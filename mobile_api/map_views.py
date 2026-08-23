import math
from collections import Counter
from decimal import Decimal
from urllib.parse import urlparse

from django.db import transaction
from django.db.models import Prefetch, Q
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from users.models import Location, LocationClaim, LocationRequest, UserBlock
from users.security import check_rate_limit

VISIBLE_ARTIST_LOCATION_STATUSES = ("verified", "claimed")
VISIBLE_STUDIO_LOCATION_STATUSES = ("imported", "unclaimed", "pending_claim")
ACTIVE_SUBMISSION_STATUSES = ("submitted", "under_review")
MAP_TYPES = {"artist", "studio"}
BOOKING_FILTERS = {"accepting", "online", "in_person"}


class MapQuerySerializer(serializers.Serializer):
    north = serializers.FloatField(required=False)
    south = serializers.FloatField(required=False)
    east = serializers.FloatField(required=False)
    west = serializers.FloatField(required=False)
    types = serializers.CharField(required=False, allow_blank=True, max_length=40)
    styles = serializers.CharField(required=False, allow_blank=True, max_length=500)
    booking = serializers.CharField(required=False, allow_blank=True, max_length=80)
    q = serializers.CharField(required=False, allow_blank=True, max_length=100)
    limit = serializers.IntegerField(
        required=False, min_value=1, max_value=200, default=200
    )
    offset = serializers.IntegerField(required=False, min_value=0, default=0)

    def validate(self, attrs):
        bound_names = ("north", "south", "east", "west")
        present = [name for name in bound_names if name in attrs]
        if present and len(present) != len(bound_names):
            raise serializers.ValidationError(
                {"bounds": "north, south, east and west must be provided together."}
            )

        if present:
            for name in bound_names:
                if not math.isfinite(attrs[name]):
                    raise serializers.ValidationError(
                        {name: "Coordinate must be a finite number."}
                    )
            if not -90 <= attrs["south"] < attrs["north"] <= 90:
                raise serializers.ValidationError(
                    {"bounds": "Latitude bounds are invalid."}
                )
            if not -180 <= attrs["west"] <= 180 or not -180 <= attrs["east"] <= 180:
                raise serializers.ValidationError(
                    {"bounds": "Longitude bounds are invalid."}
                )
            if attrs["west"] == attrs["east"]:
                raise serializers.ValidationError(
                    {"bounds": "Longitude bounds must cover a visible area."}
                )

        attrs["type_filters"] = self._csv_values(
            attrs.get("types", ""), MAP_TYPES, "types"
        )
        attrs["style_filters"] = self._csv_values(
            attrs.get("styles", ""), None, "styles"
        )
        attrs["booking_filters"] = self._csv_values(
            attrs.get("booking", ""), BOOKING_FILTERS, "booking"
        )
        attrs["q"] = attrs.get("q", "").strip()
        return attrs

    @staticmethod
    def _csv_values(raw_value, allowed, field_name):
        values = []
        for raw_item in str(raw_value or "").split(","):
            value = raw_item.strip()
            if value and value not in values:
                values.append(value)
        if allowed is not None:
            invalid = sorted(set(values) - allowed)
            if invalid:
                raise serializers.ValidationError(
                    {field_name: f"Unsupported values: {', '.join(invalid)}."}
                )
        return values


class LocationRequestSerializer(serializers.ModelSerializer):
    full_address = serializers.CharField(max_length=1000)
    message = serializers.CharField(required=False, allow_blank=True, max_length=3000)

    class Meta:
        model = LocationRequest
        fields = (
            "name",
            "city",
            "country",
            "full_address",
            "website_or_map_link",
            "phone",
            "supporting_file",
            "contact_email",
            "latitude",
            "longitude",
            "message",
        )
        extra_kwargs = {
            "supporting_file": {"required": False, "allow_null": True},
            "website_or_map_link": {"required": False, "allow_blank": True},
            "phone": {"required": False, "allow_blank": True},
            "latitude": {
                "required": False,
                "allow_null": True,
                "min_value": Decimal("-90"),
                "max_value": Decimal("90"),
            },
            "longitude": {
                "required": False,
                "allow_null": True,
                "min_value": Decimal("-180"),
                "max_value": Decimal("180"),
            },
            "message": {"required": False, "allow_blank": True},
        }

    def validate(self, attrs):
        latitude = attrs.get("latitude")
        longitude = attrs.get("longitude")
        if (latitude is None) != (longitude is None):
            raise serializers.ValidationError(
                {"coordinates": "Latitude and longitude must be provided together."}
            )
        if latitude is not None and (
            not latitude.is_finite() or not longitude.is_finite()
        ):
            raise serializers.ValidationError(
                {"coordinates": "Coordinates must be finite numbers."}
            )
        return attrs


