from decimal import Decimal, InvalidOperation
from urllib.parse import urlencode

from django.conf import settings
from django.db import transaction
from django.http import Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from appointments.models import Appointment
from appointments.views import _get_artist_settings
from payments.copy import get_copy
from payments.models import AppointmentDeposit, ArtistStripeAccount
from payments.stripe_api import (
    StripeAPIError,
    create_account_link,
    create_connected_account,
    create_direct_checkout_session,
    retrieve_connected_account,
    stripe_is_configured,
)
from users.security import check_rate_limit

ARTIST_COPY_KEYS = (
    "dashboard_title",
    "dashboard_intro",
    "not_connected",
    "onboarding",
    "ready",
    "connect",
    "continue",
    "payments_unavailable",
    "connect_error",
    "deposit_settings_title",
    "deposit_settings_intro",
    "deposit_toggle",
    "deposit_amount_label",
    "save_settings",
    "settings_saved",
)

DEPOSIT_COPY_KEYS = (
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
    "payment_return",
    "checkout_error",
)


def _is_verified_artist(user):
    profile = getattr(user, "profile", None)
    return bool(
        profile
        and profile.account_type == "tattoo_artist"
        and profile.verification_status == "approved"
    )


def _copy_payload(request, keys):
    copy = get_copy(request)
    return {key: copy[key] for key in keys}


def _format_amount(amount):
    value = Decimal(amount or 0).quantize(Decimal("0.01"))
    return f"{value:.2f}".rstrip("0").rstrip(".")


def _sync_account(record, payload):
    record.charges_enabled = bool(payload.get("charges_enabled"))
    record.payouts_enabled = bool(payload.get("payouts_enabled"))
    record.details_submitted = bool(payload.get("details_submitted"))
    record.last_synced_at = timezone.now()
    record.save(
        update_fields=(
            "charges_enabled",
            "payouts_enabled",
            "details_submitted",
            "last_synced_at",
            "updated_at",
        )
    )
    return record


def _artist_payment_payload(request, record, booking_settings):
    configured = stripe_is_configured()
    copy = get_copy(request)
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
        "configured": configured,
        "state": state,
        "label": label,
        "ready": bool(record and record.is_ready),
        "charges_enabled": bool(record and record.charges_enabled),
        "payouts_enabled": bool(record and record.payouts_enabled),
        "details_submitted": bool(record and record.details_submitted),
        "deposit_required": bool(booking_settings.deposit_required),
        "deposit_amount": _format_amount(booking_settings.deposit_amount),
        "copy": _copy_payload(request, ARTIST_COPY_KEYS),
    }


def _mobile_deep_link(path, **query):
    scheme = str(getattr(settings, "MOBILE_APP_SCHEME", "tatzo")).rstrip(":/")
    suffix = f"?{urlencode(query)}" if query else ""
    return f"{scheme}://{path.lstrip('/')}{suffix}"


def _mobile_redirect(path, **query):
    response = HttpResponse(status=302)
    response["Location"] = _mobile_deep_link(path, **query)
    response["Cache-Control"] = "no-store"
    return response


class PrivatePaymentResponseMixin:
    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "private, no-store"
        return response


def _deposit_message(copy, deposit, role, amount):
    values = {"amount": amount}
    if deposit.status == AppointmentDeposit.STATUS_PAID:
        key = "deposit_artist_paid" if role == "artist" else "deposit_paid"
    elif deposit.status == AppointmentDeposit.STATUS_REFUNDED:
        key = "deposit_refunded"
    elif deposit.status == AppointmentDeposit.STATUS_EXPIRED:
        key = "deposit_expired"
    elif deposit.status == AppointmentDeposit.STATUS_CANCELLED:
        key = "deposit_cancelled"
    elif deposit.status == AppointmentDeposit.STATUS_FAILED:
        key = "deposit_failed"
    else:
        key = "deposit_artist_pending" if role == "artist" else "deposit_pending"
    return copy[key] % values


