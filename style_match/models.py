import uuid
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from .styles import STYLE_CHOICES, STYLE_LABELS, TRAIT_LABELS


def _validate_weight_map(values, allowed_keys, field_label):
    if not isinstance(values, dict):
        raise ValidationError(
            _("%(field)s must be an object of numeric weights."), {"field": field_label}
        )

    unknown = set(values) - set(allowed_keys)
    if unknown:
        raise ValidationError(
            _("%(field)s contains unknown keys: %(keys)s."),
            {"field": field_label, "keys": ", ".join(sorted(unknown))},
        )

    for key, value in values.items():
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValidationError(
                _("Weight %(key)s in %(field)s must be numeric."),
                {"key": key, "field": field_label},
            )
        if not 0 <= float(value) <= 1:
            raise ValidationError(
                _("Weight %(key)s in %(field)s must be between 0 and 1."),
                {"key": key, "field": field_label},
            )


class TattooCard(models.Model):
    card_id = models.CharField(max_length=16, unique=True, db_index=True)
    image_url = models.URLField(max_length=1000)
    cloudinary_public_id = models.CharField(max_length=255, unique=True)
    primary_style = models.CharField(max_length=40, choices=STYLE_CHOICES)
    style_weights = models.JSONField(default=dict)
    visual_traits = models.JSONField(default=dict, blank=True)
    motifs = models.JSONField(default=list, blank=True)
    body_area = models.CharField(max_length=80, blank=True)
    skin_tone = models.CharField(max_length=40, blank=True)
    quality_score = models.DecimalField(
        max_digits=4,
        decimal_places=3,
        default=Decimal("1.000"),
    )
    is_active = models.BooleanField(default=True)
    is_approved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("card_id",)
        indexes = [
            models.Index(fields=("is_active", "is_approved", "primary_style")),
        ]

    def __str__(self):
        return f"{self.card_id} — {self.get_primary_style_display()}"

    def clean(self):
        super().clean()
        _validate_weight_map(
            self.style_weights,
            STYLE_LABELS,
            _("Style weights"),
        )
        _validate_weight_map(
            self.visual_traits,
            TRAIT_LABELS,
            _("Visual traits"),
        )
        if self.primary_style and self.style_weights:
            if float(self.style_weights.get(self.primary_style, 0)) <= 0:
                raise ValidationError(
                    {
                        "style_weights": _(
                            "The primary style must have a positive weight."
                        )
                    }
                )
        if not isinstance(self.motifs, list):
            raise ValidationError({"motifs": _("Motifs must be a list.")})
        if not 0 <= self.quality_score <= 1:
            raise ValidationError(
                {"quality_score": _("Quality score must be between 0 and 1.")}
            )

    @property
    def delivery_url(self):
        """Use Cloudinary delivery optimisation without altering the source asset."""
        marker = "/image/upload/"
        if "res.cloudinary.com" in self.image_url and marker in self.image_url:
            transformation = "f_auto,q_auto:good,c_fill,g_auto,w_900,h_1350/"
            return self.image_url.replace(marker, f"{marker}{transformation}", 1)
        return self.image_url


class StyleMatchSession(models.Model):
    STATUS_ACTIVE = "active"
    STATUS_COMPLETED = "completed"
    STATUS_ABANDONED = "abandoned"
    STATUS_CHOICES = (
        (STATUS_ACTIVE, _("Active")),
        (STATUS_COMPLETED, _("Completed")),
        (STATUS_ABANDONED, _("Abandoned")),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="style_match_sessions",
        blank=True,
        null=True,
    )
    browser_session_key = models.CharField(max_length=40, blank=True, db_index=True)
    status = models.CharField(
        max_length=16, choices=STATUS_CHOICES, default=STATUS_ACTIVE
    )
    target_count = models.PositiveSmallIntegerField(default=30)
    card_order = models.JSONField(default=list)
    current_index = models.PositiveSmallIntegerField(default=0)
    style_scores = models.JSONField(default=dict, blank=True)
    trait_scores = models.JSONField(default=dict, blank=True)
    personality_slug = models.CharField(max_length=40, blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-started_at",)
        indexes = [
            models.Index(fields=("user", "status", "-started_at")),
            models.Index(fields=("browser_session_key", "status", "-started_at")),
        ]

    def __str__(self):
        owner = (
            self.user.username
            if self.user_id
            else self.browser_session_key or "anonymous"
        )
        return f"Style Match {self.pk} — {owner}"

    @property
    def is_complete(self):
        return self.status == self.STATUS_COMPLETED

    def mark_completed(self, *, style_scores, trait_scores, personality_slug):
        self.status = self.STATUS_COMPLETED
        self.current_index = len(self.card_order)
        self.style_scores = style_scores
        self.trait_scores = trait_scores
        self.personality_slug = personality_slug
        self.completed_at = timezone.now()


class StyleMatchResponse(models.Model):
    REACTION_REJECT = "reject"
    REACTION_LIKE = "like"
    REACTION_FAVORITE = "favorite"
    REACTION_CHOICES = (
        (REACTION_REJECT, _("Not my style")),
        (REACTION_LIKE, _("Like")),
        (REACTION_FAVORITE, _("Favorite")),
    )

    session = models.ForeignKey(
        StyleMatchSession,
        on_delete=models.CASCADE,
        related_name="responses",
    )
    card = models.ForeignKey(
        TattooCard,
        on_delete=models.PROTECT,
        related_name="style_match_responses",
    )
    position = models.PositiveSmallIntegerField()
    reaction = models.CharField(max_length=16, choices=REACTION_CHOICES, blank=True)
    saved = models.BooleanField(default=False)
    responded_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("position",)
        constraints = [
            models.UniqueConstraint(
                fields=("session", "card"),
                name="unique_style_match_session_card",
            ),
            models.UniqueConstraint(
                fields=("session", "position"),
                name="unique_style_match_session_position",
            ),
        ]

    def __str__(self):
        return f"{self.session_id} · {self.card.card_id} · {self.reaction or 'saved'}"
