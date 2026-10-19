"""Reviewed studio ownership and obsolete location operations.

Keep business decisions here, not in writable Django Admin status fields.
"""
import hashlib
import re

from django.conf import settings
from django.core import signing
from django.core.exceptions import PermissionDenied, ValidationError
from django.core.mail import send_mail
from django.db import transaction
from django.urls import reverse
from django.utils import timezone

from .models import Location, LocationClaim, LocationSuppression

CLAIM_SALT = "tatzo.studio.location-claim.email.v1"
CLAIM_EMAIL_MAX_AGE = 48 * 60 * 60


def normalize(value):
    return re.sub(r"\s+", " ", str(value or "").casefold().strip())


def location_fingerprint(name, city, address, country=""):
    """Conservative match: require a real address to avoid false suppressions."""
    a, n = normalize(address), normalize(name)
    if not n or not a:
        return ""
    return hashlib.sha256(f"{n}|{normalize(city)}|{normalize(country)}|{a}".encode("utf-8")).hexdigest()


def make_claim_email_token(claim):
    return signing.dumps(
        {"claim_id": claim.pk, "email": normalize(claim.contact_email)},
        salt=CLAIM_SALT,
    )


def send_claim_confirmation(claim, request):
    token = make_claim_email_token(claim)
    url = request.build_absolute_uri(reverse("verify_location_claim_email", args=[token]))
    send_mail(
        "Confirm your Tatzo studio claim email",
        f"Confirm your contact email for {claim.location.name} within 48 hours:\n{url}\n\n"
        "Confirming your email does not grant ownership. Tatzo will review proof of your "
        "authority and require a verified Tatzo account.",
        settings.DEFAULT_FROM_EMAIL,
        [claim.contact_email],
        fail_silently=False,
    )


@transaction.atomic
def confirm_claim_email(token):
    try:
        payload = signing.loads(token, salt=CLAIM_SALT, max_age=CLAIM_EMAIL_MAX_AGE)
    except (signing.BadSignature, signing.SignatureExpired) as exc:
        raise ValidationError("Invalid or expired confirmation link.") from exc
    claim = LocationClaim.objects.select_for_update().get(pk=payload["claim_id"])
    if normalize(claim.contact_email) != payload["email"]:
        raise ValidationError("This confirmation link is no longer valid.")
    if claim.email_verified_at or claim.status in {"approved", "rejected"}:
        raise ValidationError("This confirmation link was already used.")
    claim.email_verified_at = timezone.now()
    claim.status = "under_review" if claim.claimant_user_id else "awaiting_account"
    claim.save(update_fields=["email_verified_at", "status", "updated_at"])
    return claim


@transaction.atomic
def connect_claim_account(claim_id, user):
    if not user.is_authenticated or not user.is_active or not getattr(user.profile, "is_email_verified", False):
        raise PermissionDenied("A logged-in, email-verified Tatzo account is required.")
    claim = LocationClaim.objects.select_for_update().get(pk=claim_id)
    if not claim.email_verified_at or claim.status in {"rejected", "approved"}:
        raise ValidationError("The claim must have a confirmed email and await review.")
    if normalize(user.email) != normalize(claim.contact_email):
        raise PermissionDenied("Your Tatzo account email must match the verified claim email.")
    if claim.claimant_user_id and claim.claimant_user_id != user.pk:
        raise PermissionDenied("This claim is already linked to another account.")
    claim.claimant_user = user
    claim.status = "under_review"
    claim.save(update_fields=["claimant_user", "status", "updated_at"])
    return claim


def _staff(user):
    if not user or not user.is_authenticated or not user.is_active or not user.is_staff:
        raise PermissionDenied("Staff review is required.")


@transaction.atomic
def verify_claim_evidence(claim_id, reviewer):
    _staff(reviewer)
    claim = LocationClaim.objects.select_for_update().get(pk=claim_id)
    if claim.status in {"approved", "rejected"}:
        raise ValidationError("The review is already final.")
    if not claim.email_verified_at:
        raise ValidationError("Confirm the claimant email first.")
    if not (claim.proof.strip() or claim.proof_document or claim.message.strip()):
        raise ValidationError("Request supporting evidence before verification.")
    claim.evidence_verified_at = timezone.now()
    claim.reviewed_by = reviewer
    claim.reviewed_at = timezone.now()
    claim.decision = "Evidence manually verified"
    claim.save(update_fields=[
        "evidence_verified_at", "reviewed_by", "reviewed_at", "decision", "updated_at",
    ])
    return claim


