from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from .imported_artists import (
    ImportedArtistAdminForm,
    create_imported_artist,
    get_imported_artist_location,
    make_imported_artist_claim_token,
)

User = get_user_model()


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    DEFAULT_FROM_EMAIL="Tatzo <noreply@example.com>",
)
class ImportedArtistFlowTests(TestCase):
    def create_imported(self, username="linntatt"):
        form = ImportedArtistAdminForm(
            data={
                "username": username,
                "display_name": "Linn Tatt",
                "city": "Moscow",
                "country": "Russia",
                "instagram_url": "https://www.instagram.com/linntatt/",
                "bio": "Tattoo artist",
                "default_style": "Blackwork",
            }
        )
        self.assertTrue(form.is_valid(), form.errors)
        user, location = create_imported_artist(form)
        return user, location

    def test_imported_profile_is_public_before_claim(self):
        user, location = self.create_imported()

        self.assertFalse(user.has_usable_password())
        self.assertEqual(user.email, "")
        self.assertFalse(user.profile.is_email_verified)
        self.assertEqual(location.status, "unclaimed")

        response = self.client.get(reverse("profile", kwargs={"username": user.username}))
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "users/imported_artist_profile.html")
        self.assertContains(response, "Unclaimed profile")
        self.assertContains(response, "Moscow")

    def test_normal_profile_still_uses_existing_profile_view(self):
        user = User.objects.create_user(
            username="normal_artist",
            email="normal@example.com",
            password="StrongPass!23456",
            is_active=True,
        )
        user.profile.account_type = "tattoo_artist"
        user.profile.is_email_verified = True
        user.profile.save(update_fields=["account_type", "is_email_verified"])

        response = self.client.get(reverse("profile", kwargs={"username": user.username}))
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "users/profile.html")

    def test_claim_sets_credentials_and_requires_email_confirmation(self):
        user, _location = self.create_imported()
        token = make_imported_artist_claim_token(user)

        response = self.client.post(
            reverse("claim_imported_artist", kwargs={"token": token}),
            {
                "email": "artist@example.com",
                "password1": "StrongPass!23456",
                "password2": "StrongPass!23456",
                "accept_terms": "on",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "users/claim_imported_artist_done.html")

        user.refresh_from_db()
        user.profile.refresh_from_db()
        location = get_imported_artist_location(user)

        self.assertEqual(user.email, "artist@example.com")
        self.assertTrue(user.has_usable_password())
        self.assertFalse(user.is_active)
        self.assertFalse(user.profile.is_email_verified)
        self.assertEqual(location.status, "pending_claim")
        self.assertEqual(len(mail.outbox), 1)

        reused = self.client.get(reverse("claim_imported_artist", kwargs={"token": token}))
        self.assertEqual(reused.status_code, 404)

    def test_email_verification_finalizes_imported_claim(self):
        user, _location = self.create_imported()
        claim_token = make_imported_artist_claim_token(user)
        self.client.post(
            reverse("claim_imported_artist", kwargs={"token": claim_token}),
            {
                "email": "artist@example.com",
                "password1": "StrongPass!23456",
                "password2": "StrongPass!23456",
                "accept_terms": "on",
            },
        )

        user.refresh_from_db()
        verification_token = default_token_generator.make_token(user)
        uid = urlsafe_base64_encode(force_bytes(user.pk))

        response = self.client.get(
            reverse("verify_email", kwargs={"uidb64": uid, "token": verification_token})
        )
        self.assertEqual(response.status_code, 302)

        user.refresh_from_db()
        user.profile.refresh_from_db()
        location = get_imported_artist_location(user)

        self.assertTrue(user.is_active)
        self.assertTrue(user.profile.is_email_verified)
        self.assertEqual(location.status, "claimed")

    def test_claim_rejects_duplicate_email(self):
        self.create_imported(username="linntatt")
        User.objects.create_user(
            username="existing",
            email="artist@example.com",
            password="StrongPass!23456",
        )
        imported = User.objects.get(username="linntatt")
        token = make_imported_artist_claim_token(imported)

        response = self.client.post(
            reverse("claim_imported_artist", kwargs={"token": token}),
            {
                "email": "artist@example.com",
                "password1": "StrongPass!23456",
                "password2": "StrongPass!23456",
                "accept_terms": "on",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "An account with this email already exists.")
        imported.refresh_from_db()
        self.assertEqual(imported.email, "")
        self.assertFalse(imported.has_usable_password())
