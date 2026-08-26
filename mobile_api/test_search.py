from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from users.models import UserBlock


User = get_user_model()


class MobileProfileSearchTests(APITestCase):
    def make_user(self, username, *, tag=None, account_type="regular"):
        user = User.objects.create_user(
            username=username,
            email=f"{username}@example.com",
            password="StrongPassword123",
            is_active=True,
        )
        profile = user.profile
        profile.is_email_verified = True
        profile.account_type = account_type
        if tag is not None:
            profile.tag = tag
        profile.save(update_fields=("is_email_verified", "account_type", "tag"))
        return user

    def setUp(self):
        self.viewer = self.make_user("viewer", tag="viewer_tag")
        self.artist = self.make_user(
            "MedusaTattoo",
            tag="medusatattoo",
            account_type="tattoo_artist",
        )
        self.client_user = self.make_user("medusa_fan", tag="medusa_fan")
        self.client.force_authenticate(self.viewer)

    def test_search_requires_authentication(self):
        self.client.force_authenticate(None)
        response = self.client.get(reverse("mobile_api:profile_search"), {"q": "medusa"})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_search_matches_username_and_tag(self):
        response = self.client.get(reverse("mobile_api:profile_search"), {"q": "medusa"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        usernames = [item["username"] for item in response.data["results"]]
        self.assertIn("MedusaTattoo", usernames)
        self.assertIn("medusa_fan", usernames)

    def test_artist_filter_returns_only_artists(self):
        response = self.client.get(
            reverse("mobile_api:profile_search"),
            {"q": "medusa", "type": "artists"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([item["username"] for item in response.data["results"]], ["MedusaTattoo"])

    def test_search_accepts_leading_at_for_tags(self):
        response = self.client.get(reverse("mobile_api:profile_search"), {"q": "@medusatattoo"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["results"][0]["username"], "MedusaTattoo")

    def test_two_way_blocks_hide_results(self):
        UserBlock.objects.create(blocker=self.artist, blocked=self.viewer)
        response = self.client.get(reverse("mobile_api:profile_search"), {"q": "medusa"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        usernames = [item["username"] for item in response.data["results"]]
        self.assertNotIn("MedusaTattoo", usernames)
        self.assertIn("medusa_fan", usernames)
