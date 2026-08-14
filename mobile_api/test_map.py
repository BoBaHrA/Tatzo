from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from appointments.models import ArtistBookingSettings
from users.models import (
    Location,
    LocationClaim,
    LocationRequest,
    PortfolioWork,
    UserBlock,
)

User = get_user_model()


@override_settings(TATZO_RATE_LIMIT_ENABLED=False)
class MobileMapTests(APITestCase):
    def setUp(self):
        self.viewer = User.objects.create_user(
            "map-viewer",
            email="viewer@example.com",
            password="StrongPassword123",
            is_active=True,
        )
        self.viewer.profile.is_email_verified = True
        self.viewer.profile.save(update_fields=("is_email_verified",))
        self.artist = User.objects.create_user(
            "map-artist",
            email="artist@example.com",
            password="StrongPassword123",
            is_active=True,
        )
        self.artist.profile.account_type = "tattoo_artist"
        self.artist.profile.verification_status = "approved"
        self.artist.profile.is_email_verified = True
        self.artist.profile.tag = "black_lines"
        self.artist.profile.save(
            update_fields=(
                "account_type",
                "verification_status",
                "is_email_verified",
                "tag",
            )
        )
        self.artist_location = Location.objects.create(
            name="Map Artist Studio",
            city="Paris",
            country="France",
            formatted_address="10 Rue Tatzo, Paris",
            latitude="48.856600",
            longitude="2.352200",
            linked_user=self.artist,
            status="verified",
        )
        self.studio = Location.objects.create(
            name="Independent Ink",
            city="Lyon",
            country="France",
            address="20 Quai Tattoo, Lyon",
            latitude="45.764000",
            longitude="4.835700",
            website="independent.example",
            status="unclaimed",
            source="osm",
        )
        self.client.force_authenticate(self.viewer)

    def get_map(self, **params):
        defaults = {
            "north": 51,
            "south": 41,
            "east": 10,
            "west": -5,
        }
        return self.client.get(
            reverse("mobile_api:map_locations"),
            {**defaults, **params},
        )

    def test_map_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.get_map()
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_map_returns_stable_artist_and_studio_markers(self):
        duplicate_name = Location.objects.create(
            name=self.studio.name,
            city="Marseille",
            country="France",
            latitude="43.296500",
            longitude="5.369800",
            status="imported",
        )
        response = self.get_map()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total"], 3)
        markers = {item["location_id"]: item for item in response.data["results"]}
        artist = markers[self.artist_location.pk]
        studio = markers[self.studio.pk]
        self.assertEqual(artist["marker_id"], f"location:{self.artist_location.pk}")
        self.assertEqual(artist["kind"], "artist")
        self.assertEqual(artist["username"], self.artist.username)
        self.assertTrue(artist["can_book"])
        self.assertEqual(artist["booking_modes"], ["accepting"])
        self.assertEqual(studio["kind"], "studio")
        self.assertEqual(studio["website"], "https://independent.example")
        self.assertTrue(studio["claimable"])
        self.assertNotEqual(
            studio["marker_id"], markers[duplicate_name.pk]["marker_id"]
        )
        self.assertEqual(response.data["viewport"], {"artists": 1, "studios": 2})
        self.assertFalse(response.data["capabilities"]["distance"])

    def test_map_does_not_silently_cap_results_at_thirty_six(self):
        Location.objects.bulk_create(
            [
                Location(
                    name=f"Imported Studio {index}",
                    city="Paris",
                    country="France",
                    latitude=f"48.{index:06d}",
                    longitude=f"2.{index:06d}",
                    status="imported",
                )
                for index in range(40)
            ]
        )
        response = self.get_map()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total"], 42)
        self.assertEqual(len(response.data["results"]), 42)
        self.assertFalse(response.data["has_more"])

    def test_viewport_filters_coordinates_and_preserves_zero(self):
        zero = Location.objects.create(
            name="Prime Meridian Ink",
            city="Accra",
            country="Ghana",
            latitude="0.000000",
            longitude="0.000000",
            status="imported",
        )
        france = self.get_map()
        self.assertNotIn(
            zero.pk, [item["location_id"] for item in france.data["results"]]
        )

        equator = self.client.get(
            reverse("mobile_api:map_locations"),
            {"north": 1, "south": -1, "east": 1, "west": -1},
        )
        self.assertEqual(equator.status_code, status.HTTP_200_OK)
        self.assertEqual(equator.data["results"][0]["latitude"], 0.0)
        self.assertEqual(equator.data["results"][0]["longitude"], 0.0)

    def test_style_booking_search_type_and_pagination_filters(self):
        settings = ArtistBookingSettings.objects.create(
            artist=self.artist,
            active_styles=["Blackwork", "Fine Line"],
            online_consultation_enabled=True,
            studio_consultation_enabled=False,
        )
        PortfolioWork.objects.create(
            user=self.artist,
            title="Ornamental",
            style="Ornamental",
            image="portfolio/map.jpg",
        )

        style = self.get_map(styles="Blackwork")
        self.assertEqual(style.data["total"], 1)
        self.assertIn("Ornamental", style.data["results"][0]["styles"])
        self.assertIn("Blackwork", style.data["filters"]["styles"])

        booking = self.get_map(booking="online")
        self.assertEqual(booking.data["total"], 1)
        self.assertIn("online", booking.data["results"][0]["booking_modes"])

        studio = self.get_map(types="studio", q="independent")
        self.assertEqual(studio.data["total"], 1)
        self.assertEqual(studio.data["results"][0]["location_id"], self.studio.pk)

        first = self.get_map(limit=1)
        self.assertTrue(first.data["has_more"])
        second = self.get_map(limit=1, offset=first.data["next_offset"])
        self.assertFalse(second.data["has_more"])
        self.assertNotEqual(
            first.data["results"][0]["marker_id"],
            second.data["results"][0]["marker_id"],
        )
        settings.delete()

    def test_blocked_unverified_and_moderation_only_locations_are_hidden(self):
        UserBlock.objects.create(blocker=self.viewer, blocked=self.artist)
        Location.objects.create(
            name="Rejected Place",
            latitude="47.000000",
            longitude="3.000000",
            status="rejected",
        )
        response = self.get_map()
        self.assertEqual(
            [item["location_id"] for item in response.data["results"]],
            [self.studio.pk],
        )

    def test_invalid_incomplete_and_non_finite_bounds_are_rejected(self):
        incomplete = self.client.get(
            reverse("mobile_api:map_locations"),
            {"north": 50, "south": 40},
        )
        non_finite = self.client.get(
            reverse("mobile_api:map_locations"),
            {"north": "nan", "south": 40, "east": 10, "west": -5},
        )
        self.assertEqual(incomplete.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(non_finite.status_code, status.HTTP_400_BAD_REQUEST)

    def test_location_request_validates_coordinates_and_duplicates(self):
        url = reverse("mobile_api:map_location_request")
        payload = {
            "name": "New Studio",
            "city": "Nice",
            "country": "France",
            "full_address": "5 Promenade Tatzo",
            "contact_email": "owner@example.com",
            "latitude": 43.7102,
            "longitude": 7.262,
        }
        created = self.client.post(url, payload, format="json")
        duplicate = self.client.post(url, payload, format="json")
        missing_coordinate = self.client.post(
            url,
            {**payload, "name": "Half Pin", "longitude": None},
            format="json",
        )
        oversized_address = self.client.post(
            url,
            {**payload, "name": "Too Long", "full_address": "x" * 1001},
            format="json",
        )

        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(created.data["status"], "submitted")
        self.assertEqual(LocationRequest.objects.count(), 1)
        self.assertEqual(duplicate.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(duplicate.data["code"], "location_request_exists")
        self.assertEqual(missing_coordinate.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(oversized_address.status_code, status.HTTP_400_BAD_REQUEST)

    def test_claim_submission_is_private_and_idempotent(self):
        url = reverse("mobile_api:map_location_claim", args=[self.studio.pk])
        payload = {
            "claimant_name": "Studio Owner",
            "contact_email": "owner@example.com",
            "relation_to_location": "Owner",
            "proof": "Business registration is available.",
        }
        created = self.client.post(url, payload, format="json")
        duplicate = self.client.post(url, payload, format="json")
        map_response = self.get_map(types="studio")

        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        claim = LocationClaim.objects.get()
        self.assertEqual(claim.claimant_user, self.viewer)
        self.assertEqual(claim.status, "submitted")
        self.assertEqual(duplicate.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(duplicate.data["code"], "claim_exists")
        self.assertEqual(map_response.data["results"][0]["claim_status"], "submitted")

    def test_claim_rejects_linked_location(self):
        response = self.client.post(
            reverse("mobile_api:map_location_claim", args=[self.artist_location.pk]),
            {"relation_to_location": "Artist"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class MobileMapRateLimitTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            "map-rate-user",
            email="rate@example.com",
            password="StrongPassword123",
            is_active=True,
        )
        self.client.force_authenticate(self.user)

    def tearDown(self):
        cache.clear()

    @override_settings(TATZO_RATE_LIMIT_ENABLED=True)
    def test_location_request_rate_limit_runs_before_save(self):
        url = reverse("mobile_api:map_location_request")
        for index in range(3):
            response = self.client.post(
                url,
                {
                    "name": f"Studio {index}",
                    "city": "Paris",
                    "country": "France",
                    "full_address": f"{index} Rue Tatzo",
                    "contact_email": "rate@example.com",
                },
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        limited = self.client.post(
            url,
            {
                "name": "Studio blocked",
                "city": "Paris",
                "country": "France",
                "full_address": "99 Rue Tatzo",
                "contact_email": "rate@example.com",
            },
            format="json",
        )
        self.assertEqual(limited.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(limited.data["code"], "rate_limited")
        self.assertEqual(LocationRequest.objects.count(), 3)
