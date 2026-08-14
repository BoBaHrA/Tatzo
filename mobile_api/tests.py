from django.contrib.auth import get_user_model
from django.core import mail
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

User = get_user_model()


@override_settings(
    TATZO_RATE_LIMIT_ENABLED=False,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
)
class MobileAuthenticationTests(APITestCase):
    registration_payload = {
        "username": "mobile-user",
        "email": "mobile@example.com",
        "password": "StrongPassword123",
        "account_type": "regular",
        "accept_terms": True,
    }

    def register(self, **changes):
        payload = {**self.registration_payload, **changes}
        return self.client.post(reverse("mobile_api:register"), payload, format="json")

    def activate(self, user):
        user.is_active = True
        user.save(update_fields=("is_active",))
        user.profile.is_email_verified = True
        user.profile.save(update_fields=("is_email_verified",))

    def login(self, identifier="mobile-user", password="StrongPassword123"):
        return self.client.post(
            reverse("mobile_api:token"),
            {"identifier": identifier, "password": password},
            format="json",
        )

    def authorize(self, response):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def test_registration_requires_terms(self):
        response = self.register(accept_terms=False)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("accept_terms", response.data)

    def test_registration_creates_inactive_user_and_sends_verification_email(self):
        response = self.register()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(username="mobile-user")
        self.assertFalse(user.is_active)
        self.assertFalse(user.profile.is_email_verified)
        self.assertEqual(user.profile.account_type, "regular")
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("verify-email", mail.outbox[0].body)

    def test_unverified_user_cannot_receive_tokens(self):
        self.register()
        response = self.login()
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data["code"], "email_not_verified")

    def test_login_accepts_email_and_returns_profile(self):
        self.register()
        user = User.objects.get(username="mobile-user")
        self.activate(user)
        response = self.login(identifier="MOBILE@example.com")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        self.assertEqual(response.data["user"]["account_type"], "regular")
        self.assertTrue(response.data["user"]["is_email_verified"])
        user.refresh_from_db()
        self.assertIsNotNone(user.last_login)

    def test_me_requires_authentication(self):
        response = self.client.get(reverse("mobile_api:me"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_authenticated_user_can_read_and_update_profile(self):
        self.register()
        user = User.objects.get(username="mobile-user")
        self.activate(user)
        login_response = self.login()
        self.authorize(login_response)

        response = self.client.patch(
            reverse("mobile_api:me"),
            {"bio": "Tattoo collector", "tag": "mobile_collector"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["bio"], "Tattoo collector")
        self.assertEqual(response.data["tag"], "mobile_collector")

    def test_refresh_rotates_refresh_token(self):
        self.register()
        user = User.objects.get(username="mobile-user")
        self.activate(user)
        login_response = self.login()

        response = self.client.post(
            reverse("mobile_api:token_refresh"),
            {"refresh": login_response.data["refresh"]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_delete_account_requires_current_password(self):
        self.register()
        user = User.objects.get(username="mobile-user")
        self.activate(user)
        login_response = self.login()
        self.authorize(login_response)

        wrong = self.client.delete(
            reverse("mobile_api:me"), {"password": "wrong"}, format="json"
        )
        self.assertEqual(wrong.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(User.objects.filter(pk=user.pk).exists())

        deleted = self.client.delete(
            reverse("mobile_api:me"),
            {"password": "StrongPassword123"},
            format="json",
        )
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(User.objects.filter(pk=user.pk).exists())
