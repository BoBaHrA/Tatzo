from dataclasses import dataclass
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from appointments.models import Appointment
from appointments.views import _artist_datetime

from .models import Notification
from .push_notifications import dispatch_push_deliveries, queue_notification_push


@dataclass(frozen=True)
class ReminderWindow:
    key: str
    lower_bound: timedelta
    upper_bound: timedelta


REMINDER_WINDOWS = (
    ReminderWindow("24h", timedelta(hours=2), timedelta(hours=24)),
    ReminderWindow("2h", timedelta(0), timedelta(hours=2)),
)
REMINDER_APPOINTMENT_STATUSES = (
    Appointment.STATUS_ACCEPTED,
    Appointment.STATUS_CONSULTATION_REQUIRED,
)


def _appointment_start(appointment):
    return _artist_datetime(
        appointment.artist,
        appointment.date,
        appointment.start_time,
    )


def _schedule_key(appointment):
    return f"{appointment.date.isoformat()}T{appointment.start_time.strftime('%H%M')}"


def _due_window(starts_at, now):
    remaining = starts_at - now
    for window in REMINDER_WINDOWS:
        if window.lower_bound < remaining <= window.upper_bound:
            return window
    return None


def create_booking_reminders(*, now=None, dispatch=False, limit=500):
    now = now or timezone.now()
    limit = min(max(int(limit), 1), 2000)
    earliest_date = (now - timedelta(days=1)).date()
    latest_date = (now + REMINDER_WINDOWS[0].upper_bound + timedelta(days=1)).date()
    appointments = (
        Appointment.objects.filter(
            status__in=REMINDER_APPOINTMENT_STATUSES,
            date__gte=earliest_date,
            date__lte=latest_date,
            artist__is_active=True,
            client__is_active=True,
        )
        .select_related("artist", "artist__profile", "client")
        .order_by("date", "start_time", "id")
    )

    created_count = 0
    due_appointments = 0
    for appointment in appointments.iterator(chunk_size=500):
        starts_at = _appointment_start(appointment)
        window = _due_window(starts_at, now)
        if window is None:
            continue
        if due_appointments >= limit:
            break
        due_appointments += 1
        schedule_key = _schedule_key(appointment)
        for recipient_id in (appointment.artist_id, appointment.client_id):
            with transaction.atomic():
                notification, created = Notification.objects.get_or_create(
                    recipient_id=recipient_id,
                    dedupe_key=(
                        f"appointment:{appointment.pk}:reminder:"
                        f"{window.key}:{schedule_key}"
                    ),
                    defaults={
                        "kind": Notification.KIND_BOOKING_REMINDER,
                        "appointment_id": appointment.pk,
                    },
                )
                if created:
                    queue_notification_push(notification, dispatch=False)
                    created_count += 1

    if dispatch and getattr(settings, "TATZO_PUSH_ENABLED", True):
        dispatch_push_deliveries(limit=100)
    return created_count