class LocationClaimSerializer(serializers.ModelSerializer):
    proof = serializers.CharField(required=False, allow_blank=True, max_length=3000)
    message = serializers.CharField(required=False, allow_blank=True, max_length=3000)

    class Meta:
        model = LocationClaim
        fields = (
            "claimant_name",
            "contact_email",
            "relation_to_location",
            "proof",
            "proof_document",
            "message",
        )
        extra_kwargs = {
            "proof": {"required": False, "allow_blank": True},
            "proof_document": {"required": False, "allow_null": True},
            "message": {"required": False, "allow_blank": True},
        }


def _csv_search_value(value):
    return str(value or "").strip().casefold()


def _dedupe_styles(values):
    styles = []
    seen = set()
    for raw_value in values:
        value = str(raw_value or "").strip()
        normalized = value.casefold()
        if value and normalized not in seen:
            styles.append(value)
            seen.add(normalized)
    return styles


def _absolute_media_url(request, field):
    if not field:
        return None
    try:
        url = field.url
    except (AttributeError, ValueError):
        return None
    if url.startswith("/"):
        return request.build_absolute_uri(url)
    return url


def _safe_public_url(value):
    value = str(value or "").strip()
    if not value:
        return None
    if "://" not in value:
        value = f"https://{value}"
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    return value


def _artist_styles(artist, booking_settings):
    configured = getattr(booking_settings, "active_styles", None) or []
    portfolio = [work.style for work in artist.portfolio_works.all() if work.style]
    return _dedupe_styles([*configured, *portfolio])[:12]


def _booking_state(booking_settings):
    if booking_settings is None:
        return True, ["accepting"]
    if not booking_settings.bookings_enabled:
        return False, []
    modes = ["accepting"]
    if booking_settings.online_consultation_enabled:
        modes.append("online")
    if booking_settings.studio_consultation_enabled:
        modes.append("in_person")
    return True, modes


def _blocked_user_ids(user):
    relations = UserBlock.objects.filter(Q(blocker=user) | Q(blocked=user)).values_list(
        "blocker_id", "blocked_id"
    )
    return {
        blocked_id if blocker_id == user.pk else blocker_id
        for blocker_id, blocked_id in relations
    }


def _location_queryset(viewer, query):
    locations = (
        Location.objects.filter(
            Q(
                linked_user__isnull=True,
                status__in=VISIBLE_STUDIO_LOCATION_STATUSES,
            )
            | Q(
                linked_user__isnull=False,
                status__in=VISIBLE_ARTIST_LOCATION_STATUSES,
                linked_user__is_active=True,
                linked_user__profile__account_type="tattoo_artist",
                linked_user__profile__verification_status="approved",
                linked_user__profile__is_email_verified=True,
            ),
            latitude__isnull=False,
            longitude__isnull=False,
        )
        .exclude(linked_user_id__in=_blocked_user_ids(viewer))
        .select_related(
            "linked_user",
            "linked_user__profile",
            "linked_user__booking_settings",
        )
        .prefetch_related(
            "linked_user__portfolio_works",
            Prefetch(
                "claims",
                queryset=LocationClaim.objects.filter(
                    status__in=ACTIVE_SUBMISSION_STATUSES,
                    claimant_user=viewer,
                ).order_by("-created_at"),
                to_attr="viewer_active_claims",
            ),
        )
        .order_by("id")
    )

    if "north" in query:
        locations = locations.filter(
            latitude__gte=query["south"],
            latitude__lte=query["north"],
        )
        if query["west"] < query["east"]:
            locations = locations.filter(
                longitude__gte=query["west"],
                longitude__lte=query["east"],
            )
        else:
            locations = locations.filter(
                Q(longitude__gte=query["west"]) | Q(longitude__lte=query["east"])
            )
    return locations


