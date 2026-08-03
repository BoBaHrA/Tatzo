import json
import tempfile
from decimal import Decimal
from pathlib import Path

from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.test import Client, TestCase, override_settings
from django.urls import reverse

from appointments.models import ArtistBookingSettings

from .models import StyleMatchResponse, StyleMatchSession, TattooCard
from .services import result_payload, select_balanced_card_ids


def make_card(card_id="T001", primary_style="fine_line", **overrides):
    defaults = {
        "image_url": f"https://example.com/{card_id}.jpg",
        "cloudinary_public_id": f"style_match/cards/{card_id}",
        "primary_style": primary_style,
        "style_weights": {primary_style: 0.9},
        "visual_traits": {"organic": 0.8, "line_weight": 0.2},
        "motifs": ["nature"],
        "quality_score": Decimal("0.900"),
        "is_active": True,
        "is_approved": True,
    }
    defaults.update(overrides)
    return TattooCard.objects.create(card_id=card_id, **defaults)


@override_settings(
    STYLE_MATCH_CARD_COUNT=30,
    STORAGES={
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
        "staticfiles": {
            "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"
        },
    },
)
class StyleMatchFlowTests(TestCase):
    def setUp(self):
        TattooCard.objects.all().delete()
        self.card = make_card()

    def start(self, client=None):
        client = client or self.client
        return client.post(
            reverse("style_match:start"),
            data=json.dumps({}),
            content_type="application/json",
        )

    def test_index_renders_available_card(self):
        response = self.client.get(reverse("style_match:index"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Style Match")
        self.assertContains(response, self.card.delivery_url)

    def test_index_uses_module_translation_catalog(self):
        response = self.client.get(
            reverse("style_match:index"),
            HTTP_ACCEPT_LANGUAGE="ru",
        )

        self.assertContains(response, "Не знаете, какой стиль тату вам подходит?")

    def test_start_returns_visual_card_data_without_style_labels(self):
        response = self.start()

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload["total"], 1)
        self.assertEqual(payload["cards"][0]["card_id"], self.card.card_id)
        self.assertNotIn("primary_style", payload["cards"][0])
        self.assertNotIn("style_weights", payload["cards"][0])

    def test_save_does_not_advance_then_favorite_completes_session(self):
        started = self.start().json()
        react_url = started["react_url"]

        saved = self.client.post(
            react_url,
            data=json.dumps({"action": "save", "card_id": self.card.pk, "saved": True}),
            content_type="application/json",
        )
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(saved.json()["current_index"], 0)

        completed = self.client.post(
            react_url,
            data=json.dumps({"action": "favorite", "card_id": self.card.pk}),
            content_type="application/json",
        )
        self.assertEqual(completed.status_code, 200)
        self.assertTrue(completed.json()["completed"])

        session = StyleMatchSession.objects.get(pk=started["session_id"])
        response = StyleMatchResponse.objects.get(session=session)
        self.assertTrue(response.saved)
        self.assertEqual(response.reaction, StyleMatchResponse.REACTION_FAVORITE)
        self.assertEqual(session.status, StyleMatchSession.STATUS_COMPLETED)
        self.assertGreater(session.style_scores["fine_line"], 50)

        result = self.client.get(started["result_url"])
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["top_style"]["slug"], "fine_line")

    def test_anonymous_session_is_private_to_browser_session(self):
        started = self.start().json()

        response = Client().get(started["result_url"])

        self.assertEqual(response.status_code, 404)

    def test_new_session_abandons_previous_active_session(self):
        first_id = self.start().json()["session_id"]
        second_id = self.start().json()["session_id"]

        self.assertNotEqual(first_id, second_id)
        self.assertEqual(
            StyleMatchSession.objects.get(pk=first_id).status,
            StyleMatchSession.STATUS_ABANDONED,
        )


class StyleMatchScoringTests(TestCase):
    def setUp(self):
        TattooCard.objects.all().delete()

    def test_balanced_selection_starts_with_distinct_primary_styles(self):
        styles = ["fine_line", "blackwork", "japanese", "geometric"]
        for index, style in enumerate(styles, start=1):
            make_card(f"B{index:03}", style)
            make_card(f"B{index + 10:03}", style)

        selected = select_balanced_card_ids(limit=4)
        selected_styles = set(
            TattooCard.objects.filter(pk__in=selected).values_list(
                "primary_style", flat=True
            )
        )

        self.assertEqual(len(selected), 4)
        self.assertEqual(selected_styles, set(styles))

    def test_card_rejects_unknown_or_out_of_range_weights(self):
        card = TattooCard(
            card_id="INVALID",
            image_url="https://example.com/invalid.jpg",
            cloudinary_public_id="style_match/cards/INVALID",
            primary_style="fine_line",
            style_weights={"fine_line": 1.2, "unknown": 0.4},
        )

        with self.assertRaises(ValidationError):
            card.full_clean()

    def test_verified_artist_is_ranked_from_booking_styles(self):
        card = make_card()
        session = StyleMatchSession.objects.create(
            browser_session_key="test-browser",
            target_count=1,
            card_order=[card.pk],
            current_index=1,
            status=StyleMatchSession.STATUS_COMPLETED,
            style_scores={"fine_line": 92, "blackwork": 12},
            trait_scores={"organic": 80},
            personality_slug="storyteller",
        )
        StyleMatchResponse.objects.create(
            session=session,
            card=card,
            position=0,
            reaction=StyleMatchResponse.REACTION_LIKE,
        )
        artist = User.objects.create_user(
            username="needle_artist", password="password123"
        )
        artist.profile.account_type = "tattoo_artist"
        artist.profile.verification_status = "approved"
        artist.profile.is_email_verified = True
        artist.profile.save()
        ArtistBookingSettings.objects.create(artist=artist, active_styles=["Fine Line"])

        result = result_payload(session)

        self.assertEqual(result["artists"][0]["username"], artist.username)
        self.assertEqual(result["artists"][0]["top_style"], "Fine Line")
        self.assertGreater(result["artists"][0]["score"], 80)


class StyleMatchImportTests(TestCase):
    def setUp(self):
        TattooCard.objects.all().delete()

    def test_manifest_can_be_validated_then_imported(self):
        payload = {
            "cards": [
                {
                    "card_id": "IMPORT001",
                    "image_url": "https://example.com/import.jpg",
                    "cloudinary_public_id": "style_match/cards/IMPORT001",
                    "primary_style": "botanical",
                    "style_weights": {"botanical": 0.9, "fine_line": 0.7},
                    "visual_traits": {"organic": 0.95},
                    "motifs": ["flowers"],
                }
            ]
        }
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", encoding="utf-8", delete=False
        ) as manifest:
            json.dump(payload, manifest)
            manifest_path = Path(manifest.name)

        try:
            call_command("import_style_match_cards", manifest_path, dry_run=True)
            self.assertFalse(TattooCard.objects.filter(card_id="IMPORT001").exists())

            call_command("import_style_match_cards", manifest_path)
            card = TattooCard.objects.get(card_id="IMPORT001")
            self.assertEqual(card.primary_style, "botanical")
            self.assertTrue(card.is_approved)
        finally:
            manifest_path.unlink(missing_ok=True)
