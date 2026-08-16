from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.test import override_settings
from django.urls import reverse

from .forms import VerificationForm
from .forms_custom import CustomUserCreationForm
from .models import ChatAttachment, ChatMessage, ChatThread, Profile


User = get_user_model()


class SignupValidationTests(TestCase):
    def test_missing_password_is_a_form_error_not_an_exception(self):
        form = CustomUserCreationForm(
            data={
                "username": "new-user",
                "email": "new@example.com",
                "account_type": "regular",
            }
        )
        self.assertFalse(form.is_valid())
        self.assertIn("password1", form.errors)

    def test_email_is_unique_case_insensitively(self):
        User.objects.create_user("existing", email="Person@Example.com")
        form = CustomUserCreationForm(
            data={
                "username": "new-user",
                "email": "person@example.com",
                "password1": "Password1",
                "password2": "Password1",
                "account_type": "regular",
            }
        )
        self.assertFalse(form.is_valid())
        self.assertIn("email", form.errors)


class VerificationUploadTests(TestCase):
    def test_executable_files_are_rejected(self):
        executable = SimpleUploadedFile(
            "malware.exe", b"MZ", content_type="application/octet-stream"
        )
        form = VerificationForm(
            data={
                "business_document_type": "license",
                "id_document_type": "passport",
            },
            files={
                "business_document_file": executable,
                "id_document_file": SimpleUploadedFile(
                    "id.pdf", b"%PDF-1.4", content_type="application/pdf"
                ),
            },
        )
        self.assertFalse(form.is_valid())
        self.assertIn("business_document_file", form.errors)


class ProtectedMediaTests(TestCase):
    def setUp(self):
        self.first = User.objects.create_user("first", password="test")
        self.second = User.objects.create_user("second", password="test")
        self.outsider = User.objects.create_user("outsider", password="test")
        User.objects.filter(
            pk__in=[self.first.pk, self.second.pk, self.outsider.pk]
        ).update(is_active=True)
        self.first.refresh_from_db()
        self.second.refresh_from_db()
        self.outsider.refresh_from_db()
        thread = ChatThread.objects.create(
            participant_one=self.first,
            participant_two=self.second,
        )
        message = ChatMessage.objects.create(
            thread=thread,
            sender=self.first,
            content="private",
        )
        self.attachment = ChatAttachment.objects.create(
            message=message,
            file=SimpleUploadedFile("private.txt", b"secret"),
            original_name="private.txt",
            content_type="text/plain",
        )
        self.url = reverse(
            "protected_media", args=["chat", self.attachment.pk, "file"]
        )

    def test_chat_participant_can_download_attachment(self):
        self.client.force_login(self.second)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(b"".join(response.streaming_content), b"secret")

    def test_outsider_cannot_download_attachment(self):
        self.client.force_login(self.outsider)
        self.assertEqual(self.client.get(self.url).status_code, 404)

    def test_private_storage_does_not_expose_direct_url(self):
        with self.assertRaises(ValueError):
            self.attachment.file.url


class AccountSecurityTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("account-owner", password="Password123!")
        self.user.is_active = True
        self.user.save(update_fields=["is_active"])

    def test_new_staff_user_is_not_deactivated_by_profile_signal(self):
        staff = User.objects.create_user("new-staff", password="Password123!", is_staff=True)
        self.assertTrue(staff.is_active)
        self.assertTrue(Profile.objects.filter(user=staff).exists())

    def test_delete_account_has_web_confirmation_and_requires_current_password(self):
        self.client.force_login(self.user)
        url = reverse("delete_account")
        page = self.client.get(url)
        self.assertEqual(page.status_code, 200)
        self.assertContains(page, "Delete account")
        self.assertContains(page, "privacy@tatzo.eu")
        response = self.client.post(url, {"password": "wrong"})
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, url)
        self.assertTrue(User.objects.filter(pk=self.user.pk).exists())

    def test_delete_account_web_confirmation_redirects_signed_out_users_to_login(self):
        url = reverse("delete_account")
        response = self.client.get(url)
        self.assertRedirects(
            response,
            f"{reverse('login')}?next={url}",
            fetch_redirect_response=False,
        )

    def test_delete_account_removes_user_with_correct_password(self):
        self.client.force_login(self.user)
        response = self.client.post(
            reverse("delete_account"), {"password": "Password123!"}
        )
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, reverse("home"))
        self.assertFalse(User.objects.filter(pk=self.user.pk).exists())


