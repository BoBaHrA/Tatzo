from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from users.location_review import (
    approve_location_claim,
    approve_location_request,
    reject_location_submission,
)
from users.models import Location, LocationClaim, LocationOwnershipAudit, LocationRequest

User = get_user_model()


@override_settings(TATZO_RATE_LIMIT_ENABLED=False)
class StudioOwnershipTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            "studioowner", "owner@example.com", "safe-pass-123", is_active=True
        )
        self.owner.profile.is_email_verified = True
        self.owner.profile.save(update_fields=["is_email_verified"])
        self.moderator = User.objects.create_user(
            "moderator", "staff@example.com", "safe-pass-123",
            is_active=True, is_staff=True
        )
        self.request = LocationRequest.objects.create(
            name="New Ink Studio", city="Lyon", country="France",
            full_address="3 Rue de la Paix, Lyon", latitude="45.764",
            longitude="4.835", contact_email=self.owner.email,
            requested_by=self.owner, wants_ownership=True,
        )

    def test_logged_in_new_address_can_be_claimed_after_review(self):
        self.client.force_login(self.moderator)
        response = self.client.post(
            reverse("moderation_review_location", args=("request", self.request.pk)),
            {"decision": "approve", "confirm_evidence": "1"},
        )
        self.assertRedirects(response, reverse("moderation_dashboard"))
        self.request.refresh_from_db()
        location = self.request.approved_location
        self.assertEqual(self.request.status, "approved")
        self.assertEqual(location.studio_owner, self.owner)
        self.assertEqual(location.status, "claimed")
        self.assertEqual(LocationOwnershipAudit.objects.filter(location=location).count(), 1)

        self.assertEqual(approve_location_request(self.request.pk, self.moderator).pk, location.pk)
        self.assertEqual(LocationOwnershipAudit.objects.filter(location=location).count(), 1)

        api = APIClient()
        api.force_authenticate(self.owner)
        result = api.get(reverse("mobile_api:map_locations")).data
        studio = next(x for x in result["results"] if x["location_id"] == location.pk)
        self.assertEqual(studio["kind"], "studio")
        self.assertFalse(studio["claimable"])
        self.assertEqual(studio["username"], self.owner.username)

    def test_moderation_shows_actual_tatzo_account_separately_from_contact_email(self):
        self.request.contact_email = "other-contact@example.com"
        self.request.save(update_fields=["contact_email"])
        self.client.force_login(self.moderator)

        response = self.client.get(reverse("moderation_dashboard"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "other-contact@example.com")
        self.assertContains(
            response,
            f'<a href="{reverse("profile", kwargs={"username": self.owner.username})}">@{self.owner.username}</a>',
            html=True,
        )
        self.assertContains(response, "Tatzo:")

    def test_moderation_does_not_guess_account_for_legacy_request(self):
        self.request.requested_by = None
        self.request.contact_email = self.owner.email
        self.request.save(update_fields=["requested_by", "contact_email"])
        self.client.force_login(self.moderator)

        response = self.client.get(reverse("moderation_dashboard"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Unknown")
        self.assertNotContains(response, f"@{self.owner.username}")

    def test_approval_requires_explicit_moderator_confirmation(self):
        self.client.force_login(self.moderator)
        self.client.post(
            reverse("moderation_review_location", args=("request", self.request.pk)),
            {"decision": "approve"},
        )
        self.request.refresh_from_db()
        self.assertEqual(self.request.status, "submitted")
        self.assertFalse(LocationOwnershipAudit.objects.exists())

    def test_ordinary_user_cannot_moderate(self):
        self.client.force_login(self.owner)
        response = self.client.post(
            reverse("moderation_review_location", args=("request", self.request.pk)),
            {"decision": "approve", "confirm_evidence": "1"},
        )
        self.assertNotEqual(response.status_code, 200)
        self.request.refresh_from_db()
        self.assertEqual(self.request.status, "submitted")

    def test_unverified_account_cannot_claim_new_location(self):
        self.owner.profile.is_email_verified = False
        self.owner.profile.save(update_fields=["is_email_verified"])
        with self.assertRaises(ValidationError):
            approve_location_request(self.request.pk, self.moderator)
        self.assertFalse(Location.objects.filter(name=self.request.name).exists())

    def test_email_mismatch_rejects_linking(self):
        self.request.contact_email = "elsewhere@example.com"
        self.request.save(update_fields=["contact_email"])
        with self.assertRaises(ValidationError):
            approve_location_request(self.request.pk, self.moderator)

    def test_existing_owner_cannot_be_overwritten(self):
        previous_owner = User.objects.create_user("previous", "previous@example.com", "pw")
        Location.objects.create(
            name=self.request.name, city=self.request.city,
            address=self.request.full_address, studio_owner=previous_owner,
            status="claimed", latitude=self.request.latitude, longitude=self.request.longitude
        )
        with self.assertRaises(ValidationError):
            approve_location_request(self.request.pk, self.moderator)
        self.request.refresh_from_db()
        self.assertEqual(self.request.status, "submitted")

    def test_existing_claim_requires_verified_linked_account(self):
        location = Location.objects.create(
            name="Claim target", city="Lyon", status="unclaimed",
            latitude="45.763", longitude="4.835"
        )
        claim = LocationClaim.objects.create(
            location=location, claimant_name="Owner", contact_email=self.owner.email,
            relation_to_location="Studio manager", status="submitted",
        )
        with self.assertRaises(ValidationError):
            approve_location_claim(claim.pk, self.moderator)
        claim.claimant_user = self.owner
        claim.save(update_fields=["claimant_user"])
        approved = approve_location_claim(claim.pk, self.moderator)
        self.assertEqual(approved.studio_owner, self.owner)
        self.assertEqual(approved.status, "claimed")
        self.assertEqual(approve_location_claim(claim.pk, self.moderator).pk, location.pk)

    def test_rejection_never_creates_a_public_location(self):
        reject_location_submission("request", self.request.pk, self.moderator)
        with self.assertRaises(ValidationError):
            approve_location_request(self.request.pk, self.moderator)
        self.assertFalse(Location.objects.filter(name=self.request.name).exists())

    def test_public_add_location_form_records_ownership_intent(self):
        self.client.force_login(self.owner)
        response = self.client.post(reverse("submit_location_request"), {
            "name": "Own second studio", "city": "Paris", "country": "France",
            "full_address": "10 Rue des Fleurs, Paris", "contact_email": self.owner.email,
            "latitude": "48.85", "longitude": "2.35",
            "claim_for_my_account": "1",
        })
        self.assertEqual(response.status_code, 302)
        item = LocationRequest.objects.get(name="Own second studio")
        self.assertTrue(item.wants_ownership)
        self.assertEqual(item.requested_by_id, self.owner.pk)

    def _existing_studio(self):
        return Location.objects.create(
            name="Old Ink Atelier", address="18 Rue de Paris",
            city="Lyon", country="France", status="unclaimed",
            source="osm", source_place_id="node/claim-148",
            latitude="45.760", longitude="4.830",
        )

    def test_existing_studio_web_claim_reaches_map_tab_and_approval(self):
        studio = self._existing_studio()
        claim_url = reverse("submit_location_claim", args=[studio.pk])
        self.client.force_login(self.owner)
        map_response = self.client.get(reverse("maps_page"))
        self.assertContains(map_response, claim_url)

        submitted = self.client.post(claim_url, {
            "claimant_name": "Studio owner",
            "contact_email": self.owner.email,
            "relation_to_location": "Owner",
            "proof": "https://example.com/business",
            "message": "I operate this studio.",
        })
        self.assertRedirects(submitted, reverse("maps_page"))
        claim = LocationClaim.objects.get(location=studio)
        self.assertContains(self.client.get(reverse("maps_page")), "Your claim is under review")
        self.assertEqual(claim.status, "submitted")
        self.assertEqual(claim.claimant_user_id, self.owner.pk)

        self.client.force_login(self.moderator)
        dashboard = self.client.get(reverse("moderation_dashboard"))
        self.assertEqual(dashboard.context["location_claim_count"], 1)
        self.assertContains(dashboard, 'data-folder-tab="maps"')
        self.assertContains(dashboard, 'data-folder-panel="maps"')
        self.assertContains(dashboard, "Old Ink Atelier")
        self.assertContains(dashboard, self.owner.email)
        self.assertContains(dashboard, f"@{self.owner.username}")
        action_url = reverse("moderation_review_location", args=["claim", claim.pk])
        self.assertContains(dashboard, action_url)

        # An approval without explicit staff evidence review must not change ownership.
        self.client.post(action_url, {"decision": "approve"})
        claim.refresh_from_db()
        studio.refresh_from_db()
        self.assertEqual(claim.status, "submitted")
        self.assertIsNone(studio.studio_owner_id)

        approved = self.client.post(
            action_url, {"decision": "approve", "confirm_evidence": "1"},
        )
        self.assertRedirects(approved, reverse("moderation_dashboard"))
        claim.refresh_from_db()
        studio.refresh_from_db()
        self.assertEqual(claim.status, "approved")
        self.assertEqual(studio.studio_owner_id, self.owner.pk)
        self.assertEqual(studio.status, "claimed")
        self.assertEqual(LocationOwnershipAudit.objects.filter(
            source="location_claim", source_id=claim.pk,
        ).count(), 1)
        self.assertEqual(
            self.client.get(reverse("moderation_dashboard")).context["location_claim_count"],
            0,
        )

    def test_legacy_anonymous_claim_appears_without_linked_account(self):
        studio = self._existing_studio()
        claim = LocationClaim.objects.create(
            location=studio,
            claimant_name="Old claimant",
            contact_email="old@example.com",
            relation_to_location="Owner",
            status="under_review",
            claimant_user=None,
        )
        self.client.force_login(self.moderator)
        dashboard = self.client.get(reverse("moderation_dashboard"))
        self.assertEqual(dashboard.context["location_claim_count"], 1)
        self.assertContains(dashboard, "Old Ink Atelier")
        self.assertContains(dashboard, "Not linked")
        self.assertContains(
            dashboard,
            reverse("moderation_review_location", args=["claim", claim.pk]),
        )
        self.client.post(
            reverse("moderation_review_location", args=["claim", claim.pk]),
            {"decision": "reject"},
        )
        claim.refresh_from_db()
        self.assertEqual(claim.status, "rejected")
        studio.refresh_from_db()
        self.assertEqual(studio.status, "unclaimed")

    def test_mobile_existing_studio_claim_reaches_same_moderation_tab(self):
        studio = self._existing_studio()
        api = APIClient()
        api.force_authenticate(self.owner)
        submitted = api.post(
            reverse("mobile_api:map_location_claim", args=[studio.pk]),
            {
                "claimant_name": "Mobile owner",
                "contact_email": self.owner.email,
                "relation_to_location": "Manager",
            },
        )
        self.assertEqual(submitted.status_code, 201)
        claim = LocationClaim.objects.get(pk=submitted.data["id"])
        self.assertEqual(claim.claimant_user_id, self.owner.pk)
        self.client.force_login(self.moderator)
        dashboard = self.client.get(reverse("moderation_dashboard"))
        self.assertEqual(dashboard.context["location_claim_count"], 1)
        self.assertContains(dashboard, "Old Ink Atelier")
        self.assertContains(dashboard, "Mobile owner")

    def test_duplicate_web_claim_not_recreated_and_still_visible_in_queue(self):
        studio = self._existing_studio()
        self.client.force_login(self.owner)
        url = reverse("submit_location_claim", args=[studio.pk])
        body = {
            "claimant_name": "Studio owner",
            "contact_email": self.owner.email,
            "relation_to_location": "Owner",
        }
        self.client.post(url, body)
        self.client.post(url, body)
        self.assertEqual(LocationClaim.objects.filter(location=studio).count(), 1)
        self.client.force_login(self.moderator)
        response = self.client.get(reverse("moderation_dashboard"))
        self.assertEqual(response.context["location_claim_count"], 1)
        self.assertContains(response, "Old Ink Atelier")

    def _make_anonymous_claim(self, email=None):
        location = Location.objects.create(
            name="Anonymous claim studio", city="Lyon", status="unclaimed",
        )
        return LocationClaim.objects.create(
            location=location, claimant_name="Manager",
            contact_email=email or self.owner.email,
            relation_to_location="Manager", status="submitted",
        )

    def test_anonymous_claim_can_be_linked_then_staff_approved(self):
        claim = self._make_anonymous_claim()
        with self.assertRaises(ValidationError):
            approve_location_claim(claim.pk, self.moderator)
        self.client.force_login(self.owner)
        dashboard = self.client.get(reverse("my_studios"))
        self.assertContains(dashboard, "Anonymous claim studio")
        self.assertContains(dashboard, reverse("link_my_studio_claim", args=[claim.pk]))
        response = self.client.post(reverse("link_my_studio_claim", args=[claim.pk]))
        self.assertRedirects(response, reverse("my_studios"))
        claim.refresh_from_db()
        self.assertEqual(claim.claimant_user, self.owner)
        self.assertEqual(claim.status, "submitted")
        self.assertIsNone(claim.location.studio_owner)
        self.assertEqual(LocationOwnershipAudit.objects.count(), 0)
        self.assertEqual(
            approve_location_claim(claim.pk, self.moderator).studio_owner, self.owner
        )
        self.assertEqual(LocationOwnershipAudit.objects.count(), 1)

    def test_link_requires_post_and_login(self):
        claim = self._make_anonymous_claim()
        url = reverse("link_my_studio_claim", args=[claim.pk])
        self.assertEqual(self.client.post(url).status_code, 302)
        self.client.force_login(self.owner)
        self.assertEqual(self.client.get(url).status_code, 405)
        claim.refresh_from_db()
        self.assertIsNone(claim.claimant_user)

    def test_unverified_or_mismatched_email_cannot_link(self):
        claim = self._make_anonymous_claim()
        self.client.force_login(self.owner)
        self.owner.profile.is_email_verified = False
        self.owner.profile.save(update_fields=["is_email_verified"])
        self.client.post(reverse("link_my_studio_claim", args=[claim.pk]))
        claim.refresh_from_db()
        self.assertIsNone(claim.claimant_user)
        self.assertNotContains(self.client.get(reverse("my_studios")), "Anonymous claim studio")
        self.owner.profile.is_email_verified = True
        self.owner.profile.save(update_fields=["is_email_verified"])
        claim.contact_email = "other@example.com"
        claim.save(update_fields=["contact_email"])
        self.client.post(reverse("link_my_studio_claim", args=[claim.pk]))
        claim.refresh_from_db()
        self.assertIsNone(claim.claimant_user)

    def test_link_never_reassigns_claim_or_approved_ownership(self):
        claim = self._make_anonymous_claim()
        second = User.objects.create_user("secondowner", "second@example.com", "pw")
        second.profile.is_email_verified = True
        second.profile.save(update_fields=["is_email_verified"])
        claim.claimant_user = second
        claim.save(update_fields=["claimant_user"])
        self.client.force_login(self.owner)
        self.client.post(reverse("link_my_studio_claim", args=[claim.pk]))
        claim.refresh_from_db()
        self.assertEqual(claim.claimant_user, second)
        claim.claimant_user = None
        claim.status = "rejected"
        claim.save(update_fields=["claimant_user", "status"])
        self.client.post(reverse("link_my_studio_claim", args=[claim.pk]))
        claim.refresh_from_db()
        self.assertIsNone(claim.claimant_user)

    def test_anonymous_can_suggest_but_not_claim_new_address(self):
        self.client.logout()
        self.client.post(reverse("submit_location_request"), {
            "name": "Unlinked studio", "city": "Lyon", "country": "France",
            "full_address": "3 Rue de Lyon", "contact_email": "anon@example.com",
        })
        item = LocationRequest.objects.get(name="Unlinked studio")
        self.assertFalse(item.wants_ownership)
        self.assertIsNone(item.requested_by)
