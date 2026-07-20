from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _, pgettext_lazy


APPOINTMENT_VALUE_LABELS = {
    "Head": _("Head"),
    "Head / neck": _("Head / neck"),
    "Chest": _("Chest"),
    "Stomach": _("Stomach"),
    "Stomach / ribs": _("Stomach / ribs"),
    "Back": pgettext_lazy("body placement", "Back"),
    "Lower back": _("Lower back"),
    "Left arm": _("Left arm"),
    "Right arm": _("Right arm"),
    "Left forearm": _("Left forearm"),
    "Right forearm": _("Right forearm"),
    "Left hand": _("Left hand"),
    "Right hand": _("Right hand"),
    "Left leg": _("Left leg"),
    "Right leg": _("Right leg"),
    "Left calf": _("Left calf"),
    "Right calf": _("Right calf"),
    "Foot": _("Foot"),
    "Feet": _("Feet"),
    "Fine Line": _("Fine Line"),
    "Blackwork": _("Blackwork"),
    "Realism": _("Realism"),
    "Japanese": _("Japanese"),
    "Minimalist": _("Minimalist"),
    "Lettering": _("Lettering"),
    "Geometric": _("Geometric"),
    "Watercolor": _("Watercolor"),
    "Floral": _("Floral"),
    "Traditional": _("Traditional"),
    "Other": _("Other"),
    "Coin": _("Coin"),
    "Smartphone": _("Smartphone"),
    "Half sleeve": _("Half sleeve"),
    "Full sleeve": _("Full sleeve"),
    "No budget": _("No budget"),
}


def _localize_appointment_value(value):
    value = str(value or "").strip()
    return str(APPOINTMENT_VALUE_LABELS.get(value, value))


def _localize_appointment_values(value):
    if not value:
        return ""

    values = value if isinstance(value, (list, tuple)) else str(value).split(",")
    return ", ".join(
        _localize_appointment_value(item)
        for item in values
        if str(item).strip()
    )


