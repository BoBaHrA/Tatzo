from datetime import timedelta

from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

from appointments.models import Appointment

from .models import (
    AppointmentHealthDeclaration,
    HEALTH_BOOLEAN_FIELDS,
    HealthSafetyCard,
    HealthSafetyShare,
    HealthSafetyShareIntent,
)


@receiver(post_save, sender=Appointment, dispatch_uid="health_safety.attach_share_intent")
def attach_health_share_intent(sender, instance, created, **kwargs):
    if not created or instance.booking_type != Appointment.TYPE_TATTOO:
        return

    cutoff = timezone.now() - timedelta(minutes=15)
    HealthSafetyShareIntent.objects.filter(created_at__lt=cutoff).delete()

    intent = (
        HealthSafetyShareIntent.objects.filter(
            client=instance.client,
            artist=instance.artist,
            appointment_date=instance.date,
            start_time=instance.start_time,
            created_at__gte=cutoff,
        )
        .order_by("-created_at")
        .first()
    )
    if not intent:
        return

    if intent.source == HealthSafetyShareIntent.SOURCE_CARD:
        card = HealthSafetyCard.objects.filter(
            user=instance.client,
            explicit_storage_consent=True,
        ).first()
        if card:
            HealthSafetyShare.objects.update_or_create(
                appointment=instance,
                defaults={
                    "card": card,
                    "granted_at": timezone.now(),
                    "revoked_at": None,
                },
            )

    elif intent.source == HealthSafetyShareIntent.SOURCE_QUICK:
        declaration_defaults = {
            field: bool(getattr(intent, field))
            for field in HEALTH_BOOLEAN_FIELDS
        }
        declaration_defaults.update(
            {
                "other_relevant_information": (
                    intent.other_relevant_information or ""
                ).strip()[:1000],
                "confirmed_none": bool(intent.confirmed_none),
                "shared_at": timezone.now(),
                "revoked_at": None,
            }
        )
        AppointmentHealthDeclaration.objects.update_or_create(
            appointment=instance,
            defaults=declaration_defaults,
        )

        if intent.save_to_card:
            card_defaults = {
                field: declaration_defaults[field]
                for field in HEALTH_BOOLEAN_FIELDS
            }
            card_defaults.update(
                {
                    "other_relevant_information": declaration_defaults[
                        "other_relevant_information"
                    ],
                    "explicit_storage_consent": True,
                    "consent_version": HealthSafetyCard.CONSENT_VERSION,
                    "consented_at": timezone.now(),
                }
            )
            HealthSafetyCard.objects.update_or_create(
                user=instance.client,
                defaults=card_defaults,
            )

    HealthSafetyShareIntent.objects.filter(
        client=instance.client,
        artist=instance.artist,
        appointment_date=instance.date,
        start_time=instance.start_time,
    ).delete()
