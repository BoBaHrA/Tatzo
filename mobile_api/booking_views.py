import mimetypes
import os
from datetime import datetime, timedelta
from urllib.parse import urlencode

from django.contrib.auth import get_user_model
from django.core import signing
from django.db import transaction
from django.db.models import Q
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.urls import reverse
from django.utils import timezone
from django.utils.encoding import force_str
from PIL import Image, UnidentifiedImageError
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from appointments.models import (
    APPOINTMENT_VALUE_LABELS,
    Appointment,
    AppointmentReferenceImage,
    ArtistTimeOff,
    CalendarEvent,
)
from appointments.views import (
    DEFAULT_TATTOO_STYLES,
    _artist_datetime,
    _artist_timezone,
    _build_schedule_payload,
    _get_artist_booked_minutes,
    _get_artist_settings,
    _get_booking_status_block_message,
    _is_bookable_artist,
    _send_artist_auto_response,
    _validate_artist_slot,
)
from health_safety.models import HealthSafetyCard, HealthSafetyShareIntent
from users.models import UserBlock
from users.security import check_rate_limit

from .health_safety_views import BOOKING_COPY_KEYS as HEALTH_BOOKING_COPY_KEYS
from .health_safety_views import _copy_payload as _health_copy_payload
from .health_safety_views import _field_payload as _health_field_payload
from .health_safety_views import (
    attach_health_submission,
    validate_health_submission,
)

User = get_user_model()

BOOKING_DURATIONS = (60, 120, 180, 480)
BOOKING_PLACEMENTS = (
    "Head",
    "Chest",
    "Stomach",
    "Back",
    "Lower back",
    "Left arm",
    "Right arm",
    "Left forearm",
    "Right forearm",
    "Left hand",
    "Right hand",
    "Left leg",
    "Right leg",
    "Left calf",
    "Right calf",
    "Feet",
)
BOOKING_SIZES = ("Coin", "Smartphone", "A5", "A4", "Half sleeve", "Full sleeve")
BOOKING_BUDGETS = ("€100–300", "€300–600", "€600–1000", "€1000+", "No budget")
MAX_REFERENCE_IMAGE_SIZE = int(9.5 * 1024 * 1024)
REFERENCE_LINK_MAX_AGE = 60 * 60
REFERENCE_SIGNING_SALT = "mobile-appointment-reference-v1"


def _absolute_profile_image_url(user, request):
    image = user.profile.profile_image
    if not image:
        return None
    try:
        url = image.url
    except (AttributeError, ValueError):
        return None
    return request.build_absolute_uri(url) if url.startswith("/") else url


def _booking_user_payload(user, request):
    return {
        "id": user.pk,
        "username": user.username,
        "tag": user.profile.tag,
        "is_verified_artist": user.profile.is_verified_artist,
        "profile_image_url": _absolute_profile_image_url(user, request),
    }


def _reference_url(reference, request):
    token = signing.dumps(
        {"reference_id": reference.pk, "user_id": request.user.pk},
        salt=REFERENCE_SIGNING_SALT,
        compress=True,
    )
    path = reverse("mobile_api:appointment_reference", args=[reference.pk])
    return request.build_absolute_uri(f"{path}?{urlencode({'token': token})}")


def _reference_payload(reference, request):
    return {
        "id": reference.pk,
        "name": reference.original_name or os.path.basename(reference.image.name),
        "url": _reference_url(reference, request),
        "order": reference.order,
    }


def _available_actions(appointment, user):
    if appointment.artist_id != user.pk:
        return []
    if appointment.status in (
        Appointment.STATUS_PENDING,
        Appointment.STATUS_NEEDS_REFERENCES,
    ):
        return ["accept", "decline", "need_references", "consultation_required"]
    if appointment.status == Appointment.STATUS_ACCEPTED:
        return ["complete", "cancel"]
    if appointment.status == Appointment.STATUS_CONSULTATION_REQUIRED:
        return ["complete"]
    return []


