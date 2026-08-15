from datetime import datetime, time, timedelta

from django.db.models import Q
from django.utils import timezone
from django.utils.encoding import force_str
from django.utils.translation import gettext as _

from appointments.models import (
    Appointment,
    ArtistAvailability,
    ArtistBookingSettings,
    ArtistTimeOff,
    CalendarEvent,
)
from appointments.views import (
    _artist_timezone,
    _ensure_default_artist_availability,
    _get_artist_booked_minutes,
    _get_artist_settings,
    _get_booking_status_label,
)
from users.models import ChatMessage

from .booking_views import _booking_user_payload


ACTIVE_APPOINTMENT_STATUSES = (
    Appointment.STATUS_PENDING,
    Appointment.STATUS_NEEDS_REFERENCES,
    Appointment.STATUS_CONSULTATION_REQUIRED,
    Appointment.STATUS_ACCEPTED,
)
TIMELINE_APPOINTMENT_STATUSES = (
    Appointment.STATUS_ACCEPTED,
    Appointment.STATUS_CONSULTATION_REQUIRED,
)


def time_string(value):
    return value.strftime("%H:%M") if value else None


def settings_payload(settings):
    return {
        "booking_status": settings.booking_status,
        "booking_status_label": force_str(
            _get_booking_status_label(settings.booking_status)
        ),
        "booking_status_options": [
            {"value": value, "label": force_str(label)}
            for value, label in ArtistBookingSettings.BOOKING_STATUS_CHOICES
        ],
        "bookings_enabled": settings.bookings_enabled,
        "booking_workflow": settings.booking_workflow,
        "maximum_session_hours": settings.maximum_session_hours,
        "minimum_notice_hours": settings.minimum_notice_hours,
        "maximum_booking_window_days": settings.maximum_booking_window_days,
    }


def schedule_payload(artist):
    rows = ArtistAvailability.objects.filter(artist=artist).order_by("weekday")
    return [
        {
            "weekday": row.weekday,
            "is_closed": row.is_closed,
            "open_time": None if row.is_closed else time_string(row.open_time),
            "close_time": None if row.is_closed else time_string(row.close_time),
            "break_start": None if row.is_closed else time_string(row.break_start),
            "break_end": None if row.is_closed else time_string(row.break_end),
        }
        for row in rows
    ]


def time_off_payload(item):
    return {
        "id": item.pk,
        "date": item.date.isoformat(),
        "reason": item.reason,
    }


def blocked_period_payload(event):
    artist_tz = _artist_timezone(event.artist)
    local_start = timezone.localtime(event.starts_at, artist_tz)
    local_end = timezone.localtime(event.ends_at, artist_tz)
    return {
        "id": event.pk,
        "event_type": event.event_type,
        "event_type_label": force_str(event.get_event_type_display()),
        "date": local_start.date().isoformat(),
        "end_date": local_end.date().isoformat(),
        "start_time": local_start.strftime("%H:%M"),
        "end_time": local_end.strftime("%H:%M"),
        "title": event.title,
    }


def _dashboard_stats(artist, today):
    artist_appointments = Appointment.objects.filter(artist=artist)
    return {
        "today_sessions": artist_appointments.filter(
            date=today,
            status__in=(
                Appointment.STATUS_ACCEPTED,
                Appointment.STATUS_CONSULTATION_REQUIRED,
            ),
        ).count(),
        "pending_requests": artist_appointments.filter(
            status__in=(
                Appointment.STATUS_PENDING,
                Appointment.STATUS_NEEDS_REFERENCES,
            )
        ).count(),
        "upcoming_consultations": artist_appointments.filter(
            date__gte=today,
            booking_type__in=(
                Appointment.TYPE_CONSULTATION,
                Appointment.TYPE_ONLINE_CONSULTATION,
            ),
            status__in=ACTIVE_APPOINTMENT_STATUSES,
        ).count(),
        "unread_messages": ChatMessage.objects.filter(
            is_read=False,
            is_deleted=False,
        )
        .exclude(sender=artist)
        .filter(
            Q(thread__participant_one=artist)
            | Q(thread__participant_two=artist)
        )
        .count(),
    }


def _workload_payload(artist, settings, today, days=14):
    end_date = today + timedelta(days=days - 1)
    booked_minutes = _get_artist_booked_minutes(artist, today, end_date)
    time_off_dates = set(
        ArtistTimeOff.objects.filter(
            artist=artist,
            date__gte=today,
            date__lte=end_date,
        ).values_list("date", flat=True)
    )
    closed_weekdays = set(
        ArtistAvailability.objects.filter(
            artist=artist,
            is_closed=True,
        ).values_list("weekday", flat=True)
    )
    capacity_minutes = max(1, int(settings.maximum_session_hours or 1)) * 60
    result = []
    for offset in range(days):
        date_value = today + timedelta(days=offset)
        reserved = booked_minutes.get(date_value.isoformat(), 0)
        weekday = (date_value.weekday() + 1) % 7
        is_time_off = date_value in time_off_dates
        is_closed = weekday in closed_weekdays
        percent = min(100, round(reserved / capacity_minutes * 100))
        if is_time_off:
            workload = "time_off"
        elif is_closed:
            workload = "closed"
        elif percent >= 100:
            workload = "full"
        elif percent >= 50:
            workload = "busy"
        elif percent:
            workload = "light"
        else:
            workload = "empty"
        result.append(
            {
                "date": date_value.isoformat(),
                "booked_minutes": reserved,
                "capacity_minutes": capacity_minutes,
                "percent": percent,
                "workload": workload,
            }
        )
    return result


