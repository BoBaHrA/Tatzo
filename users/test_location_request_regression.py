"""Legacy production map moderation behaviors adapted to reviewed studio workflow.

Retains regression coverage from the former main-branch LocationRequestModerationTests.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse

from users.models import Location, LocationRequest

User = get_user_model()


@override_settings(
    STORAGES={
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
        "staticfiles": {
            "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"
        },
    }
)
class LocationRequestModerationTests(TestCase):
    def setUp(self):
        self.staff = User.objects.create_user(
            "map-moderator",
            password="Password123!",
            is_staff=True,
            is_active=True,
        )
        self.regular = User.objects.create_user(
            "map-user",
            password="Password123!",
            is_active=True,
        )
        self.location_request = LocationRequest.objects.create(
            name="Atelier Encre",
            city="Clermont-Ferrand",
            country="France",
            full_address="12 rue des Arts, 63000 Clermont-Ferrand",
            website_or_map_link="https://example.com/atelier-encre",
            phone="+33 4 00 00 00 00",
            contact_email="owner@example.com",
            latitude="45.777222",
            longitude="3.087025",
            message="The studio opened this month.",
            status="submitted",
        )

    def test_dashboard_lists_active_location_requests_only(self):
        LocationRequest.objects.create(
            name="Rejected Studio",
            city="Lyon",
            country="France",
            full_address="1 rue Rejetee",
            contact_email="rejected@example.com",
            status="rejected",
        )
        self.client.force_login(self.staff)

        response = self.client.get(reverse("moderation_dashboard"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context["location_request_count"], 1)
        self.assertContains(response, "Atelier Encre")
        self.assertContains(response, "owner@example.com")
        self.assertNotContains(response, "Rejected Studio")

    def test_staff_can_approve_request_and_publish_unclaimed_location(self):
        self.client.force_login(self.staff)

        response = self.client.post(
            reverse("moderation_review_location", args=["request", self.location_request.pk]),
            {"decision": "approve", "confirm_evidence": "1", "latitude": "45.777222", "longitude": "3.087025"},
        )

        self.assertRedirects(
            response,
            reverse("moderation_dashboard"),
            fetch_redirect_response=False,
        )
        self.location_request.refresh_from_db()
        self.assertEqual(self.location_request.status, "approved")
        location = Location.objects.get(name="Atelier Encre")
        self.assertEqual(location.status, "unclaimed")
        self.assertEqual(location.source, "manual")
        self.assertEqual(location.address, self.location_request.full_address)
        self.assertEqual(location.city, "Clermont-Ferrand")
        self.assertEqual(location.country, "France")
        self.assertEqual(location.latitude, self.location_request.latitude)
        self.assertEqual(location.longitude, self.location_request.longitude)
        self.assertIsNotNone(location.verified_at)
        self.assertContains(self.client.get(reverse("maps_page")), "Atelier Encre")

    def test_approval_requires_valid_coordinates(self):
        self.location_request.latitude = None
        self.location_request.longitude = None
        self.location_request.save(update_fields=["latitude", "longitude"])
        self.client.force_login(self.staff)

        response = self.client.post(
            reverse("moderation_review_location", args=["request", self.location_request.pk]),
            {"decision": "approve", "confirm_evidence": "1", "latitude": "", "longitude": ""},
        )

        self.assertRedirects(
            response,
            reverse("moderation_dashboard"),
            fetch_redirect_response=False,
        )
        self.location_request.refresh_from_db()
        self.assertEqual(self.location_request.status, "submitted")
        self.assertFalse(Location.objects.filter(name="Atelier Encre").exists())

    def test_approval_updates_matching_public_location_instead_of_duplicating(self):
        existing = Location.objects.create(
            name="atelier encre",
            address=self.location_request.full_address,
            city="clermont-ferrand",
            country="france",
            latitude="45.700000",
            longitude="3.000000",
            source="osm",
            status="imported",
        )
        self.client.force_login(self.staff)

        response = self.client.post(
            reverse("moderation_review_location", args=["request", self.location_request.pk]),
            {"decision": "approve", "confirm_evidence": "1", "latitude": "45.777222", "longitude": "3.087025"},
        )

        self.assertEqual(response.status_code, 302)
        self.assertEqual(Location.objects.count(), 1)
        existing.refresh_from_db()
        self.location_request.refresh_from_db()
        self.assertEqual(existing.name, "Atelier Encre")
        self.assertEqual(existing.latitude, self.location_request.latitude)
        self.assertEqual(existing.longitude, self.location_request.longitude)
        self.assertEqual(existing.status, "imported")

    def test_staff_can_reject_location_request_without_publishing_it(self):
        self.client.force_login(self.staff)

        response = self.client.post(
            reverse("moderation_review_location", args=["request", self.location_request.pk]),
            {"decision": "reject"},
        )

        self.assertRedirects(
            response,
            reverse("moderation_dashboard"),
            fetch_redirect_response=False,
        )
        self.location_request.refresh_from_db()
        self.assertEqual(self.location_request.status, "rejected")
        self.assertFalse(Location.objects.filter(name="Atelier Encre").exists())

    def test_location_request_moderation_is_staff_only_and_post_only(self):
        approve_url = reverse("moderation_review_location", args=["request", self.location_request.pk])
        self.client.force_login(self.staff)
        self.assertEqual(self.client.get(approve_url).status_code, 405)

        self.client.force_login(self.regular)
        response = self.client.post(
            approve_url,
            {"decision": "approve", "confirm_evidence": "1", "latitude": "45.777222", "longitude": "3.087025"},
        )
        self.assertEqual(response.status_code, 302)
        self.location_request.refresh_from_db()
        self.assertEqual(self.location_request.status, "submitted")
        self.assertFalse(Location.objects.filter(name="Atelier Encre").exists())