def _appointment_payload(appointment, request):
    role = "artist" if appointment.artist_id == request.user.pk else "client"
    other_user = appointment.client if role == "artist" else appointment.artist
    references = list(appointment.reference_images.all())
    booking_settings = getattr(appointment.artist, "booking_settings", None)
    reference_limit = (
        booking_settings.maximum_reference_images if booking_settings else 10
    )
    return {
        "id": appointment.pk,
        "role": role,
        "artist": _booking_user_payload(appointment.artist, request),
        "client": _booking_user_payload(appointment.client, request),
        "other_user": _booking_user_payload(other_user, request),
        "booking_type": appointment.booking_type,
        "booking_type_label": force_str(appointment.get_booking_type_display()),
        "status": appointment.status,
        "status_label": force_str(appointment.get_status_display()),
        "date": appointment.date,
        "start_time": appointment.start_time.strftime("%H:%M"),
        "end_time": (
            appointment.end_time.strftime("%H:%M") if appointment.end_time else None
        ),
        "session_length_minutes": appointment.session_length_minutes,
        "client_comfort_limit": appointment.client_comfort_limit,
        "styles": appointment.styles or [],
        "styles_label": force_str(appointment.localized_styles),
        "placement": appointment.placement,
        "placement_label": force_str(appointment.localized_placement),
        "size": appointment.size,
        "size_label": force_str(appointment.localized_size),
        "budget": appointment.budget,
        "budget_label": force_str(appointment.localized_budget),
        "description": appointment.description,
        "consultation_already_completed": appointment.consultation_already_completed,
        "consultation_note": appointment.consultation_note,
        "artist_note": appointment.artist_note,
        "created_at": appointment.created_at,
        "updated_at": appointment.updated_at,
        "responded_at": appointment.responded_at,
        "reference_images": [
            _reference_payload(reference, request) for reference in references
        ],
        "reference_limit": reference_limit,
        "can_add_references": (
            role == "client"
            and appointment.status == Appointment.STATUS_NEEDS_REFERENCES
            and len(references) < reference_limit
        ),
        "available_actions": _available_actions(appointment, request.user),
    }


def _appointment_or_404(appointment_id, user):
    appointment = get_object_or_404(
        Appointment.objects.select_related(
            "artist",
            "artist__profile",
            "artist__booking_settings",
            "client",
            "client__profile",
        ).prefetch_related("reference_images"),
        pk=appointment_id,
    )
    if user.pk not in (appointment.artist_id, appointment.client_id):
        raise Http404
    return appointment


def _visible_booking_artist(request, username):
    artist = get_object_or_404(
        User.objects.select_related("profile"),
        username=username,
    )
    if not _is_bookable_artist(artist):
        raise Http404
    if UserBlock.objects.filter(
        Q(blocker=request.user, blocked=artist)
        | Q(blocker=artist, blocked=request.user)
    ).exists():
        raise Http404
    return artist


def _booking_type_options(settings):
    options = []
    if settings.booking_status != settings.BOOKING_STATUS_CONSULTATION_ONLY:
        options.append(Appointment.TYPE_TATTOO)
    if settings.consultation_enabled and settings.studio_consultation_enabled:
        options.append(Appointment.TYPE_CONSULTATION)
    if settings.consultation_enabled and settings.online_consultation_enabled:
        options.append(Appointment.TYPE_ONLINE_CONSULTATION)
    return options


def _option_labels(values):
    return {
        value: force_str(
            APPOINTMENT_VALUE_LABELS.get(
                value,
                str(value).replace("_", " ").title(),
            )
        )
        for value in values
    }


def _availability_state(settings):
    block_message = _get_booking_status_block_message(settings.booking_status)
    if block_message:
        return False, settings.booking_status, force_str(block_message)
    if not settings.bookings_enabled:
        return False, "disabled", "This artist is not accepting bookings right now."
    if not _booking_type_options(settings):
        return False, "no_booking_types", "This artist has no booking types available."
    return True, None, None


