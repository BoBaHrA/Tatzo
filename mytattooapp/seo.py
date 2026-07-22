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


def seo_context(request):
    """Provide a stable production canonical and keep private/application pages out of search."""
    match = getattr(request, "resolver_match", None)
    url_name = match.url_name if match else None
    path = quote(request.path, safe="/%:@")
    canonical = f"{settings.PUBLIC_SITE_URL}{path}"
    indexable = request.method == "GET" and url_name in INDEXABLE_URL_NAMES
    return {
        "canonical_url": canonical,
        "seo_robots": "index,follow" if indexable else "noindex,nofollow",
    }
