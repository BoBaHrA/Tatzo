from datetime import datetime, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.encoding import force_str
from django.utils.translation import gettext as _
from rest_framework import status
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from appointments.models import (
    Appointment,
    ArtistAvailability,
    ArtistBookingSettings,
    ArtistTimeOff,
    CalendarEvent,
    CalendarRescheduleRequest,
)
from appointments.views import (
    DEFAULT_TATTOO_STYLES,
    _artist_datetime,
    _artist_timezone,
    _build_schedule_payload,
    _get_artist_booked_minutes,
    _get_artist_settings,
    _is_bookable_artist,
    _validate_artist_slot,
)
from users.models import UserBlock
from users.security import check_rate_limit

from .artist_dashboard_payloads import (
    ACTIVE_APPOINTMENT_STATUSES,
    SLOT_STEP_OPTIONS,
    blocked_period_payload,
    booking_preferences_payload,
    dashboard_payload,
    schedule_payload,
    settings_payload,
    time_off_payload,
)
from .booking_views import (
    BOOKING_BUDGETS,
    BOOKING_DURATIONS,
    BOOKING_PLACEMENTS,
    BOOKING_SIZES,
    _appointment_or_404,
    _appointment_payload,
    _booking_user_payload,
    _list_values,
    _occupied_slots,
    _option_labels,
)


User = get_user_model()

MANUAL_BOOKING_WINDOW_DAYS = 365
MANUAL_DURATION_MINUTES = 15
MANUAL_DURATION_STEP_MINUTES = 15
RESCHEDULABLE_APPOINTMENT_STATUSES = (
    Appointment.STATUS_ACCEPTED,
    Appointment.STATUS_CONSULTATION_REQUIRED,
)

BOOKING_PREFERENCE_FIELDS = (
    "booking_workflow",
    "minimum_notice_hours",
    "maximum_booking_window_days",
    "slot_step_minutes",
    "default_session_minutes",
    "maximum_session_hours",
    "consultation_enabled",
    "online_consultation_enabled",
    "studio_consultation_enabled",
    "consultation_required_before_booking",
    "consultation_price",
    "online_consultation_price",
    "reference_images_required",
    "minimum_reference_images",
    "maximum_reference_images",
    "active_styles",
    "auto_response_booking_received",
    "auto_response_consultation_required",
    "auto_response_need_more_references",
    "auto_response_booking_approved",
    "auto_response_booking_declined",
)


