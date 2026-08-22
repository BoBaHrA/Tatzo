from datetime import datetime
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
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
)
from appointments.views import (
    _artist_datetime,
    _artist_timezone,
    _get_artist_settings,
    _is_bookable_artist,
)

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
from .booking_views import BOOKING_DURATIONS


User = get_user_model()

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
