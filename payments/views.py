from decimal import Decimal

from django.conf import settings
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.http import Http404, HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, redirect
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from appointments.models import Appointment, ArtistBookingSettings

from .copy import get_copy
from .models import AppointmentDeposit, ArtistStripeAccount
from .stripe_api import (
    StripeAPIError,
    create_account_link,
    create_connected_account,
    create_direct_checkout_session,
    parse_webhook_event,
    retrieve_connected_account,
    stripe_is_configured,
    verify_webhook_signature,
)


def _is_verified_artist(user):
    profile = getattr(user, "profile", None)
    return bool(
        profile
        and profile.account_type == "tattoo_artist"
        and profile.verification_status == "approved"
    )


def _format_amount(amount):
    value = Decimal(amount or 0).quantize(Decimal("0.01"))
    return f"{value:.2f}".rstrip("0").rstrip(".")


def _sync_account_record(record, payload):
    record.charges_enabled = bool(payload.get("charges_enabled"))
    record.payouts_enabled = bool(payload.get("payouts_enabled"))
    record.details_submitted = bool(payload.get("details_submitted"))
    record.last_synced_at = timezone.now()
    record.save(
        update_fields=[
            "charges_enabled",
            "payouts_enabled",
            "details_submitted",
            "last_synced_at",
            "updated_at",
        ]
    )
    return record


def _account_payload(request, record):
    copy = get_copy(request)
    configured = stripe_is_configured()
    if not configured:
        state = "unavailable"
        label = copy["payments_unavailable"]
    elif not record:
        state = "not_connected"
        label = copy["not_connected"]
    elif record.is_ready:
        state = "ready"
        label = copy["ready"]
    else:
        state = "onboarding"
        label = copy["onboarding"]

    return {
        "ok": True,
        "configured": configured,
        "state": state,
        "label": label,
        "ready": bool(record and record.is_ready),
        "charges_enabled": bool(record and record.charges_enabled),
        "payouts_enabled": bool(record and record.payouts_enabled),
        "details_submitted": bool(record and record.details_submitted),
        "copy": {
            key: copy[key]
            for key in (
                "dashboard_title",
                "dashboard_intro",
                "connect",
                "continue",
                "payments_unavailable",
            )
        },
    }


def _connect_link_response(request, record):
    refresh_url = request.build_absolute_uri(reverse("payments:connect_refresh"))
    return_url = request.build_absolute_uri(reverse("payments:connect_return"))
    account_link = create_account_link(
        account_id=record.stripe_account_id,
        refresh_url=refresh_url,
        return_url=return_url,
    )
    url = account_link.get("url")
    if not url:
        raise StripeAPIError("stripe_missing_account_link")
    return redirect(url)


@login_required
@require_GET
def connect_status(request):
    if not _is_verified_artist(request.user):
        raise Http404
    record = ArtistStripeAccount.objects.filter(artist=request.user).first()
    return JsonResponse(_account_payload(request, record))


@login_required
@require_POST
def connect_start(request):
    if not _is_verified_artist(request.user):
        raise Http404
    copy = get_copy(request)
    if not stripe_is_configured():
        messages.error(request, copy["payments_unavailable"])
        return redirect("artist_booking_settings")

    record = ArtistStripeAccount.objects.filter(artist=request.user).first()
    try:
        if not record:
            stripe_account = create_connected_account(email=request.user.email or "")
            record = ArtistStripeAccount.objects.create(
                artist=request.user,
                stripe_account_id=stripe_account["id"],
            )
            _sync_account_record(record, stripe_account)
        return _connect_link_response(request, record)
    except (StripeAPIError, KeyError):
        messages.error(request, copy["connect_error"])
        return redirect("artist_booking_settings")


@login_required
@require_GET
def connect_refresh(request):
    if not _is_verified_artist(request.user):
        raise Http404
    record = ArtistStripeAccount.objects.filter(artist=request.user).first()
    if not record:
        messages.error(request, get_copy(request)["connect_error"])
        return redirect("artist_booking_settings")
    try:
        return _connect_link_response(request, record)
    except StripeAPIError:
        messages.error(request, get_copy(request)["connect_error"])
        return redirect("artist_booking_settings")


