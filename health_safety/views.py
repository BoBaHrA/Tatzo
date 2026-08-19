from datetime import datetime, timedelta

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.http import Http404, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST

from appointments.models import Appointment

from .copy import get_copy
from .models import (
    AppointmentHealthDeclaration,
    HEALTH_BOOLEAN_FIELDS,
    HealthSafetyCard,
    HealthSafetyShare,
    HealthSafetyShareIntent,
)


BOOLEAN_FIELDS = HEALTH_BOOLEAN_FIELDS


FIELD_COPY_KEYS = (
    ("bleeding_clotting_condition", "bleeding"),
    ("blood_thinning_medication", "blood_thinners"),
    ("diabetes_or_blood_sugar_condition", "diabetes"),
    ("relevant_skin_condition", "skin"),
    ("relevant_allergy_sensitivity", "allergy"),
    ("immune_or_healing_condition", "immune"),
)


def _form_state(card=None, post_data=None):
    if post_data is not None:
        return {
            **{field: post_data.get(field) == "on" for field in BOOLEAN_FIELDS},
            "other_relevant_information": (
                post_data.get("other_relevant_information") or ""
            ).strip()[:1000],
            "explicit_storage_consent": post_data.get("explicit_storage_consent") == "on",
        }

    return {
        **{field: bool(getattr(card, field, False)) for field in BOOLEAN_FIELDS},
        "other_relevant_information": getattr(card, "other_relevant_information", "") or "",
        "explicit_storage_consent": bool(
            getattr(card, "explicit_storage_consent", False)
        ),
    }


def _declared_items(source, copy):
    if not source:
        return []
    return [
        copy[copy_key]
        for field, copy_key in FIELD_COPY_KEYS
        if getattr(source, field, False)
    ]


def _appointment_or_404_for_participant(request, appointment_id):
    appointment = get_object_or_404(
        Appointment.objects.select_related("client", "artist"),
        pk=appointment_id,
    )
    if request.user not in {appointment.client, appointment.artist}:
        raise Http404
    return appointment


def _card_for_user(user):
    return HealthSafetyCard.objects.filter(
        user=user,
        explicit_storage_consent=True,
    ).first()


def _active_health_source(appointment):
    share = (
        HealthSafetyShare.objects.filter(appointment=appointment)
        .select_related("card", "appointment", "appointment__client", "appointment__artist")
        .first()
    )
    declaration = (
        AppointmentHealthDeclaration.objects.filter(appointment=appointment)
        .select_related("appointment", "appointment__client", "appointment__artist")
        .first()
    )

    if share and share.is_active:
        return "card", share, share.card
    if declaration and declaration.is_active:
        return "quick", declaration, declaration
    return None, share or declaration, None


@login_required
def card(request):
    copy = get_copy(request)
    health_card = HealthSafetyCard.objects.filter(user=request.user).first()

    if request.method == "POST":
        state = _form_state(post_data=request.POST)
        if not state["explicit_storage_consent"]:
            messages.error(request, copy["consent_required"])
            return render(
                request,
                "health_safety/card.html",
                {
                    "copy": copy,
                    "card": health_card,
                    "form_state": state,
                    "shares": [],
                    "seo_robots": "noindex, nofollow",
                },
                status=400,
            )

        defaults = {field: state[field] for field in BOOLEAN_FIELDS}
        defaults.update(
            {
                "other_relevant_information": state["other_relevant_information"],
                "explicit_storage_consent": True,
                "consent_version": HealthSafetyCard.CONSENT_VERSION,
                "consented_at": timezone.now(),
            }
        )
        health_card, _ = HealthSafetyCard.objects.update_or_create(
            user=request.user,
            defaults=defaults,
        )
        messages.success(request, copy["saved"])
        return redirect("health_safety:card")

    shares = []
    if health_card:
        shares = [
            share
            for share in HealthSafetyShare.objects.filter(card=health_card)
            .select_related("appointment", "appointment__artist")
            .order_by("-granted_at")[:20]
            if share.is_active
        ]

    return render(
        request,
        "health_safety/card.html",
        {
            "copy": copy,
            "card": health_card,
            "form_state": _form_state(health_card),
            "shares": shares,
            "seo_robots": "noindex, nofollow",
        },
    )


