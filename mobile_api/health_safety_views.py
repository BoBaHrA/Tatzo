from datetime import timedelta

from django.db import transaction
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from appointments.models import Appointment
from health_safety.copy import get_copy
from health_safety.models import (
    HEALTH_BOOLEAN_FIELDS,
    AppointmentHealthDeclaration,
    HealthSafetyCard,
    HealthSafetyShare,
    HealthSafetyShareIntent,
)

FIELD_COPY_KEYS = (
    ("bleeding_clotting_condition", "bleeding"),
    ("blood_thinning_medication", "blood_thinners"),
    ("diabetes_or_blood_sugar_condition", "diabetes"),
    ("relevant_skin_condition", "skin"),
    ("relevant_allergy_sensitivity", "allergy"),
    ("immune_or_healing_condition", "immune"),
)

CARD_COPY_KEYS = (
    "nav",
    "eyebrow",
    "title",
    "intro",
    "privacy",
    "other",
    "other_help",
    "consent",
    "save",
    "delete",
    "saved",
    "deleted",
    "consent_required",
    "shared_with",
    "no_shares",
)

BOOKING_COPY_KEYS = (
    "booking_title",
    "booking_ready",
    "booking_share",
    "booking_missing",
    "booking_create",
    "booking_quick",
    "booking_quick_intro",
    "booking_none",
    "booking_confirm_none",
    "booking_quick_consent",
    "booking_save_quick",
    "booking_validation",
    "booking_consent_required",
    "booking_error",
    "artist_title",
    "artist_intro",
    "client_shared",
    "client_quick_shared",
    "client_not_shared",
    "share_now",
    "revoke",
    "manage_card",
    "expires",
    "share_success",
    "revoke_success",
    "none_declared",
)


def _copy_payload(request, keys):
    copy = get_copy(request)
    return {key: copy[key] for key in keys}


def _field_payload(request):
    copy = get_copy(request)
    return [
        {"key": field, "label": copy[copy_key]} for field, copy_key in FIELD_COPY_KEYS
    ]


def _health_values(source):
    return {
        field: bool(getattr(source, field, False)) for field in HEALTH_BOOLEAN_FIELDS
    }


def _parse_boolean_values(data):
    values = {}
    for field in HEALTH_BOOLEAN_FIELDS:
        value = data.get(field, False)
        if not isinstance(value, bool):
            return None
        values[field] = value
    return values


def _active_health_source(appointment):
    share = (
        HealthSafetyShare.objects.filter(appointment=appointment)
        .select_related("card", "appointment")
        .first()
    )
    declaration = (
        AppointmentHealthDeclaration.objects.filter(appointment=appointment)
        .select_related("appointment")
        .first()
    )
    if share and share.is_active:
        return "card", share, share.card
    if declaration and declaration.is_active:
        return "quick", declaration, declaration
    return None, share or declaration, None


def _appointment_context_payload(appointment, request):
    role = "artist" if appointment.artist_id == request.user.pk else "client"
    source_type, source_record, data_source = _active_health_source(appointment)
    active = bool(source_type and data_source)
    payload = {
        "role": role,
        "active": active,
        "source": source_type,
        "shared": bool(source_record),
        "expires_on": source_record.expires_on if source_record else None,
        "fields": _field_payload(request),
        "copy": _copy_payload(request, BOOKING_COPY_KEYS),
    }

    if role == "client":
        card = HealthSafetyCard.objects.filter(
            user=request.user,
            explicit_storage_consent=True,
        ).first()
        within_access_window = timezone.localdate() <= appointment.date + timedelta(
            days=HealthSafetyShare.ACCESS_DAYS_AFTER_APPOINTMENT
        )
        shareable_appointment = (
            appointment.booking_type == Appointment.TYPE_TATTOO
            and appointment.status
            not in {Appointment.STATUS_CANCELLED, Appointment.STATUS_DECLINED}
            and within_access_window
        )
        payload.update(
            {
                "has_card": bool(card),
                "can_share_card": bool(card and not active and shareable_appointment),
                "can_share_quick": bool(not active and shareable_appointment),
                "items": [],
                "other": "",
                "confirmed_none": False,
            }
        )
        return payload

    if active:
        copy = get_copy(request)
        payload["items"] = [
            copy[copy_key]
            for field, copy_key in FIELD_COPY_KEYS
            if getattr(data_source, field, False)
        ]
        payload["other"] = (data_source.other_relevant_information or "").strip()
        payload["confirmed_none"] = bool(getattr(data_source, "confirmed_none", False))
    else:
        payload["items"] = []
        payload["other"] = ""
        payload["confirmed_none"] = False
    return payload


