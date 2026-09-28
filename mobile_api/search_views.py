import math

from django.contrib.auth import get_user_model
from django.core.paginator import Paginator
from django.db.models import Case, Count, IntegerField, Prefetch, Q, Value, When
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from appointments.models import ArtistBookingSettings
from users.imported_artists import IMPORTED_ARTIST_SOURCE_MARKER
from users.models import Location, PortfolioWork, UserBlock


User = get_user_model()

DISCOVERY_STYLE_CHOICES = (
    "Fine Line",
    "Realism",
    "Blackwork",
    "Traditional",
    "Neo Traditional",
    "Japanese",
    "Minimalist",
    "Lettering",
    "Ornamental",
    "Geometric",
    "Watercolor",
    "Floral",
)
DISCOVERY_RADIUS_CHOICES = (5, 10, 25, 50, 100)
DISCOVERY_TYPES = {"all", "artists", "studios", "users"}
DISCOVERY_SORTS = {"relevance", "distance", "newest"}
BOOKING_OPEN_STATUSES = {
    ArtistBookingSettings.BOOKING_STATUS_OPEN,
    ArtistBookingSettings.BOOKING_STATUS_CONSULTATION_ONLY,
}
DISCOVERY_PAGE_SIZE = 20


def _image_url(image, request):
    if not image:
        return None
    try:
        url = image.url
    except (AttributeError, ValueError):
        return None
    return request.build_absolute_uri(url) if url.startswith("/") else url


def _profile_image_url(user, request):
    return _image_url(user.profile.profile_image, request)


def _safe_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_coordinates(request):
    lat = _safe_float(request.query_params.get("lat"))
    lng = _safe_float(request.query_params.get("lng"))
    if lat is None or lng is None:
        return None, None
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return None, None
    return lat, lng


def _haversine_km(lat1, lng1, lat2, lng2):
    radius_km = 6371.0088
    lat1_r, lng1_r, lat2_r, lng2_r = map(
        math.radians,
        (float(lat1), float(lng1), float(lat2), float(lng2)),
    )
    dlat = lat2_r - lat1_r
    dlng = lng2_r - lng1_r
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlng / 2) ** 2
    )
    return radius_km * 2 * math.asin(math.sqrt(a))


def _booking_settings_for(user):
    if not user:
        return None
    try:
        return user.booking_settings
    except ArtistBookingSettings.DoesNotExist:
        return None


def _location_priority(location):
    status_rank = {
        "verified": 0,
        "claimed": 1,
        "pending_claim": 2,
        "unclaimed": 3,
        "imported": 4,
    }
    return (
        status_rank.get(location.status, 9),
        0 if location.latitude is not None and location.longitude is not None else 1,
        location.name.casefold(),
    )


def _best_user_location(user):
    locations = list(getattr(user, "discovery_locations", []))
    if not locations:
        return None
    return min(locations, key=_location_priority)


def _location_label(location):
    if not location:
        return ""
    city_country = ", ".join(part for part in (location.city, location.country) if part)
    return city_country or location.formatted_address or location.address or location.name


def _collect_styles(user, settings):
    values = []
    if settings and isinstance(settings.active_styles, list):
        values.extend(
            str(value).strip()
            for value in settings.active_styles
            if str(value).strip()
        )
    for work in getattr(user, "discovery_portfolio", []):
        value = (work.style or "").strip()
        if value:
            values.append(value)

    unique = []
    seen = set()
    for value in values:
        key = value.casefold()
        if key not in seen:
            seen.add(key)
            unique.append(value)
    return unique


def _style_matches(styles, selected_styles):
    if not selected_styles:
        return True
    haystack = {style.casefold() for style in styles}
    return any(style.casefold() in haystack for style in selected_styles)


def _portfolio_payload(user, request):
    works = list(getattr(user, "discovery_portfolio", []))[:3]
    return [
        {
            "id": work.id,
            "image_url": _image_url(work.image, request),
            "style": work.style or "",
        }
        for work in works
        if _image_url(work.image, request)
    ]