@login_required
@require_POST
def delete_card(request):
    copy = get_copy(request)
    HealthSafetyCard.objects.filter(user=request.user).delete()
    HealthSafetyShareIntent.objects.filter(
        client=request.user,
        source=HealthSafetyShareIntent.SOURCE_CARD,
    ).delete()
    messages.success(request, copy["deleted"])
    return redirect("health_safety:card")


@login_required
@require_GET
def status(request):
    copy = get_copy(request)
    health_card = _card_for_user(request.user)
    return JsonResponse(
        {
            "ok": True,
            "has_card": bool(health_card),
            "declared_count": health_card.declared_issue_count if health_card else 0,
            "updated_at": health_card.updated_at.isoformat() if health_card else None,
            "card_url": reverse("health_safety:card"),
            "field_labels": {
                field: copy[copy_key]
                for field, copy_key in FIELD_COPY_KEYS
            },
            "copy": {
                key: copy[key]
                for key in (
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
                    "other",
                    "other_help",
                )
            },
        }
    )


@login_required
@require_POST
def share_intent(request):
    artist_username = (request.POST.get("artist") or "").strip()
    date_raw = (request.POST.get("date") or "").strip()
    time_raw = (request.POST.get("start_time") or "").strip()
    mode = (request.POST.get("mode") or "").strip().lower()
    if not mode:
        mode = "card" if request.POST.get("share") == "true" else "none"

    try:
        appointment_date = datetime.strptime(date_raw, "%Y-%m-%d").date()
        start_time = datetime.strptime(time_raw, "%H:%M").time()
    except ValueError:
        return JsonResponse({"ok": False, "error": "invalid_slot"}, status=400)

    artist = get_object_or_404(
        User.objects.select_related("profile"),
        username=artist_username,
        is_active=True,
    )
    profile = getattr(artist, "profile", None)
    if artist == request.user or not profile or profile.account_type != "tattoo_artist":
        raise Http404

    cutoff = timezone.now() - timedelta(hours=24)
    HealthSafetyShareIntent.objects.filter(
        client=request.user,
        created_at__lt=cutoff,
    ).delete()

    matching = HealthSafetyShareIntent.objects.filter(
        client=request.user,
        artist=artist,
        appointment_date=appointment_date,
        start_time=start_time,
    )
    matching.delete()

    if mode == "none":
        return JsonResponse({"ok": True, "sharing": False, "mode": "none"})

    if mode == "card":
        if not _card_for_user(request.user):
            return JsonResponse({"ok": False, "error": "card_required"}, status=409)
        HealthSafetyShareIntent.objects.create(
            client=request.user,
            artist=artist,
            appointment_date=appointment_date,
            start_time=start_time,
            source=HealthSafetyShareIntent.SOURCE_CARD,
        )
        return JsonResponse({"ok": True, "sharing": True, "mode": "card"})

    if mode != "quick":
        return JsonResponse({"ok": False, "error": "invalid_mode"}, status=400)

    if request.POST.get("share_consent") != "true":
        return JsonResponse({"ok": False, "error": "share_consent_required"}, status=400)

    health_values = {
        field: request.POST.get(field) == "true"
        for field in BOOLEAN_FIELDS
    }
    other = (request.POST.get("other_relevant_information") or "").strip()[:1000]
    confirmed_none = request.POST.get("confirmed_none") == "true"
    has_declared_item = any(health_values.values()) or bool(other)

    if confirmed_none and has_declared_item:
        return JsonResponse({"ok": False, "error": "conflicting_declaration"}, status=400)
    if not confirmed_none and not has_declared_item:
        return JsonResponse({"ok": False, "error": "declaration_required"}, status=400)

    HealthSafetyShareIntent.objects.create(
        client=request.user,
        artist=artist,
        appointment_date=appointment_date,
        start_time=start_time,
        source=HealthSafetyShareIntent.SOURCE_QUICK,
        other_relevant_information=other,
        confirmed_none=confirmed_none,
        save_to_card=request.POST.get("save_to_card") == "true",
        **health_values,
    )
    return JsonResponse({"ok": True, "sharing": True, "mode": "quick"})


