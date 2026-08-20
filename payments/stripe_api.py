import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

import requests
from django.conf import settings


class StripeAPIError(RuntimeError):
    pass


def stripe_is_configured():
    return bool(getattr(settings, "STRIPE_SECRET_KEY", ""))


def _api_url(path):
    base = getattr(settings, "STRIPE_API_BASE", "https://api.stripe.com").rstrip("/")
    return f"{base}{path}"


def _request(method, path, *, data=None, connected_account=None, timeout=15):
    secret = getattr(settings, "STRIPE_SECRET_KEY", "")
    if not secret:
        raise StripeAPIError("stripe_not_configured")

    headers = {
        "Authorization": f"Bearer {secret}",
        "Content-Type": "application/x-www-form-urlencoded",
    }
    if connected_account:
        headers["Stripe-Account"] = connected_account

    try:
        response = requests.request(
            method,
            _api_url(path),
            headers=headers,
            data=data or {},
            timeout=timeout,
        )
    except requests.RequestException as exc:
        raise StripeAPIError("stripe_unreachable") from exc

    try:
        payload = response.json()
    except ValueError as exc:
        raise StripeAPIError("stripe_invalid_response") from exc

    if not response.ok:
        message = (
            payload.get("error", {}).get("message")
            if isinstance(payload, dict)
            else None
        ) or "stripe_request_failed"
        raise StripeAPIError(message)

    return payload


def create_connected_account(*, email=""):
    data = {
        "controller[fees][payer]": "account",
        "controller[losses][payments]": "stripe",
        "controller[requirement_collection]": "stripe",
        "controller[stripe_dashboard][type]": "full",
        "metadata[tatzo_role]": "tattoo_artist",
    }
    if email:
        data["email"] = email
    return _request("POST", "/v1/accounts", data=data)


def retrieve_connected_account(account_id):
    return _request("GET", f"/v1/accounts/{account_id}")


def create_account_link(*, account_id, refresh_url, return_url):
    return _request(
        "POST",
        "/v1/account_links",
        data={
            "account": account_id,
            "refresh_url": refresh_url,
            "return_url": return_url,
            "type": "account_onboarding",
            "collection_options[fields]": "eventually_due",
        },
    )


def create_direct_checkout_session(
    *,
    connected_account_id,
    deposit_id,
    appointment_id,
    amount_cents,
    currency,
    success_url,
    cancel_url,
):
    data = {
        "mode": "payment",
        "line_items[0][price_data][currency]": currency.lower(),
        "line_items[0][price_data][product_data][name]": "Tatzo booking deposit",
        "line_items[0][price_data][unit_amount]": str(int(amount_cents)),
        "line_items[0][quantity]": "1",
        "client_reference_id": str(appointment_id),
        "metadata[deposit_id]": str(deposit_id),
        "metadata[appointment_id]": str(appointment_id),
        "payment_intent_data[metadata][deposit_id]": str(deposit_id),
        "payment_intent_data[metadata][appointment_id]": str(appointment_id),
        "success_url": success_url,
        "cancel_url": cancel_url,
    }
    return _request(
        "POST",
        "/v1/checkout/sessions",
        data=data,
        connected_account=connected_account_id,
    )


def verify_webhook_signature(payload, signature_header, secret, *, tolerance=300):
    if not secret or not signature_header:
        return False

    timestamp = None
    signatures = []
    for part in signature_header.split(","):
        key, _, value = part.strip().partition("=")
        if key == "t":
            try:
                timestamp = int(value)
            except ValueError:
                return False
        elif key == "v1":
            signatures.append(value)

    if timestamp is None or not signatures:
        return False
    if abs(int(time.time()) - timestamp) > tolerance:
        return False

    if isinstance(payload, bytes):
        payload_text = payload.decode("utf-8")
    else:
        payload_text = str(payload)

    signed_payload = f"{timestamp}.{payload_text}".encode("utf-8")
    expected = hmac.new(
        secret.encode("utf-8"),
        signed_payload,
        hashlib.sha256,
    ).hexdigest()
    return any(hmac.compare_digest(expected, signature) for signature in signatures)


def parse_webhook_event(payload):
    try:
        if isinstance(payload, bytes):
            payload = payload.decode("utf-8")
        event = json.loads(payload)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise StripeAPIError("invalid_webhook_payload") from exc

    if not isinstance(event, dict) or not event.get("id") or not event.get("type"):
        raise StripeAPIError("invalid_webhook_event")
    return event