def validate_health_submission(data, client, booking_type):
    """Validate optional native booking health data without persisting it."""
    mode = str(data.get("health_mode") or "none").strip().lower()
    if mode not in {"none", "card", "quick"}:
        return None, {
            "code": "invalid_health_mode",
            "detail": "Choose a valid Health & Safety sharing option.",
        }
    if booking_type != Appointment.TYPE_TATTOO:
        if mode != "none":
            return None, {
                "code": "health_not_applicable",
                "detail": "Health & Safety sharing is available for tattoo sessions only.",
            }
        return {"mode": "none"}, None
    if mode == "none":
        return {"mode": "none"}, None
    if mode == "card":
        card = HealthSafetyCard.objects.filter(
            user=client,
            explicit_storage_consent=True,
        ).first()
        if not card:
            return None, {
                "code": "health_card_required",
                "detail": "Create a private Health & Safety Card before sharing it.",
            }
        return {"mode": "card", "card": card}, None

    if (
        data.get("health_share_consent") is not True
        and str(data.get("health_share_consent", "")).lower() != "true"
    ):
        return None, {
            "code": "health_share_consent_required",
            "detail": "Confirm that you agree to share these health answers with the artist.",
        }
    values = {}
    for field in HEALTH_BOOLEAN_FIELDS:
        raw = data.get(field, False)
        if isinstance(raw, bool):
            values[field] = raw
        elif str(raw).lower() in {"true", "false", ""}:
            values[field] = str(raw).lower() == "true"
        else:
            return None, {
                "code": "invalid_health_answers",
                "detail": "Check the Health & Safety answers and try again.",
            }
    other = str(data.get("health_other_relevant_information") or "").strip()
    if len(other) > 1000:
        return None, {
            "code": "health_note_too_long",
            "detail": "Keep the Health & Safety note under 1000 characters.",
        }
    confirmed_none = (
        data.get("health_confirmed_none") is True
        or str(data.get("health_confirmed_none", "")).lower() == "true"
    )
    has_declared_item = any(values.values()) or bool(other)
    if confirmed_none and has_declared_item:
        return None, {
            "code": "conflicting_health_declaration",
            "detail": "Do not confirm none while declaring a Health & Safety item.",
        }
    if not confirmed_none and not has_declared_item:
        return None, {
            "code": "health_declaration_required",
            "detail": "Declare an item, add a note, or confirm that none apply.",
        }
    return {
        "mode": "quick",
        "values": values,
        "other": other,
        "confirmed_none": confirmed_none,
        "save_to_card": data.get("health_save_to_card") is True
        or str(data.get("health_save_to_card", "")).lower() == "true",
    }, None


def attach_health_submission(appointment, submission):
    mode = submission["mode"]
    if mode == "none":
        return
    now = timezone.now()
    if mode == "card":
        declaration = AppointmentHealthDeclaration.objects.filter(
            appointment=appointment,
            revoked_at__isnull=True,
        ).first()
        if declaration:
            declaration.revoked_at = now
            declaration.save(update_fields=("revoked_at",))
        HealthSafetyShare.objects.update_or_create(
            appointment=appointment,
            defaults={
                "card": submission["card"],
                "granted_at": now,
                "revoked_at": None,
            },
        )
        return

    share = HealthSafetyShare.objects.filter(
        appointment=appointment,
        revoked_at__isnull=True,
    ).first()
    if share:
        share.revoked_at = now
        share.save(update_fields=("revoked_at",))
    declaration_defaults = {
        **submission["values"],
        "other_relevant_information": submission["other"],
        "confirmed_none": submission["confirmed_none"],
        "shared_at": now,
        "revoked_at": None,
    }
    AppointmentHealthDeclaration.objects.update_or_create(
        appointment=appointment,
        defaults=declaration_defaults,
    )
    if submission["save_to_card"]:
        HealthSafetyCard.objects.update_or_create(
            user=appointment.client,
            defaults={
                **submission["values"],
                "other_relevant_information": submission["other"],
                "explicit_storage_consent": True,
                "consent_version": HealthSafetyCard.CONSENT_VERSION,
                "consented_at": now,
            },
        )


class PrivateHealthResponseMixin:
    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "private, no-store"
        return response