@override_settings(
    PUBLIC_SITE_URL="https://tatzo.eu",
    STORAGES={
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
        "staticfiles": {
            "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"
        },
    },
)
class SeoEndpointTests(TestCase):
    def setUp(self):
        self.approved = User.objects.create_user("indexed-artist")
        self.hidden = User.objects.create_user("hidden-artist")
        User.objects.filter(pk__in=[self.approved.pk, self.hidden.pk]).update(
            is_active=True
        )
        Profile.objects.filter(user=self.approved).update(
            account_type="tattoo_artist",
            status="active",
            verification_status="approved",
        )
        Profile.objects.filter(user=self.hidden).update(
            account_type="tattoo_artist",
            status="active",
            verification_status="pending",
        )

    def test_robots_advertises_sitemap_and_blocks_private_areas(self):
        response = self.client.get(reverse("robots_txt"))
        self.assertContains(response, "Sitemap: https://tatzo.eu/sitemap.xml")
        self.assertContains(response, "Sitemap: https://tatzo.eu/sitemap.txt")
        self.assertNotIn("X-Robots-Tag", response)
        self.assertContains(response, "Disallow: /protected-media/")
        self.assertContains(response, "Disallow: /appointments/")

    def test_sitemap_contains_only_approved_active_artist_profiles(self):
        response = self.client.get("/sitemap.xml")
        self.assertNotIn("X-Robots-Tag", response)
        self.assertContains(response, f"/profile/{self.approved.username}/")
        self.assertNotContains(response, f"/profile/{self.hidden.username}/")

    def test_text_sitemap_contains_only_approved_active_artist_profiles(self):
        response = self.client.get("/sitemap.txt")
        urls = response.content.decode("utf-8").splitlines()

        self.assertEqual(response["Content-Type"], "text/plain; charset=utf-8")
        self.assertEqual(response["Cache-Control"], "public, max-age=3600")
        self.assertIn("https://tatzo.eu/", urls)
        self.assertIn("https://tatzo.eu/search/", urls)
        self.assertIn("https://tatzo.eu/maps/", urls)
        self.assertIn(f"https://tatzo.eu/profile/{self.approved.username}/", urls)
        self.assertNotIn(f"https://tatzo.eu/profile/{self.hidden.username}/", urls)
        self.assertEqual(len(urls), len(set(urls)))

    def test_canonical_uses_primary_domain_without_query_string(self):
        response = self.client.get(reverse("search_page") + "?q=blackwork")
        self.assertContains(
            response,
            '<link rel="canonical" href="https://tatzo.eu/search/">',
            html=True,
        )
        self.assertContains(response, 'content="index,follow"')

    def test_private_page_is_noindex(self):
        response = self.client.get(reverse("login"))
        self.assertContains(response, 'content="noindex,nofollow"')


class ModerationAccessTests(TestCase):
    def setUp(self):
        self.regular = User.objects.create_user("regular-user", password="Password123!")
        self.artist = User.objects.create_user("pending-artist", password="Password123!")
        self.staff = User.objects.create_user(
            "moderator", password="Password123!", is_staff=True
        )
        User.objects.filter(pk__in=[self.regular.pk, self.artist.pk, self.staff.pk]).update(
            is_active=True
        )
        Profile.objects.filter(user=self.regular).update(account_type="regular")
        Profile.objects.filter(user=self.artist).update(
            account_type="tattoo_artist", verification_status="pending"
        )

    def test_non_staff_cannot_use_moderation_action(self):
        self.client.force_login(self.regular)
        response = self.client.post(
            reverse("moderation_approve_artist", args=[self.artist.username])
        )
        self.assertEqual(response.status_code, 302)
        self.artist.profile.refresh_from_db()
        self.assertEqual(self.artist.profile.verification_status, "pending")

    def test_moderation_actions_are_post_only(self):
        self.client.force_login(self.staff)
        response = self.client.get(
            reverse("moderation_approve_artist", args=[self.artist.username])
        )
        self.assertEqual(response.status_code, 405)

    def test_staff_cannot_approve_regular_account_as_artist(self):
        self.client.force_login(self.staff)
        response = self.client.post(
            reverse("moderation_approve_artist", args=[self.regular.username])
        )
        self.assertEqual(response.status_code, 404)
        self.regular.profile.refresh_from_db()
        self.assertNotEqual(self.regular.profile.verification_status, "approved")

    def test_legacy_profile_action_no_longer_changes_status(self):
        self.client.force_login(self.staff)
        self.artist.profile.refresh_from_db()
        response = self.client.post(
            reverse("approve_profile", args=[self.artist.profile.pk])
        )
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, reverse("moderation_dashboard"))
        self.artist.profile.refresh_from_db()
        self.assertEqual(self.artist.profile.verification_status, "pending")
