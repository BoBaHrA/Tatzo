from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse

from .models import StyleMatchSession
from .views import PENDING_RESULT_SESSION_KEY


class StyleMatchPersistenceHotfixTests(TestCase):
    def test_latest_result_returns_saved_user_session(self):
        user = User.objects.create_user(username="saved-user", password="password123")
        session = StyleMatchSession.objects.create(
            user=user,
            status=StyleMatchSession.STATUS_COMPLETED,
            target_count=1,
            card_order=[],
            current_index=0,
            style_scores={"fine_line": 90},
            trait_scores={},
            personality_slug="storyteller",
        )
        self.client.force_login(user)

        response = self.client.get(reverse("style_match:latest"))

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["authenticated"])
        self.assertTrue(response.json()["has_result"])
        self.assertIn(str(session.pk), response.json()["result_url"])

    def test_pending_guest_result_is_claimed_after_login(self):
        guest_result = StyleMatchSession.objects.create(
            browser_session_key="old-browser-key",
            status=StyleMatchSession.STATUS_COMPLETED,
            target_count=1,
            card_order=[],
            current_index=0,
            style_scores={"fine_line": 90},
            trait_scores={},
            personality_slug="storyteller",
        )
        browser_session = self.client.session
        browser_session[PENDING_RESULT_SESSION_KEY] = str(guest_result.pk)
        browser_session.save()

        user = User.objects.create_user(username="claim-user", password="password123")
        self.client.force_login(user)
        response = self.client.get(reverse("style_match:latest"))

        guest_result.refresh_from_db()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(guest_result.user, user)
        self.assertEqual(guest_result.browser_session_key, "")
