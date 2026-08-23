from django.core.management.base import BaseCommand

from users.booking_reminders import create_booking_reminders


class Command(BaseCommand):
    help = "Create idempotent 24-hour and 2-hour appointment reminders."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=500)
        parser.add_argument(
            "--dispatch",
            action="store_true",
            help="Also send eligible queued Expo deliveries immediately.",
        )

    def handle(self, *args, **options):
        created = create_booking_reminders(
            dispatch=options["dispatch"],
            limit=options["limit"],
        )
        self.stdout.write(self.style.SUCCESS(f"Created {created} booking reminders."))
