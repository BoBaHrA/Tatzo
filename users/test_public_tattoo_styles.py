"""Public tattoo styles follow the artist dashboard selections."""
from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import translation

from appointments.models import ArtistBookingSettings
from users.models import Location
from users.profile_styles import public_artist_styles

User = get_user_model()


class PublicTattooStyleTests(TestCase):
    def setUp(self):
        self.artist = User.objects.create_user(
            "stylesartist", "styles@example.org", "password123"
        )
        profile = self.artist.profile
        profile.account_type = "tattoo_artist"
        profile.verification_status = "approved"
        profile.is_email_verified = True
        profile.save(update_fields=[
            "account_type", "verification_status", "is_email_verified"
        ])
        self.booking_settings, _created = ArtistBookingSettings.objects.update_or_create(
            artist=self.artist,
            defaults={"active_styles": ["Fine Line", "Blackwork", "Geometric"]},
        )
        self.url = reverse("profile", args=[self.artist.username])

    def test_public_profile_displays_selected_dashboard_styles(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'class="profile-styles-card"')
        self.assertContains(response, 'class="profile-style-chip"', count=3)
        self.assertContains(response, "Fine Line")
        self.assertContains(response, "Blackwork")
        self.assertContains(response, "Geometric")
        self.assertNotContains(response, "Manage styles")

    def test_owner_can_manage_styles_from_profile(self):
        self.client.force_login(self.artist)
        response = self.client.get(self.url)
        self.assertContains(response, reverse("artist_booking_settings"))
        self.assertContains(response, "Manage styles")

    def test_dashboard_updates_appear_without_copying_profile_data(self):
        self.booking_settings.active_styles = ["Japanese", "Realism"]
        self.booking_settings.save(update_fields=["active_styles"])
        response = self.client.get(self.url)
        self.assertContains(response, "Japanese")
        self.assertContains(response, "Realism")
        self.assertNotContains(response, "Blackwork")
        self.assertContains(response, 'class="profile-style-chip"', count=2)

    def test_empty_styles_are_not_invented_for_visitors(self):
        self.booking_settings.active_styles = []
        self.booking_settings.save(update_fields=["active_styles"])
        visitor_page = self.client.get(self.url)
        self.assertNotContains(visitor_page, 'class="profile-styles-card"')
        self.client.force_login(self.artist)
        owner_page = self.client.get(self.url)
        self.assertContains(owner_page, "booking dashboard to show them")
        self.assertNotContains(owner_page, 'class="profile-style-chip"')

    def test_custom_styles_are_escaped_and_duplicates_removed(self):
        self.booking_settings.active_styles = [
            " Blackwork ", "blackwork", "", "<script>alert(1)</script>", 1
        ]
        self.booking_settings.save(update_fields=["active_styles"])
        page = self.client.get(self.url)
        self.assertContains(page, "Blackwork")
        self.assertContains(page, "&lt;script&gt;alert(1)&lt;/script&gt;")
        self.assertNotContains(page, "<script>alert(1)</script>", html=False)
        self.assertContains(page, 'class="profile-style-chip"', count=2)

    def test_non_artist_profile_does_not_show_artist_specialties(self):
        self.artist.profile.account_type = "client"
        self.artist.profile.save(update_fields=["account_type"])
        self.assertEqual(public_artist_styles(self.artist), [])
        response = self.client.get(self.url)
        self.assertNotContains(response, 'class="profile-styles-card"')

    def test_imported_artist_profile_uses_same_dashboard_styles(self):
        Location.objects.create(
            name="Prepared tattoo artist", city="Lyon", source="admin",
            source_place_id="tatzo:imported-artist", status="claimed",
            linked_user=self.artist,
        )
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Fine Line")
        self.assertContains(response, 'class="profile-style-chip"', count=3)

    def test_profile_titles_are_translated(self):
        for language, translated_title in [
            ("ru", "Стили татуировки"),
            ("fr", "Styles de tatouage"),
        ]:
            with self.subTest(language=language):
                self.client.cookies[settings.LANGUAGE_COOKIE_NAME] = language
                with translation.override(language):
                    response = self.client.get(self.url, HTTP_ACCEPT_LANGUAGE=language)
                    self.assertContains(response, translated_title)
                    self.assertContains(response, 'class="profile-style-chip"', count=3)
