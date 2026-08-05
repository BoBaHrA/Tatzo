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
from .services import (
    calculate_match_confidence,
    calculate_session_scores,
    result_payload,
    select_balanced_card_ids,
    select_clarification_card_ids,
)


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
        self.assertContains(response, "человек разделяет ваш тату-характер.")
        self.assertContains(
            response,
            "Обычно 30 выборов · до 42, если результат нужно уточнить",
        )

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

        result = self.client.get(started["result_url"], HTTP_ACCEPT_LANGUAGE="ru")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["top_style"]["slug"], "fine_line")
        self.assertEqual(result.json()["personality"]["label"], "Рассказчик")
        self.assertEqual(
            result.json()["personality"]["description"],
            "Вас привлекают эмоциональные татуировки, органичное движение и детали с личным смыслом.",
        )

    def test_reacting_to_a_future_card_returns_conflict(self):
        make_card("T002", "blackwork")
        started = self.start().json()
        session = StyleMatchSession.objects.get(pk=started["session_id"])
        future_card_id = session.card_order[1]

        response = self.client.post(
            started["react_url"],
            data=json.dumps({"action": "like", "card_id": future_card_id}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.json()["error"], "Please react to the current card first."
        )

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

    @override_settings(
        STYLE_MATCH_CARD_COUNT=4,
        STYLE_MATCH_CLARIFICATION_BATCH_SIZE=2,
        STYLE_MATCH_MAX_CARD_COUNT=8,
        STYLE_MATCH_CONFIDENCE_THRESHOLD=100,
    )
    def test_ambiguous_session_adds_two_private_batches_then_stops_at_maximum(self):
        for index in range(2, 9):
            make_card(
                f"A{index:03}",
                "fine_line" if index % 2 else "blackwork",
            )

        started = self.start().json()
        self.assertEqual(started["total"], 4)

        extension_sizes = []
        completed_payload = None
        while completed_payload is None:
            session = StyleMatchSession.objects.get(pk=started["session_id"])
            card_id = session.card_order[session.current_index]
            response = self.client.post(
                started["react_url"],
                data=json.dumps({"action": "like", "card_id": card_id}),
                content_type="application/json",
            )
            self.assertEqual(response.status_code, 200)
            payload = response.json()
            if payload.get("clarification"):
                extension_sizes.append(len(payload["cards"]))
                self.assertEqual(
                    set(payload["cards"][0]),
                    {"id", "card_id", "image_url", "alt"},
                )
                self.assertNotIn("style_weights", payload["cards"][0])
                self.assertNotIn("primary_style", payload["cards"][0])
            if payload["completed"]:
                completed_payload = payload

        session = StyleMatchSession.objects.get(pk=started["session_id"])
        self.assertEqual(extension_sizes, [2, 2])
        self.assertEqual(session.target_count, 8)
        self.assertEqual(session.current_index, 8)
        self.assertEqual(len(set(session.card_order)), 8)
        self.assertEqual(session.status, StyleMatchSession.STATUS_COMPLETED)
        self.assertLess(
            self.client.get(started["result_url"]).json()["match_confidence"],
            100,
        )

    @override_settings(
        STYLE_MATCH_CARD_COUNT=4,
        STYLE_MATCH_CLARIFICATION_BATCH_SIZE=2,
        STYLE_MATCH_MAX_CARD_COUNT=8,
        STYLE_MATCH_CONFIDENCE_THRESHOLD=0,
    )
    def test_confident_session_completes_at_base_count(self):
        for index in range(2, 9):
            make_card(f"C{index:03}", "fine_line")

        started = self.start().json()
        final_payload = None
        for _index in range(4):
            session = StyleMatchSession.objects.get(pk=started["session_id"])
            response = self.client.post(
                started["react_url"],
                data=json.dumps(
                    {
                        "action": "favorite",
                        "card_id": session.card_order[session.current_index],
                    }
                ),
                content_type="application/json",
            )
            final_payload = response.json()

        self.assertTrue(final_payload["completed"])
        self.assertNotIn("clarification", final_payload)
        session = StyleMatchSession.objects.get(pk=started["session_id"])
        self.assertEqual(session.target_count, 4)


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

    def test_clarification_selection_targets_leading_styles_without_repeats(self):
        used_cards = [
            make_card("USED1", "fine_line"),
            make_card("USED2", "blackwork"),
        ]
        session = StyleMatchSession.objects.create(
            browser_session_key="test-browser",
            target_count=2,
            card_order=[card.pk for card in used_cards],
            current_index=2,
        )
        contenders = ["fine_line", "blackwork", "ornamental"]
        for style in contenders:
            for index in range(2):
                make_card(
                    f"{style[:3].upper()}{index}",
                    style,
                    style_weights={style: 0.9},
                )
        for index in range(3):
            make_card(f"OTHER{index}", "watercolor")

        selected = select_clarification_card_ids(
            session,
            {"fine_line": 70, "blackwork": 68, "ornamental": 65},
            limit=6,
        )
        selected_styles = set(
            TattooCard.objects.filter(pk__in=selected).values_list(
                "primary_style", flat=True
            )
        )

        self.assertEqual(len(selected), 6)
        self.assertEqual(len(set(selected)), 6)
        self.assertFalse(set(selected) & set(session.card_order))
        self.assertEqual(selected_styles, set(contenders))

    def test_real_confidence_distinguishes_clear_and_tied_results(self):
        def build_session(prefix, reactions):
            cards = []
            for index, (style, _reaction) in enumerate(reactions):
                cards.append(make_card(f"{prefix}{index:02}", style))
            session = StyleMatchSession.objects.create(
                browser_session_key=f"{prefix}-browser",
                target_count=len(cards),
                card_order=[card.pk for card in cards],
                current_index=len(cards),
            )
            for position, (card, (_style, reaction)) in enumerate(
                zip(cards, reactions)
            ):
                StyleMatchResponse.objects.create(
                    session=session,
                    card=card,
                    position=position,
                    reaction=reaction,
                )
            scores = calculate_session_scores(session)
            return session, scores

        clear_reactions = [("fine_line", StyleMatchResponse.REACTION_FAVORITE)] * 15 + [
            ("blackwork", StyleMatchResponse.REACTION_REJECT)
        ] * 15
        tied_reactions = [("fine_line", StyleMatchResponse.REACTION_LIKE)] * 15 + [
            ("blackwork", StyleMatchResponse.REACTION_LIKE)
        ] * 15
        clear_session, clear_scores = build_session("CLR", clear_reactions)
        tied_session, tied_scores = build_session("TIE", tied_reactions)

        clear_confidence = calculate_match_confidence(clear_session, clear_scores)
        tied_confidence = calculate_match_confidence(tied_session, tied_scores)

        self.assertEqual(clear_confidence, 98)
        self.assertLess(tied_confidence, 78)
        self.assertGreater(clear_confidence, tied_confidence)

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