class ArtistBookingPreferencesSerializer(serializers.Serializer):
    booking_workflow = serializers.ChoiceField(
        choices=ArtistBookingSettings.BOOKING_WORKFLOW_CHOICES
    )
    minimum_notice_hours = serializers.IntegerField(min_value=0, max_value=2160)
    maximum_booking_window_days = serializers.IntegerField(min_value=1, max_value=365)
    slot_step_minutes = serializers.ChoiceField(choices=SLOT_STEP_OPTIONS)
    default_session_minutes = serializers.ChoiceField(choices=BOOKING_DURATIONS)
    maximum_session_hours = serializers.IntegerField(min_value=1, max_value=12)
    consultation_enabled = serializers.BooleanField()
    online_consultation_enabled = serializers.BooleanField()
    studio_consultation_enabled = serializers.BooleanField()
    consultation_required_before_booking = serializers.BooleanField()
    consultation_price = serializers.DecimalField(
        max_digits=8,
        decimal_places=2,
        min_value=Decimal("0"),
        max_value=Decimal("999999.99"),
    )
    online_consultation_price = serializers.DecimalField(
        max_digits=8,
        decimal_places=2,
        min_value=Decimal("0"),
        max_value=Decimal("999999.99"),
    )
    reference_images_required = serializers.BooleanField()
    minimum_reference_images = serializers.IntegerField(min_value=0, max_value=20)
    maximum_reference_images = serializers.IntegerField(min_value=1, max_value=20)
    active_styles = serializers.ListField(
        child=serializers.CharField(max_length=80, trim_whitespace=True),
        allow_empty=False,
        max_length=30,
    )
    auto_response_booking_received = serializers.CharField(
        allow_blank=True, max_length=2000, trim_whitespace=True
    )
    auto_response_consultation_required = serializers.CharField(
        allow_blank=True, max_length=2000, trim_whitespace=True
    )
    auto_response_need_more_references = serializers.CharField(
        allow_blank=True, max_length=2000, trim_whitespace=True
    )
    auto_response_booking_approved = serializers.CharField(
        allow_blank=True, max_length=2000, trim_whitespace=True
    )
    auto_response_booking_declined = serializers.CharField(
        allow_blank=True, max_length=2000, trim_whitespace=True
    )

    def validate_active_styles(self, values):
        unique = []
        seen = set()
        for value in values:
            key = value.casefold()
            if key in seen:
                continue
            seen.add(key)
            unique.append(value)
        if not unique:
            raise serializers.ValidationError("Choose at least one active style.")
        return unique

    def validate(self, attrs):
        if attrs["default_session_minutes"] > attrs["maximum_session_hours"] * 60:
            raise serializers.ValidationError(
                {
                    "default_session_minutes": (
                        "The default session cannot exceed the maximum session length."
                    )
                }
            )

        supported_consultation = bool(
            attrs["online_consultation_enabled"]
            or attrs["studio_consultation_enabled"]
        )
        if attrs["consultation_enabled"] and not supported_consultation:
            raise serializers.ValidationError(
                {
                    "consultation_enabled": (
                        "Enable an online or in-studio consultation option."
                    )
                }
            )
        if attrs["consultation_required_before_booking"] and not (
            attrs["consultation_enabled"] and supported_consultation
        ):
            raise serializers.ValidationError(
                {
                    "consultation_required_before_booking": (
                        "Required consultations need an enabled consultation option."
                    )
                }
            )

        minimum_references = attrs["minimum_reference_images"]
        maximum_references = attrs["maximum_reference_images"]
        if minimum_references > maximum_references:
            raise serializers.ValidationError(
                {
                    "minimum_reference_images": (
                        "The minimum cannot exceed the maximum reference count."
                    )
                }
            )
        if attrs["reference_images_required"] and minimum_references < 1:
            raise serializers.ValidationError(
                {
                    "minimum_reference_images": (
                        "Require at least one reference image."
                    )
                }
            )
        return attrs


class PrivateArtistResponseMixin:
    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "private, no-store"
        return response


def _artist_forbidden(request):
    if _is_bookable_artist(request.user):
        return None
    return Response(
        {
            "code": "artist_dashboard_forbidden",
            "detail": "The artist dashboard is available only to verified tattoo artists.",
        },
        status=status.HTTP_403_FORBIDDEN,
    )


