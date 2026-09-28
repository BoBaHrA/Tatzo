from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from appointments.models import ArtistBookingSettings
from users.imported_artists import IMPORTED_ARTIST_SOURCE_MARKER
from users.models import Location, UserBlock


User = get_user_model()


class MobileDiscoverySearchTests(APITestCase):
    def make_user(
        self,
        username,
        *,
        account_type="regular",
        verified_artist=False,
        email_verified=True,
    ):
        user = User.objects.create_user(
            username=username,
            email=f"{username}@example.com" if email_verified else "",
            password="StrongPassword123" if email_verified else None,
            is_active=True,
        )
        if not email_verified:
            user.set_unusable_password()
            user.save(update_fields=["password"])
        profile = user.profile
        profile.account_type = account_type
        profile.is_email_verified = email_verified
        profile.verification_status = "approved" if verified_artist else "not_submitted"
        profile.save(
            update_fields=[
                "account_type",
                "is_email_verified",
                "verification_status",
            ]
        )
        return user

    def setUp(self):
        self.viewer = self.make_user("viewer")
        self.artist = self.make_user(
            "blackwork_artist",
            account_type="tattoo_artist",
            verified_artist=True,
        )
        ArtistBookingSettings.objects.update_or_create(
            artist=self.artist,
            defaults={
                "bookings_enabled": True,
                "booking_status": ArtistBookingSettings.BOOKING_STATUS_OPEN,
                "active_styles": ["Blackwork", "Geometric"],
                "consultation_enabled": True,
                "consultation_price": 30,
            },
        )
        Location.objects.create(
            name="Black Ink Studio",
            city="Paris",
            country="France",
            latitude="48.856600",
            longitude="2.352200",
            source="manual",
            status="verified",
            linked_user=self.artist,
        )
        self.client.force_authenticate(self.viewer)
        self.url = reverse("mobile_api:profile_search")

    def test_legacy_search_contract_stays_available(self):
        response = self.client.get(self.url, {"q": "blackwork"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("tab_counts", response.data)
        self.assertEqual(response.data["type"], "all")
        self.assertEqual(response.data["results"][0]["username"], "blackwork_artist")

    def test_discovery_supports_artist_filters_and_rich_metadata(self):
        response = self.client.get(
            self.url,
            {
                "discovery": "1",
                "type": "artists",
                "style": "Blackwork",
                "accepting": "1",
                "verified": "1",
                "location": "Paris",
            },
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        result = response.data["results"][0]
        self.assertEqual(result["kind"], "artist")
        self.assertEqual(result["username"], "blackwork_artist")
        self.assertTrue(result["booking_open"])
        self.assertTrue(result["verified"])
        self.assertIn("Blackwork", result["styles"])
        self.assertEqual(result["location_label"], "Paris, France")
        self.assertEqual(result["consultation_price"], "30.00")

    def test_discovery_supports_studios_and_distance_sorting(self):
        Location.objects.create(
            name="Far Studio",
            city="Lyon",
            country="France",
            latitude="45.764000",
            longitude="4.835700",
            source="manual",
            status="imported",
        )
        response = self.client.get(
            self.url,
            {
                "discovery": "1",
                "type": "studios",
                "lat": "48.8566",
                "lng": "2.3522",
                "radius": "100",
                "sort": "distance",
            },
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        result = response.data["results"][0]
        self.assertEqual(result["kind"], "studio")
        self.assertEqual(result["display_name"], "Black Ink Studio")
        self.assertLess(result["distance_km"], 1)

    def test_discovery_includes_prepared_artist_without_claimed_native_profile(self):
        prepared = self.make_user(
            "prepared_artist",
            account_type="tattoo_artist",
            email_verified=False,
        )
        Location.objects.create(
            name="Prepared Artist",
            city="Berlin",
            country="Germany",
            source="admin",
            source_place_id=IMPORTED_ARTIST_SOURCE_MARKER,
            status="unclaimed",
            linked_user=prepared,
        )

        response = self.client.get(
            self.url,
            {"discovery": "1", "type": "artists", "q": "prepared"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        result = response.data["results"][0]
        self.assertTrue(result["is_imported"])
        self.assertEqual(result["imported_state"], "unclaimed")
        self.assertFalse(result["native_profile_available"])
        self.assertFalse(result["can_message"])

    def test_two_way_blocks_hide_linked_studios_in_discovery(self):
        UserBlock.objects.create(blocker=self.artist, blocked=self.viewer)
        response = self.client.get(
            self.url,
            {"discovery": "1", "type": "studios", "q": "Black Ink"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["results"], [])

    def test_invalid_distance_sort_falls_back_without_coordinates(self):
        response = self.client.get(
            self.url,
            {"discovery": "1", "sort": "distance"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["filters"]["sort"], "relevance")