def _calendar_blocked_slots(artist, start_date, end_date):
    artist_tz = _artist_timezone(artist)
    start_at = timezone.make_aware(
        datetime.combine(start_date, datetime.min.time()), artist_tz
    )
    end_at = timezone.make_aware(
        datetime.combine(end_date + timedelta(days=1), datetime.min.time()),
        artist_tz,
    )
    events = CalendarEvent.objects.filter(
        artist=artist,
        event_type__in=(
            CalendarEvent.TYPE_TATTOO_SESSION,
            CalendarEvent.TYPE_CONSULTATION,
            CalendarEvent.TYPE_BLOCKED,
            CalendarEvent.TYPE_VACATION,
        ),
        starts_at__lt=end_at,
        ends_at__gt=start_at,
    ).exclude(status=CalendarEvent.STATUS_CANCELLED)

    slots = []
    for event in events:
        local_start = timezone.localtime(event.starts_at, artist_tz)
        local_end = timezone.localtime(event.ends_at, artist_tz)
        cursor = max(local_start.date(), start_date)
        last_date = min(local_end.date(), end_date)
        while cursor <= last_date:
            start_time = (
                local_start.strftime("%H:%M")
                if cursor == local_start.date()
                else "00:00"
            )
            end_time = (
                local_end.strftime("%H:%M") if cursor == local_end.date() else "23:59"
            )
            slots.append(
                {
                    "date": cursor.isoformat(),
                    "start_time": start_time,
                    "end_time": end_time,
                }
            )
            cursor += timedelta(days=1)
    return slots


def _occupied_slots(artist, start_date, end_date):
    appointments = Appointment.objects.filter(
        artist=artist,
        status__in=(
            Appointment.STATUS_PENDING,
            Appointment.STATUS_NEEDS_REFERENCES,
            Appointment.STATUS_CONSULTATION_REQUIRED,
            Appointment.STATUS_ACCEPTED,
        ),
        date__gte=start_date,
        date__lte=end_date,
        end_time__isnull=False,
    ).only("date", "start_time", "end_time")
    slots = [
        {
            "date": appointment.date.isoformat(),
            "start_time": appointment.start_time.strftime("%H:%M"),
            "end_time": appointment.end_time.strftime("%H:%M"),
        }
        for appointment in appointments
    ]
    return [*slots, *_calendar_blocked_slots(artist, start_date, end_date)]


def _booking_config_payload(artist, settings, request):
    artist_tz = _artist_timezone(artist)
    today = timezone.localdate(timezone=artist_tz)
    end_date = today + timedelta(days=settings.maximum_booking_window_days)
    available, unavailable_code, unavailable_reason = _availability_state(settings)
    active_styles = settings.active_styles or DEFAULT_TATTOO_STYLES
    booking_types = _booking_type_options(settings)
    return {
        "artist": _booking_user_payload(artist, request),
        "available": available,
        "unavailable_code": unavailable_code,
        "unavailable_reason": unavailable_reason,
        "artist_timezone": str(artist_tz),
        "today": today.isoformat(),
        "settings": {
            "booking_status": settings.booking_status,
            "minimum_notice_hours": settings.minimum_notice_hours,
            "maximum_booking_window_days": settings.maximum_booking_window_days,
            "slot_step_minutes": settings.slot_step_minutes,
            "default_session_minutes": settings.default_session_minutes,
            "maximum_session_hours": settings.maximum_session_hours,
            "consultation_required_before_booking": settings.consultation_required_before_booking,
            "consultation_price": float(settings.consultation_price),
            "online_consultation_price": float(settings.online_consultation_price),
            "reference_images_required": settings.reference_images_required,
            "minimum_reference_images": settings.minimum_reference_images,
            "maximum_reference_images": settings.maximum_reference_images,
            "deposit_required": settings.deposit_required,
            "deposit_amount": float(settings.deposit_amount),
            "booking_workflow": settings.booking_workflow,
        },
        "booking_types": booking_types,
        "durations": [
            duration
            for duration in BOOKING_DURATIONS
            if duration <= settings.maximum_session_hours * 60
        ],
        "styles": active_styles,
        "placements": BOOKING_PLACEMENTS,
        "sizes": BOOKING_SIZES,
        "budgets": BOOKING_BUDGETS,
        "option_labels": {
            "booking_types": {
                value: force_str(dict(Appointment.BOOKING_TYPE_CHOICES)[value])
                for value in booking_types
            },
            "styles": _option_labels(active_styles),
            "placements": _option_labels(BOOKING_PLACEMENTS),
            "sizes": _option_labels(BOOKING_SIZES),
            "budgets": _option_labels(BOOKING_BUDGETS),
        },
        "schedule": _build_schedule_payload(artist),
        "vacations": [
            date_value.isoformat()
            for date_value in ArtistTimeOff.objects.filter(
                artist=artist,
                date__gte=today,
                date__lte=end_date,
            ).values_list("date", flat=True)
        ],
        "occupied_slots": _occupied_slots(artist, today, end_date),
        "booked_minutes_by_date": _get_artist_booked_minutes(
            artist,
            today,
            end_date,
        ),
        "health_safety": {
            "has_card": HealthSafetyCard.objects.filter(
                user=request.user,
                explicit_storage_consent=True,
            ).exists(),
            "fields": _health_field_payload(request),
            "copy": _health_copy_payload(request, HEALTH_BOOKING_COPY_KEYS),
        },
    }


