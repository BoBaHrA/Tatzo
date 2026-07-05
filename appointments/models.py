from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


class ArtistBookingSettings(models.Model):
    BOOKING_WORKFLOW_CHOICES = [
        ("manual", _("Manual approval")),
        ("auto", _("Auto accept")),
    ]

    artist = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="booking_settings",
    )

    bookings_enabled = models.BooleanField(default=True)

    minimum_notice_hours = models.PositiveIntegerField(default=24)
    maximum_booking_window_days = models.PositiveIntegerField(default=60)
    slot_step_minutes = models.PositiveIntegerField(default=30)
    default_session_minutes = models.PositiveIntegerField(default=60)
    maximum_session_hours = models.PositiveIntegerField(default=6)

    consultation_enabled = models.BooleanField(default=True)
    online_consultation_enabled = models.BooleanField(default=True)
    studio_consultation_enabled = models.BooleanField(default=True)
    phone_consultation_enabled = models.BooleanField(default=False)
    consultation_required_before_booking = models.BooleanField(default=False)

    consultation_price = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    online_consultation_price = models.DecimalField(max_digits=8, decimal_places=2, default=25)

    reference_images_required = models.BooleanField(default=False)
    minimum_reference_images = models.PositiveIntegerField(default=1)
    maximum_reference_images = models.PositiveIntegerField(default=10)

    deposit_required = models.BooleanField(default=False)
    deposit_rate = models.DecimalField(max_digits=4, decimal_places=2, default=0.30)
    deposit_amount = models.DecimalField(max_digits=8, decimal_places=2, default=50)

    booking_workflow = models.CharField(
        max_length=20,
        choices=BOOKING_WORKFLOW_CHOICES,
        default="manual",
    )

    active_styles = models.JSONField(default=list, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Booking settings — {self.artist.username}"


class ArtistAvailability(models.Model):
    WEEKDAY_CHOICES = [
        (0, _("Sunday")),
        (1, _("Monday")),
        (2, _("Tuesday")),
        (3, _("Wednesday")),
        (4, _("Thursday")),
        (5, _("Friday")),
        (6, _("Saturday")),
    ]

    artist = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="availability_slots",
    )
    weekday = models.PositiveSmallIntegerField(choices=WEEKDAY_CHOICES)

    is_closed = models.BooleanField(default=False)
    open_time = models.TimeField(blank=True, null=True)
    close_time = models.TimeField(blank=True, null=True)

    break_start = models.TimeField(blank=True, null=True)
    break_end = models.TimeField(blank=True, null=True)

    class Meta:
        unique_together = ("artist", "weekday")
        ordering = ["weekday"]
        indexes = [
            models.Index(fields=["artist", "weekday"]),
        ]

    def __str__(self):
        return f"{self.artist.username} — {self.get_weekday_display()}"


class ArtistTimeOff(models.Model):
    artist = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="time_off_days",
    )
    date = models.DateField()
    reason = models.CharField(max_length=160, blank=True)

    class Meta:
        unique_together = ("artist", "date")
        ordering = ["date"]
        indexes = [
            models.Index(fields=["artist", "date"]),
        ]

    def __str__(self):
        return f"{self.artist.username} off on {self.date}"


class Appointment(models.Model):
    STATUS_PENDING = "pending"
    STATUS_ACCEPTED = "accepted"
    STATUS_DECLINED = "declined"
    STATUS_CANCELLED = "cancelled"
    STATUS_COMPLETED = "completed"

    STATUS_CHOICES = [
        (STATUS_PENDING, _("Pending")),
        (STATUS_ACCEPTED, _("Accepted")),
        (STATUS_DECLINED, _("Declined")),
        (STATUS_CANCELLED, _("Cancelled")),
        (STATUS_COMPLETED, _("Completed")),
    ]

    TYPE_TATTOO = "tattoo_session"
    TYPE_CONSULTATION = "consultation"
    TYPE_ONLINE_CONSULTATION = "online_consultation"

    BOOKING_TYPE_CHOICES = [
        (TYPE_TATTOO, _("Tattoo session")),
        (TYPE_CONSULTATION, _("Consultation")),
        (TYPE_ONLINE_CONSULTATION, _("Online consultation")),
    ]

    client = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="client_appointments",
    )
    artist = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="artist_appointments",
    )

    booking_type = models.CharField(
        max_length=30,
        choices=BOOKING_TYPE_CHOICES,
        default=TYPE_TATTOO,
    )

    date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField(blank=True, null=True)

    session_length_minutes = models.PositiveIntegerField(blank=True, null=True)
    client_comfort_limit = models.CharField(max_length=40, blank=True)

    styles = models.JSONField(default=list, blank=True)
    placement = models.CharField(max_length=80, blank=True)
    size = models.CharField(max_length=80, blank=True)
    budget = models.CharField(max_length=80, blank=True)
    description = models.TextField(blank=True)

    ai_ready_payload = models.JSONField(default=dict, blank=True)

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
    )

    artist_note = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    responded_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["artist", "date", "start_time"]),
            models.Index(fields=["client", "-created_at"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"{self.client.username} → {self.artist.username} on {self.date} {self.start_time}"

    @property
    def is_pending(self):
        return self.status == self.STATUS_PENDING

    def accept(self):
        self.status = self.STATUS_ACCEPTED
        self.responded_at = timezone.now()
        self.save(update_fields=["status", "responded_at", "updated_at"])

    def decline(self):
        self.status = self.STATUS_DECLINED
        self.responded_at = timezone.now()
        self.save(update_fields=["status", "responded_at", "updated_at"])


class AppointmentReferenceImage(models.Model):
    appointment = models.ForeignKey(
        Appointment,
        on_delete=models.CASCADE,
        related_name="reference_images",
    )
    image = models.ImageField(upload_to="appointments/references/")
    original_name = models.CharField(max_length=255, blank=True)
    order = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.original_name or f"Reference #{self.id}"
    