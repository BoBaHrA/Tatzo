import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from style_match.models import TattooCard


class Command(BaseCommand):
    help = "Import or update annotated Style Match cards from a JSON manifest."

    def add_arguments(self, parser):
        parser.add_argument("manifest", type=Path)
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        manifest = options["manifest"]
        if not manifest.exists():
            raise CommandError(f"Manifest not found: {manifest}")

        try:
            payload = json.loads(manifest.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise CommandError(f"Cannot read manifest: {exc}") from exc

        cards = payload.get("cards") if isinstance(payload, dict) else payload
        if not isinstance(cards, list):
            raise CommandError(
                "Manifest must be a list or an object with a 'cards' list."
            )

        created = 0
        updated = 0
        with transaction.atomic():
            for index, item in enumerate(cards, start=1):
                if not isinstance(item, dict) or not item.get("card_id"):
                    raise CommandError(f"Card #{index} is missing card_id.")

                defaults = {
                    "image_url": item.get("image_url", ""),
                    "cloudinary_public_id": item.get("cloudinary_public_id", ""),
                    "primary_style": item.get("primary_style", ""),
                    "style_weights": item.get("style_weights", {}),
                    "visual_traits": item.get("visual_traits", {}),
                    "motifs": item.get("motifs", []),
                    "body_area": item.get("body_area", ""),
                    "skin_tone": item.get("skin_tone", ""),
                    "quality_score": item.get("quality_score", 1),
                    "is_active": item.get("is_active", True),
                    "is_approved": item.get("is_approved", True),
                }
                card = TattooCard(card_id=item["card_id"], **defaults)
                card.full_clean()

                _, was_created = TattooCard.objects.update_or_create(
                    card_id=item["card_id"],
                    defaults=defaults,
                )
                created += int(was_created)
                updated += int(not was_created)

            if options["dry_run"]:
                transaction.set_rollback(True)

        mode = "Validated" if options["dry_run"] else "Imported"
        self.stdout.write(
            self.style.SUCCESS(f"{mode}: {created} created, {updated} updated.")
        )
