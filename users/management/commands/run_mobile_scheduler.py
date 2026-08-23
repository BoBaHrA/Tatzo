from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from users.booking_reminders import create_booking_reminders
from users.push_notifications import check_push_receipts, dispatch_push_deliveries

REMINDER_INTERVAL_MINUTES = 5
RECEIPT_INTERVAL_MINUTES = 15


class Command(BaseCommand):
    help = "Run Tatzo's minute-based mobile notification scheduler."

    def add_arguments(self, parser):
        parser.add_argument("--reminder-limit", type=int, default=500)
        parser.add_argument("--delivery-limit", type=int, default=100)
        parser.add_argument("--receipt-limit", type=int, default=1000)

    def handle(self, *args, **options):
        now = timezone.now()
        reminder_due = now.minute % REMINDER_INTERVAL_MINUTES == 0
        receipt_due = now.minute % RECEIPT_INTERVAL_MINUTES == 0
        push_enabled = getattr(settings, "TATZO_PUSH_ENABLED", True)

        reminders = None
        if reminder_due:
            reminders = create_booking_reminders(
                now=now,
                dispatch=False,
                limit=options["reminder_limit"],
            )

        deliveries = None
        if push_enabled:
            deliveries = dispatch_push_deliveries(
                limit=options["delivery_limit"],
            )

        receipts = None
        if receipt_due and push_enabled:
            receipts = check_push_receipts(
                limit=options["receipt_limit"],
            )

        self.stdout.write(
            self.style.SUCCESS(
                "Mobile scheduler "
                f"{now.isoformat()}: "
                f"reminders={self._result(reminders, due=reminder_due)}, "
                f"deliveries={self._result(deliveries, due=True, enabled=push_enabled)}, "
                f"receipts={self._result(receipts, due=receipt_due, enabled=push_enabled)}."
            )
        )

    @staticmethod
    def _result(value, *, due, enabled=True):
        if not enabled:
            return "disabled"
        if not due:
            return "skipped"
        return str(value)