def _timeline_payload(artist, request, today, days=30):
    end_date = today + timedelta(days=days)
    appointments = list(
        Appointment.objects.filter(
            Q(artist=artist) | Q(client=artist),
            date__gte=today,
            date__lte=end_date,
            status__in=TIMELINE_APPOINTMENT_STATUSES,
        )
        .select_related(
            "artist",
            "artist__profile",
            "client",
            "client__profile",
        )
        .order_by("date", "start_time", "id")
    )
    items = []
    appointment_ids = set()
    for appointment in appointments:
        appointment_ids.add(appointment.pk)
        role = "artist" if appointment.artist_id == artist.pk else "client"
        other_user = appointment.client if role == "artist" else appointment.artist
        items.append(
            {
                "id": f"appointment-{appointment.pk}",
                "source": "appointment",
                "appointment_id": appointment.pk,
                "role": role,
                "date": appointment.date.isoformat(),
                "start_time": time_string(appointment.start_time),
                "end_time": time_string(appointment.end_time),
                "title": force_str(appointment.get_booking_type_display()),
                "status": appointment.status,
                "status_label": force_str(appointment.get_status_display()),
                "other_user": _booking_user_payload(other_user, request),
                "_sort": (
                    appointment.date.isoformat(),
                    time_string(appointment.start_time) or "00:00",
                    f"appointment-{appointment.pk}",
                ),
            }
        )

    artist_tz = _artist_timezone(artist)
    range_start = timezone.make_aware(datetime.combine(today, time.min), artist_tz)
    range_end = timezone.make_aware(
        datetime.combine(end_date + timedelta(days=1), time.min), artist_tz
    )
    events = (
        CalendarEvent.objects.filter(
            Q(artist=artist) | Q(client=artist),
            starts_at__lt=range_end,
            ends_at__gt=range_start,
        )
        .exclude(status=CalendarEvent.STATUS_CANCELLED)
        .select_related(
            "artist",
            "artist__profile",
            "client",
            "client__profile",
        )
        .order_by("starts_at", "id")
    )
    for event in events:
        if event.project_id and event.project_id in appointment_ids:
            continue
        event_tz = _artist_timezone(event.artist)
        local_start = timezone.localtime(event.starts_at, event_tz)
        local_end = timezone.localtime(event.ends_at, event_tz)
        role = "artist" if event.artist_id == artist.pk else "client"
        other_user = None
        if event.client_id:
            other = event.client if role == "artist" else event.artist
            other_user = _booking_user_payload(other, request)
        items.append(
            {
                "id": f"event-{event.pk}",
                "source": "calendar_event",
                "appointment_id": event.project_id,
                "role": role,
                "date": local_start.date().isoformat(),
                "start_time": local_start.strftime("%H:%M"),
                "end_time": local_end.strftime("%H:%M"),
                "title": event.title,
                "status": event.status,
                "status_label": force_str(event.get_status_display()),
                "other_user": other_user,
                "_sort": (
                    local_start.date().isoformat(),
                    local_start.strftime("%H:%M"),
                    f"event-{event.pk}",
                ),
            }
        )

    time_off = ArtistTimeOff.objects.filter(
        artist=artist,
        date__gte=today,
        date__lte=end_date,
    ).order_by("date", "id")
    for item in time_off:
        items.append(
            {
                "id": f"time-off-{item.pk}",
                "source": "time_off",
                "appointment_id": None,
                "role": "artist",
                "date": item.date.isoformat(),
                "start_time": None,
                "end_time": None,
                "title": item.reason or force_str(_("Time off")),
                "status": "time_off",
                "status_label": force_str(_("Time off")),
                "other_user": None,
                "_sort": (item.date.isoformat(), "00:00", f"time-off-{item.pk}"),
            }
        )

    items.sort(key=lambda item: item["_sort"])
    for item in items:
        item.pop("_sort", None)
    return items[:20]


def dashboard_payload(artist, request):
    settings = _get_artist_settings(artist)
    _ensure_default_artist_availability(artist)
    artist_tz = _artist_timezone(artist)
    today = timezone.localdate(timezone=artist_tz)
    future_events = (
        CalendarEvent.objects.filter(
            artist=artist,
            event_type__in=(
                CalendarEvent.TYPE_BLOCKED,
                CalendarEvent.TYPE_VACATION,
            ),
            ends_at__gte=timezone.now(),
        )
        .exclude(status=CalendarEvent.STATUS_CANCELLED)
        .select_related("artist", "artist__profile")
        .order_by("starts_at", "id")[:50]
    )
    return {
        "artist_timezone": str(artist_tz),
        "today": today.isoformat(),
        "settings": settings_payload(settings),
        "stats": _dashboard_stats(artist, today),
        "schedule": schedule_payload(artist),
        "workload": _workload_payload(artist, settings, today),
        "time_off": [
            time_off_payload(item)
            for item in ArtistTimeOff.objects.filter(
                artist=artist,
                date__gte=today,
            ).order_by("date", "id")[:50]
        ],
        "blocked_periods": [
            blocked_period_payload(event) for event in future_events
        ],
        "timeline": _timeline_payload(artist, request, today),
    }
