"""Reviewed, transactional location publishing and ownership decisions.

Only an authenticated, email-verified account can become a studio owner.
Admin review verifies the real-world relationship separately from email control.
"""
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .models import Location, LocationClaim, LocationRequest, LocationOwnershipAudit


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
def approve_location_request(request_id, reviewer):
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
        location.status = "claimed" if owner else "unclaimed"
        location.studio_owner = owner
        # Keep correct existing coordinates, but allow a reviewed replacement.
        if submission.latitude is not None and submission.longitude is not None:
            location.latitude = submission.latitude
            location.longitude = submission.longitude
        location.website = submission.website_or_map_link or location.website
        location.phone = submission.phone or location.phone
        location.save()
    else:
        location = Location.objects.create(
            name=submission.name.strip(), city=submission.city.strip(),
            country=submission.country.strip(),
            address=submission.full_address.strip()[:255],
            formatted_address=submission.full_address.strip()[:255],
            latitude=submission.latitude, longitude=submission.longitude,
            website=submission.website_or_map_link, phone=submission.phone,
            source="manual", status="claimed" if owner else "unclaimed",
            studio_owner=owner,
        )
        previous_owner = None

    submission.approved_location = location
    submission.status = "approved"
    submission.reviewed_by = reviewer
    submission.reviewed_at = timezone.now()
    submission.save(update_fields=["approved_location", "status", "reviewed_by", "reviewed_at", "updated_at"])
    _audit(location, reviewer, previous_owner, owner, "approve", "location_request", submission.pk)
    return location


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
