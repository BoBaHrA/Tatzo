from decimal import Decimal

from django.contrib.auth.models import User
from django.test import Client, TestCase
from django.urls import reverse

from .models import StyleMatchResponse, StyleMatchSession, TattooCard


class StyleMatchSavedReferenceTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="reference-owner",
            password="password123",
        )
        self.card = TattooCard.objects.create(
            card_id="SAVED001",
            image_url="https://example.com/saved-reference.jpg",
            cloudinary_public_id="style_match/cards/SAVED001",
            primary_style="fine_line",
            style_weights={"fine_line": 0.9},
            visual_traits={},
            motifs=["botanical"],
            quality_score=Decimal("0.900"),
            is_active=True,
            is_approved=True,
        )
        self.session = StyleMatchSession.objects.create(
            user=self.user,
            status=StyleMatchSession.STATUS_COMPLETED,
            target_count=1,
            card_order=[self.card.pk],
            current_index=1,
            style_scores={"fine_line": 90},
            trait_scores={},
            personality_slug="storyteller",
        )
        StyleMatchResponse.objects.create(
            session=self.session,
            card=self.card,
            position=0,
            reaction=StyleMatchResponse.REACTION_LIKE,
            saved=True,
        )

    def test_owner_can_load_saved_references(self):
        self.client.force_login(self.user)

        response = self.client.get(
            reverse(
                "style_match:saved_references",
                kwargs={"session_id": self.session.pk},
            )
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["session_id"], str(self.session.pk))
        self.assertEqual(response.json()["cards"][0]["card_id"], self.card.card_id)
        self.assertEqual(
            response.json()["cards"][0]["image_url"],
            self.card.delivery_url,
        )

    def test_other_browser_cannot_load_saved_references(self):
        response = Client().get(
            reverse(
                "style_match:saved_references",
                kwargs={"session_id": self.session.pk},
            )
        )

        self.assertEqual(response.status_code, 404)
