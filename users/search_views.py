import math
from urllib.parse import urlencode

from django.contrib.auth import get_user_model
from django.core.paginator import Paginator
from django.db.models import Case, Count, IntegerField, Prefetch, Q, Value, When
from django.shortcuts import render
from django.urls import reverse

from appointments.models import ArtistBookingSettings
from .imported_artists import IMPORTED_ARTIST_SOURCE_MARKER
from .models import Location, PortfolioWork


User = get_user_model()

SEARCH_STYLE_CHOICES = (
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

SEARCH_RADIUS_CHOICES = (5, 10, 25, 50, 100)
SEARCH_TYPES = {"all", "artists", "studios", "users"}
SEARCH_SORTS = {"relevance", "distance", "newest"}
BOOKING_OPEN_STATUSES = {
    ArtistBookingSettings.BOOKING_STATUS_OPEN,
    ArtistBookingSettings.BOOKING_STATUS_CONSULTATION_ONLY,
}


def _safe_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_coordinates(request):
    lat = _safe_float(request.GET.get("lat"))
    lng = _safe_float(request.GET.get("lng"))
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
        location.name.lower(),
    )


def _best_user_location(user):
    locations = list(getattr(user, "search_locations", []))
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

    for work in getattr(user, "search_portfolio", []):
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


def _user_result(user, origin_lat=None, origin_lng=None):
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
    portfolio = list(getattr(user, "search_portfolio", []))[:3]
    portfolio_count = getattr(
        user,
        "search_portfolio_count",
        len(getattr(user, "search_portfolio", [])),
    )

    score = (
        (40 if verified else 0)
        + (18 if booking_open else 0)
        + min(int(portfolio_count or 0), 12)
        + (6 if location else 0)
    )

    display_name = user.get_full_name().strip() or user.username
    imported_location = next(
        (
            item
            for item in getattr(user, "search_locations", [])
            if item.source == "admin"
            and item.source_place_id == IMPORTED_ARTIST_SOURCE_MARKER
        ),
        None,
    )
    imported_state = imported_location.status if imported_location else ""

    consultation_price = None
    if settings and settings.consultation_enabled:
        consultation_price = settings.consultation_price

    return {
        "kind": "artist" if profile.account_type == "tattoo_artist" else "user",
        "user": user,
        "display_name": display_name,
        "handle": profile.tag or user.username,
        "bio": profile.bio or "",
        "verified": verified,
        "booking_open": booking_open,
        "styles": styles,
        "portfolio": portfolio,
        "portfolio_count": int(portfolio_count or 0),
        "location": location,
        "location_label": _location_label(location),
        "distance_km": distance_km,
        "consultation_price": consultation_price,
        "is_imported": bool(imported_location),
        "imported_state": imported_state,
        "can_message": bool(profile.is_email_verified and user.has_usable_password()),
        "score": score,
        "created_at": user.date_joined,
    }


def _studio_styles(location):
    if not location.linked_user_id:
        return []
    settings = _booking_settings_for(location.linked_user)
    return _collect_styles(location.linked_user, settings)


def _studio_result(location, origin_lat=None, origin_lng=None):
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

    linked_user = location.linked_user
    settings = _booking_settings_for(linked_user) if linked_user else None
    booking_open = bool(
        linked_user
        and settings
        and settings.bookings_enabled
        and settings.booking_status in BOOKING_OPEN_STATUSES
    )
    verified = location.status == "verified"
    claimed = bool(location.linked_user_id or location.status in {"claimed", "verified"})
    styles = _studio_styles(location)
    portfolio = []
    if linked_user:
        portfolio = list(getattr(linked_user, "search_portfolio", []))[:3]

    score = (
        (35 if verified else 0)
        + (18 if claimed else 0)
        + (12 if booking_open else 0)
        + (8 if location.latitude is not None and location.longitude is not None else 0)
    )

    return {
        "kind": "studio",
        "location": location,
        "display_name": location.name,
        "location_label": _location_label(location),
        "distance_km": distance_km,
        "verified": verified,
        "claimed": claimed,
        "booking_open": booking_open,
        "styles": styles,
        "portfolio": portfolio,
        "linked_user": linked_user,
        "can_message": bool(
            linked_user
            and linked_user.profile.is_email_verified
            and linked_user.has_usable_password()
        ),
        "score": score,
        "created_at": location.created_at,
    }


def _remove_filter_url(request, key, value=None):
    params = request.GET.copy()
    params.pop("page", None)

    if value is None:
        params.pop(key, None)
    else:
        remaining = [item for item in params.getlist(key) if item != value]
        if remaining:
            params.setlist(key, remaining)
        else:
            params.pop(key, None)

    encoded = params.urlencode()
    base = reverse("search_page")
    return f"{base}?{encoded}" if encoded else base


def _remove_geo_url(request):
    params = request.GET.copy()
    params.pop("page", None)
    params.pop("lat", None)
    params.pop("lng", None)
    params.pop("radius", None)
    if params.get("sort") == "distance":
        params["sort"] = "relevance"
    encoded = params.urlencode()
    base = reverse("search_page")
    return f"{base}?{encoded}" if encoded else base


def _tab_url(request, account_type):
    params = request.GET.copy()
    params["type"] = account_type
    params.pop("page", None)
    return f"{reverse('search_page')}?{params.urlencode()}"