@login_required
@require_GET
def connect_return(request):
    if not _is_verified_artist(request.user):
        raise Http404
    record = ArtistStripeAccount.objects.filter(artist=request.user).first()
    if not record:
        return redirect("artist_booking_settings")

    try:
        stripe_account = retrieve_connected_account(record.stripe_account_id)
        _sync_account_record(record, stripe_account)
    except StripeAPIError:
        pass
    return redirect("artist_booking_settings")


def _appointment_for_participant(request, appointment_id):
    appointment = get_object_or_404(
        Appointment.objects.select_related("client", "artist"),
        pk=appointment_id,
    )
    if request.user not in {appointment.client, appointment.artist}:
        raise Http404
    return appointment


@login_required
@require_GET
def deposit_status(request, appointment_id):
    appointment = _appointment_for_participant(request, appointment_id)
    copy = get_copy(request)
    deposit = AppointmentDeposit.objects.filter(appointment=appointment).first()
    if not deposit:
        return JsonResponse({"ok": True, "has_deposit": False})

    deposit.refresh_expiry_state()
    amount = _format_amount(deposit.amount)
    role = "artist" if request.user == appointment.artist else "client"
    can_pay = bool(
        role == "client"
        and appointment.status == Appointment.STATUS_ACCEPTED
        and deposit.is_payable
    )

    return JsonResponse(
        {
            "ok": True,
            "has_deposit": True,
            "role": role,
            "amount": amount,
            "currency": deposit.currency.upper(),
            "status": deposit.status,
            "can_pay": can_pay,
            "expires_at": deposit.expires_at.isoformat() if deposit.expires_at else None,
            "checkout_url": reverse(
                "payments:deposit_checkout", args=[appointment.pk]
            ),
            "copy": {
                key: copy[key]
                for key in (
                    "deposit_title",
                    "deposit_pending",
                    "deposit_checkout",
                    "deposit_paid",
                    "deposit_refunded",
                    "deposit_expired",
                    "deposit_cancelled",
                    "deposit_failed",
                    "deposit_artist_pending",
                    "deposit_artist_paid",
                    "deposit_due",
                    "checkout_error",
                )
            },
        }
    )


@login_required
@require_POST
def deposit_checkout(request, appointment_id):
    appointment = get_object_or_404(
        Appointment.objects.select_related("client", "artist"),
        pk=appointment_id,
        client=request.user,
        status=Appointment.STATUS_ACCEPTED,
    )
    deposit = get_object_or_404(AppointmentDeposit, appointment=appointment)
    deposit.refresh_expiry_state()
    if not deposit.is_payable:
        return JsonResponse({"ok": False, "error": "deposit_not_payable"}, status=409)

    account = ArtistStripeAccount.objects.filter(
        artist=appointment.artist,
        stripe_account_id=deposit.connected_account_id,
    ).first()
    if not account or not account.is_ready:
        return JsonResponse({"ok": False, "error": "artist_stripe_not_ready"}, status=409)

    success_base = request.build_absolute_uri(
        reverse("payments:deposit_return", args=[appointment.pk])
    )
    success_url = f"{success_base}?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = request.build_absolute_uri(
        reverse("appointment_detail", kwargs={"appointment_id": appointment.pk})
    )

    try:
        session = create_direct_checkout_session(
            connected_account_id=deposit.connected_account_id,
            deposit_id=deposit.pk,
            appointment_id=appointment.pk,
            amount_cents=int(deposit.amount * 100),
            currency=deposit.currency,
            success_url=success_url,
            cancel_url=cancel_url,
        )
    except StripeAPIError:
        return JsonResponse(
            {"ok": False, "error": get_copy(request)["checkout_error"]},
            status=502,
        )

    url = session.get("url")
    if not url:
        return JsonResponse({"ok": False, "error": "checkout_url_missing"}, status=502)

    deposit.checkout_session_id = session.get("id", "")
    deposit.status = AppointmentDeposit.STATUS_CHECKOUT
    deposit.save(update_fields=["checkout_session_id", "status", "updated_at"])
    return JsonResponse({"ok": True, "url": url})


