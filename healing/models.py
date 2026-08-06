import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.urls import reverse
from django.utils import timezone

from appointments.models import Appointment
from mytattooapp.storage_backends import private_media_storage


def healing_checkin_upload_path(instance, filename):
    return f"healing/{instance.journey_id}/day-{instance.day_number}/{filename}"


class HealingJourney(models.Model):
    STATUS_ACTIVE = "active"
    STATUS_HEALED = "healed"
    STATUS_ARCHIVED = "archived"
    STATUS_CHOICES = (
        (STATUS_ACTIVE, "Active"),
        (STATUS_HEALED, "Healed"),
        (STATUS_ARCHIVED, "Archived"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    appointment = models.OneToOneField(
        Appointment,
        on_delete=models.CASCADE,
        related_name="healing_journey",
    )
    client = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="healing_journeys_as_client",
    )
    artist = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="healing_journeys_as_artist",
    )
    title = models.CharField(max_length=160, blank=True)
    started_on = models.DateField()
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
    healed_on = models.DateField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-started_on", "-created_at")
        indexes = [
            models.Index(fields=("client", "status", "-started_on")),
            models.Index(fields=("artist", "status", "-started_on")),
        ]

    def __str__(self):
        return f"{self.title or 'Healing journey'} — {self.client.username}"

    def clean(self):
        super().clean()
        if self.appointment_id:
            if self.appointment.booking_type != Appointment.TYPE_TATTOO:
                raise ValidationError({"appointment": "Healing tracking requires a tattoo session."})
            if self.client_id and self.client_id != self.appointment.client_id:
                raise ValidationError({"client": "Client must match the appointment."})
            if self.artist_id and self.artist_id != self.appointment.artist_id:
                raise ValidationError({"artist": "Artist must match the appointment."})

    @property
    def current_day(self):
        end_date = self.healed_on if self.status == self.STATUS_HEALED and self.healed_on else timezone.localdate()
        return max(1, (end_date - self.started_on).days + 1)

    @property
    def tracking_percent(self):
        return min(100, round((self.current_day / 30) * 100))

    @property
    def days_remaining(self):
        return max(0, 30 - self.current_day)

    def mark_healed(self):
        self.status = self.STATUS_HEALED
        self.healed_on = timezone.localdate()
        self.save(update_fields=("status", "healed_on", "updated_at"))


class HealingCheckIn(models.Model):
    journey = models.ForeignKey(
        HealingJourney,
        on_delete=models.CASCADE,
        related_name="checkins",
    )
    day_number = models.PositiveSmallIntegerField()
    photo = models.ImageField(
        upload_to=healing_checkin_upload_path,
        storage=private_media_storage,
    )
    note = models.CharField(max_length=1000, blank=True)
    symptoms = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("day_number", "created_at")
        constraints = [
            models.UniqueConstraint(
                fields=("journey", "day_number"),
                name="unique_healing_checkin_day",
            ),
        ]

    def __str__(self):
        return f"{self.journey_id} — day {self.day_number}"

    @property
    def private_url(self):
        return reverse("healing:checkin_media", kwargs={"checkin_id": self.pk})


class HealingRoutineCompletion(models.Model):
    TASK_WASH = "wash"
    TASK_MOISTURIZE = "moisturize"
    TASK_SUN = "sun"
    TASK_FRICTION = "friction"
    TASK_CHOICES = (
        (TASK_WASH, "Wash gently"),
        (TASK_MOISTURIZE, "Moisturize"),
        (TASK_SUN, "Avoid direct sun"),
        (TASK_FRICTION, "Avoid friction"),
    )
    TASK_SLUGS = {choice[0] for choice in TASK_CHOICES}

    journey = models.ForeignKey(
        HealingJourney,
        on_delete=models.CASCADE,
        related_name="routine_completions",
    )
    date = models.DateField(default=timezone.localdate)
    task_slug = models.CharField(max_length=24, choices=TASK_CHOICES)
    completed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-date", "task_slug")
        constraints = [
            models.UniqueConstraint(
                fields=("journey", "date", "task_slug"),
                name="unique_healing_routine_task_day",
            ),
        ]
        indexes = [models.Index(fields=("journey", "-date"))]

    def __str__(self):
        return f"{self.journey_id} — {self.date} — {self.task_slug}"