def _list_values(data, key):
    if hasattr(data, "getlist"):
        values = data.getlist(key)
    else:
        raw = data.get(key, [])
        values = raw if isinstance(raw, list) else [raw]
    cleaned = []
    for value in values:
        cleaned.extend(item.strip() for item in str(value).split(",") if item.strip())
    return list(dict.fromkeys(cleaned))


def _validate_reference_images(files, maximum):
    if len(files) > maximum:
        return {
            "code": "too_many_references",
            "detail": f"You can upload up to {maximum} reference images.",
        }
    for uploaded_file in files:
        if uploaded_file.size > MAX_REFERENCE_IMAGE_SIZE:
            return {
                "code": "reference_too_large",
                "detail": f"{uploaded_file.name} is too large.",
            }
        if not (uploaded_file.content_type or "").lower().startswith("image/"):
            return {
                "code": "invalid_reference",
                "detail": "Reference attachments must be images.",
            }
        try:
            Image.open(uploaded_file).verify()
            uploaded_file.seek(0)
        except (UnidentifiedImageError, OSError, ValueError):
            return {
                "code": "invalid_reference",
                "detail": f"{uploaded_file.name} is not a valid image.",
            }
    return None


class BookingArtistView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, username):
        artist = _visible_booking_artist(request, username)
        if artist.pk == request.user.pk:
            return Response(
                {"code": "cannot_book_self", "detail": "You cannot book yourself."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        settings = _get_artist_settings(artist)
        return Response(_booking_config_payload(artist, settings, request))

    def post(self, request, username):
        artist = _visible_booking_artist(request, username)
        if artist.pk == request.user.pk:
            return Response(
                {"code": "cannot_book_self", "detail": "You cannot book yourself."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        settings = _get_artist_settings(artist)
        available, unavailable_code, unavailable_reason = _availability_state(settings)
        if not available:
            return Response(
                {"code": unavailable_code, "detail": unavailable_reason},
                status=status.HTTP_409_CONFLICT,
            )

        allowed, retry_after = check_rate_limit(
            request,
            scope="mobile:appointments:create",
            limit=10,
            window_seconds=60 * 60,
            identity="user",
        )
        if not allowed:
            return Response(
                {
                    "code": "rate_limited",
                    "detail": "Too many booking requests. Please try again later.",
                    "retry_after": retry_after,
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        booking_type = str(request.data.get("booking_type") or Appointment.TYPE_TATTOO)
        allowed_types = _booking_type_options(settings)
        if booking_type not in allowed_types:
            return Response(
                {
                    "code": "invalid_booking_type",
                    "detail": "This booking type is unavailable.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        health_submission, health_error = validate_health_submission(
            request.data,
            request.user,
            booking_type,
        )
        if health_error:
            error_status = (
                status.HTTP_409_CONFLICT
                if health_error["code"] == "health_card_required"
                else status.HTTP_400_BAD_REQUEST
            )
            return Response(health_error, status=error_status)
        is_consultation = booking_type in (
            Appointment.TYPE_CONSULTATION,
            Appointment.TYPE_ONLINE_CONSULTATION,
        )
        consultation_completed = (
            str(request.data.get("consultation_already_completed", "false")).lower()
            == "true"
        )
        consultation_note = str(request.data.get("consultation_note") or "").strip()[
            :240
        ]
        if (
            not is_consultation
            and settings.consultation_required_before_booking
            and not consultation_completed
        ):
            return Response(
                {
                    "code": "consultation_required",
                    "detail": "This artist requires a consultation before a tattoo session.",
                },
                status=status.HTTP_409_CONFLICT,
            )

        try:
            date_value = datetime.strptime(
                str(request.data.get("date") or ""), "%Y-%m-%d"
            ).date()
            start_time = datetime.strptime(
                str(request.data.get("start_time") or ""), "%H:%M"
            ).time()
            duration = int(request.data.get("session_length_minutes") or 60)
        except (TypeError, ValueError):
            return Response(
                {"code": "invalid_slot", "detail": "Choose a valid date and time."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if is_consultation:
            duration = 60
            consultation_completed = False
        elif duration not in BOOKING_DURATIONS:
            return Response(
                {
                    "code": "invalid_duration",
                    "detail": "Choose a valid session duration.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if duration > settings.maximum_session_hours * 60:
            return Response(
                {
                    "code": "session_too_long",
                    "detail": "This session is longer than the artist allows.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        artist_tz = _artist_timezone(artist)
        start_at = _artist_datetime(artist, date_value, start_time)
        end_at = start_at + timedelta(minutes=duration)
        latest_date = timezone.localdate(timezone=artist_tz) + timedelta(
            days=settings.maximum_booking_window_days
        )
        if date_value > latest_date:
            return Response(
                {
                    "code": "date_too_far",
                    "detail": "This date is too far in the future.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if start_at < timezone.now() + timedelta(hours=settings.minimum_notice_hours):
            return Response(
                {
                    "code": "slot_unavailable",
                    "detail": "This time slot is no longer available.",
                },
                status=status.HTTP_409_CONFLICT,
            )
        if end_at.date() != date_value:
            return Response(
                {
                    "code": "slot_unavailable",
                    "detail": "This time is outside working hours.",
                },
                status=status.HTTP_409_CONFLICT,
            )
        if ArtistTimeOff.objects.filter(artist=artist, date=date_value).exists():
            return Response(
                {
                    "code": "date_blocked",
                    "detail": "This date is blocked by the artist.",
                },
                status=status.HTTP_409_CONFLICT,
            )

        styles = _list_values(request.data, "styles")
        placements = _list_values(request.data, "placements")
        size = str(request.data.get("size") or "").strip()
        budget = str(request.data.get("budget") or "").strip()
        description = str(request.data.get("description") or "").strip()[:3000]
        if not is_consultation:
            active_styles = set(settings.active_styles or DEFAULT_TATTOO_STYLES)
            if not styles or any(style not in active_styles for style in styles):
                return Response(
                    {
                        "code": "styles_required",
                        "detail": "Choose at least one available style.",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if not placements or any(
                item not in BOOKING_PLACEMENTS for item in placements
            ):
                return Response(
                    {
                        "code": "placement_required",
                        "detail": "Choose at least one body placement.",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if size not in BOOKING_SIZES:
                return Response(
                    {"code": "size_required", "detail": "Choose a tattoo size."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if budget not in BOOKING_BUDGETS:
                return Response(
                    {"code": "budget_required", "detail": "Choose a budget."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        files = list(request.FILES.getlist("references"))
        minimum_references = (
            settings.minimum_reference_images
            if settings.reference_images_required and not is_consultation
            else 0
        )
        if len(files) < minimum_references:
            return Response(
                {
                    "code": "references_required",
                    "detail": f"Upload at least {minimum_references} reference images.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        reference_error = _validate_reference_images(
            files, settings.maximum_reference_images
        )
        if reference_error:
            return Response(reference_error, status=status.HTTP_400_BAD_REQUEST)

        initial_status = (
            Appointment.STATUS_ACCEPTED
            if settings.booking_workflow == "auto"
            else Appointment.STATUS_PENDING
        )
        with transaction.atomic():
            User.objects.select_for_update().get(pk=artist.pk)
            slot_error = _validate_artist_slot(
                artist,
                date_value,
                start_time,
                end_at.time(),
            )
            if slot_error:
                return Response(
                    {"code": "slot_unavailable", "detail": force_str(slot_error)},
                    status=status.HTTP_409_CONFLICT,
                )
            HealthSafetyShareIntent.objects.filter(
                client=request.user,
                artist=artist,
                appointment_date=date_value,
                start_time=start_time,
            ).delete()
            appointment = Appointment.objects.create(
                client=request.user,
                artist=artist,
                booking_type=booking_type,
                date=date_value,
                start_time=start_time,
                end_time=end_at.time(),
                session_length_minutes=duration,
                client_comfort_limit=str(
                    request.data.get("client_comfort_limit") or ""
                )[:40],
                styles=styles if not is_consultation else [],
                placement=", ".join(placements) if not is_consultation else "",
                size=size if not is_consultation else "",
                budget=budget if not is_consultation else "",
                description=description,
                consultation_already_completed=consultation_completed,
                consultation_note=consultation_note,
                status=initial_status,
                ai_ready_payload={
                    "placement": placements,
                    "styles": styles,
                    "size": size,
                    "budget": budget,
                    "description": description,
                    "booking_type": booking_type,
                    "consultation_already_completed": consultation_completed,
                    "consultation_note": consultation_note,
                },
            )
            attach_health_submission(appointment, health_submission)
            for index, uploaded_file in enumerate(files):
                AppointmentReferenceImage.objects.create(
                    appointment=appointment,
                    image=uploaded_file,
                    original_name=uploaded_file.name[:255],
                    order=index,
                )

        _send_artist_auto_response(appointment, settings.auto_response_booking_received)
        if settings.consultation_required_before_booking:
            _send_artist_auto_response(
                appointment,
                settings.auto_response_consultation_required,
            )
        appointment = _appointment_or_404(appointment.pk, request.user)
        return Response(
            _appointment_payload(appointment, request),
            status=status.HTTP_201_CREATED,
        )


class AppointmentListView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        appointments = (
            Appointment.objects.filter(Q(client=request.user) | Q(artist=request.user))
            .select_related("artist", "artist__profile", "client", "client__profile")
            .select_related("artist__booking_settings")
            .prefetch_related("reference_images")
            .order_by("-created_at", "-id")
        )
        results = [
            _appointment_payload(appointment, request) for appointment in appointments
        ]
        return Response(
            {
                "attention_count": sum(
                    item["role"] == "artist"
                    and item["status"]
                    in (Appointment.STATUS_PENDING, Appointment.STATUS_NEEDS_REFERENCES)
                    for item in results
                ),
                "results": results,
            }
        )


class AppointmentDetailView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, appointment_id):
        appointment = _appointment_or_404(appointment_id, request.user)
        return Response(_appointment_payload(appointment, request))


class AppointmentActionView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, appointment_id):
        action = str(request.data.get("action") or "")
        with transaction.atomic():
            appointment = get_object_or_404(
                Appointment.objects.select_for_update().select_related(
                    "artist",
                    "artist__profile",
                    "artist__booking_settings",
                    "client",
                    "client__profile",
                ),
                pk=appointment_id,
                artist=request.user,
            )
            if action not in _available_actions(appointment, request.user):
                return Response(
                    {
                        "code": "invalid_action",
                        "detail": "This action is not available.",
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            settings = _get_artist_settings(appointment.artist)
            if action == "accept":
                appointment.accept()
                auto_response = settings.auto_response_booking_approved
            elif action == "decline":
                appointment.decline()
                auto_response = settings.auto_response_booking_declined
            elif action == "need_references":
                if (
                    appointment.reference_images.count()
                    >= settings.maximum_reference_images
                ):
                    return Response(
                        {
                            "code": "reference_limit_reached",
                            "detail": "This appointment already has the maximum number of references.",
                        },
                        status=status.HTTP_409_CONFLICT,
                    )
                appointment.status = Appointment.STATUS_NEEDS_REFERENCES
                appointment.save(update_fields=("status", "updated_at"))
                auto_response = settings.auto_response_need_more_references
            elif action == "consultation_required":
                appointment.status = Appointment.STATUS_CONSULTATION_REQUIRED
                appointment.responded_at = timezone.now()
                appointment.save(update_fields=("status", "responded_at", "updated_at"))
                auto_response = settings.auto_response_consultation_required
            elif action == "cancel":
                appointment.status = Appointment.STATUS_CANCELLED
                appointment.responded_at = timezone.now()
                appointment.save(update_fields=("status", "responded_at", "updated_at"))
                auto_response = ""
            else:
                appointment.status = Appointment.STATUS_COMPLETED
                appointment.save(update_fields=("status", "updated_at"))
                CalendarEvent.objects.filter(project=appointment).update(
                    status=CalendarEvent.STATUS_COMPLETED,
                    updated_at=timezone.now(),
                )
                auto_response = ""

        _send_artist_auto_response(appointment, auto_response)
        appointment = _appointment_or_404(appointment.pk, request.user)
        return Response(_appointment_payload(appointment, request))


class AppointmentReferenceUploadView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, appointment_id):
        with transaction.atomic():
            appointment = get_object_or_404(
                Appointment.objects.select_for_update().select_related(
                    "artist",
                    "artist__profile",
                    "artist__booking_settings",
                    "client",
                    "client__profile",
                ),
                pk=appointment_id,
                client=request.user,
            )
            if appointment.status != Appointment.STATUS_NEEDS_REFERENCES:
                return Response(
                    {
                        "code": "references_not_requested",
                        "detail": "The artist is not requesting more references right now.",
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            files = list(request.FILES.getlist("references"))
            if not files:
                return Response(
                    {
                        "code": "references_required",
                        "detail": "Choose at least one reference image.",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            settings = _get_artist_settings(appointment.artist)
            existing_count = appointment.reference_images.count()
            remaining = max(0, settings.maximum_reference_images - existing_count)
            reference_error = _validate_reference_images(files, remaining)
            if reference_error:
                return Response(reference_error, status=status.HTTP_400_BAD_REQUEST)
            for index, uploaded_file in enumerate(files, start=existing_count):
                AppointmentReferenceImage.objects.create(
                    appointment=appointment,
                    image=uploaded_file,
                    original_name=uploaded_file.name[:255],
                    order=index,
                )
            appointment.status = Appointment.STATUS_PENDING
            appointment.save(update_fields=("status", "updated_at"))

        appointment = _appointment_or_404(appointment.pk, request.user)
        return Response(_appointment_payload(appointment, request))


class AppointmentReferenceView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)

    def get(self, request, reference_id):
        try:
            payload = signing.loads(
                request.query_params.get("token", ""),
                salt=REFERENCE_SIGNING_SALT,
                max_age=REFERENCE_LINK_MAX_AGE,
            )
        except signing.BadSignature:
            raise Http404
        if payload.get("reference_id") != reference_id:
            raise Http404

        reference = get_object_or_404(
            AppointmentReferenceImage.objects.select_related("appointment"),
            pk=reference_id,
        )
        appointment = reference.appointment
        if payload.get("user_id") not in (
            appointment.artist_id,
            appointment.client_id,
        ):
            raise Http404
        try:
            file_handle = reference.image.open("rb")
        except (FileNotFoundError, OSError, ValueError):
            raise Http404
        response = FileResponse(
            file_handle,
            as_attachment=False,
            filename=reference.original_name or os.path.basename(reference.image.name),
            content_type=(
                mimetypes.guess_type(reference.original_name or reference.image.name)[0]
                or "application/octet-stream"
            ),
        )
        response["Cache-Control"] = "private, max-age=300"
        response["X-Content-Type-Options"] = "nosniff"
        return response
