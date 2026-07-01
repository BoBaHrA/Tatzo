import re
import mimetypes

from django.contrib.auth.models import User
from django.db import models
from django.conf import settings
from django.utils.translation import gettext_lazy as _
from cloudinary.utils import cloudinary_url

# Определяем варианты выбора для типа пользователя
# Определяем варианты выбора для типа пользователя
USER_TYPE_CHOICES = [
    ("regular", _("Regular user")),
    ("tattoo_artist", _("Tattoo artist")),
]

NOTIFICATION_CHOICES = [
    (
        "approved",
        _("Congratulations, your tattoo artist account has been verified."),
    ),
    (
        "rejected",
        _(
            "Unfortunately, your tattoo artist account has not been verified. "
            "Contact technical support for more information."
        ),
    ),
]

VERIFICATION_STATUS_CHOICES = [
    ("not_submitted", _("Not submitted")),
    ("pending_documents", _("Pending documents review")),
    ("pending_manual_review", _("Pending manual review")),
    ("pending", _("Pending")),
    ("approved", _("Approved")),
    ("rejected", _("Rejected")),
]

# Варианты документов для подтверждения бизнеса
BUSINESS_DOCUMENT_CHOICES = [
    ("license", _("Business license")),
    ("sole_proprietor", _("Self-employed certificate")),
    ("business_registration", _("Tattoo studio registration")),
    ("other", _("Other (upload an official document)")),
]

# Варианты удостоверений личности
ID_DOCUMENT_CHOICES = [
    ("passport", _("Passport")),
    ("driver_license", _("Driver license")),
    ("national_id", _("National ID")),
]


class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    account_type = models.CharField(max_length=20, choices=USER_TYPE_CHOICES)
    status = models.CharField(
        max_length=20,
        default="pending",
        choices=[("pending", _("Pending")), ("active", _("Active"))],
    )
    bio = models.TextField(blank=True, null=True)
    profile_image = models.ImageField(
        upload_to="profile_images/", blank=True, null=True
    )
    verification_status = models.CharField(
        max_length=30,
        default="not_submitted",
        choices=VERIFICATION_STATUS_CHOICES,
    )
    
    is_email_verified = models.BooleanField(default=False)
    show_liked_posts = models.BooleanField(default=True)
    tag = models.SlugField(
        max_length=32,
        unique=True,
        blank=True,
        null=True,
        help_text="Unique public tag used to find the profile.",
    )

    def __str__(self):
        return f"{self.user.username} - {self.account_type}"
    
    @staticmethod
    def normalize_tag(value):
        value = (value or "").strip().lower()
        value = value.lstrip("@")
        value = re.sub(r"[^a-z0-9_]+", "_", value)
        value = re.sub(r"_+", "_", value).strip("_")
        return value[:32]


    @classmethod
    def generate_unique_tag(cls, username):
        base_tag = cls.normalize_tag(username)

        if not base_tag:
            base_tag = "user"

        base_tag = base_tag[:32]
        candidate = base_tag
        counter = 2

        while cls.objects.filter(tag=candidate).exists():
            suffix = f"_{counter}"
            candidate = f"{base_tag[:32 - len(suffix)]}{suffix}"
            counter += 1

        return candidate
    
    @property
    def public_verification_status(self):
        if self.verification_status in [
            "pending",
            "pending_documents",
            "pending_manual_review",
        ]:
            return _("Pending verification")

        if self.verification_status == "approved":
            return _("Verified")

        if self.verification_status == "rejected":
            return _("Verification rejected")

        return _("Not submitted")
    
    @property
    def is_verified_artist(self):
        return (
            self.account_type == "tattoo_artist"
            and self.verification_status == "approved"
        )


