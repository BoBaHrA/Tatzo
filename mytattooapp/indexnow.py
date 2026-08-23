import json
from urllib import error, request

from django.conf import settings


INDEXNOW_KEY = "c4f5cc0f03d99cb2b93e2c32203a770a"
INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow"


def submit_urls(urls, timeout=15):
    """Submit public URLs to IndexNow-compatible search engines."""
    public_site_url = settings.PUBLIC_SITE_URL.rstrip("/")
    host = public_site_url.split("://", 1)[-1].split("/", 1)[0]
    normalized = []

    for url in urls:
        if not url:
            continue
        absolute = url if url.startswith(("http://", "https://")) else f"{public_site_url}/{url.lstrip('/')}"
        if absolute.startswith(f"{public_site_url}/") or absolute == public_site_url:
            normalized.append(absolute)

    normalized = list(dict.fromkeys(normalized))
    if not normalized:
        return 0, None

    payload = {
        "host": host,
        "key": INDEXNOW_KEY,
        "keyLocation": f"{public_site_url}/{INDEXNOW_KEY}.txt",
        "urlList": normalized,
    }
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(
        INDEXNOW_ENDPOINT,
        data=body,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=timeout) as response:
            return len(normalized), response.status
    except error.HTTPError as exc:
        return len(normalized), exc.code