@login_required
@require_GET
def deposit_return(request, appointment_id):
    appointment = get_object_or_404(Appointment, pk=appointment_id, client=request.user)
    messages.info(request, get_copy(request)["payment_return"])
    return redirect("appointment_detail", appointment_id=appointment.pk)


def _event_deposit(event):
    obj = event.get("data", {}).get("object", {})
    metadata = obj.get("metadata") or {}
    deposit_id = metadata.get("deposit_id")
    connected_account_id = event.get("account") or ""
    if not deposit_id or not connected_account_id:
        return None, obj
    try:
        deposit = AppointmentDeposit.objects.get(
            pk=int(deposit_id),
            connected_account_id=connected_account_id,
        )
    except (AppointmentDeposit.DoesNotExist, TypeError, ValueError):
        return None, obj
    return deposit, obj


@csrf_exempt
@require_POST
def stripe_webhook(request):
    secret = getattr(settings, "STRIPE_CONNECT_WEBHOOK_SECRET", "")
    signature = request.headers.get("Stripe-Signature", "")
    if not verify_webhook_signature(request.body, signature, secret):
        return HttpResponse(status=400)

    try:
        event = parse_webhook_event(request.body)
    except StripeAPIError:
        return HttpResponse(status=400)

    event_type = event.get("type")
    obj = event.get("data", {}).get("object", {})

    if event_type == "account.updated":
        account_id = obj.get("id")
        record = ArtistStripeAccount.objects.filter(stripe_account_id=account_id).first()
        if record:
            _sync_account_record(record, obj)
        return HttpResponse(status=200)

    deposit, obj = _event_deposit(event)
    if not deposit:
        return HttpResponse(status=200)
    if deposit.last_stripe_event_id == event.get("id"):
        return HttpResponse(status=200)

    update_fields = ["last_stripe_event_id", "updated_at"]
    deposit.last_stripe_event_id = event.get("id", "")

    if event_type == "checkout.session.completed" and obj.get("payment_status") == "paid":
        if deposit.status != AppointmentDeposit.STATUS_REFUNDED:
            deposit.status = AppointmentDeposit.STATUS_PAID
            deposit.payment_intent_id = obj.get("payment_intent") or deposit.payment_intent_id
            deposit.paid_at = timezone.now()
            update_fields.extend(["status", "payment_intent_id", "paid_at"])
    elif event_type == "payment_intent.succeeded":
        if deposit.status != AppointmentDeposit.STATUS_REFUNDED:
            deposit.status = AppointmentDeposit.STATUS_PAID
            deposit.payment_intent_id = obj.get("id") or deposit.payment_intent_id
            deposit.paid_at = timezone.now()
            update_fields.extend(["status", "payment_intent_id", "paid_at"])
    elif event_type == "payment_intent.payment_failed":
        if deposit.status not in {AppointmentDeposit.STATUS_PAID, AppointmentDeposit.STATUS_REFUNDED}:
            deposit.status = AppointmentDeposit.STATUS_FAILED
            update_fields.append("status")
    elif event_type == "checkout.session.expired":
        if deposit.status == AppointmentDeposit.STATUS_CHECKOUT:
            deposit.status = AppointmentDeposit.STATUS_PENDING
            update_fields.append("status")
    elif event_type == "charge.refunded" and obj.get("refunded"):
        deposit.status = AppointmentDeposit.STATUS_REFUNDED
        deposit.refunded_at = timezone.now()
        update_fields.extend(["status", "refunded_at"])

    deposit.save(update_fields=list(dict.fromkeys(update_fields)))
    return HttpResponse(status=200)
