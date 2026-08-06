from django.db.models.signals import post_save
from django.dispatch import receiver

from appointments.models import Appointment

from .models import HealingJourney


def _journey_title(appointment):
    styles = appointment.styles or []
    if isinstance(styles, (list, tuple)):
        styles_text = ", ".join(str(item).strip() for item in styles if str(item).strip())
    else:
        styles_text = str(styles).strip()
    placement = str(appointment.placement or "").strip()
    title = " · ".join(part for part in (styles_text, placement) if part)
    return title[:160] or f"Tattoo #{appointment.pk}"


@receiver(post_save, sender=Appointment, dispatch_uid="healing.create_journey_after_completed_tattoo")
def create_journey_after_completed_tattoo(sender, instance, **kwargs):
    if instance.booking_type != Appointment.TYPE_TATTOO:
        return
    if instance.status != Appointment.STATUS_COMPLETED:
        return

    HealingJourney.objects.get_or_create(
        appointment=instance,
        defaults={
            "client": instance.client,
            "artist": instance.artist,
            "title": _journey_title(instance),
            "started_on": instance.date,
        },
    )