@transaction.atomic
def approve_studio_claim(claim_id, reviewer):
    _staff(reviewer)
    claim = LocationClaim.objects.select_for_update().select_related("claimant_user__profile").get(pk=claim_id)
    location = Location.objects.select_for_update().get(pk=claim.location_id)
    if claim.status == "approved" and location.studio_owner_id == claim.claimant_user_id:
        return claim
    if not claim.email_verified_at or not claim.evidence_verified_at:
        raise ValidationError("Confirm the claimant email and independently verify business evidence.")
    user = claim.claimant_user
    if not user or not user.is_active or not getattr(user.profile, "is_email_verified", False):
        raise ValidationError("Connect an active, email-verified Tatzo account first.")
    if normalize(user.email) != normalize(claim.contact_email):
        raise ValidationError("The verified claim email and account email must match.")
    if location.is_suppressed or location.linked_user_id:
        raise ValidationError("Cannot claim a suppressed location or an artist profile.")
    if location.studio_owner_id and location.studio_owner_id != user.pk:
        raise ValidationError("This studio already has a different owner. Transfer requires separate review.")
    if LocationClaim.objects.filter(location=location, status="approved").exclude(pk=claim.pk).exists():
        raise ValidationError("A different ownership claim was already approved.")
    if claim.status not in {"under_review", "awaiting_account", "needs_information", "submitted"}:
        raise ValidationError("This claim cannot be approved from its current state.")
    location.studio_owner = user
    location.status = "claimed"
    location.save(update_fields=["studio_owner", "status", "updated_at"])
    claim.status = "approved"
    claim.reviewed_by = reviewer
    claim.reviewed_at = timezone.now()
    claim.decision = "Ownership approved and account linked"
    claim.save(update_fields=["status", "reviewed_by", "reviewed_at", "decision", "updated_at"])
    return claim


@transaction.atomic
def set_claim_review_state(claim_id, reviewer, new_state):
    _staff(reviewer)
    if new_state not in {"rejected", "needs_information", "under_review"}:
        raise ValidationError("Invalid review action.")
    claim = LocationClaim.objects.select_for_update().get(pk=claim_id)
    if claim.status == "approved":
        raise ValidationError("Approved ownership cannot be changed via this action.")
    if claim.status == "rejected" and new_state != "rejected":
        raise ValidationError("A rejected claim requires a new review request.")
    if new_state == "under_review" and not claim.email_verified_at:
        raise ValidationError("Email verification is required.")
    claim.status = new_state
    claim.reviewed_by = reviewer
    claim.reviewed_at = timezone.now()
    claim.decision = {
        "rejected": "Rejected by reviewer",
        "needs_information": "Additional business evidence requested",
        "under_review": "Returned to manual review",
    }[new_state]
    claim.save(update_fields=["status", "reviewed_by", "reviewed_at", "decision", "updated_at"])
    return claim


@transaction.atomic
def suppress_location(location_id, reviewer, reason, correction=None):
    _staff(reviewer)
    if not str(reason or "").strip():
        raise ValidationError("A documented reason is required.")
    location = Location.objects.select_for_update().get(pk=location_id)
    # Existing artist locations remain attached to their original accounts.
    location.is_suppressed = True
    location.suppressed_at = timezone.now()
    location.suppressed_by = reviewer
    location.suppression_reason = str(reason)[:300]
    location.save(update_fields=["is_suppressed", "suppressed_at", "suppressed_by", "suppression_reason", "updated_at"])
    fingerprint = location_fingerprint(location.name, location.city, location.display_address, location.country)
    if location.source_place_id or fingerprint:
        LocationSuppression.objects.get_or_create(
            location=location, source=location.source, source_place_id=location.source_place_id,
            defaults={"fingerprint": fingerprint},
        )
    if correction is not None:
        correction.status = "approved"
        correction.reviewed_by = reviewer
        correction.reviewed_at = timezone.now()
        correction.save(update_fields=["status", "reviewed_by", "reviewed_at"])
    return location


@transaction.atomic
def restore_location(location_id, reviewer):
    _staff(reviewer)
    location = Location.objects.select_for_update().get(pk=location_id)
    location.is_suppressed = False
    location.suppressed_at = None
    location.suppressed_by = None
    location.suppression_reason = ""
    location.save(update_fields=["is_suppressed", "suppressed_at", "suppressed_by", "suppression_reason", "updated_at"])
    location.import_suppressions.all().delete()
    return location
