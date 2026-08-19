from django.conf import settings
from django.db import models
from django.utils import timezone


class ArtistStripeAccount(models.Model):
    artist = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="stripe_connect_account",
    )
    stripe_account_id = models.CharField(max_length=255, unique=True)
    charges_enabled = models.BooleanField(default=False)
    payouts_enabled = models.BooleanField(default=False)
    details_submitted = models.BooleanField(default=False)
    last_synced_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["artist_id"]

    def __str__(self):
        return f"Stripe Connect — {self.artist.username}"

    @property
    def is_ready(self):
        return bool(
            self.stripe_account_id
            and self.details_submitted
            and self.charges_enabled
            and self.payouts_enabled
        )


class AppointmentDeposit(models.Model):
    STATUS_PENDING = "pending"
    STATUS_CHECKOUT = "checkout_created"
    STATUS_PAID = "paid"
    STATUS_FAILED = "failed"
    STATUS_REFUNDED = "refunded"
    STATUS_CANCELLED = "cancelled"
    STATUS_EXPIRED = "expired"

    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_CHECKOUT, "Checkout created"),
        (STATUS_PAID, "Paid"),
        (STATUS_FAILED, "Failed"),
        (STATUS_REFUNDED, "Refunded"),
        (STATUS_CANCELLED, "Cancelled"),
        (STATUS_EXPIRED, "Expired"),
    ]

    appointment = models.OneToOneField(
        "appointments.Appointment",
        on_delete=models.CASCADE,
        related_name="deposit",
    )
    amount = models.DecimalField(max_digits=8, decimal_places=2)
    currency = models.CharField(max_length=3, default="eur")
    status = models.CharField(
        max_length=24,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
    )
    connected_account_id = models.CharField(max_length=255)
    checkout_session_id = models.CharField(max_length=255, blank=True)
    payment_intent_id = models.CharField(max_length=255, blank=True)
    last_stripe_event_id = models.CharField(max_length=255, blank=True)
    expires_at = models.DateTimeField(blank=True, null=True)
    paid_at = models.DateTimeField(blank=True, null=True)
    refunded_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status", "expires_at"]),
            models.Index(fields=["connected_account_id"]),
        ]

    def __str__(self):
        return f"Deposit #{self.pk} for appointment #{self.appointment_id}"

    @property
    def is_payable(self):
        if self.status not in {self.STATUS_PENDING, self.STATUS_CHECKOUT, self.STATUS_FAILED}:
            return False
        if self.expires_at and timezone.now() > self.expires_at:
            return False
        return self.amount > 0

    def refresh_expiry_state(self, *, save=True):
        if (
            self.status in {self.STATUS_PENDING, self.STATUS_CHECKOUT, self.STATUS_FAILED}
            and self.expires_at
            and timezone.now() > self.expires_at
        ):
            self.status = self.STATUS_EXPIRED
            if save:
                self.save(update_fields=["status", "updated_at"])
        return self.status
