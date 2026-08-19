from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone


class HealthSafetyCard(models.Model):
    CONSENT_VERSION = "2026-08"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="health_safety_card",
    )
    bleeding_clotting_condition = models.BooleanField(default=False)
    blood_thinning_medication = models.BooleanField(default=False)
    diabetes_or_blood_sugar_condition = models.BooleanField(default=False)
    relevant_skin_condition = models.BooleanField(default=False)
    relevant_allergy_sensitivity = models.BooleanField(default=False)
    immune_or_healing_condition = models.BooleanField(default=False)
    other_relevant_information = models.TextField(blank=True, max_length=1000)

    explicit_storage_consent = models.BooleanField(default=False)
    consent_version = models.CharField(max_length=20, default=CONSENT_VERSION)
    consented_at = models.DateTimeField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"Health & Safety — {self.user.username}"

    @property
    def declared_issue_count(self):
        fields = (
            self.bleeding_clotting_condition,
            self.blood_thinning_medication,
            self.diabetes_or_blood_sugar_condition,
            self.relevant_skin_condition,
            self.relevant_allergy_sensitivity,
            self.immune_or_healing_condition,
        )
        return sum(bool(value) for value in fields) + bool(
            (self.other_relevant_information or "").strip()
        )


class HealthSafetyShare(models.Model):
    ACCESS_DAYS_AFTER_APPOINTMENT = 60

    appointment = models.OneToOneField(
        "appointments.Appointment",
        on_delete=models.CASCADE,
        related_name="health_safety_share",
    )
    card = models.ForeignKey(
        HealthSafetyCard,
        on_delete=models.CASCADE,
        related_name="shares",
    )
    granted_at = models.DateTimeField(default=timezone.now)
    revoked_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        ordering = ["-granted_at"]

    def __str__(self):
        return f"Health share for appointment #{self.appointment_id}"

    @property
    def expires_on(self):
        return self.appointment.date + timedelta(days=self.ACCESS_DAYS_AFTER_APPOINTMENT)

    @property
    def is_active(self):
        if self.revoked_at:
            return False
        if self.appointment.status in {"declined", "cancelled"}:
            return False
        return timezone.localdate() <= self.expires_on


class HealthSafetyShareIntent(models.Model):
    client = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="health_share_intents",
    )
    artist = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="incoming_health_share_intents",
    )
    appointment_date = models.DateField()
    start_time = models.TimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["client", "artist", "appointment_date", "start_time"],
                name="unique_health_share_intent_slot",
            )
        ]
        indexes = [
            models.Index(
                fields=["client", "artist", "appointment_date", "start_time"],
                name="health_intent_slot_idx",
            ),
            models.Index(fields=["created_at"], name="health_intent_created_idx"),
        ]

    def __str__(self):
        return f"Health share intent {self.client_id} → {self.artist_id}"
