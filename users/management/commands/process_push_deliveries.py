from django.core.management.base import BaseCommand

from users.push_notifications import dispatch_push_deliveries


class Command(BaseCommand):
    help = "Send pending and retryable Tatzo push deliveries through Expo."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=100)

    def handle(self, *args, **options):
        sent = dispatch_push_deliveries(limit=options["limit"])
        self.stdout.write(self.style.SUCCESS(f"Sent {sent} push deliveries."))
