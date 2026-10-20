"""Reviewed, transactional location publishing and ownership decisions.

Only an authenticated, email-verified account can become a studio owner.
Admin review verifies the real-world relationship separately from email control.
"""
from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .models import Location, LocationClaim, LocationRequest, LocationRemovalRequest, LocationOwnershipAudit


ACTIVE_STATES = ("submitted", "under_review")


def _require_moderator(reviewer):
    if not getattr(reviewer, "is_authenticated", False) or not reviewer.is_active or not reviewer.is_staff:
        raise ValidationError("Only active Tatzo moderators can review location ownership.")


def _verified_applicant(user, submitted_email):
    if not user or not user.is_active:
        raise ValidationError("A registered active Tatzo account must be linked first.")
    if not user.email or user.email.strip().casefold() != (submitted_email or "").strip().casefold():
        raise ValidationError("The request email must match the linked account email.")
    profile = getattr(user, "profile", None)
    if profile is None or not profile.is_email_verified:
        raise ValidationError("The linked account must have a verified email.")
    return user


def _audit(location, reviewer, before, after, action, origin, origin_id):
    LocationOwnershipAudit.objects.create(
        location=location, actor=reviewer,
        previous_owner=before, new_owner=after,
        decision=action, source=origin, source_id=origin_id,
    )


@transaction.atomic
def approve_location_request(request_id, reviewer, *, latitude=None, longitude=None):
    """Review a user-created address, publish it, and optionally bind its owner.

    Must only be invoked after staff have inspected submitted evidence.
    """
    _require_moderator(reviewer)
    submission = LocationRequest.objects.select_for_update().select_related(
        "requested_by", "approved_location"
    ).get(pk=request_id)

    if submission.status == "approved" and submission.approved_location_id:
        return submission.approved_location
    if submission.status not in ACTIVE_STATES:
        raise ValidationError("This location request cannot be approved in its current state.")

    # The moderator may correct a pin before approval. No unpinned location
    # is silently published, and invalid coordinates cannot mutate the request.
    if latitude is not None or longitude is not None:
        if latitude is None or longitude is None:
            raise ValidationError("Both reviewed coordinates are required.")
        try:
            latitude, longitude = Decimal(str(latitude)), Decimal(str(longitude))
        except (InvalidOperation, ValueError, TypeError):
            raise ValidationError("Enter valid latitude and longitude.") from None
        if (
            not latitude.is_finite() or not longitude.is_finite()
            or not Decimal("-90") <= latitude <= Decimal("90")
            or not Decimal("-180") <= longitude <= Decimal("180")
        ):
            raise ValidationError("Enter coordinates within valid ranges.")
        submission.latitude = latitude
        submission.longitude = longitude
    if submission.latitude is None or submission.longitude is None:
        raise ValidationError("Confirm coordinates before approving a new address.")

    owner = None
    if submission.wants_ownership:
        owner = _verified_applicant(submission.requested_by, submission.contact_email)

    # Reuse exactly matching unclaimed/imported locations instead of generating
    # a duplicate marker. Never silently take over someone's existing listing.
    matches = list(
        Location.objects.select_for_update().filter(
            name__iexact=submission.name.strip(),
            city__iexact=submission.city.strip(),
        ).filter(
            Q(address__iexact=submission.full_address.strip())
            | Q(formatted_address__iexact=submission.full_address.strip())
        ).order_by("pk")[:2]
    )
    if len(matches) > 1:
        raise ValidationError("Multiple matching studios exist; resolve duplicates manually.")
    if matches:
        location = matches[0]
        if (
            location.status not in {"imported", "unclaimed", "pending_claim"}
            or location.linked_user_id is not None
            or location.studio_owner_id not in (None, getattr(owner, "pk", None))
        ):
            raise ValidationError("The matching location is already managed or suppressed.")
        previous_owner = location.studio_owner
        location.status = "claimed" if owner else ("unclaimed" if location.status == "pending_claim" else location.status)
        location.name = submission.name.strip()
        location.address = submission.full_address.strip()[:1000]
        location.formatted_address = submission.full_address.strip()[:1000]
        location.country = submission.country.strip()
        location.studio_owner = owner
        # Keep correct existing coordinates, but allow a reviewed replacement.
        if submission.latitude is not None and submission.longitude is not None:
            location.latitude = submission.latitude
            location.longitude = submission.longitude
        location.website = submission.website_or_map_link or location.website
        location.phone = submission.phone or location.phone
        location.verified_at = timezone.now()
        location.save()
    else:
        location = Location.objects.create(
            name=submission.name.strip(), city=submission.city.strip(),
            country=submission.country.strip(),
            address=submission.full_address.strip()[:1000],
            formatted_address=submission.full_address.strip()[:1000],
            latitude=submission.latitude, longitude=submission.longitude,
            website=submission.website_or_map_link, phone=submission.phone,
            source="manual", status="claimed" if owner else "unclaimed",
            studio_owner=owner, verified_at=timezone.now(),
        )
        previous_owner = None

    submission.approved_location = location
    submission.status = "approved"
    submission.reviewed_by = reviewer
    submission.reviewed_at = timezone.now()
    submission.save(update_fields=["latitude", "longitude", "approved_location", "status", "reviewed_by", "reviewed_at", "updated_at"])
    _audit(location, reviewer, previous_owner, owner, "approve", "location_request", submission.pk)
    return location


