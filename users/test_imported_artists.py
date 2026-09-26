from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.contrib.auth.models import Permission
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils import timezone
from django.utils.http import urlsafe_base64_encode
from datetime import timedelta

from .imported_artists import (
    ImportedArtistAdminForm,
    create_imported_artist,
    get_imported_artist_location,
    make_imported_artist_claim_token,
)
from .admin import PortfolioWorkAdminForm
from .models import PortfolioAlbum, PortfolioWork, UserBlock
from .views import delete_expired_unverified_duplicate_users

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
        self.assertTemplateUsed(response, "users/profile.html")
        self.assertTemplateNotUsed(response, "users/imported_artist_profile.html")
        self.assertContains(response, "Unclaimed profile")
        self.assertContains(response, "Professional portfolio")
        self.assertContains(response, "Moscow")
        self.assertContains(response, 'class="profile-header"')
        self.assertTrue(response.context["is_imported_artist"])
        self.assertTrue(response.context["is_unclaimed"])

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
        self.assertNotContains(response, "Unclaimed profile")

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

        preview = self.client.get(reverse("profile", kwargs={"username": user.username}))
        self.assertEqual(preview.status_code, 200)
        self.assertTemplateUsed(preview, "users/profile.html")
        self.assertContains(preview, "Claim pending")

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

        preview = self.client.get(reverse("profile", kwargs={"username": user.username}))
        self.assertEqual(preview.status_code, 200)
        self.assertTemplateUsed(preview, "users/profile.html")
        self.assertNotContains(preview, "Unclaimed profile")
        self.assertNotContains(preview, "Claim pending")

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

    def test_claim_uses_registration_password_policy(self):
        user, _ = self.create_imported()
        token = make_imported_artist_claim_token(user)
        response = self.client.post(
            reverse("claim_imported_artist", kwargs={"token": token}),
            {
                "email": "artist@example.com",
                "password1": "alllowercasepassword",
                "password2": "alllowercasepassword",
                "accept_terms": "on",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Password must contain at least one uppercase letter.")
        user.refresh_from_db()
        self.assertEqual(user.email, "")
        self.assertFalse(user.has_usable_password())

    def test_claim_token_cannot_replace_credentials_after_first_submission(self):
        user, _ = self.create_imported()
        token = make_imported_artist_claim_token(user)
        claim_url = reverse("claim_imported_artist", kwargs={"token": token})
        first_response = self.client.post(
            claim_url,
            {
                "email": "first@example.com",
                "password1": "StrongPass!23456",
                "password2": "StrongPass!23456",
                "accept_terms": "on",
            },
        )
        self.assertEqual(first_response.status_code, 200)

        second_response = self.client.post(
            claim_url,
            {
                "email": "second@example.com",
                "password1": "OtherStrong!23456",
                "password2": "OtherStrong!23456",
                "accept_terms": "on",
            },
        )
        self.assertEqual(second_response.status_code, 404)
        user.refresh_from_db()
        self.assertEqual(user.email, "first@example.com")
        self.assertTrue(user.check_password("StrongPass!23456"))
        self.assertEqual(len(mail.outbox), 1)

    def test_pending_claim_survives_signup_duplicate_cleanup(self):
        user, location = self.create_imported()
        user.email = "artist@example.com"
        user.set_password("StrongPass!23456")
        user.is_active = False
        user.save()
        location.status = "pending_claim"
        location.save()
        PortfolioWork.objects.create(
            user=user,
            image=SimpleUploadedFile("work.jpg", b"fake-image", content_type="image/jpeg"),
        )
        User.objects.filter(pk=user.pk).update(date_joined=timezone.now() - timedelta(hours=2))

        delete_expired_unverified_duplicate_users(username=user.username)

        self.assertTrue(User.objects.filter(pk=user.pk).exists())
        self.assertEqual(PortfolioWork.objects.filter(user=user).count(), 1)

    def test_claimed_import_respects_regular_profile_visibility(self):
        user, location = self.create_imported()
        user.email = "artist@example.com"
        user.set_password("StrongPass!23456")
        user.is_active = True
        user.save()
        user.profile.is_email_verified = True
        user.profile.save()
        location.status = "claimed"
        location.save()

        user.is_active = False
        user.save(update_fields=["is_active"])
        self.assertEqual(
            self.client.get(reverse("profile", kwargs={"username": user.username})).status_code,
            404,
        )

        user.is_active = True
        user.save(update_fields=["is_active"])
        viewer = User.objects.create_user(username="viewer", password="StrongPass!23456")
        UserBlock.objects.create(blocker=viewer, blocked=user)
        self.client.force_login(viewer)
        self.assertEqual(
            self.client.get(reverse("profile", kwargs={"username": user.username})).status_code,
            404,
        )

    def test_imported_admin_requires_permissions_for_all_created_models(self):
        staff = User.objects.create_user(username="limited_staff", password="x", is_staff=True)
        staff.user_permissions.add(Permission.objects.get(codename="add_profile"))
        self.client.force_login(staff)
        response = self.client.get(reverse("admin:users_profile_add_imported"))
        self.assertEqual(response.status_code, 403)

    def test_admin_form_rejects_album_owned_by_another_artist(self):
        artist_a, _ = self.create_imported("artist_a")
        artist_b, _ = self.create_imported("artist_b")
        album = PortfolioAlbum.objects.create(user=artist_b, title="B's album")
        form = PortfolioWorkAdminForm(
            data={"user": artist_a.pk, "album": album.pk, "title": "Cross assigned"},
            files={
                "image": SimpleUploadedFile("work.jpg", b"fake-image", content_type="image/jpeg")
            },
        )
        self.assertFalse(form.is_valid())
        self.assertIn("album", form.errors)