def _clear_filters_url(query, account_filter):
    params = {}
    if query:
        params["q"] = query
    if account_filter != "all":
        params["type"] = account_filter
    encoded = urlencode(params)
    base = reverse("search_page")
    return f"{base}?{encoded}" if encoded else base


def search_page(request):
    query = (request.GET.get("q") or "").strip()
    clean_query = query.lstrip("@").strip()
    account_filter = (request.GET.get("type") or "all").strip().lower()
    if account_filter not in SEARCH_TYPES:
        account_filter = "all"

    location_filter = (request.GET.get("location") or "").strip()
    accepting = request.GET.get("accepting") == "1"
    verified = request.GET.get("verified") == "1"

    selected_styles = []
    style_lookup = {style.casefold(): style for style in SEARCH_STYLE_CHOICES}
    for raw_style in request.GET.getlist("style"):
        normalized = style_lookup.get((raw_style or "").strip().casefold())
        if normalized and normalized not in selected_styles:
            selected_styles.append(normalized)

    radius = request.GET.get("radius") or "25"
    try:
        radius_km = int(radius)
    except (TypeError, ValueError):
        radius_km = 25
    if radius_km not in SEARCH_RADIUS_CHOICES:
        radius_km = 25

    origin_lat, origin_lng = _parse_coordinates(request)
    has_origin = origin_lat is not None and origin_lng is not None

    sort = (request.GET.get("sort") or "relevance").strip().lower()
    if sort not in SEARCH_SORTS:
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
        to_attr="search_portfolio",
    )
    location_prefetch = Prefetch(
        "map_locations",
        queryset=Location.objects.exclude(status="rejected").order_by("name"),
        to_attr="search_locations",
    )

    users = (
        User.objects
        .select_related("profile", "booking_settings")
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
            search_portfolio_count=Count("portfolio_works", distinct=True),
            search_verified_rank=Case(
                When(profile__verification_status="approved", then=Value(1)),
                default=Value(0),
                output_field=IntegerField(),
            ),
        )
    )

    if request.user.is_authenticated:
        users = (
            users.exclude(id=request.user.id)
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
        "-search_verified_rank",
        "-search_portfolio_count",
        "username",
    )

    user_results = []
    for user in users:
        result = _user_result(user, origin_lat, origin_lng)

        if selected_styles and not _style_matches(result["styles"], selected_styles):
            continue
        if accepting and not result["booking_open"]:
            continue
        if verified and not result["verified"]:
            continue
        if has_origin and radius_km and (
            result["distance_km"] is None or result["distance_km"] > radius_km
        ):
            continue

        user_results.append(result)

    studio_statuses = ["imported", "unclaimed", "pending_claim", "claimed", "verified"]
    studios = (
        Location.objects
        .filter(status__in=studio_statuses)
        .select_related("linked_user", "linked_user__profile", "linked_user__booking_settings")
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
                to_attr="search_portfolio",
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
        result = _studio_result(studio, origin_lat, origin_lng)

        if selected_styles and not _style_matches(result["styles"], selected_styles):
            continue
        if accepting and not result["booking_open"]:
            continue
        if verified and not result["verified"]:
            continue
        if has_origin and radius_km and (
            result["distance_km"] is None or result["distance_km"] > radius_km
        ):
            continue

        studio_results.append(result)

    user_ids = {item["user"].id for item in user_results}
    mixed_studios = [
        item
        for item in studio_results
        if not item["linked_user"] or item["linked_user"].id not in user_ids
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

    paginator = Paginator(filtered_results, 24)
    page_obj = paginator.get_page(request.GET.get("page"))

    active_filters = []
    if location_filter:
        active_filters.append(
            {
                "label": location_filter,
                "url": _remove_filter_url(request, "location"),
            }
        )
    for style in selected_styles:
        active_filters.append(
            {
                "label": style,
                "url": _remove_filter_url(request, "style", style),
            }
        )
    if accepting:
        active_filters.append(
            {
                "label": "Accepting bookings",
                "url": _remove_filter_url(request, "accepting"),
            }
        )
    if verified:
        active_filters.append(
            {
                "label": "Verified",
                "url": _remove_filter_url(request, "verified"),
            }
        )
    if has_origin:
        active_filters.append(
            {
                "label": f"Within {radius_km} km",
                "url": _remove_geo_url(request),
            }
        )

    pagination_params = request.GET.copy()
    pagination_params.pop("page", None)

    return render(
        request,
        "users/search.html",
        {
            "query": query,
            "account_filter": account_filter,
            "results": page_obj.object_list,
            "results_count": len(filtered_results),
            "page_obj": page_obj,
            "tab_counts": tab_counts,
            "tab_urls": {
                kind: _tab_url(request, kind)
                for kind in ("all", "artists", "studios", "users")
            },
            "style_choices": SEARCH_STYLE_CHOICES,
            "selected_styles": selected_styles,
            "location_filter": location_filter,
            "accepting_filter": accepting,
            "verified_filter": verified,
            "radius_km": radius_km,
            "has_origin": has_origin,
            "origin_lat": origin_lat if has_origin else "",
            "origin_lng": origin_lng if has_origin else "",
            "sort": sort,
            "active_filters": active_filters,
            "clear_filters_url": _clear_filters_url(query, account_filter),
            "pagination_query": pagination_params.urlencode(),
            "maps_url": reverse("maps_page"),
        },
    )
