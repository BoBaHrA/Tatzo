from datetime import timedelta

from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

from appointments.models import Appointment, ArtistBookingSettings

from .models import AppointmentDeposit, ArtistStripeAccount


def _ready_stripe_account(artist):
    account = ArtistStripeAccount.objects.filter(artist=artist).first()
    return account if account and account.is_ready else None


@receiver(post_save, sender=Appointment, dispatch_uid="payments.sync_appointment_deposit")
def sync_appointment_deposit(sender, instance, **kwargs):
    existing = AppointmentDeposit.objects.filter(appointment=instance).first()

    if instance.status in {Appointment.STATUS_CANCELLED, Appointment.STATUS_DECLINED}:
        if existing and existing.status not in {
            AppointmentDeposit.STATUS_PAID,
            AppointmentDeposit.STATUS_REFUNDED,
            AppointmentDeposit.STATUS_CANCELLED,
        }:
            existing.status = AppointmentDeposit.STATUS_CANCELLED
            existing.save(update_fields=["status", "updated_at"])
        return

    if instance.status != Appointment.STATUS_ACCEPTED:
        return

    if instance.booking_type != Appointment.TYPE_TATTOO:
        return

    booking_settings = ArtistBookingSettings.objects.filter(artist=instance.artist).first()
    if not booking_settings or not booking_settings.deposit_required:
        return

    amount = booking_settings.deposit_amount
    if not amount or amount <= 0:
        return

    stripe_account = _ready_stripe_account(instance.artist)
    if not stripe_account:
        return

    deadline_hours = max(
        1,
        int(getattr(settings, "STRIPE_DEPOSIT_DEADLINE_HOURS", 24)),
    )
    defaults = {
        "amount": amount,
        "currency": "eur",
        "connected_account_id": stripe_account.stripe_account_id,
    }
    if not existing:
        defaults["expires_at"] = timezone.now() + timedelta(hours=deadline_hours)

    AppointmentDeposit.objects.update_or_create(
        appointment=instance,
        defaults=defaults,
    )


@receiver(post_save, sender=ArtistStripeAccount, dispatch_uid="payments.disable_unready_deposits")
def disable_deposits_when_account_is_not_ready(sender, instance, **kwargs):
    if instance.is_ready:
        return
    ArtistBookingSettings.objects.filter(
        artist=instance.artist,
        deposit_required=True,
    ).update(deposit_required=False)
