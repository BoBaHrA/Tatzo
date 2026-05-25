import re

from django.contrib.auth.models import User
from django.db import models

# Определяем варианты выбора для типа пользователя
USER_TYPE_CHOICES = [
    ("regular", "Regular User"),
    ("tattoo_artist", "Tattoo Artist"),
]

NOTIFICATION_CHOICES = [
    ("approved", "Congratulations, your tattoo artist account has been verified."),
    (
        "rejected",
        "Unfortunately, your tattoo artist account has not been verified. Contact tech. support for more information.",
    ),
]

VERIFICATION_STATUS_CHOICES = [
    ("not_submitted", "Not submitted"),
    ("pending_documents", "Pending documents review"),
    ("pending_manual_review", "Pending manual review"),
    ("pending", "Pending"),  # legacy, чтобы старые аккаунты не сломались
    ("approved", "Approved"),
    ("rejected", "Rejected"),
]

# Варианты документов для подтверждения бизнеса
BUSINESS_DOCUMENT_CHOICES = [
    ("license", "Лицензия на деятельность"),
    ("sole_proprietor", "Свидетельство самозанятого"),
    ("business_registration", "Регистрация тату-салона"),
    ("other", "Другой (Загрузите официальный документ)"),
]

# Варианты удостоверений личности
ID_DOCUMENT_CHOICES = [
    ("passport", "Паспорт"),
    ("driver_license", "Водительское удостоверение"),
    ("national_id", "Национальное удостоверение личности"),
]


class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    account_type = models.CharField(max_length=20, choices=USER_TYPE_CHOICES)
    status = models.CharField(
        max_length=20,
        default="pending",
        choices=[("pending", "На проверке"), ("active", "Активный")],
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
            return "Pending verification"

        if self.verification_status == "approved":
            return "Verified"

        if self.verification_status == "rejected":
            return "Verification rejected"

        return "Not submitted"


class VerificationDocument(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)

    # Документ о бизнесе (обязательный)
    business_document_type = models.CharField(
        max_length=50,
        choices=BUSINESS_DOCUMENT_CHOICES,
        verbose_name="Тип бизнес-документа",
    )
    business_document_file = models.FileField(
        upload_to="business_docs/", verbose_name="Документ о бизнесе"
    )

    # Документ, удостоверяющий личность (обязательный)
    id_document_type = models.CharField(
        max_length=50,
        choices=ID_DOCUMENT_CHOICES,
        verbose_name="Тип документа личности",
    )
    id_document_file = models.FileField(
        upload_to="id_docs/", verbose_name="Документ удостоверяющий личность"
    )

    # Статус верификации
    is_verified = models.BooleanField(default=False, verbose_name="Документ проверен")

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
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"Message from {self.sender.username} in chat {self.thread_id}"
    
class ChatAttachment(models.Model):
    message = models.ForeignKey(
        ChatMessage,
        on_delete=models.CASCADE,
        related_name="attachments",
    )
    file = models.FileField(upload_to="chat_attachments/")
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Attachment for message {self.message_id}"

    @property
    def is_image(self):
        name = self.file.name.lower()
        return name.endswith((".jpg", ".jpeg", ".png", ".webp", ".gif"))

    @property
    def is_video(self):
        name = self.file.name.lower()
        return name.endswith((".mp4", ".webm", ".mov"))