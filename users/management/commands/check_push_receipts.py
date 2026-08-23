from django.core.management.base import BaseCommand

from users.push_notifications import check_push_receipts


class Command(BaseCommand):
    help = "Check Expo push receipts and disable unregistered devices."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=1000)

    def handle(self, *args, **options):
        checked = check_push_receipts(limit=options["limit"])
        self.stdout.write(self.style.SUCCESS(f"Checked {checked} push receipts."))
