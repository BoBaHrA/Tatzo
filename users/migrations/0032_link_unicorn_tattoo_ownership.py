"""Resolve the historical Unicorn Tattoo Art Collective claim after account signup.

The original claim was submitted anonymously on 2026-10-01. The corresponding
business mailbox has since verified a Tatzo account. The business's official
website independently identifies Chris as an owner and confirms the studio
address and email. Keep this a strict, single-record, auditable migration.
"""
from django.db import migrations
from django.utils import timezone


def approve_verified_unicorn_studio_claim(apps, schema_editor):
    Location = apps.get_model("users", "Location")
    LocationClaim = apps.get_model("users", "LocationClaim")
    LocationOwnershipAudit = apps.get_model("users", "LocationOwnershipAudit")
    User = apps.get_model("auth", "User")
    Profile = apps.get_model("users", "Profile")

    claim = LocationClaim.objects.select_for_update().filter(
        pk=1,
        location_id=608,
        claimant_name__iexact="Chris",
        contact_email__iexact="info@utac.cc",
        relation_to_location__iexact="owner",
    ).first()
    location = Location.objects.select_for_update().filter(
        pk=608,
        name__iexact="Unicorn Tattoo Art Collective",
        source="osm",
        source_place_id="node/13914535105",
        city__iexact="Ashford",
    ).first()
    user = User.objects.filter(
        pk=36, username__iexact="Utac", email__iexact="info@utac.cc",
        is_active=True,
    ).first()
    reviewer = User.objects.filter(
        pk=7, username="BoBaHrA",
        email__iexact="vladimir.procopisin@gmail.com",
        is_active=True, is_staff=True,
    ).first()

    if not all((claim, location, user, reviewer)):
        return
    profile = Profile.objects.filter(user_id=user.pk, is_email_verified=True).first()
    if profile is None:
        return
    if "feltham road" not in (location.formatted_address or location.address).lower():
        return
    if (claim.proof or "").strip().rstrip("/").lower() != "https://utac.cc":
        return
    if location.linked_user_id is not None:
        return
    if location.studio_owner_id not in (None, user.pk):
        return
    if claim.claimant_user_id not in (None, user.pk):
        return

    # Re-running on an already approved, correctly linked claim is harmless.
    if claim.status == "approved":
        return
    if claim.status not in ("submitted", "under_review"):
        return
    if location.status not in ("imported", "unclaimed", "pending_claim", "claimed"):
        return

    # The owner/admin's evidence review was based on the official business
    # website https://utac.cc/ (Chris, owner; info@utac.cc; Ashford address),
    # original claim proof, and the verified Tatzo account's matching email.
    now = timezone.now()
    previous_owner_id = location.studio_owner_id
    claim.claimant_user_id = user.pk
    claim.status = "approved"
    claim.reviewed_by_id = reviewer.pk
    claim.reviewed_at = now
    claim.admin_notes = (
        ((claim.admin_notes or "").strip() + "\n").lstrip()
        + "Historical anonymous claim linked to verified user Utac (#36). "
          "Business ownership corroborated by official studio website "
          "(https://utac.cc/), matching 39a Feltham Road address, matching "
          "info@utac.cc email, and owner Chris named on website. "
          "Approved via reviewed, single-record migration."
    )
    claim.save(update_fields=[
        "claimant_user", "status", "reviewed_by", "reviewed_at",
        "admin_notes", "updated_at",
    ])

    location.studio_owner_id = user.pk
    location.status = "claimed"
    location.save(update_fields=["studio_owner", "status", "updated_at"])

    if not LocationOwnershipAudit.objects.filter(
        location_id=location.pk, source="location_claim",
        source_id=claim.pk, decision="approve",
    ).exists():
        LocationOwnershipAudit.objects.create(
            location_id=location.pk,
            actor_id=reviewer.pk,
            previous_owner_id=previous_owner_id,
            new_owner_id=user.pk,
            decision="approve",
            source="location_claim",
            source_id=claim.pk,
        )


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0031_remove_obsolete_tales_of_inkspiration"),
    ]

    operations = [
        migrations.RunPython(
            approve_verified_unicorn_studio_claim,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