def _location_payload(request, location):
    latitude = float(location.latitude)
    longitude = float(location.longitude)
    if not math.isfinite(latitude) or not math.isfinite(longitude):
        return None

    artist = location.linked_user
    if artist is None:
        active_claims = getattr(location, "viewer_active_claims", [])
        active_claim = active_claims[0] if active_claims else None
        return {
            "marker_id": f"location:{location.pk}",
            "location_id": location.pk,
            "kind": "studio",
            "name": location.name,
            "tag": None,
            "username": None,
            "avatar_url": None,
            "address": location.display_address,
            "city": location.city,
            "country": location.country,
            "latitude": latitude,
            "longitude": longitude,
            "status": location.status,
            "styles": [],
            "booking_modes": [],
            "can_book": False,
            "portfolio_count": 0,
            "website": _safe_public_url(location.website),
            "phone": location.phone or None,
            "claimable": True,
            "claim_status": active_claim.status if active_claim else None,
        }

    booking_settings = getattr(artist, "booking_settings", None)
    styles = _artist_styles(artist, booking_settings)
    can_book, booking_modes = _booking_state(booking_settings)
    return {
        "marker_id": f"location:{location.pk}",
        "location_id": location.pk,
        "kind": "artist",
        "name": artist.username,
        "tag": artist.profile.tag or artist.username,
        "username": artist.username,
        "avatar_url": _absolute_media_url(request, artist.profile.profile_image),
        "address": location.display_address,
        "city": location.city,
        "country": location.country,
        "latitude": latitude,
        "longitude": longitude,
        "status": "verified",
        "styles": styles,
        "booking_modes": booking_modes,
        "can_book": can_book,
        "portfolio_count": artist.portfolio_works.count(),
        "website": _safe_public_url(location.website),
        "phone": location.phone or None,
        "claimable": False,
        "claim_status": None,
    }


def _matches_filters(payload, query):
    if query["type_filters"] and payload["kind"] not in query["type_filters"]:
        return False

    style_filters = {_csv_search_value(value) for value in query["style_filters"]}
    payload_styles = {_csv_search_value(value) for value in payload["styles"]}
    if style_filters and not style_filters.intersection(payload_styles):
        return False

    booking_filters = set(query["booking_filters"])
    if booking_filters and not booking_filters.intersection(payload["booking_modes"]):
        return False

    search = _csv_search_value(query["q"])
    if search:
        haystack = " ".join(
            str(value or "")
            for value in (
                payload["name"],
                payload["tag"],
                payload["address"],
                payload["city"],
                payload["country"],
                *payload["styles"],
            )
        ).casefold()
        if search not in haystack:
            return False
    return True


def _rate_limit_response(checks):
    if all(allowed for allowed, _retry_after in checks):
        return None
    retry_after = max(retry_after for _allowed, retry_after in checks)
    return Response(
        {
            "code": "rate_limited",
            "detail": "Too many map submissions. Please try again later.",
            "retry_after": retry_after,
        },
        status=status.HTTP_429_TOO_MANY_REQUESTS,
    )


class MapLocationListView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        serializer = MapQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        query = serializer.validated_data

        payloads = []
        style_counts = Counter()
        viewport_counts = Counter()
        for location in _location_queryset(request.user, query):
            payload = _location_payload(request, location)
            if payload is None:
                continue
            viewport_counts[payload["kind"]] += 1
            style_counts.update(payload["styles"])
            if _matches_filters(payload, query):
                payloads.append(payload)

        offset = query["offset"]
        limit = query["limit"]
        page = payloads[offset : offset + limit]
        next_offset = offset + len(page)
        has_more = next_offset < len(payloads)
        available_styles = [
            style
            for style, _count in sorted(
                style_counts.items(),
                key=lambda item: (-item[1], item[0].casefold()),
            )[:24]
        ]
        return Response(
            {
                "results": page,
                "count": len(page),
                "total": len(payloads),
                "has_more": has_more,
                "next_offset": next_offset if has_more else None,
                "viewport": {
                    "artists": viewport_counts["artist"],
                    "studios": viewport_counts["studio"],
                },
                "filters": {
                    "styles": available_styles,
                    "booking": ["accepting", "online", "in_person"],
                },
                "capabilities": {
                    "availability": False,
                    "distance": False,
                    "rating": False,
                    "price": False,
                },
            }
        )