@transaction.atomic
def link_pending_claim_to_account(claim_id, user):
    """Attach a prior anonymous claim to its contact email's verified account.

    This does NOT grant studio ownership: a moderator must still review the
    evidence and approve the claim separately.
    """
    if not getattr(user, "is_authenticated", False):
        raise ValidationError("Sign in before linking a studio claim.")

    claim = LocationClaim.objects.select_for_update().get(pk=claim_id)
    if claim.status not in ACTIVE_STATES:
        raise ValidationError("Only pending studio claims can be linked.")
    _verified_applicant(user, claim.contact_email)

    if claim.claimant_user_id and claim.claimant_user_id != user.pk:
        raise ValidationError("This studio claim is already linked to a different account.")
    if claim.location.status in {"removed", "rejected"}:
        raise ValidationError("This location is no longer eligible for a claim.")
    if claim.location.studio_owner_id and claim.location.studio_owner_id != user.pk:
        raise ValidationError("This studio already has a different owner.")

    if claim.claimant_user_id is None:
        claim.claimant_user = user
        claim.save(update_fields=["claimant_user", "updated_at"])
    return claim


@transaction.atomic
def approve_location_claim(claim_id, reviewer):
    """Grant management of an existing studio after independent evidence review."""
    _require_moderator(reviewer)
    claim = LocationClaim.objects.select_for_update().select_related("claimant_user").get(pk=claim_id)
    location = Location.objects.select_for_update().get(pk=claim.location_id)
    if claim.status == "approved":
        if claim.claimant_user_id and location.studio_owner_id == claim.claimant_user_id:
            return location
        raise ValidationError("Previously approved claim is inconsistent with studio ownership.")
    if claim.status not in ACTIVE_STATES:
        raise ValidationError("This claim cannot be approved in its current state.")
    owner = _verified_applicant(claim.claimant_user, claim.contact_email)
    if location.status in {"rejected", "removed"} or location.linked_user_id is not None:
        raise ValidationError("The listing cannot be claimed through studio ownership.")
    if location.studio_owner_id and location.studio_owner_id != owner.pk:
        raise ValidationError("Studio already belongs to another account; use a reviewed transfer process.")
    previous_owner = location.studio_owner
    location.studio_owner = owner
    location.status = "claimed"
    location.save(update_fields=["studio_owner", "status", "updated_at"])
    claim.status = "approved"
    claim.reviewed_by = reviewer
    claim.reviewed_at = timezone.now()
    claim.save(update_fields=["status", "reviewed_by", "reviewed_at", "updated_at"])
    _audit(location, reviewer, previous_owner, owner, "approve", "location_claim", claim.pk)
    return location


@transaction.atomic
def review_location_removal(report_id, reviewer, decision, *, confirm_managed=False):
    """Approve or reject a public closure report; never hard-delete a studio."""
    _require_moderator(reviewer)
    if decision not in {"approve", "reject"}:
        raise ValidationError("Choose a valid removal decision.")

    report = LocationRemovalRequest.objects.select_for_update().get(pk=report_id)
    location = Location.objects.select_for_update().get(pk=report.location_id)

    if report.status != "submitted":
        if report.status == ("approved" if decision == "approve" else "rejected"):
            return report
        raise ValidationError("This report was already reviewed.")

    if decision == "approve":
        if location.linked_user_id:
            raise ValidationError(
                "Linked artist locations require separate artist-address review."
            )
        if location.studio_owner_id and not confirm_managed:
            raise ValidationError(
                "A managed studio requires explicit additional staff confirmation."
            )
        location.status = "removed"
        location.save(update_fields=["status", "updated_at"])

    report.status = "approved" if decision == "approve" else "rejected"
    report.reviewed_by = reviewer
    report.reviewed_at = timezone.now()
    report.save(update_fields=["status", "reviewed_by", "reviewed_at", "updated_at"])
    return report


@transaction.atomic
def reject_location_submission(kind, item_id, reviewer):
    _require_moderator(reviewer)
    if kind == "claim":
        obj = LocationClaim.objects.select_for_update().get(pk=item_id)
    elif kind == "request":
        obj = LocationRequest.objects.select_for_update().get(pk=item_id)
    else:
        raise ValidationError("Unknown submission type.")
    if obj.status == "rejected":
        return obj
    if obj.status not in ACTIVE_STATES:
        raise ValidationError("Only pending submissions can be rejected.")
    obj.status = "rejected"
    obj.reviewed_by = reviewer
    obj.reviewed_at = timezone.now()
    obj.save(update_fields=["status", "reviewed_by", "reviewed_at", "updated_at"])
    return obj