def _parse_date(value):
    try:
        return datetime.strptime(str(value or ""), "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


def _parse_time(value):
    if value in (None, ""):
        return None
    try:
        return datetime.strptime(str(value), "%H:%M").time()
    except (TypeError, ValueError):
        return None


def _artist_appointment_config_payload(
    artist,
    request,
    *,
    exclude_appointment_id=None,
):
    settings = _get_artist_settings(artist)
    artist_tz = _artist_timezone(artist)
    today = timezone.localdate(timezone=artist_tz)
    end_date = today + timedelta(days=MANUAL_BOOKING_WINDOW_DAYS)
    active_styles = settings.active_styles or list(DEFAULT_TATTOO_STYLES)
    booking_types = [value for value, _label in Appointment.BOOKING_TYPE_CHOICES]
    duration_presets = sorted(
        {
            settings.default_session_minutes,
            30,
            45,
            *BOOKING_DURATIONS,
            90,
            240,
            360,
        }
    )
    duration_presets = [
        value
        for value in duration_presets
        if MANUAL_DURATION_MINUTES
        <= value
        <= settings.maximum_session_hours * 60
    ]
    return {
        "artist": _booking_user_payload(artist, request),
        "artist_timezone": str(artist_tz),
        "today": today.isoformat(),
        "settings": {
            "minimum_notice_hours": 0,
            "maximum_booking_window_days": MANUAL_BOOKING_WINDOW_DAYS,
            "slot_step_minutes": settings.slot_step_minutes,
            "default_session_minutes": settings.default_session_minutes,
            "maximum_session_hours": settings.maximum_session_hours,
        },
        "booking_types": booking_types,
        "durations": duration_presets,
        "duration_minimum_minutes": MANUAL_DURATION_MINUTES,
        "duration_step_minutes": MANUAL_DURATION_STEP_MINUTES,
        "styles": active_styles,
        "placements": list(BOOKING_PLACEMENTS),
        "sizes": list(BOOKING_SIZES),
        "budgets": list(BOOKING_BUDGETS),
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
        "occupied_slots": _occupied_slots(
            artist,
            today,
            end_date,
            exclude_appointment_id=exclude_appointment_id,
        ),
        "booked_minutes_by_date": _get_artist_booked_minutes(
            artist,
            today,
            end_date,
            exclude_appointment_id=exclude_appointment_id,
        ),
    }


def _parse_artist_appointment_slot(data, artist, settings, *, exclude_id=None):
    date_value = _parse_date(data.get("date"))
    start_time = _parse_time(data.get("start_time"))
    try:
        duration = int(data.get("session_length_minutes") or 0)
    except (TypeError, ValueError):
        duration = 0

    if not date_value or not start_time:
        return None, Response(
            {"code": "invalid_slot", "detail": "Choose a valid date and time."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if (
        duration < MANUAL_DURATION_MINUTES
        or duration % MANUAL_DURATION_STEP_MINUTES
    ):
        return None, Response(
            {
                "code": "invalid_duration",
                "detail": "Session duration must use 15-minute increments.",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )
    if duration > settings.maximum_session_hours * 60:
        return None, Response(
            {
                "code": "session_too_long",
                "detail": "This session is longer than your booking settings allow.",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    artist_tz = _artist_timezone(artist)
    start_at = _artist_datetime(artist, date_value, start_time)
    end_at = start_at + timedelta(minutes=duration)
    latest_date = timezone.localdate(timezone=artist_tz) + timedelta(
        days=MANUAL_BOOKING_WINDOW_DAYS
    )
    if start_at <= timezone.now():
        return None, Response(
            {
                "code": "slot_unavailable",
                "detail": "Manual appointments must start in the future.",
            },
            status=status.HTTP_409_CONFLICT,
        )
    if date_value > latest_date:
        return None, Response(
            {
                "code": "date_too_far",
                "detail": "Manual appointments can be scheduled up to one year ahead.",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )
    if end_at.date() != date_value:
        return None, Response(
            {
                "code": "slot_unavailable",
                "detail": "The appointment must start and end on the same day.",
            },
            status=status.HTTP_409_CONFLICT,
        )
    if ArtistTimeOff.objects.filter(artist=artist, date=date_value).exists():
        return None, Response(
            {
                "code": "date_blocked",
                "detail": "This date is blocked on your calendar.",
            },
            status=status.HTTP_409_CONFLICT,
        )

    slot_error = _validate_artist_slot(
        artist,
        date_value,
        start_time,
        end_at.time(),
        exclude_appointment_id=exclude_id,
    )
    if slot_error:
        return None, Response(
            {"code": "slot_unavailable", "detail": force_str(slot_error)},
            status=status.HTTP_409_CONFLICT,
        )
    return {
        "date": date_value,
        "start_time": start_time,
        "end_time": end_at.time(),
        "starts_at": start_at,
        "ends_at": end_at,
        "duration": duration,
    }, None


class ArtistDashboardView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        forbidden = _artist_forbidden(request)
        if forbidden:
            return forbidden
        return Response(dashboard_payload(request.user, request))

    def patch(self, request):
        forbidden = _artist_forbidden(request)
        if forbidden:
            return forbidden
        booking_status = str(request.data.get("booking_status") or "")
        allowed = dict(ArtistBookingSettings.BOOKING_STATUS_CHOICES)
        if booking_status not in allowed:
            return Response(
                {
                    "code": "invalid_booking_status",
                    "detail": "Choose a valid booking status.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        with transaction.atomic():
            User.objects.select_for_update().get(pk=request.user.pk)
            settings = _get_artist_settings(request.user)
            settings.booking_status = booking_status
            settings.bookings_enabled = booking_status in (
                ArtistBookingSettings.BOOKING_STATUS_OPEN,
                ArtistBookingSettings.BOOKING_STATUS_CONSULTATION_ONLY,
            )
            settings.save(
                update_fields=("booking_status", "bookings_enabled", "updated_at")
            )
        return Response(settings_payload(settings))


class ArtistBookingPreferencesView(PrivateArtistResponseMixin, APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        forbidden = _artist_forbidden(request)
        if forbidden:
            return forbidden
        return Response(
            booking_preferences_payload(_get_artist_settings(request.user))
        )

    def put(self, request):
        forbidden = _artist_forbidden(request)
        if forbidden:
            return forbidden
        serializer = ArtistBookingPreferencesSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {
                    "code": "invalid_booking_preferences",
                    "detail": "Check the booking settings and try again.",
                    "errors": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            User.objects.select_for_update().get(pk=request.user.pk)
            settings = (
                ArtistBookingSettings.objects.select_for_update()
                .filter(artist=request.user)
                .first()
            )
            if settings is None:
                settings = ArtistBookingSettings.objects.create(
                    artist=request.user
                )
            for field in BOOKING_PREFERENCE_FIELDS:
                setattr(settings, field, serializer.validated_data[field])
            settings.save(update_fields=(*BOOKING_PREFERENCE_FIELDS, "updated_at"))

        return Response(booking_preferences_payload(settings))


class ArtistAppointmentListView(PrivateArtistResponseMixin, APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        forbidden = _artist_forbidden(request)
        if forbidden:
            return forbidden

        exclude_appointment_id = None
        raw_exclusion = request.query_params.get("exclude_appointment_id")
        if raw_exclusion not in (None, ""):
            try:
                exclude_appointment_id = int(raw_exclusion)
            except (TypeError, ValueError):
                return Response(
                    {
                        "code": "invalid_appointment",
                        "detail": "Choose a valid appointment to reschedule.",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            appointment = get_object_or_404(
                Appointment,
                pk=exclude_appointment_id,
                artist=request.user,
            )
            if appointment.status not in RESCHEDULABLE_APPOINTMENT_STATUSES:
                return Response(
                    {
                        "code": "appointment_not_reschedulable",
                        "detail": "This appointment cannot be rescheduled.",
                    },
                    status=status.HTTP_409_CONFLICT,
                )

        return Response(
            _artist_appointment_config_payload(
                request.user,
                request,
                exclude_appointment_id=exclude_appointment_id,
            )
        )

    def post(self, request):
        forbidden = _artist_forbidden(request)
        if forbidden:
            return forbidden

        allowed, retry_after = check_rate_limit(
            request,
            scope="mobile:artist:appointments:create",
            limit=60,
            window_seconds=60 * 60,
            identity="user",
        )
        if not allowed:
            return Response(
                {
                    "code": "rate_limited",
                    "detail": "Too many appointments were created. Try again later.",
                    "retry_after": retry_after,
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        client_username = str(request.data.get("client_username") or "").strip()
        client = (
            User.objects.select_related("profile")
            .filter(
                username__iexact=client_username,
                is_active=True,
                profile__is_email_verified=True,
            )
            .first()
        )
        if not client:
            return Response(
                {
                    "code": "client_not_found",
                    "detail": "No active client was found with that exact username.",
                },
                status=status.HTTP_404_NOT_FOUND,
            )
        if client.pk == request.user.pk:
            return Response(
                {
                    "code": "cannot_book_self",
                    "detail": "You cannot create an appointment with yourself.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if UserBlock.objects.filter(
            Q(blocker=request.user, blocked=client)
            | Q(blocker=client, blocked=request.user)
        ).exists():
            return Response(
                {
                    "code": "client_not_found",
                    "detail": "No active client was found with that exact username.",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        booking_type = str(
            request.data.get("booking_type") or Appointment.TYPE_TATTOO
        )
        if booking_type not in dict(Appointment.BOOKING_TYPE_CHOICES):
            return Response(
                {
                    "code": "invalid_booking_type",
                    "detail": "Choose a valid appointment type.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        styles = _list_values(request.data, "styles")
        placements = _list_values(request.data, "placements")
        size = str(request.data.get("size") or "").strip()
        budget = str(request.data.get("budget") or "").strip()
        settings = _get_artist_settings(request.user)
        active_styles = set(settings.active_styles or DEFAULT_TATTOO_STYLES)
        if len(styles) > 30 or any(item not in active_styles for item in styles):
            return Response(
                {
                    "code": "invalid_styles",
                    "detail": "Choose only styles from your active booking list.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(placements) > 20 or any(
            item not in BOOKING_PLACEMENTS for item in placements
        ):
            return Response(
                {
                    "code": "invalid_placements",
                    "detail": "Choose only available body placements.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if size and size not in BOOKING_SIZES:
            return Response(
                {"code": "invalid_size", "detail": "Choose a valid tattoo size."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if budget and budget not in BOOKING_BUDGETS:
            return Response(
                {"code": "invalid_budget", "detail": "Choose a valid budget."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            User.objects.select_for_update().get(pk=request.user.pk)
            settings = _get_artist_settings(request.user)
            slot, slot_response = _parse_artist_appointment_slot(
                request.data,
                request.user,
                settings,
            )
            if slot_response is not None:
                return slot_response

            appointment = Appointment(
                client=client,
                artist=request.user,
                booking_type=booking_type,
                status=Appointment.STATUS_ACCEPTED,
                date=slot["date"],
                start_time=slot["start_time"],
                end_time=slot["end_time"],
                session_length_minutes=slot["duration"],
                styles=styles,
                placement=", ".join(placements),
                size=size,
                budget=budget,
                description=str(request.data.get("description") or "").strip()[
                    :3000
                ],
                responded_at=timezone.now(),
                ai_ready_payload={
                    "placement": placements,
                    "styles": styles,
                    "size": size,
                    "budget": budget,
                    "description": str(
                        request.data.get("description") or ""
                    ).strip()[:3000],
                    "booking_type": booking_type,
                    "created_by_artist": True,
                },
            )
            appointment._notification_created_by_artist = True
            appointment.save()

        appointment = _appointment_or_404(appointment.pk, request.user)
        return Response(
            _appointment_payload(appointment, request),
            status=status.HTTP_201_CREATED,
        )


class ArtistAppointmentScheduleView(PrivateArtistResponseMixin, APIView):
    permission_classes = (IsAuthenticated,)

    def put(self, request, appointment_id):
        forbidden = _artist_forbidden(request)
        if forbidden:
            return forbidden

        with transaction.atomic():
            User.objects.select_for_update().get(pk=request.user.pk)
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
            if appointment.status not in RESCHEDULABLE_APPOINTMENT_STATUSES:
                return Response(
                    {
                        "code": "appointment_not_reschedulable",
                        "detail": "This appointment cannot be rescheduled.",
                    },
                    status=status.HTTP_409_CONFLICT,
                )

            slot, slot_response = _parse_artist_appointment_slot(
                request.data,
                request.user,
                _get_artist_settings(request.user),
                exclude_id=appointment.pk,
            )
            if slot_response is not None:
                return slot_response

            appointment.date = slot["date"]
            appointment.start_time = slot["start_time"]
            appointment.end_time = slot["end_time"]
            appointment.session_length_minutes = slot["duration"]
            appointment._notification_schedule_changed = True
            appointment.save(
                update_fields=(
                    "date",
                    "start_time",
                    "end_time",
                    "session_length_minutes",
                    "updated_at",
                )
            )

            session_events = CalendarEvent.objects.select_for_update().filter(
                project=appointment,
                event_type__in=(
                    CalendarEvent.TYPE_TATTOO_SESSION,
                    CalendarEvent.TYPE_CONSULTATION,
                ),
            )
            session_event_ids = list(
                session_events.values_list("pk", flat=True)
            )
            event_type = (
                CalendarEvent.TYPE_CONSULTATION
                if appointment.booking_type
                in (
                    Appointment.TYPE_CONSULTATION,
                    Appointment.TYPE_ONLINE_CONSULTATION,
                )
                or appointment.status == Appointment.STATUS_CONSULTATION_REQUIRED
                else CalendarEvent.TYPE_TATTOO_SESSION
            )
            changed_at = timezone.now()
            session_events.update(
                artist=appointment.artist,
                client=appointment.client,
                event_type=event_type,
                status=CalendarEvent.STATUS_CONFIRMED,
                title=force_str(appointment.get_booking_type_display())[:160],
                starts_at=slot["starts_at"],
                ends_at=slot["ends_at"],
                notes=appointment.description,
                placement=appointment.placement,
                tattoo_style=", ".join(appointment.styles or []),
                updated_at=changed_at,
            )
            if session_event_ids:
                CalendarRescheduleRequest.objects.filter(
                    event_id__in=session_event_ids,
                    status=CalendarRescheduleRequest.STATUS_PENDING,
                ).update(
                    status=CalendarRescheduleRequest.STATUS_ACCEPTED,
                    resolved_at=changed_at,
                )

        appointment = _appointment_or_404(appointment.pk, request.user)
        return Response(_appointment_payload(appointment, request))


class ArtistScheduleView(APIView):
    permission_classes = (IsAuthenticated,)

    def put(self, request):
        forbidden = _artist_forbidden(request)
        if forbidden:
            return forbidden
        raw_days = request.data.get("days")
        if not isinstance(raw_days, list) or len(raw_days) != 7:
            return Response(
                {
                    "code": "invalid_schedule",
                    "detail": "Send all seven days of the weekly schedule.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        parsed_days = []
        weekdays = set()
        for raw_day in raw_days:
            if not isinstance(raw_day, dict):
                parsed_days = []
                break
            try:
                weekday = int(raw_day.get("weekday"))
            except (TypeError, ValueError):
                parsed_days = []
                break
            is_closed = raw_day.get("is_closed")
            if (
                weekday not in range(7)
                or weekday in weekdays
                or not isinstance(is_closed, bool)
            ):
                parsed_days = []
                break
            weekdays.add(weekday)
            open_time = _parse_time(raw_day.get("open_time"))
            close_time = _parse_time(raw_day.get("close_time"))
            break_start = _parse_time(raw_day.get("break_start"))
            break_end = _parse_time(raw_day.get("break_end"))
            if is_closed:
                open_time = close_time = break_start = break_end = None
            elif (
                not open_time
                or not close_time
                or close_time <= open_time
                or bool(break_start) != bool(break_end)
                or (
                    break_start
                    and not open_time <= break_start < break_end <= close_time
                )
            ):
                parsed_days = []
                break
            parsed_days.append(
                {
                    "weekday": weekday,
                    "is_closed": is_closed,
                    "open_time": open_time,
                    "close_time": close_time,
                    "break_start": break_start,
                    "break_end": break_end,
                }
            )

        if len(parsed_days) != 7 or weekdays != set(range(7)):
            return Response(
                {
                    "code": "invalid_schedule",
                    "detail": "Check working hours and breaks for every day.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            User.objects.select_for_update().get(pk=request.user.pk)
            for values in parsed_days:
                ArtistAvailability.objects.update_or_create(
                    artist=request.user,
                    weekday=values["weekday"],
                    defaults={
                        "is_closed": values["is_closed"],
                        "open_time": values["open_time"],
                        "close_time": values["close_time"],
                        "break_start": values["break_start"],
                        "break_end": values["break_end"],
                    },
                )
        return Response({"schedule": schedule_payload(request.user)})


class ArtistTimeOffListView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        forbidden = _artist_forbidden(request)
        if forbidden:
            return forbidden
        date_value = _parse_date(request.data.get("date"))
        today = timezone.localdate(timezone=_artist_timezone(request.user))
        if not date_value:
            return Response(
                {"code": "invalid_date", "detail": "Use a valid date."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if date_value < today:
            return Response(
                {
                    "code": "past_date",
                    "detail": "Time off cannot start in the past.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        reason = str(request.data.get("reason") or "").strip()[:160]
        with transaction.atomic():
            User.objects.select_for_update().get(pk=request.user.pk)
            item, created = ArtistTimeOff.objects.update_or_create(
                artist=request.user,
                date=date_value,
                defaults={"reason": reason},
            )
        return Response(
            time_off_payload(item),
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class ArtistTimeOffDetailView(APIView):
    permission_classes = (IsAuthenticated,)

    def delete(self, request, time_off_id):
        forbidden = _artist_forbidden(request)
        if forbidden:
            return forbidden
        with transaction.atomic():
            User.objects.select_for_update().get(pk=request.user.pk)
            item = get_object_or_404(
                ArtistTimeOff,
                pk=time_off_id,
                artist=request.user,
            )
            item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ArtistBlockListView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        forbidden = _artist_forbidden(request)
        if forbidden:
            return forbidden
        date_value = _parse_date(request.data.get("date"))
        start_time = _parse_time(request.data.get("start_time"))
        end_time = _parse_time(request.data.get("end_time"))
        today = timezone.localdate(timezone=_artist_timezone(request.user))
        if (
            not date_value
            or not start_time
            or not end_time
            or end_time <= start_time
        ):
            return Response(
                {
                    "code": "invalid_block",
                    "detail": "Choose a valid date and an end time after the start time.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if date_value < today:
            return Response(
                {
                    "code": "past_date",
                    "detail": "Blocked time cannot start in the past.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        starts_at = _artist_datetime(request.user, date_value, start_time)
        ends_at = _artist_datetime(request.user, date_value, end_time)
        title = (
            str(request.data.get("reason") or "").strip()[:160]
            or str(_("Blocked time"))
        )

        with transaction.atomic():
            User.objects.select_for_update().get(pk=request.user.pk)
            calendar_overlap = CalendarEvent.objects.filter(
                artist=request.user,
                starts_at__lt=ends_at,
                ends_at__gt=starts_at,
            ).exclude(status=CalendarEvent.STATUS_CANCELLED)
            appointment_overlap = Appointment.objects.filter(
                artist=request.user,
                date=date_value,
                status__in=ACTIVE_APPOINTMENT_STATUSES,
                start_time__lt=end_time,
            ).filter(Q(end_time__gt=start_time) | Q(end_time__isnull=True))
            if calendar_overlap.exists() or appointment_overlap.exists():
                return Response(
                    {
                        "code": "calendar_conflict",
                        "detail": "This time overlaps another booking or calendar event.",
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            event = CalendarEvent.objects.create(
                artist=request.user,
                event_type=CalendarEvent.TYPE_BLOCKED,
                status=CalendarEvent.STATUS_PLANNED,
                title=title,
                starts_at=starts_at,
                ends_at=ends_at,
            )
        event = CalendarEvent.objects.select_related(
            "artist", "artist__profile"
        ).get(pk=event.pk)
        return Response(
            blocked_period_payload(event),
            status=status.HTTP_201_CREATED,
        )


class ArtistBlockDetailView(APIView):
    permission_classes = (IsAuthenticated,)

    def delete(self, request, event_id):
        forbidden = _artist_forbidden(request)
        if forbidden:
            return forbidden
        with transaction.atomic():
            User.objects.select_for_update().get(pk=request.user.pk)
            event = get_object_or_404(
                CalendarEvent,
                pk=event_id,
                artist=request.user,
                event_type__in=(
                    CalendarEvent.TYPE_BLOCKED,
                    CalendarEvent.TYPE_VACATION,
                ),
            )
            event.status = CalendarEvent.STATUS_CANCELLED
            event.save(update_fields=("status", "updated_at"))
        return Response(status=status.HTTP_204_NO_CONTENT)