class ArtistBookingSettings(models.Model):
    BOOKING_STATUS_OPEN = "open"
    BOOKING_STATUS_PAUSED = "paused"
    BOOKING_STATUS_VACATION = "vacation"
    BOOKING_STATUS_FULLY_BOOKED = "fully_booked"
    BOOKING_STATUS_CONSULTATION_ONLY = "consultation_only"
    BOOKING_STATUS_EMERGENCY = "emergency"

    BOOKING_STATUS_CHOICES = [
        (BOOKING_STATUS_OPEN, _("Booking allowed")),
        (BOOKING_STATUS_PAUSED, _("Booking paused")),
        (BOOKING_STATUS_VACATION, _("Vacation")),
        (BOOKING_STATUS_FULLY_BOOKED, _("Fully booked")),
        (BOOKING_STATUS_CONSULTATION_ONLY, _("Consultation only")),
        (BOOKING_STATUS_EMERGENCY, _("Emergency closure")),
    ]

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
    booking_status = models.CharField(
        max_length=30,
        choices=BOOKING_STATUS_CHOICES,
        default=BOOKING_STATUS_OPEN,
    )

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

    auto_response_booking_received = models.TextField(blank=True, default="")
    auto_response_consultation_required = models.TextField(blank=True, default="")
    auto_response_need_more_references = models.TextField(blank=True, default="")
    auto_response_booking_approved = models.TextField(blank=True, default="")
    auto_response_booking_declined = models.TextField(blank=True, default="")

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
    STATUS_NEEDS_REFERENCES = "needs_references"
    STATUS_CONSULTATION_REQUIRED = "consultation_required"

    STATUS_CHOICES = [
        (STATUS_PENDING, _("Pending")),
        (STATUS_ACCEPTED, _("Accepted")),
        (STATUS_DECLINED, _("Declined")),
        (STATUS_CANCELLED, _("Cancelled")),
        (STATUS_COMPLETED, _("Completed")),
        (STATUS_NEEDS_REFERENCES, _("Need more references")),
        (STATUS_CONSULTATION_REQUIRED, _("Consultation required")),
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
    consultation_already_completed = models.BooleanField(default=False)
    consultation_note = models.CharField(max_length=240, blank=True)

    ai_ready_payload = models.JSONField(default=dict, blank=True)

    status = models.CharField(
        max_length=30,
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
    def localized_placement(self):
        return _localize_appointment_values(self.placement)

    @property
    def localized_styles(self):
        return _localize_appointment_values(self.styles)

    @property
    def localized_size(self):
        return _localize_appointment_value(self.size)

    @property
    def localized_budget(self):
        return _localize_appointment_value(self.budget)

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


class CalendarEvent(models.Model):
    TYPE_TATTOO_SESSION = "tattoo_session"
    TYPE_CONSULTATION = "consultation"
    TYPE_BLOCKED = "blocked"
    TYPE_VACATION = "vacation"
    TYPE_SKETCH_DEADLINE = "sketch_deadline"
    TYPE_DEPOSIT_REMINDER = "deposit_reminder"
    TYPE_HEALING_REMINDER = "healing_reminder"

    EVENT_TYPE_CHOICES = [
        (TYPE_TATTOO_SESSION, _("Tattoo session")),
        (TYPE_CONSULTATION, _("Consultation")),
        (TYPE_BLOCKED, _("Blocked time")),
        (TYPE_VACATION, _("Vacation")),
        (TYPE_SKETCH_DEADLINE, _("Sketch deadline")),
        (TYPE_DEPOSIT_REMINDER, _("Deposit reminder")),
        (TYPE_HEALING_REMINDER, _("Healing reminder")),
    ]

    STATUS_PLANNED = "planned"
    STATUS_CONFIRMED = "confirmed"
    STATUS_COMPLETED = "completed"
    STATUS_CANCELLED = "cancelled"
    STATUS_RESCHEDULE_REQUESTED = "reschedule_requested"
    STATUS_DEPOSIT_PENDING = "deposit_pending"

    STATUS_CHOICES = [
        (STATUS_PLANNED, _("Planned")),
        (STATUS_CONFIRMED, _("Confirmed")),
        (STATUS_COMPLETED, _("Completed")),
        (STATUS_CANCELLED, _("Cancelled")),
        (STATUS_RESCHEDULE_REQUESTED, _("Reschedule requested")),
        (STATUS_DEPOSIT_PENDING, _("Deposit pending")),
    ]

    DEPOSIT_UNKNOWN = "unknown"
    DEPOSIT_PENDING = "pending"
    DEPOSIT_PAID = "paid"
    DEPOSIT_NOT_REQUIRED = "not_required"

    DEPOSIT_STATUS_CHOICES = [
        (DEPOSIT_UNKNOWN, _("Unknown")),
        (DEPOSIT_PENDING, _("Pending")),
        (DEPOSIT_PAID, _("Paid")),
        (DEPOSIT_NOT_REQUIRED, _("Not required")),
    ]

    artist = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="calendar_artist_events",
        verbose_name=_("Artist"),
    )
    client = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="calendar_client_events",
        blank=True,
        null=True,
        verbose_name=_("Client"),
    )
    # TODO: Link to TattooProject when the project domain model is added.
    project = models.ForeignKey(
        Appointment,
        on_delete=models.SET_NULL,
        related_name="calendar_events",
        blank=True,
        null=True,
        verbose_name=_("Related appointment"),
    )
    event_type = models.CharField(max_length=30, choices=EVENT_TYPE_CHOICES)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default=STATUS_PLANNED)
    title = models.CharField(max_length=160)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    location = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)
    placement = models.CharField(max_length=120, blank=True)
    tattoo_style = models.CharField(max_length=120, blank=True)
    deposit_status = models.CharField(max_length=30, choices=DEPOSIT_STATUS_CHOICES, default=DEPOSIT_UNKNOWN)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["starts_at", "id"]
        indexes = [
            models.Index(fields=["artist", "starts_at", "ends_at"]),
            models.Index(fields=["client", "starts_at"]),
            models.Index(fields=["event_type", "status"]),
        ]

    def __str__(self):
        return f"{self.title} — {self.starts_at:%Y-%m-%d %H:%M}"

    def clean(self):
        super().clean()
        if self.ends_at and self.starts_at and self.ends_at <= self.starts_at:
            raise ValidationError({"ends_at": _("End time must be after start time.")})
        if self.event_type in [self.TYPE_TATTOO_SESSION, self.TYPE_CONSULTATION] and not self.client_id:
            raise ValidationError({"client": _("Client is required for sessions and consultations.")})

    @property
    def duration_hours(self):
        if not self.starts_at or not self.ends_at:
            return 0
        return round((self.ends_at - self.starts_at).total_seconds() / 3600, 2)

    def overlaps_for_artist(self):
        qs = CalendarEvent.objects.filter(
            artist=self.artist,
            starts_at__lt=self.ends_at,
            ends_at__gt=self.starts_at,
        ).exclude(status=self.STATUS_CANCELLED)
        if self.pk:
            qs = qs.exclude(pk=self.pk)
        return qs.exists()


class CalendarRescheduleRequest(models.Model):
    STATUS_PENDING = "pending"
    STATUS_ACCEPTED = "accepted"
    STATUS_DECLINED = "declined"

    STATUS_CHOICES = [
        (STATUS_PENDING, _("Pending")),
        (STATUS_ACCEPTED, _("Accepted")),
        (STATUS_DECLINED, _("Declined")),
    ]

    event = models.ForeignKey(CalendarEvent, on_delete=models.CASCADE, related_name="reschedule_requests")
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="calendar_reschedule_requests")
    proposed_start = models.DateTimeField(blank=True, null=True)
    proposed_end = models.DateTimeField(blank=True, null=True)
    reason = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["event", "status"]), models.Index(fields=["requested_by", "created_at"])]

    def clean(self):
        super().clean()
        if self.proposed_start and self.proposed_end and self.proposed_end <= self.proposed_start:
            raise ValidationError({"proposed_end": _("Proposed end must be after proposed start.")})
