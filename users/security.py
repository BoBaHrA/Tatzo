import hashlib

from django.conf import settings
from django.core.cache import cache
from django.http import JsonResponse
from django.utils import timezone
from django.utils.translation import gettext as _


def get_client_ip(request):
    cloudflare_ip = request.META.get("HTTP_CF_CONNECTING_IP")

    if cloudflare_ip:
        return cloudflare_ip.strip()

    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")

    if forwarded_for:
        return forwarded_for.split(",")[0].strip()

    return request.META.get("REMOTE_ADDR", "") or "unknown"


def is_new_account(user, hours=24):
    if not user or not user.is_authenticated:
        return False

    return user.date_joined >= timezone.now() - timezone.timedelta(hours=hours)


def _hash_value(value):
    raw = str(value or "unknown").encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:32]


def _identity(request, identity="ip", value=None):
    if value is not None:
        return str(value).strip().lower() or "unknown"

    if identity == "user" and request.user.is_authenticated:
        return f"user:{request.user.pk}"

    if identity == "user_or_ip":
        if request.user.is_authenticated:
            return f"user:{request.user.pk}"

        return f"ip:{get_client_ip(request)}"

    return f"ip:{get_client_ip(request)}"


def check_rate_limit(request, scope, limit, window_seconds, identity="ip", value=None):
    if not getattr(settings, "TATZO_RATE_LIMIT_ENABLED", True):
        return True, 0

    if getattr(request.user, "is_staff", False) or getattr(request.user, "is_superuser", False):
        return True, 0

    identifier = _identity(request, identity=identity, value=value)
    key = f"tatzo:rl:{scope}:{_hash_value(identifier)}"
    reset_key = f"{key}:reset"

    count = cache.get(key, 0)

    if count >= limit:
        reset_at = cache.get(reset_key)

        if reset_at:
            retry_after = max(1, int(reset_at - timezone.now().timestamp()))
        else:
            retry_after = window_seconds

        return False, retry_after

    if count == 0:
        cache.set(key, 1, window_seconds)
        cache.set(reset_key, int(timezone.now().timestamp()) + window_seconds, window_seconds)
    else:
        try:
            cache.incr(key)
        except ValueError:
            cache.set(key, 1, window_seconds)
            cache.set(reset_key, int(timezone.now().timestamp()) + window_seconds, window_seconds)

    return True, 0


def rate_limited_json(retry_after=0, message=None):
    return JsonResponse(
        {
            "ok": False,
            "error": message or _("Too many actions. Please wait a bit and try again."),
            "retry_after": retry_after,
        },
        status=429,
    )