class MapLocationRequestView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        contact_email = str(
            request.data.get("contact_email") or request.user.email
        ).strip()
        checks = (
            check_rate_limit(
                request,
                scope="mobile:map:location-request:user",
                limit=3,
                window_seconds=24 * 60 * 60,
                identity="user",
            ),
            check_rate_limit(
                request,
                scope="mobile:map:location-request:email",
                limit=3,
                window_seconds=24 * 60 * 60,
                value=contact_email,
            ),
            check_rate_limit(
                request,
                scope="mobile:map:location-request:ip",
                limit=8,
                window_seconds=60 * 60,
                identity="ip",
            ),
        )
        limited = _rate_limit_response(checks)
        if limited:
            return limited

        data = request.data.copy()
        if not data.get("contact_email"):
            data["contact_email"] = request.user.email
        serializer = LocationRequestSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        duplicate = LocationRequest.objects.filter(
            name__iexact=validated["name"],
            city__iexact=validated["city"],
            full_address__iexact=validated["full_address"],
            contact_email__iexact=validated["contact_email"],
            status__in=ACTIVE_SUBMISSION_STATUSES,
        ).exists()
        if duplicate:
            return Response(
                {
                    "code": "location_request_exists",
                    "detail": "A request for this location is already under review.",
                },
                status=status.HTTP_409_CONFLICT,
            )

        with transaction.atomic():
            location_request = serializer.save(status="submitted")
        return Response(
            {
                "id": location_request.pk,
                "status": location_request.status,
                "detail": "Your location was submitted for review.",
            },
            status=status.HTTP_201_CREATED,
        )


class MapLocationClaimView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, location_id):
        location = get_object_or_404(
            Location,
            pk=location_id,
            linked_user__isnull=True,
            status__in=VISIBLE_STUDIO_LOCATION_STATUSES,
        )
        contact_email = str(
            request.data.get("contact_email") or request.user.email
        ).strip()
        checks = (
            check_rate_limit(
                request,
                scope="mobile:map:claim:user",
                limit=5,
                window_seconds=24 * 60 * 60,
                identity="user",
            ),
            check_rate_limit(
                request,
                scope="mobile:map:claim:email",
                limit=5,
                window_seconds=24 * 60 * 60,
                value=contact_email,
            ),
            check_rate_limit(
                request,
                scope="mobile:map:claim:ip",
                limit=10,
                window_seconds=60 * 60,
                identity="ip",
            ),
        )
        limited = _rate_limit_response(checks)
        if limited:
            return limited

        data = request.data.copy()
        if not data.get("claimant_name"):
            data["claimant_name"] = request.user.username
        if not data.get("contact_email"):
            data["contact_email"] = request.user.email
        serializer = LocationClaimSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        if (
            LocationClaim.objects.filter(
                location=location,
                status__in=ACTIVE_SUBMISSION_STATUSES,
            )
            .filter(
                Q(claimant_user=request.user)
                | Q(contact_email__iexact=validated["contact_email"])
            )
            .exists()
        ):
            return Response(
                {
                    "code": "claim_exists",
                    "detail": "Your claim for this location is already under review.",
                },
                status=status.HTTP_409_CONFLICT,
            )

        with transaction.atomic():
            claim = serializer.save(
                location=location,
                claimant_user=request.user,
                status="submitted",
            )
        return Response(
            {
                "id": claim.pk,
                "status": claim.status,
                "detail": "Your claim was submitted for review.",
            },
            status=status.HTTP_201_CREATED,
        )