@login_required
@require_GET
def appointment_context(request, appointment_id):
    appointment = _appointment_or_404_for_participant(request, appointment_id)
    copy = get_copy(request)
    source_type, source_record, data_source = _active_health_source(appointment)
    active = bool(source_type and data_source)

    payload = {
        "ok": True,
        "role": "artist" if request.user == appointment.artist else "client",
        "active": active,
        "source": source_type,
        "shared": bool(source_record),
        "expires_on": source_record.expires_on.isoformat() if source_record else None,
        "card_url": reverse("health_safety:card"),
        "copy": {
            key: copy[key]
            for key in (
                "artist_title",
                "artist_intro",
                "client_shared",
                "client_quick_shared",
                "client_not_shared",
                "share_now",
                "revoke",
                "manage_card",
                "expires",
                "none_declared",
            )
        },
    }

    if request.user == appointment.client:
        card_obj = _card_for_user(request.user)
        payload["has_card"] = bool(card_obj)
        payload["can_share"] = bool(
            card_obj
            and not active
            and appointment.booking_type == Appointment.TYPE_TATTOO
            and appointment.status
            not in {Appointment.STATUS_CANCELLED, Appointment.STATUS_DECLINED}
            and timezone.localdate()
            <= appointment.date + timedelta(days=HealthSafetyShare.ACCESS_DAYS_AFTER_APPOINTMENT)
        )
        return JsonResponse(payload)

    if active:
        payload["items"] = _declared_items(data_source, copy)
        payload["other"] = (data_source.other_relevant_information or "").strip()
        payload["confirmed_none"] = bool(
            getattr(data_source, "confirmed_none", False)
        )
    else:
        payload["items"] = []
        payload["other"] = ""
        payload["confirmed_none"] = False
    return JsonResponse(payload)


@login_required
@require_POST
def share_appointment(request, appointment_id):
    appointment = get_object_or_404(
        Appointment.objects.select_related("client", "artist"),
        pk=appointment_id,
        client=request.user,
    )
    if (
        appointment.booking_type != Appointment.TYPE_TATTOO
        or appointment.status in {Appointment.STATUS_CANCELLED, Appointment.STATUS_DECLINED}
    ):
        return JsonResponse({"ok": False, "error": "not_shareable"}, status=409)

    card_obj = _card_for_user(request.user)
    if not card_obj:
        return JsonResponse({"ok": False, "error": "card_required"}, status=409)

    if timezone.localdate() > appointment.date + timedelta(
        days=HealthSafetyShare.ACCESS_DAYS_AFTER_APPOINTMENT
    ):
        return JsonResponse({"ok": False, "error": "expired"}, status=409)

    declaration = AppointmentHealthDeclaration.objects.filter(
        appointment=appointment,
        revoked_at__isnull=True,
    ).first()
    if declaration:
        declaration.revoked_at = timezone.now()
        declaration.save(update_fields=["revoked_at"])

    HealthSafetyShare.objects.update_or_create(
        appointment=appointment,
        defaults={
            "card": card_obj,
            "granted_at": timezone.now(),
            "revoked_at": None,
        },
    )
    return JsonResponse({"ok": True, "message": get_copy(request)["share_success"]})


@login_required
@require_POST
def revoke_share(request, appointment_id):
    appointment = get_object_or_404(
        Appointment.objects.select_related("client"),
        pk=appointment_id,
        client=request.user,
    )
    share = HealthSafetyShare.objects.filter(appointment=appointment).first()
    declaration = AppointmentHealthDeclaration.objects.filter(appointment=appointment).first()

    if not share and not declaration:
        raise Http404

    now = timezone.now()
    if share and not share.revoked_at:
        share.revoked_at = now
        share.save(update_fields=["revoked_at"])
    if declaration and not declaration.revoked_at:
        declaration.revoked_at = now
        declaration.save(update_fields=["revoked_at"])

    return JsonResponse({"ok": True, "message": get_copy(request)["revoke_success"]})
