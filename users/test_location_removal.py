from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse

from users.models import Location, LocationRemovalRequest

User = get_user_model()


@override_settings(TATZO_RATE_LIMIT_ENABLED=False)
class LocationRemovalTests(TestCase):
    def setUp(self):
        self.location = Location.objects.create(
            name="Closed Ink", city="Lyon", country="France",
            address="10 Rue Lumiere", latitude="45.75", longitude="4.84",
            status="unclaimed", source="osm", source_place_id="node/123",
        )
        self.staff = User.objects.create_user(
            "removalstaff", "staff@example.com", "pass123", is_staff=True,
        )

    def _submit(self, email="reporter@example.com"):
        return self.client.post(
            reverse("report_outdated_location", args=[self.location.pk]),
            {
                "reporter_name": "Reporter",
                "contact_email": email,
                "reason": "The studio permanently closed last month.",
                "evidence_url": "https://example.org/closure",
            },
        )

    def test_anonymous_report_never_removes_location_automatically(self):
        get_response = self.client.get(
            reverse("report_outdated_location", args=[self.location.pk])
        )
        self.assertContains(get_response, "Closed Ink")
        response = self._submit()
        self.assertRedirects(response, reverse("maps_page"))
        self.location.refresh_from_db()
        self.assertEqual(self.location.status, "unclaimed")
        report = LocationRemovalRequest.objects.get()
        self.assertEqual(report.status, "submitted")
        self.assertIsNone(report.reporter_user)

    def test_duplicate_reports_from_same_email_are_not_created(self):
        self._submit()
        self._submit()
        self.assertEqual(LocationRemovalRequest.objects.count(), 1)

    def test_invalid_report_is_rejected(self):
        result = self.client.post(
            reverse("report_outdated_location", args=[self.location.pk]),
            {"reporter_name": "Someone", "contact_email": "invalid", "reason": "Closed"},
        )
        self.assertEqual(result.status_code, 400)
        self.assertEqual(LocationRemovalRequest.objects.count(), 0)

    def test_staff_must_confirm_evidence_before_removal(self):
        self._submit()
        report = LocationRemovalRequest.objects.get()
        self.client.force_login(self.staff)
        url = reverse("moderation_review_location_removal", args=[report.pk])
        self.client.post(url, {"decision": "approve"})
        self.location.refresh_from_db()
        report.refresh_from_db()
        self.assertEqual(self.location.status, "unclaimed")
        self.assertEqual(report.status, "submitted")
        self.client.post(url, {"decision": "approve", "confirm_evidence": "1"})
        self.location.refresh_from_db()
        report.refresh_from_db()
        self.assertEqual(self.location.status, "removed")
        self.assertEqual(report.status, "approved")
        self.assertEqual(report.reviewed_by, self.staff)
        self.assertNotContains(self.client.get(reverse("maps_page")), "Closed Ink")

    def test_staff_rejecting_report_does_not_hide_location(self):
        self._submit()
        report = LocationRemovalRequest.objects.get()
        self.client.force_login(self.staff)
        self.client.post(
            reverse("moderation_review_location_removal", args=[report.pk]),
            {"decision": "reject"},
        )
        self.location.refresh_from_db()
        report.refresh_from_db()
        self.assertEqual(self.location.status, "unclaimed")
        self.assertEqual(report.status, "rejected")

    def test_ordinary_user_cannot_approve_removal(self):
        self._submit()
        report = LocationRemovalRequest.objects.get()
        user = User.objects.create_user("ordinaryreporter", "hello@example.com", "pass123")
        self.client.force_login(user)
        self.client.post(
            reverse("moderation_review_location_removal", args=[report.pk]),
            {"decision": "approve", "confirm_evidence": "1"},
        )
        self.location.refresh_from_db()
        self.assertEqual(self.location.status, "unclaimed")

    def test_managed_studio_requires_extra_confirmation(self):
        owner = User.objects.create_user("managedowner", "owner@example.com", "pass123")
        self.location.studio_owner = owner
        self.location.status = "claimed"
        self.location.save(update_fields=["studio_owner", "status"])
        self._submit()
        report = LocationRemovalRequest.objects.get()
        self.client.force_login(self.staff)
        url = reverse("moderation_review_location_removal", args=[report.pk])
        self.client.post(url, {"decision": "approve", "confirm_evidence": "1"})
        self.location.refresh_from_db()
        self.assertEqual(self.location.status, "claimed")
        self.client.post(
            url,
            {"decision": "approve", "confirm_evidence": "1", "confirm_managed": "1"},
        )
        self.location.refresh_from_db()
        self.assertEqual(self.location.status, "removed")

    def test_linked_artist_listing_cannot_be_removed_through_studio_flow(self):
        artist = User.objects.create_user("associatedartist", "artist@example.com", "pass123")
        self.location.linked_user = artist
        self.location.status = "verified"
        self.location.save(update_fields=["linked_user", "status"])
        self._submit()
        report = LocationRemovalRequest.objects.get()
        self.client.force_login(self.staff)
        self.client.post(
            reverse("moderation_review_location_removal", args=[report.pk]),
            {"decision": "approve", "confirm_evidence": "1"},
        )
        self.location.refresh_from_db()
        report.refresh_from_db()
        self.assertEqual(self.location.status, "verified")
        self.assertEqual(report.status, "submitted")
