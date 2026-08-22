from datetime import datetime, time, timedelta
from io import StringIO
from uuid import uuid4
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone

from appointments.models import Appointment
from users.booking_reminders import create_booking_reminders
from users.models import Notification, PushDelivery, PushDevice

User = get_user_model()


@override_settings(TATZO_PUSH_ENABLED=False)
class BookingReminderTests(TestCase):
    def setUp(self):
        self.artist = self.create_user("reminder-artist", artist=True)
        self.client_user = self.create_user("reminder-client")
        self.device = PushDevice.objects.create(
            user=self.client_user,
            installation_id=uuid4(),
            expo_push_token="ExponentPushToken[booking-reminder-client]",
            platform=PushDevice.PLATFORM_ANDROID,
            locale="ru",
        )
        self.now = timezone.make_aware(
            datetime(2026, 8, 23, 10),
            ZoneInfo("Europe/Paris"),
        )

    @staticmethod
    def create_user(username, *, artist=False):
        user = User.objects.create_user(
            username,
            email=f"{username}@example.com",
            password="StrongPassword123",
            is_active=True,
        )
        user.profile.is_email_verified = True
        if artist:
            user.profile.account_type = "tattoo_artist"
            user.profile.verification_status = "approved"
            user.profile.timezone = "Europe/Paris"
        user.profile.save(
            update_fields=(
                "is_email_verified",
                "account_type",
                "verification_status",
                "timezone",
            )
        )
        return user

    def appointment(self, starts_in, *, status=Appointment.STATUS_ACCEPTED):
        local_start = timezone.localtime(
            self.now + starts_in,
            ZoneInfo("Europe/Paris"),
        )
        return Appointment.objects.create(
            artist=self.artist,
            client=self.client_user,
            booking_type=Appointment.TYPE_TATTOO,
            status=status,
            date=local_start.date(),
            start_time=local_start.time().replace(tzinfo=None),
            end_time=(local_start + timedelta(hours=2)).time().replace(tzinfo=None),
            session_length_minutes=120,
        )

    def test_creates_one_24_hour_reminder_per_participant_and_is_idempotent(self):
        appointment = self.appointment(timedelta(hours=23))

        first = create_booking_reminders(now=self.now)
        second = create_booking_reminders(now=self.now + timedelta(minutes=5))

        self.assertEqual(first, 2)
        self.assertEqual(second, 0)
        reminders = Notification.objects.filter(
            appointment=appointment,
            kind=Notification.KIND_BOOKING_REMINDER,
        )
        self.assertEqual(reminders.count(), 2)
        self.assertEqual(
            set(reminders.values_list("recipient_id", flat=True)),
            {self.artist.pk, self.client_user.pk},
        )
        delivery = PushDelivery.objects.get(
            notification__recipient=self.client_user,
            device=self.device,
        )
        self.assertEqual(delivery.status, PushDelivery.STATUS_PENDING)

    def test_two_hour_reminder_is_separate_from_earlier_reminder(self):
        appointment = self.appointment(timedelta(hours=23))
        self.assertEqual(create_booking_reminders(now=self.now), 2)

        later = self.now + timedelta(hours=22)
        self.assertEqual(create_booking_reminders(now=later), 2)

        reminders = Notification.objects.filter(
            appointment=appointment,
            kind=Notification.KIND_BOOKING_REMINDER,
        )
        keys = set(reminders.values_list("dedupe_key", flat=True))
        self.assertTrue(any(":reminder:24h:" in key for key in keys))
        self.assertTrue(any(":reminder:2h:" in key for key in keys))
        self.assertEqual(len(keys), 2)
        self.assertEqual(reminders.count(), 4)

    def test_reschedule_creates_reminder_for_new_schedule_version(self):
        appointment = self.appointment(timedelta(hours=23))
        self.assertEqual(create_booking_reminders(now=self.now), 2)
        reminders = Notification.objects.filter(
            kind=Notification.KIND_BOOKING_REMINDER,
        )
        old_keys = set(reminders.values_list("dedupe_key", flat=True))
        old_count = reminders.count()

        new_start = timezone.localtime(
            self.now + timedelta(hours=22),
            ZoneInfo("Europe/Paris"),
        )
        appointment.date = new_start.date()
        appointment.start_time = new_start.time().replace(tzinfo=None)
        appointment.end_time = (
            (new_start + timedelta(hours=2)).time().replace(tzinfo=None)
        )
        appointment.save(update_fields=("date", "start_time", "end_time", "updated_at"))

        self.assertEqual(create_booking_reminders(now=self.now), 2)
        new_keys = set(reminders.values_list("dedupe_key", flat=True))
        self.assertEqual(len(new_keys - old_keys), 1)
        self.assertEqual(reminders.count() - old_count, 2)

    def test_ignores_cancelled_past_and_more_than_24_hours(self):
        self.appointment(timedelta(hours=23), status=Appointment.STATUS_CANCELLED)
        self.appointment(timedelta(hours=-1))
        self.appointment(timedelta(hours=25))

        self.assertEqual(create_booking_reminders(now=self.now), 0)
        self.assertFalse(
            Notification.objects.filter(
                kind=Notification.KIND_BOOKING_REMINDER,
            ).exists()
        )

    def test_management_command_reports_created_count(self):
        self.appointment(timedelta(hours=1))
        output = StringIO()

        from unittest.mock import patch

        with patch(
            "users.booking_reminders.timezone.now",
            return_value=self.now,
        ):
            call_command("send_booking_reminders", stdout=output)

        self.assertIn("Created 2 booking reminders.", output.getvalue())