class VerificationDocument(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)

    # Документ о бизнесе (обязательный)
    business_document_type = models.CharField(
        max_length=50,
        choices=BUSINESS_DOCUMENT_CHOICES,
        verbose_name=_("Business document type"),
    )
    business_document_file = models.FileField(
        upload_to="business_docs",
        verbose_name=_("Business document"),
    )

    # Документ, удостоверяющий личность (обязательный)
    id_document_type = models.CharField(
        max_length=50,
        choices=ID_DOCUMENT_CHOICES,
        verbose_name=_("Identity document type"),
    )
    id_document_file = models.FileField(
        upload_to="id_docs",
        verbose_name=_("Identity document"),
    )

    # Статус верификации
    is_verified = models.BooleanField(default=False, verbose_name=_("Document verified"))

    def __str__(self):
        return f"Verification for {self.user.username}"
    
class ManualVerificationRequest(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)

    portfolio_link = models.URLField(
        max_length=500,
        blank=True,
        null=True,
        verbose_name="Portfolio link",
    )

    social_link = models.URLField(
        max_length=500,
        blank=True,
        null=True,
        verbose_name="Social media link",
    )

    city_country = models.CharField(
        max_length=120,
        blank=True,
        null=True,
        verbose_name="City / Country",
    )

    explanation = models.TextField(
        verbose_name="Explanation",
        help_text="Explain why you should be reviewed manually.",
    )

    extra_file = models.FileField(
        upload_to="manual_review_files/",
        blank=True,
        null=True,
        verbose_name="Optional file",
    )

    is_reviewed = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Manual review for {self.user.username}"
    
class UserFollow(models.Model):
    follower = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="following_relations",
    )
    following = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="follower_relations",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("follower", "following")
        indexes = [
            models.Index(fields=["follower", "following"]),
            models.Index(fields=["following"]),
        ]

    def __str__(self):
        return f"{self.follower.username} follows {self.following.username}"

class UserBlock(models.Model):
    blocker = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="blocking_relations",
    )
    blocked = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="blocked_by_relations",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("blocker", "blocked")
        indexes = [
            models.Index(fields=["blocker", "blocked"]),
            models.Index(fields=["blocked"]),
        ]

    def __str__(self):
        return f"{self.blocker.username} blocked {self.blocked.username}"

class PortfolioAlbum(models.Model):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="portfolio_albums",
    )
    title = models.CharField(max_length=80)
    description = models.TextField(blank=True)
    style = models.CharField(max_length=80, blank=True)
    cover_image = models.ImageField(
        upload_to="portfolio/albums/",
        blank=True,
        null=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["title"]
        unique_together = ("user", "title")

    def __str__(self):
        return f"{self.title} — {self.user.username}"


class PortfolioWork(models.Model):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="portfolio_works",
    )
    album = models.ForeignKey(
        PortfolioAlbum,
        on_delete=models.SET_NULL,
        related_name="works",
        blank=True,
        null=True,
    )
    image = models.ImageField(upload_to="portfolio/works/")
    title = models.CharField(max_length=120, blank=True)
    description = models.TextField(blank=True)
    style = models.CharField(max_length=80, blank=True)
    body_placement = models.CharField(max_length=80, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "-created_at"]),
        ]

    def __str__(self):
        return self.title or f"Portfolio work #{self.id}"
    
class ChatThread(models.Model):
    participant_one = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="chat_threads_as_one",
    )
    participant_two = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="chat_threads_as_two",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("participant_one", "participant_two")
        ordering = ["-updated_at"]

    def __str__(self):
        return f"Chat: {self.participant_one.username} & {self.participant_two.username}"

    @classmethod
    def get_or_create_for_users(cls, user_a, user_b):
        if user_a == user_b:
            raise ValueError("A user cannot create a chat with themselves.")

        if user_a.id < user_b.id:
            participant_one = user_a
            participant_two = user_b
        else:
            participant_one = user_b
            participant_two = user_a

        thread, created = cls.objects.get_or_create(
            participant_one=participant_one,
            participant_two=participant_two,
        )

        return thread

    def has_user(self, user):
        return user == self.participant_one or user == self.participant_two

    def get_other_user(self, user):
        if user == self.participant_one:
            return self.participant_two

        if user == self.participant_two:
            return self.participant_one

        return None