def _user_result(user, request, origin_lat=None, origin_lng=None):
    profile = user.profile
    settings = _booking_settings_for(user)
    location = _best_user_location(user)
    styles = _collect_styles(user, settings)

    distance_km = None
    if (
        origin_lat is not None
        and origin_lng is not None
        and location
        and location.latitude is not None
        and location.longitude is not None
    ):
        distance_km = _haversine_km(
            origin_lat,
            origin_lng,
            location.latitude,
            location.longitude,
        )

    booking_open = bool(
        profile.account_type == "tattoo_artist"
        and settings
        and settings.bookings_enabled
        and settings.booking_status in BOOKING_OPEN_STATUSES
    )
    verified = profile.is_verified_artist
    portfolio_count = getattr(
        user,
        "discovery_portfolio_count",
        len(getattr(user, "discovery_portfolio", [])),
    )
    score = (
        (40 if verified else 0)
        + (18 if booking_open else 0)
        + min(int(portfolio_count or 0), 12)
        + (6 if location else 0)
    )

    imported_location = next(
        (
            item
            for item in getattr(user, "discovery_locations", [])
            if item.source == "admin"
            and item.source_place_id == IMPORTED_ARTIST_SOURCE_MARKER
        ),
        None,
    )
    native_profile_available = bool(user.is_active and profile.is_email_verified)
    display_name = user.get_full_name().strip() or user.username
    consultation_price = None
    if settings and settings.consultation_enabled:
        consultation_price = str(settings.consultation_price)

    return {
        "kind": "artist" if profile.account_type == "tattoo_artist" else "user",
        "id": user.id,
        "username": user.username,
        "tag": profile.tag,
        "display_name": display_name,
        "handle": profile.tag or user.username,
        "bio": profile.bio or "",
        "account_type": profile.account_type,
        "is_verified_artist": verified,
        "verified": verified,
        "profile_image_url": _profile_image_url(user, request),
        "booking_open": booking_open,
        "styles": styles,
        "portfolio": _portfolio_payload(user, request),
        "portfolio_count": int(portfolio_count or 0),
        "location_label": _location_label(location),
        "distance_km": round(distance_km, 1) if distance_km is not None else None,
        "consultation_price": consultation_price,
        "is_imported": bool(imported_location),
        "imported_state": imported_location.status if imported_location else "",
        "native_profile_available": native_profile_available,
        "can_message": bool(native_profile_available and user.has_usable_password()),
        "score": score,
        "created_at": user.date_joined,
    }


def _studio_result(location, request, origin_lat=None, origin_lng=None):
    linked_user = location.linked_user
    settings = _booking_settings_for(linked_user) if linked_user else None
    styles = _collect_styles(linked_user, settings) if linked_user else []
    distance_km = None
    if (
        origin_lat is not None
        and origin_lng is not None
        and location.latitude is not None
        and location.longitude is not None
    ):
        distance_km = _haversine_km(
            origin_lat,
            origin_lng,
            location.latitude,
            location.longitude,
        )

    booking_open = bool(
        linked_user
        and settings
        and settings.bookings_enabled
        and settings.booking_status in BOOKING_OPEN_STATUSES
    )
    verified = location.status == "verified"
    claimed = bool(location.linked_user_id or location.status in {"claimed", "verified"})
    native_profile_available = bool(
        linked_user
        and linked_user.is_active
        and linked_user.profile.is_email_verified
    )
    score = (
        (35 if verified else 0)
        + (18 if claimed else 0)
        + (12 if booking_open else 0)
        + (8 if location.latitude is not None and location.longitude is not None else 0)
    )

    return {
        "kind": "studio",
        "id": location.id,
        "username": linked_user.username if linked_user else "",
        "linked_username": linked_user.username if linked_user else None,
        "tag": linked_user.profile.tag if linked_user else None,
        "display_name": location.name,
        "handle": linked_user.profile.tag if linked_user and linked_user.profile.tag else "",
        "bio": linked_user.profile.bio if linked_user else "",
        "account_type": "studio",
        "is_verified_artist": bool(linked_user and linked_user.profile.is_verified_artist),
        "verified": verified,
        "profile_image_url": _profile_image_url(linked_user, request) if linked_user else None,
        "booking_open": booking_open,
        "styles": styles,
        "portfolio": _portfolio_payload(linked_user, request) if linked_user else [],
        "portfolio_count": len(getattr(linked_user, "discovery_portfolio", [])) if linked_user else 0,
        "location_label": _location_label(location),
        "distance_km": round(distance_km, 1) if distance_km is not None else None,
        "consultation_price": (
            str(settings.consultation_price)
            if settings and settings.consultation_enabled
            else None
        ),
        "is_imported": False,
        "imported_state": "",
        "claimed": claimed,
        "native_profile_available": native_profile_available,
        "can_message": bool(
            native_profile_available
            and linked_user
            and linked_user.has_usable_password()
        ),
        "score": score,
        "created_at": location.created_at,
    }


