"""Regression tests for reviewed studio ownership and persistent map suppression."""
import re

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.exceptions import PermissionDenied, ValidationError
from django.test import TestCase, override_settings
from django.urls import reverse

from users.location_services import (
    approve_studio_claim, confirm_claim_email, connect_claim_account,
    restore_location, suppress_location, verify_claim_evidence,
)
from users.management.commands.import_tattoo_locations import Command
from users.models import Location, LocationClaim, LocationCorrectionRequest

User = get_user_model()


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    DEFAULT_FROM_EMAIL="Tatzo <noreply@example.com>",
    TATZO_RATE_LIMIT_ENABLED=False,
)
class StudioClaimSecurityTests(TestCase):
    def setUp(self):
        self.location = Location.objects.create(
            name="Unicorn Tattoo Art Collective", source="osm",
            source_place_id="node/321", city="Glasgow", country="UK",
            address="12 Ink Lane", formatted_address="12 Ink Lane, Glasgow, UK",
            latitude="55.865000", longitude="-4.251000", status="imported",
        )
        self.owner = User.objects.create_user("studioowner", "info@utac.cc", "StrongPass!123")
        self.owner.profile.is_email_verified = True
        self.owner.profile.save(update_fields=["is_email_verified"])
        self.staff = User.objects.create_superuser("reviewer", "reviewer@example.com", "StrongPass!123")

    def create_claim(self, client=None):
        response = (client or self.client).post(
            reverse("submit_location_claim", args=[self.location.pk]), {
                "claimant_name": "Chris",
                "contact_email": "info@utac.cc",
                "relation_to_location": "Owner",
                "proof": "Business registration available upon request",
            },
        )
        self.assertEqual(response.status_code, 302)
        return LocationClaim.objects.get()

    def email_token(self):
        self.assertEqual(len(mail.outbox), 1)
        return re.search(r"/maps/claim/verify/([^/\s]+)/", mail.outbox[0].body).group(1)

    def test_anonymous_claim_sends_confirmation_not_ownership(self):
        claim = self.create_claim()
        self.assertIsNone(claim.claimant_user)
        self.assertEqual(claim.status, "awaiting_email")
        self.assertIsNone(self.location.studio_owner_id)
        self.assertFalse(claim.email_verified_at)
        self.assertIn("Confirm your Tatzo", mail.outbox[0].subject)

    def test_email_confirmation_single_use_and_account_link(self):
        claim = self.create_claim()
        token = self.email_token()
        self.client.get(reverse("verify_location_claim_email", args=[token]))
        claim.refresh_from_db()
        self.assertIsNotNone(claim.email_verified_at)
        self.assertEqual(claim.status, "awaiting_account")
        with self.assertRaises(ValidationError):
            confirm_claim_email(token)
        self.client.force_login(self.owner)
        response = self.client.post(reverse("link_location_claim", args=[claim.pk]))
        self.assertEqual(response.status_code, 302)
        claim.refresh_from_db()
        self.assertEqual(claim.claimant_user, self.owner)
        self.assertEqual(claim.status, "under_review")
        self.location.refresh_from_db()
        self.assertIsNone(self.location.studio_owner_id)

    def test_other_account_cannot_take_claim(self):
        claim = self.create_claim()
        confirm_claim_email(self.email_token())
        attacker = User.objects.create_user("attacker", "attacker@example.com", "StrongPass!123")
        attacker.profile.is_email_verified = True
        attacker.profile.save(update_fields=["is_email_verified"])
        with self.assertRaises(PermissionDenied):
            connect_claim_account(claim.pk, attacker)
        self.client.force_login(attacker)
        self.assertEqual(self.client.post(reverse("link_location_claim", args=[claim.pk])).status_code, 404)

    def test_approval_requires_independent_evidence_and_account(self):
        claim = self.create_claim()
        with self.assertRaises(ValidationError):
            approve_studio_claim(claim.pk, self.staff)
        confirm_claim_email(self.email_token())
        with self.assertRaises(ValidationError):
            approve_studio_claim(claim.pk, self.staff)
        verify_claim_evidence(claim.pk, self.staff)
        with self.assertRaises(ValidationError):
            approve_studio_claim(claim.pk, self.staff)
        connect_claim_account(claim.pk, self.owner)
        approved = approve_studio_claim(claim.pk, self.staff)
        self.assertEqual(approved.status, "approved")
        self.location.refresh_from_db()
        self.assertEqual(self.location.studio_owner_id, self.owner.pk)
        self.assertEqual(self.location.status, "claimed")
        self.assertEqual(approve_studio_claim(claim.pk, self.staff).pk, claim.pk)
        another = User.objects.create_user("another", "another@example.com", "StrongPass!123")
        self.assertNotEqual(self.location.studio_owner_id, another.pk)

    def test_unapproved_claim_cannot_change_ownership(self):
        claim = self.create_claim()
        self.assertEqual(self.location.studio_owner, None)
        self.assertNotEqual(claim.status, "approved")

    def test_anonymous_correction_has_separate_review_and_hides_obsolete_address(self):
        response = self.client.post(reverse("report_location_correction", args=[self.location.pk]), {
            "reporter_name": "Terry Brown", "contact_email": "talesofink@outlook.com",
            "reason": "closed", "explanation": "The business permanently ceased operating here.",
        })
        self.assertEqual(response.status_code, 302)
        report = LocationCorrectionRequest.objects.get()
        self.assertEqual(report.status, "submitted")
        self.assertFalse(self.location.is_suppressed)
        suppress_location(self.location.pk, self.staff, "Closed after checking records", correction=report)
        self.location.refresh_from_db()
        self.assertTrue(self.location.is_suppressed)
        self.assertEqual(Location.objects.filter(is_suppressed=False, pk=self.location.pk).count(), 0)
        report.refresh_from_db()
        self.assertEqual(report.status, "approved")
        result = self.client.get(reverse("maps_page"))
        self.assertNotContains(result, "12 Ink Lane")
        restore_location(self.location.pk, self.staff)
        self.location.refresh_from_db()
        self.assertFalse(self.location.is_suppressed)

    def test_import_does_not_restore_obsolete_location_after_osm_id_change(self):
        suppress_location(self.location.pk, self.staff, "Permanently closed")
        data = {
            "name": self.location.name, "city": self.location.city,
            "country": self.location.country, "address": self.location.address,
            "formatted_address": self.location.formatted_address,
            "latitude": self.location.latitude, "longitude": self.location.longitude,
            "phone": "", "website": "", "source": "osm",
            "source_place_id": "node/321", "status": "imported",
        }
        command = Command()
        first, created = command.save_location(data)
        self.assertIsNone(first)
        self.assertFalse(created)
        data["source_place_id"] = "way/999"
        next_record, created = command.save_location(data)
        self.assertIsNone(next_record)
        self.assertFalse(created)
        self.assertEqual(Location.objects.count(), 1)

    def test_import_preserves_claimed_and_verified_artist_location(self):
        self.location.studio_owner = self.owner
        self.location.status = "claimed"
        self.location.save()
        data = {
            "name": "Tampered Name", "city": self.location.city,
            "country": self.location.country, "address": self.location.address,
            "formatted_address": self.location.formatted_address,
            "latitude": self.location.latitude, "longitude": self.location.longitude,
            "phone": "", "website": "", "source": "osm",
            "source_place_id": self.location.source_place_id, "status": "imported",
        }
        existing, was_created = Command().save_location(data)
        self.assertEqual(existing.pk, self.location.pk)
        self.location.refresh_from_db()
        self.assertEqual(self.location.status, "claimed")
        self.assertEqual(self.location.name, "Unicorn Tattoo Art Collective")
        self.assertFalse(was_created)

    def test_hidden_location_is_not_claimable_or_reportable(self):
        suppress_location(self.location.pk, self.staff, "Closed")
        self.assertEqual(self.client.post(reverse("submit_location_claim", args=[self.location.pk])).status_code, 404)
        self.assertEqual(self.client.post(reverse("report_location_correction", args=[self.location.pk])).status_code, 404)

    def test_owned_studio_contact_management_requires_approved_owner(self):
        edit_url = reverse("manage_owned_studio", args=[self.location.pk])
        self.client.force_login(self.owner)
        self.assertEqual(self.client.get(edit_url).status_code, 404)
        claim = self.create_claim()
        confirm_claim_email(self.email_token())
        connect_claim_account(claim.pk, self.owner)
        verify_claim_evidence(claim.pk, self.staff)
        approve_studio_claim(claim.pk, self.staff)
        self.client.force_login(self.owner)
        response = self.client.post(edit_url, {
            "phone": "+33 123456789", "website": "https://utac.cc",
            "address": "ATTACKER ADDRESS", "latitude": "0",
        })
        self.assertEqual(response.status_code, 302)
        self.location.refresh_from_db()
        self.assertEqual(self.location.phone, "+33 123456789")
        self.assertEqual(self.location.website, "https://utac.cc")
        self.assertEqual(self.location.address, "12 Ink Lane")
        self.assertEqual(str(self.location.latitude), "55.865000")
        attacker = User.objects.create_user("attacker2", "else@example.com", "StrongPass!123")
        attacker.profile.is_email_verified = True
        attacker.profile.save(update_fields=["is_email_verified"])
        self.client.force_login(attacker)
        self.assertEqual(self.client.get(edit_url).status_code, 404)

    def test_public_web_search_and_map_do_not_leak_suppressed_address(self):
        suppress_location(self.location.pk, self.staff, "Permanently closed")
        home = self.client.get(reverse("maps_page"))
        search = self.client.get(reverse("search_page"), {"q": "12 Ink Lane"})
        self.assertEqual(home.status_code, 200)
        self.assertEqual(search.status_code, 200)
        self.assertNotContains(home, "12 Ink Lane")
        self.assertNotContains(search, "Unicorn Tattoo Art Collective")

    def test_moderator_dashboard_lists_ownership_and_correction_queues(self):
        claim = self.create_claim()
        correction = LocationCorrectionRequest.objects.create(
            location=self.location,
            reporter_name="Terry Brown",
            contact_email="talesofink@outlook.com",
            reason="closed",
        )
        self.client.force_login(self.staff)
        response = self.client.get(reverse("moderation_dashboard"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Unicorn Tattoo Art Collective")
        self.assertContains(response, "info@utac.cc")
        self.assertContains(response, "talesofink@outlook.com")
        self.assertEqual(response.context["location_claims_count"], 1)
        self.assertEqual(response.context["location_corrections_count"], 1)