class ChatMessage(models.Model):
    thread = models.ForeignKey(
        ChatThread,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    sender = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="sent_chat_messages",
    )
    content = models.TextField(max_length=2000, blank=True)
    is_read = models.BooleanField(default=False)

    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(blank=True, null=True)

    is_edited = models.BooleanField(default=False)
    edited_at = models.DateTimeField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
    
class ChatAttachment(models.Model):
    
    MEDIA_TYPE_CHOICES = [
        ("image", "Image"),
        ("video", "Video"),
        ("file", "File"),
    ]
    
    media_type = models.CharField(
        max_length=20,
        choices=MEDIA_TYPE_CHOICES,
        default="file",
    )

    @classmethod
    def detect_media_type(cls, uploaded_file):
        content_type = (getattr(uploaded_file, "content_type", "") or "").lower()
        name = (getattr(uploaded_file, "name", "") or "").lower()

        guessed_type, _ = mimetypes.guess_type(name)
        guessed_type = (guessed_type or "").lower()

        detected_type = content_type or guessed_type

        if detected_type.startswith("image/"):
            return "image"

        if detected_type.startswith("video/"):
            return "video"

        if name.endswith(cls.IMAGE_EXTENSIONS):
            return "image"

        if name.endswith(cls.VIDEO_EXTENSIONS):
            return "video"

        return "file"    
    
    
    message = models.ForeignKey(
        ChatMessage,
        on_delete=models.CASCADE,
        related_name="attachments",
    )
    file = models.FileField(upload_to="chat_attachments/")
    original_name = models.CharField(max_length=255, blank=True, default="")
    content_type = models.CharField(max_length=120, blank=True, default="")
    uploaded_at = models.DateTimeField(auto_now_add=True)

    IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp", ".gif")
    VIDEO_EXTENSIONS = (".mp4", ".webm", ".mov", ".m4v", ".avi", ".mkv")

    def __str__(self):
        return f"Attachment for message {self.message_id}"

    def _sources_for_detection(self):
        sources = [
            self.original_name or "",
            self.file.name or "",
        ]

        try:
            sources.append(self.file.url or "")
        except Exception:
            pass

        return [source.lower().split("?")[0] for source in sources if source]

    @property
    def is_image(self):
        if getattr(self, "media_type", "") == "image":
            return True

        if self.content_type.startswith("image/"):
            return True

        for source in self._sources_for_detection():
            guessed_type, _ = mimetypes.guess_type(source)

            if guessed_type and guessed_type.startswith("image/"):
                return True

            if source.endswith(self.IMAGE_EXTENSIONS):
                return True

        return False

    @property
    def is_video(self):
        if getattr(self, "media_type", "") == "video":
            return True

        if self.content_type.startswith("video/"):
            return True

        for source in self._sources_for_detection():
            guessed_type, _ = mimetypes.guess_type(source)

            if guessed_type and guessed_type.startswith("video/"):
                return True

            if source.endswith(self.VIDEO_EXTENSIONS):
                return True

        return False

    @property
    def media_url(self):
        if not self.file:
            return ""

        if self.is_video and getattr(settings, "USE_CLOUDINARY", False):
            url, _ = cloudinary_url(
                self.file.name,
                resource_type="video",
                secure=True,
            )
            return url

        return self.file.url
    
class UserReport(models.Model):
    REPORT_TYPES = [
        ("bug", _("Bug")),
        ("suggestion", _("Suggestion")),
        ("other", _("Other")),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="reports",
        verbose_name=_("User"),
    )
    report_type = models.CharField(
        _("Report type"),
        max_length=20,
        choices=REPORT_TYPES,
        default="bug",
    )
    title = models.CharField(_("Title"), max_length=120)
    message = models.TextField(_("Message"))
    page_url = models.CharField(_("Page URL"), max_length=500, blank=True)
    attachment = models.FileField(
        _("Attachment"),
        upload_to="reports/",
        blank=True,
        null=True,
    )
    created_at = models.DateTimeField(_("Created at"), auto_now_add=True)
    is_resolved = models.BooleanField(_("Resolved"), default=False)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = _("User report")
        verbose_name_plural = _("User reports")

    def __str__(self):
        return f"{self.get_report_type_display()} — {self.title}"