def _deposit_payload(request, appointment, deposit):
    if not deposit:
        return {"has_deposit": False}
    deposit.refresh_expiry_state()
    amount = _format_amount(deposit.amount)
    role = "artist" if appointment.artist_id == request.user.pk else "client"
    can_pay = bool(
        role == "client"
        and appointment.status == Appointment.STATUS_ACCEPTED
        and deposit.is_payable
    )
    copy = get_copy(request)
    return {
        "has_deposit": True,
        "role": role,
        "amount": amount,
        "currency": deposit.currency.upper(),
        "status": deposit.status,
        "message": _deposit_message(copy, deposit, role, amount),
        "can_pay": can_pay,
        "expires_at": deposit.expires_at,
        "action_label": copy["deposit_checkout"] % {"amount": amount},
        "copy": _copy_payload(request, DEPOSIT_COPY_KEYS),
    }


class ArtistPaymentSettingsView(PrivatePaymentResponseMixin, APIView):
    permission_classes = (IsAuthenticated,)

    def _forbidden(self, request):
        if _is_verified_artist(request.user):
            return None
        return Response(
            {
                "code": "artist_payments_forbidden",
                "detail": "Payments are available only to verified tattoo artists.",
            },
            status=status.HTTP_403_FORBIDDEN,
        )

    def get(self, request):
        forbidden = self._forbidden(request)
        if forbidden:
            return forbidden
        record = ArtistStripeAccount.objects.filter(artist=request.user).first()
        if record and stripe_is_configured():
            try:
                record = _sync_account(
                    record,
                    retrieve_connected_account(record.stripe_account_id),
                )
            except StripeAPIError:
                pass
        return Response(
            _artist_payment_payload(
                request,
                record,
                _get_artist_settings(request.user),
            )
        )

    def patch(self, request):
        forbidden = self._forbidden(request)
        if forbidden:
            return forbidden
        deposit_required = request.data.get("deposit_required")
        if not isinstance(deposit_required, bool):
            return Response(
                {
                    "code": "invalid_deposit_setting",
                    "detail": "The deposit setting must be true or false.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            amount = Decimal(str(request.data.get("deposit_amount") or "0")).quantize(
                Decimal("0.01")
            )
        except (InvalidOperation, TypeError, ValueError):
            amount = Decimal("0")
        if (
            amount < 0
            or amount > Decimal("999999.99")
            or (deposit_required and amount == 0)
        ):
            return Response(
                {
                    "code": "invalid_deposit_amount",
                    "detail": "Choose a deposit amount greater than zero.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            type(request.user).objects.select_for_update().get(pk=request.user.pk)
            record = ArtistStripeAccount.objects.filter(artist=request.user).first()
            if deposit_required and (not record or not record.is_ready):
                return Response(
                    {
                        "code": "stripe_not_ready",
                        "detail": "Finish Stripe onboarding before requiring deposits.",
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            booking_settings = _get_artist_settings(request.user)
            booking_settings.deposit_required = deposit_required
            booking_settings.deposit_amount = amount
            booking_settings.save(
                update_fields=("deposit_required", "deposit_amount", "updated_at")
            )
        return Response(_artist_payment_payload(request, record, booking_settings))


class ArtistPaymentConnectView(PrivatePaymentResponseMixin, APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        if not _is_verified_artist(request.user):
            raise Http404
        if not stripe_is_configured():
            return Response(
                {
                    "code": "stripe_unavailable",
                    "detail": get_copy(request)["payments_unavailable"],
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        allowed, retry_after = check_rate_limit(
            request,
            scope="mobile:payments:connect",
            limit=5,
            window_seconds=60 * 60,
            identity="user",
        )
        if not allowed:
            return Response(
                {
                    "code": "rate_limited",
                    "detail": "Too many Stripe setup attempts. Try again later.",
                    "retry_after": retry_after,
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        try:
            with transaction.atomic():
                type(request.user).objects.select_for_update().get(pk=request.user.pk)
                record = ArtistStripeAccount.objects.filter(artist=request.user).first()
                if not record:
                    stripe_account = create_connected_account(
                        email=request.user.email or ""
                    )
                    record = ArtistStripeAccount.objects.create(
                        artist=request.user,
                        stripe_account_id=stripe_account["id"],
                    )
                    _sync_account(record, stripe_account)
        except (StripeAPIError, KeyError):
            return Response(
                {
                    "code": "stripe_connect_error",
                    "detail": get_copy(request)["connect_error"],
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )
        refresh_url = request.build_absolute_uri(
            reverse("mobile_api:mobile_payment_return") + "?result=refresh"
        )
        return_url = request.build_absolute_uri(
            reverse("mobile_api:mobile_payment_return") + "?result=return"
        )
        try:
            account_link = create_account_link(
                account_id=record.stripe_account_id,
                refresh_url=refresh_url,
                return_url=return_url,
            )
        except StripeAPIError:
            return Response(
                {
                    "code": "stripe_connect_error",
                    "detail": get_copy(request)["connect_error"],
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )
        url = account_link.get("url")
        if not url:
            return Response(
                {
                    "code": "stripe_connect_url_missing",
                    "detail": get_copy(request)["connect_error"],
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response({"url": url})


class MobilePaymentReturnView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)

    def get(self, request):
        result = str(request.query_params.get("result") or "return")
        if result not in {"return", "refresh"}:
            result = "return"
        return _mobile_redirect("artist-dashboard/payments", stripe_return=result)


class AppointmentDepositView(PrivatePaymentResponseMixin, APIView):
    permission_classes = (IsAuthenticated,)

    def _appointment(self, appointment_id, user):
        appointment = get_object_or_404(
            Appointment.objects.select_related("client", "artist"),
            pk=appointment_id,
        )
        if user.pk not in {appointment.client_id, appointment.artist_id}:
            raise Http404
        return appointment

    def get(self, request, appointment_id):
        appointment = self._appointment(appointment_id, request.user)
        deposit = AppointmentDeposit.objects.filter(appointment=appointment).first()
        return Response(_deposit_payload(request, appointment, deposit))

    def post(self, request, appointment_id):
        appointment = get_object_or_404(
            Appointment.objects.select_related("client", "artist"),
            pk=appointment_id,
            client=request.user,
            status=Appointment.STATUS_ACCEPTED,
        )
        deposit = get_object_or_404(AppointmentDeposit, appointment=appointment)
        deposit.refresh_expiry_state()
        if not deposit.is_payable:
            return Response(
                {
                    "code": "deposit_not_payable",
                    "detail": "This deposit is no longer payable.",
                },
                status=status.HTTP_409_CONFLICT,
            )
        account = ArtistStripeAccount.objects.filter(
            artist=appointment.artist,
            stripe_account_id=deposit.connected_account_id,
        ).first()
        if not account or not account.is_ready:
            return Response(
                {
                    "code": "artist_stripe_not_ready",
                    "detail": "The artist cannot accept this deposit right now.",
                },
                status=status.HTTP_409_CONFLICT,
            )
        allowed, retry_after = check_rate_limit(
            request,
            scope=f"mobile:payments:checkout:{appointment.pk}",
            limit=10,
            window_seconds=60 * 60,
            identity="user",
        )
        if not allowed:
            return Response(
                {
                    "code": "rate_limited",
                    "detail": "Too many checkout attempts. Try again later.",
                    "retry_after": retry_after,
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        return_path = reverse(
            "mobile_api:mobile_deposit_return",
            args=[appointment.pk],
        )
        return_base = request.build_absolute_uri(return_path)
        try:
            session = create_direct_checkout_session(
                connected_account_id=deposit.connected_account_id,
                deposit_id=deposit.pk,
                appointment_id=appointment.pk,
                amount_cents=int(deposit.amount * 100),
                currency=deposit.currency,
                success_url=(
                    f"{return_base}?result=success&session_id={{CHECKOUT_SESSION_ID}}"
                ),
                cancel_url=f"{return_base}?result=cancel",
            )
        except StripeAPIError:
            return Response(
                {
                    "code": "stripe_checkout_error",
                    "detail": get_copy(request)["checkout_error"],
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )
        url = session.get("url")
        if not url:
            return Response(
                {
                    "code": "stripe_checkout_url_missing",
                    "detail": get_copy(request)["checkout_error"],
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )
        deposit.checkout_session_id = session.get("id", "")
        deposit.status = AppointmentDeposit.STATUS_CHECKOUT
        deposit.save(update_fields=("checkout_session_id", "status", "updated_at"))
        return Response({"url": url})


class MobileDepositReturnView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)

    def get(self, request, appointment_id):
        result = str(request.query_params.get("result") or "return")
        if result not in {"success", "cancel", "return"}:
            result = "return"
        return _mobile_redirect(
            f"appointment/{appointment_id}",
            payment_return=result,
        )