class MyHealthSafetyCardView(PrivateHealthResponseMixin, APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        card = HealthSafetyCard.objects.filter(user=request.user).first()
        shares = []
        if card:
            shares = [
                {
                    "appointment_id": share.appointment_id,
                    "artist_username": share.appointment.artist.username,
                    "appointment_date": share.appointment.date,
                    "expires_on": share.expires_on,
                }
                for share in HealthSafetyShare.objects.filter(card=card)
                .select_related("appointment", "appointment__artist")
                .order_by("-granted_at")
                if share.is_active
            ][:20]
        return Response(
            {
                "has_card": bool(card and card.explicit_storage_consent),
                "values": _health_values(card) if card else _health_values(None),
                "other_relevant_information": (
                    card.other_relevant_information if card else ""
                ),
                "declared_count": card.declared_issue_count if card else 0,
                "consent_version": (
                    card.consent_version if card else HealthSafetyCard.CONSENT_VERSION
                ),
                "consented_at": card.consented_at if card else None,
                "updated_at": card.updated_at if card else None,
                "shared_appointments": shares,
                "fields": _field_payload(request),
                "copy": _copy_payload(request, CARD_COPY_KEYS),
            }
        )

    def put(self, request):
        if request.data.get("explicit_storage_consent") is not True:
            return Response(
                {
                    "code": "health_consent_required",
                    "detail": get_copy(request)["consent_required"],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        values = _parse_boolean_values(request.data)
        if values is None:
            return Response(
                {
                    "code": "invalid_health_answers",
                    "detail": "Health & Safety answers must be true or false.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        other = str(request.data.get("other_relevant_information") or "").strip()
        if len(other) > 1000:
            return Response(
                {
                    "code": "health_note_too_long",
                    "detail": "Keep the Health & Safety note under 1000 characters.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        with transaction.atomic():
            type(request.user).objects.select_for_update().get(pk=request.user.pk)
            HealthSafetyCard.objects.update_or_create(
                user=request.user,
                defaults={
                    **values,
                    "other_relevant_information": other,
                    "explicit_storage_consent": True,
                    "consent_version": HealthSafetyCard.CONSENT_VERSION,
                    "consented_at": timezone.now(),
                },
            )
        return self.get(request)

    def delete(self, request):
        with transaction.atomic():
            type(request.user).objects.select_for_update().get(pk=request.user.pk)
            HealthSafetyCard.objects.filter(user=request.user).delete()
            HealthSafetyShareIntent.objects.filter(
                client=request.user,
                source=HealthSafetyShareIntent.SOURCE_CARD,
            ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AppointmentHealthSafetyView(PrivateHealthResponseMixin, APIView):
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
        return Response(_appointment_context_payload(appointment, request))

    def post(self, request, appointment_id):
        with transaction.atomic():
            appointment = get_object_or_404(
                Appointment.objects.select_for_update().select_related(
                    "client", "artist"
                ),
                pk=appointment_id,
                client=request.user,
            )
            if (
                appointment.booking_type != Appointment.TYPE_TATTOO
                or appointment.status
                in {Appointment.STATUS_CANCELLED, Appointment.STATUS_DECLINED}
                or timezone.localdate()
                > appointment.date
                + timedelta(days=HealthSafetyShare.ACCESS_DAYS_AFTER_APPOINTMENT)
            ):
                return Response(
                    {
                        "code": "health_not_shareable",
                        "detail": "Health & Safety information cannot be shared for this appointment.",
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            submission, error = validate_health_submission(
                {
                    **request.data,
                    "health_mode": request.data.get("mode"),
                    "health_share_consent": request.data.get("share_consent"),
                    "health_other_relevant_information": request.data.get(
                        "other_relevant_information"
                    ),
                    "health_confirmed_none": request.data.get("confirmed_none"),
                    "health_save_to_card": request.data.get("save_to_card"),
                },
                request.user,
                appointment.booking_type,
            )
            if error:
                return Response(error, status=status.HTTP_400_BAD_REQUEST)
            if submission["mode"] == "none":
                return Response(
                    {
                        "code": "health_mode_required",
                        "detail": "Choose a Health & Safety sharing option.",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            attach_health_submission(appointment, submission)
        appointment = self._appointment(appointment_id, request.user)
        return Response(_appointment_context_payload(appointment, request))

    def delete(self, request, appointment_id):
        with transaction.atomic():
            appointment = get_object_or_404(
                Appointment.objects.select_for_update(),
                pk=appointment_id,
                client=request.user,
            )
            share = HealthSafetyShare.objects.filter(appointment=appointment).first()
            declaration = AppointmentHealthDeclaration.objects.filter(
                appointment=appointment
            ).first()
            now = timezone.now()
            if share and not share.revoked_at:
                share.revoked_at = now
                share.save(update_fields=("revoked_at",))
            if declaration and not declaration.revoked_at:
                declaration.revoked_at = now
                declaration.save(update_fields=("revoked_at",))
        return Response(status=status.HTTP_204_NO_CONTENT)
