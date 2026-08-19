from datetime import timedelta

from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

from appointments.models import Appointment

from .models import HealthSafetyCard, HealthSafetyShare, HealthSafetyShareIntent


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

    HealthSafetyShareIntent.objects.filter(
        client=instance.client,
        artist=instance.artist,
        appointment_date=instance.date,
        start_time=instance.start_time,
    ).delete()
