from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from appointments.models import ArtistBookingSettings
from users.imported_artists import IMPORTED_ARTIST_SOURCE_MARKER
from users.models import Location


User = get_user_model()


class SearchDiscoveryTests(TestCase):
    def _user(
        self,
        username,
        *,
        account_type="regular",
        email_verified=True,
        verification_status="not_submitted",
    ):
        user = User.objects.create_user(
            username=username,
            email=f"{username}@example.com" if email_verified else "",
            password="Search-test-123!" if email_verified else None,
        )
        profile = user.profile
        profile.account_type = account_type
        profile.is_email_verified = email_verified
        profile.verification_status = verification_status
        profile.tag = username.replace("-", "_")
        profile.save(
            update_fields=[
                "account_type",
                "is_email_verified",
                "verification_status",
                "tag",
            ]
        )
        return user

    def test_artist_filters_use_real_booking_styles_and_status(self):
        fine_line = self._user(
            "fine-line",
            account_type="tattoo_artist",
            verification_status="approved",
        )
        blackwork = self._user(
            "blackwork",
            account_type="tattoo_artist",
            verification_status="approved",
        )
        ArtistBookingSettings.objects.create(
            artist=fine_line,
            active_styles=["Fine Line"],
            bookings_enabled=True,
            booking_status=ArtistBookingSettings.BOOKING_STATUS_OPEN,
        )
        ArtistBookingSettings.objects.create(
            artist=blackwork,
            active_styles=["Blackwork"],
            bookings_enabled=False,
            booking_status=ArtistBookingSettings.BOOKING_STATUS_PAUSED,
        )

        response = self.client.get(
            reverse("search_page"),
            {
                "type": "artists",
                "style": "Fine Line",
                "accepting": "1",
            },
        )

        self.assertEqual(response.status_code, 200)
        usernames = [item["user"].username for item in response.context["results"]]
        self.assertEqual(usernames, ["fine-line"])

    def test_studios_tab_searches_location_rows(self):
        Location.objects.create(
            name="Atelier Nox",
            city="Paris",
            country="France",
            status="imported",
            latitude="48.856600",
            longitude="2.352200",
        )

        response = self.client.get(
            reverse("search_page"),
            {"type": "studios", "q": "Nox"},
        )

        self.assertEqual(response.status_code, 200)
        results = list(response.context["results"])
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["kind"], "studio")
        self.assertEqual(results[0]["display_name"], "Atelier Nox")

    def test_radius_filter_uses_location_coordinates(self):
        near = self._user("near-artist", account_type="tattoo_artist")
        far = self._user("far-artist", account_type="tattoo_artist")

        Location.objects.create(
            name="Near Studio",
            city="Paris",
            country="France",
            status="claimed",
            linked_user=near,
            latitude="48.856600",
            longitude="2.352200",
        )
        Location.objects.create(
            name="Far Studio",
            city="Lyon",
            country="France",
            status="claimed",
            linked_user=far,
            latitude="45.764000",
            longitude="4.835700",
        )

        response = self.client.get(
            reverse("search_page"),
            {
                "type": "artists",
                "lat": "48.8566",
                "lng": "2.3522",
                "radius": "25",
            },
        )

        usernames = [item["user"].username for item in response.context["results"]]
        self.assertIn("near-artist", usernames)
        self.assertNotIn("far-artist", usernames)

    def test_unclaimed_prepared_artist_is_discoverable_but_not_messageable(self):
        artist = self._user(
            "prepared-artist",
            account_type="tattoo_artist",
            email_verified=False,
        )
        artist.set_unusable_password()
        artist.save(update_fields=["password"])
        Location.objects.create(
            name="Prepared Artist",
            city="Berlin",
            country="Germany",
            source="admin",
            source_place_id=IMPORTED_ARTIST_SOURCE_MARKER,
            status="unclaimed",
            linked_user=artist,
        )

        response = self.client.get(
            reverse("search_page"),
            {"type": "artists", "q": "prepared"},
        )

        self.assertEqual(response.status_code, 200)
        results = list(response.context["results"])
        self.assertEqual(len(results), 1)
        self.assertTrue(results[0]["is_imported"])
        self.assertFalse(results[0]["can_message"])

    def test_unverified_regular_user_is_not_publicly_searchable(self):
        self._user("pending-person", email_verified=False)

        response = self.client.get(
            reverse("search_page"),
            {"type": "users", "q": "pending-person"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(list(response.context["results"]), [])
