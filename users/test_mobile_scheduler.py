from datetime import UTC, datetime
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.test import SimpleTestCase, override_settings


@override_settings(TATZO_PUSH_ENABLED=True)
class MobileSchedulerCommandTests(SimpleTestCase):
    def run_scheduler(self, minute, **options):
        now = datetime(2026, 8, 24, 12, minute, tzinfo=UTC)
        output = StringIO()
        with (
            patch(
                "users.management.commands.run_mobile_scheduler.timezone.now",
                return_value=now,
            ),
            patch(
                "users.management.commands.run_mobile_scheduler."
                "create_booking_reminders",
                return_value=2,
            ) as reminders,
            patch(
                "users.management.commands.run_mobile_scheduler."
                "dispatch_push_deliveries",
                return_value=3,
            ) as deliveries,
            patch(
                "users.management.commands.run_mobile_scheduler.check_push_receipts",
                return_value=4,
            ) as receipts,
        ):
            call_command("run_mobile_scheduler", stdout=output, **options)
        return now, output.getvalue(), reminders, deliveries, receipts

    def test_processes_deliveries_every_minute(self):
        _now, output, reminders, deliveries, receipts = self.run_scheduler(1)

        reminders.assert_not_called()
        deliveries.assert_called_once_with(limit=100)
        receipts.assert_not_called()
        self.assertIn("reminders=skipped", output)
        self.assertIn("deliveries=3", output)
        self.assertIn("receipts=skipped", output)

    def test_creates_reminders_every_five_minutes(self):
        now, output, reminders, deliveries, receipts = self.run_scheduler(5)

        reminders.assert_called_once_with(now=now, dispatch=False, limit=500)
        deliveries.assert_called_once_with(limit=100)
        receipts.assert_not_called()
        self.assertIn("reminders=2", output)
        self.assertIn("receipts=skipped", output)

    def test_checks_receipts_every_fifteen_minutes(self):
        now, output, reminders, deliveries, receipts = self.run_scheduler(15)

        reminders.assert_called_once_with(now=now, dispatch=False, limit=500)
        deliveries.assert_called_once_with(limit=100)
        receipts.assert_called_once_with(limit=1000)
        self.assertIn("reminders=2", output)
        self.assertIn("deliveries=3", output)
        self.assertIn("receipts=4", output)

    def test_forwards_custom_limits(self):
        now, _output, reminders, deliveries, receipts = self.run_scheduler(
            30,
            reminder_limit=40,
            delivery_limit=20,
            receipt_limit=60,
        )

        reminders.assert_called_once_with(now=now, dispatch=False, limit=40)
        deliveries.assert_called_once_with(limit=20)
        receipts.assert_called_once_with(limit=60)

    @override_settings(TATZO_PUSH_ENABLED=False)
    def test_keeps_in_app_reminders_but_skips_expo_when_push_is_disabled(self):
        now, output, reminders, deliveries, receipts = self.run_scheduler(15)

        reminders.assert_called_once_with(now=now, dispatch=False, limit=500)
        deliveries.assert_not_called()
        receipts.assert_not_called()
        self.assertIn("reminders=2", output)
        self.assertIn("deliveries=disabled", output)
        self.assertIn("receipts=disabled", output)
