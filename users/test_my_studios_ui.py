"""My Studios page styling, translations and claim controls."""
from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import translation

from users.models import Location, LocationClaim

User = get_user_model()


class MyStudiosUiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="teststudiomanager", email="verified@example.org",
            password="testpass",
        )
        self.user.profile.is_email_verified = True
        self.user.profile.save(update_fields=["is_email_verified"])
        self.client.force_login(self.user)

    def test_page_includes_tatzo_styles_and_existing_claim_form(self):
        location = Location.objects.create(
            name="Atelier S", city="Clermont-Ferrand",
            address="12 rue d'Art", status="unclaimed",
        )
        claim = LocationClaim.objects.create(
            location=location, claimant_user=self.user,
            claimant_name="Manager", contact_email="studio@example.org",
            relation_to_location="Owner", status="submitted",
        )
        response = self.client.get(reverse("my_studios"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "css/home.")
        self.assertContains(response, "css/my_studios.")
        self.assertContains(response, "my-studios-card")
        self.assertContains(response, "Atelier S")
        self.assertContains(
            response,
            reverse("set_my_studio_claim_account_email", args=[claim.pk]),
        )

    def test_page_and_maps_button_are_translated_to_russian_and_french(self):
        for language, heading in [("ru", "Мои студии"), ("fr", "Mes studios")]:
            with self.subTest(language=language):
                self.client.cookies[settings.LANGUAGE_COOKIE_NAME] = language
                with translation.override(language):
                    page = self.client.get(
                        reverse("my_studios"),
                        HTTP_ACCEPT_LANGUAGE=language,
                    )
                    self.assertContains(page, heading)
                    self.assertNotContains(page, "My studios and addresses")
                    map_page = self.client.get(
                        reverse("maps_page"),
                        HTTP_ACCEPT_LANGUAGE=language,
                    )
                    self.assertContains(map_page, heading)

    def test_anonymous_cannot_see_private_studio_dashboard(self):
        self.client.logout()
        response = self.client.get(reverse("my_studios"))
        self.assertEqual(response.status_code, 302)
        self.assertIn("login", response.url)
