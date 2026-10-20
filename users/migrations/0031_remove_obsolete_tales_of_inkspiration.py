"""Resolve the verified request to hide the obsolete Tales of Inkspiration pin.

Customer support received a direct email confirmation on 2026-10-20.
Keep the Location row (and its OSM identity) as a suppression marker so future
imports cannot accidentally publish the obsolete address again.
"""
from django.db import migrations
from django.utils import timezone


def hide_obsolete_tales_of_inkspiration(apps, schema_editor):
    Location = apps.get_model("users", "Location")
    LocationClaim = apps.get_model("users", "LocationClaim")
    LocationRemovalRequest = apps.get_model("users", "LocationRemovalRequest")

    location = Location.objects.filter(
        pk=509,
        name__iexact="Tales of Inkspiration",
        source="osm",
        source_place_id="node/5956800821",
        city__iexact="Croydon",
    ).first()
    if location is None:
        # Do not modify a different business if records were changed or removed.
        return
    if location.linked_user_id is not None or location.studio_owner_id is not None:
        return
    if "shirley road" not in (location.formatted_address or location.address).lower():
        return
    if location.status not in {"imported", "unclaimed", "pending_claim", "removed"}:
        return

    claim = LocationClaim.objects.filter(
        pk=2,
        location_id=location.pk,
        claimant_name__iexact="Terry Brown",
        contact_email__iexact="talesofink@outlook.com",
    ).first()
    if claim is None:
        return

    now = timezone.now()
    if location.status != "removed":
        location.status = "removed"
        location.save(update_fields=["status", "updated_at"])

    # Existing October 1 request used the claim form to ask for removal.
    # Record the actual decision as a removal (never as studio ownership).
    if not LocationRemovalRequest.objects.filter(
        location_id=location.pk,
        contact_email__iexact=claim.contact_email,
        status="approved",
    ).exists():
        LocationRemovalRequest.objects.create(
            location=location,
            reporter_name=claim.claimant_name,
            contact_email=claim.contact_email,
            reason="Former studio address is no longer active; remove the outdated public listing without publishing a replacement.",
            status="approved",
            reviewed_at=now,
            admin_notes=(
                "Resolved at the request of the business contact following "
                "their email confirmation on 2026-10-20. "
                "Historical request: LocationClaim #2 (2026-10-01). "
                "Location remains suppressed in the database to block re-import."
            ),
        )

    # The previous ownership claim is now inapplicable; it did not grant access.
    if claim.status in {"submitted", "under_review"}:
        claim.status = "rejected"
        claim.reviewed_at = now
        claim.admin_notes = (
            (claim.admin_notes + "\n").lstrip()
            + "Closed as not applicable: the requester sought REMOVAL of an "
              "obsolete listing, not ownership. Removal approved 2026-10-20. "
              "See LocationRemovalRequest linked to this location."
        )
        claim.save(update_fields=["status", "reviewed_at", "admin_notes", "updated_at"])


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0030_location_removal_request"),
    ]

    operations = [
        migrations.RunPython(
            hide_obsolete_tales_of_inkspiration,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
