"""Public-profile primary CTA regression tests.

The verification mark represents an approved *artist* profile; booking must
never be offered as a live link before approval.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

User = get_user_model()


class ProfilePrimaryActionTests(TestCase):
    def setUp(self):
        self.artist = User.objects.create_user(
            "tattooartistcta", "tattooartistcta@example.com", "secure-password",
            is_active=True,
        )
        profile = self.artist.profile
        profile.account_type = "tattoo_artist"
        profile.is_email_verified = True
        profile.verification_status = "approved"
        profile.save(update_fields=[
            "account_type", "is_email_verified", "verification_status",
        ])
        self.url = reverse("profile", kwargs={"username": self.artist.username})

    def test_public_verified_artist_has_ticked_name_and_two_prominent_actions(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'class="profile-verified-mark"', count=1)
        self.assertContains(response, 'aria-label="Verified"')
        self.assertContains(response, 'class="artist-cta-grid"', count=1)
        self.assertContains(response, 'artist-cta--portfolio')
        self.assertContains(response, 'artist-cta--booking')
        self.assertContains(
            response, reverse("artist_portfolio", args=[self.artist.username]),
        )
        self.assertContains(
            response, reverse("booking_wizard", args=[self.artist.username]),
        )
        self.assertNotContains(response, 'class="artist-info-grid"')
        self.assertNotContains(response, 'profile-badge profile-badge-verified')

    def test_unverified_artist_booking_is_disabled_and_check_is_hidden(self):
        self.artist.profile.verification_status = "not_submitted"
        self.artist.profile.save(update_fields=["verification_status"])
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertNotContains(response, 'class="profile-verified-mark"')
        self.assertContains(response, 'artist-cta--unavailable')
        self.assertContains(response, 'artist-cta-main--disabled')
        self.assertContains(response, "Available after verification")
        self.assertNotContains(
            response, reverse("booking_wizard", args=[self.artist.username]),
        )
        self.assertContains(
            response, reverse("artist_portfolio", args=[self.artist.username]),
        )

    def test_owner_keeps_appointment_management_and_booking_settings(self):
        self.client.force_login(self.artist)
        response = self.client.get(self.url)
        self.assertContains(response, reverse("appointments_list"))
        self.assertContains(response, reverse("artist_booking_settings"))
        self.assertNotContains(
            response, reverse("booking_wizard", args=[self.artist.username]),
        )

    def test_owner_can_still_start_verification_without_dedicated_status_card(self):
        self.artist.profile.verification_status = "not_submitted"
        self.artist.profile.save(update_fields=["verification_status"])
        self.client.force_login(self.artist)
        response = self.client.get(self.url)
        self.assertContains(response, reverse("verification_page"))
        self.assertContains(response, "Start verification")
        self.assertNotContains(response, 'class="artist-info-grid"')
        self.assertNotContains(response, 'class="profile-verified-mark"')

    def test_regular_user_does_not_get_artist_actions(self):
        self.artist.profile.account_type = "regular"
        self.artist.profile.verification_status = "not_submitted"
        self.artist.profile.save(update_fields=["account_type", "verification_status"])
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertNotContains(response, 'class="profile-verified-mark"')
        self.assertNotContains(response, 'class="artist-cta-grid"')