def _legacy_search(request):
    query = str(request.query_params.get("q", "")).strip()
    normalized_query = query.lstrip("@").strip()
    account_filter = str(request.query_params.get("type", "all")).strip()

    users = (
        User.objects.select_related("profile")
        .filter(is_active=True, profile__is_email_verified=True)
        .exclude(pk=request.user.pk)
        .exclude(blocked_by_relations__blocker=request.user)
        .exclude(blocking_relations__blocked=request.user)
        .annotate(
            verified_rank=Case(
                When(profile__verification_status="approved", then=Value(1)),
                default=Value(0),
                output_field=IntegerField(),
            )
        )
    )

    if normalized_query:
        users = users.filter(
            Q(username__icontains=normalized_query)
            | Q(profile__tag__icontains=normalized_query)
        ).annotate(
            exact_match=Case(
                When(username__iexact=normalized_query, then=Value(2)),
                When(profile__tag__iexact=normalized_query, then=Value(1)),
                default=Value(0),
                output_field=IntegerField(),
            )
        )
    else:
        users = users.annotate(
            exact_match=Value(0, output_field=IntegerField())
        )

    if account_filter == "artists":
        users = users.filter(profile__account_type="tattoo_artist")
    elif account_filter == "users":
        users = users.exclude(profile__account_type="tattoo_artist")
    else:
        account_filter = "all"

    users = users.order_by(
        "-exact_match",
        "-verified_rank",
        "username",
    )[:30]

    results = [
        {
            "id": user.id,
            "username": user.username,
            "tag": user.profile.tag,
            "bio": user.profile.bio or "",
            "account_type": user.profile.account_type,
            "is_verified_artist": user.profile.is_verified_artist,
            "profile_image_url": _profile_image_url(user, request),
        }
        for user in users
    ]

    return Response(
        {
            "query": query,
            "type": account_filter,
            "count": len(results),
            "results": results,
        }
    )


