import os
from urllib.parse import quote

from django.conf import settings


INDEXABLE_URL_NAMES = {
    "home",
    "search_page",
    "maps_page",
    "profile",
    "artist_portfolio",
    "artist_portfolio_album",
    "legal_index",
    "terms",
    "privacy",
    "cookies",
    "community_guidelines",
    "legal_notice",
}

INDEXABLE_NAMESPACED_URLS = {
    ("style_match", "index"),
}


def seo_context(request):
    """Provide stable production canonicals and keep private/application pages out of search."""
    match = getattr(request, "resolver_match", None)
    url_name = match.url_name if match else None
    app_name = match.app_name if match else None
    path = quote(request.path, safe="/%:@")
    canonical = f"{settings.PUBLIC_SITE_URL}{path}"
    is_public_route = (
        url_name in INDEXABLE_URL_NAMES
        or (app_name, url_name) in INDEXABLE_NAMESPACED_URLS
    )
    indexable = request.method == "GET" and is_public_route

    return {
        "canonical_url": canonical,
        "public_site_url": settings.PUBLIC_SITE_URL,
        "seo_robots": "index,follow" if indexable else "noindex,nofollow",
        "bing_site_verification": os.getenv("BING_SITE_VERIFICATION", "").strip(),
    }