def _discovery_search(request):
    query = str(request.query_params.get("q", "")).strip()
    clean_query = query.lstrip("@").strip()
    account_filter = str(request.query_params.get("type", "all")).strip().lower()
    if account_filter not in DISCOVERY_TYPES:
        account_filter = "all"

    location_filter = str(request.query_params.get("location", "")).strip()
    accepting = request.query_params.get("accepting") == "1"
    verified = request.query_params.get("verified") == "1"

    style_lookup = {style.casefold(): style for style in DISCOVERY_STYLE_CHOICES}
    selected_styles = []
    for raw_style in request.query_params.getlist("style"):
        normalized = style_lookup.get(str(raw_style or "").strip().casefold())
        if normalized and normalized not in selected_styles:
            selected_styles.append(normalized)

    try:
        radius_km = int(request.query_params.get("radius") or 25)
    except (TypeError, ValueError):
        radius_km = 25
    if radius_km not in DISCOVERY_RADIUS_CHOICES:
        radius_km = 25

    origin_lat, origin_lng = _parse_coordinates(request)
    has_origin = origin_lat is not None and origin_lng is not None

    sort = str(request.query_params.get("sort", "relevance")).strip().lower()
    if sort not in DISCOVERY_SORTS:
        sort = "relevance"
    if sort == "distance" and not has_origin:
        sort = "relevance"

    portfolio_prefetch = Prefetch(
        "portfolio_works",
        queryset=PortfolioWork.objects.only(
            "id",
            "user_id",
            "image",
            "style",
            "created_at",
        ).order_by("-created_at"),
        to_attr="discovery_portfolio",
    )
    location_prefetch = Prefetch(
        "map_locations",
        queryset=Location.objects.exclude(status="rejected").order_by("name"),
        to_attr="discovery_locations",
    )

    users = (
        User.objects.select_related("profile", "booking_settings")
        .prefetch_related(portfolio_prefetch, location_prefetch)
        .filter(is_active=True)
        .filter(
            Q(profile__is_email_verified=True)
            | Q(
                profile__account_type="tattoo_artist",
                map_locations__source="admin",
                map_locations__source_place_id=IMPORTED_ARTIST_SOURCE_MARKER,
                map_locations__status__in=["unclaimed", "pending_claim"],
            )
        )
        .annotate(
            discovery_portfolio_count=Count("portfolio_works", distinct=True),
            discovery_verified_rank=Case(
                When(profile__verification_status="approved", then=Value(1)),
                default=Value(0),
                output_field=IntegerField(),
            ),
        )
        .exclude(pk=request.user.pk)
        .exclude(blocked_by_relations__blocker=request.user)
        .exclude(blocking_relations__blocked=request.user)
    )

    if clean_query:
        users = users.filter(
            Q(username__icontains=clean_query)
            | Q(first_name__icontains=clean_query)
            | Q(last_name__icontains=clean_query)
            | Q(profile__tag__icontains=clean_query)
            | Q(profile__bio__icontains=clean_query)
            | Q(map_locations__name__icontains=clean_query)
            | Q(map_locations__city__icontains=clean_query)
            | Q(map_locations__country__icontains=clean_query)
        )

    if location_filter:
        users = users.filter(
            Q(map_locations__name__icontains=location_filter)
            | Q(map_locations__city__icontains=location_filter)
            | Q(map_locations__country__icontains=location_filter)
            | Q(map_locations__address__icontains=location_filter)
            | Q(map_locations__formatted_address__icontains=location_filter)
        )

    users = users.distinct().order_by(
        "-discovery_verified_rank",
        "-discovery_portfolio_count",
        "username",
    )

    user_results = []
    for user in users:
        result = _user_result(user, request, origin_lat, origin_lng)
        if selected_styles and not _style_matches(result["styles"], selected_styles):
            continue
        if accepting and not result["booking_open"]:
            continue
        if verified and not result["verified"]:
            continue
        if has_origin and (
            result["distance_km"] is None or result["distance_km"] > radius_km
        ):
            continue
        user_results.append(result)

    hidden_user_ids = set(
        UserBlock.objects.filter(
            Q(blocker=request.user) | Q(blocked=request.user)
        ).values_list("blocker_id", "blocked_id")
    )
    blocked_ids = {
        blocked_id if blocker_id == request.user.id else blocker_id
        for blocker_id, blocked_id in hidden_user_ids
    }

    studios = (
        Location.objects.filter(
            status__in=["imported", "unclaimed", "pending_claim", "claimed", "verified"]
        )
        .exclude(linked_user_id__in=blocked_ids)
        .select_related(
            "linked_user",
            "linked_user__profile",
            "linked_user__booking_settings",
        )
        .prefetch_related(
            Prefetch(
                "linked_user__portfolio_works",
                queryset=PortfolioWork.objects.only(
                    "id",
                    "user_id",
                    "image",
                    "style",
                    "created_at",
                ).order_by("-created_at"),
                to_attr="discovery_portfolio",
            )
        )
    )

    if clean_query:
        studios = studios.filter(
            Q(name__icontains=clean_query)
            | Q(city__icontains=clean_query)
            | Q(country__icontains=clean_query)
            | Q(address__icontains=clean_query)
            | Q(formatted_address__icontains=clean_query)
        )
    if location_filter:
        studios = studios.filter(
            Q(name__icontains=location_filter)
            | Q(city__icontains=location_filter)
            | Q(country__icontains=location_filter)
            | Q(address__icontains=location_filter)
            | Q(formatted_address__icontains=location_filter)
        )

    studio_results = []
    for studio in studios:
        result = _studio_result(studio, request, origin_lat, origin_lng)
        if selected_styles and not _style_matches(result["styles"], selected_styles):
            continue
        if accepting and not result["booking_open"]:
            continue
        if verified and not result["verified"]:
            continue
        if has_origin and (
            result["distance_km"] is None or result["distance_km"] > radius_km
        ):
            continue
        studio_results.append(result)

    user_ids = {item["id"] for item in user_results}
    mixed_studios = [
        item
        for item in studio_results
        if not item["linked_username"]
        or not item["id"]
        or item.get("linked_username") not in {
            result["username"] for result in user_results
        }
    ]
    all_results = user_results + mixed_studios

    if account_filter == "artists":
        filtered_results = [item for item in all_results if item["kind"] == "artist"]
    elif account_filter == "studios":
        filtered_results = studio_results
    elif account_filter == "users":
        filtered_results = [item for item in all_results if item["kind"] == "user"]
    else:
        filtered_results = all_results

    if sort == "distance":
        filtered_results.sort(
            key=lambda item: (
                item["distance_km"] is None,
                item["distance_km"] if item["distance_km"] is not None else float("inf"),
                -item["score"],
                item["display_name"].casefold(),
            )
        )
    elif sort == "newest":
        filtered_results.sort(
            key=lambda item: (item["created_at"], item["score"]),
            reverse=True,
        )
    else:
        filtered_results.sort(
            key=lambda item: (-item["score"], item["display_name"].casefold())
        )

    tab_counts = {
        "all": len(all_results),
        "artists": sum(1 for item in all_results if item["kind"] == "artist"),
        "studios": len(studio_results),
        "users": sum(1 for item in all_results if item["kind"] == "user"),
    }

    try:
        page_number = max(1, int(request.query_params.get("page") or 1))
    except (TypeError, ValueError):
        page_number = 1
    paginator = Paginator(filtered_results, DISCOVERY_PAGE_SIZE)
    page_obj = paginator.get_page(page_number)
    serialized_results = []
    for item in page_obj.object_list:
        serialized = dict(item)
        serialized.pop("score", None)
        serialized.pop("created_at", None)
        serialized_results.append(serialized)

    return Response(
        {
            "query": query,
            "type": account_filter,
            "count": len(filtered_results),
            "page": page_obj.number,
            "page_size": DISCOVERY_PAGE_SIZE,
            "has_more": page_obj.has_next(),
            "tab_counts": tab_counts,
            "style_choices": list(DISCOVERY_STYLE_CHOICES),
            "filters": {
                "location": location_filter,
                "styles": selected_styles,
                "accepting": accepting,
                "verified": verified,
                "radius": radius_km,
                "has_origin": has_origin,
                "sort": sort,
            },
            "results": serialized_results,
        }
    )


class ProfileSearchView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        if request.query_params.get("discovery") == "1":
            return _discovery_search(request)
        return _legacy_search(request)
