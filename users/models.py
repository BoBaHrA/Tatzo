from django.db import models
from django.contrib.auth.models import User

# Определяем варианты выбора для типа пользователя
USER_TYPE_CHOICES = [
    ('regular', 'Regular User'),
    ('tattoo_artist', 'Tattoo Artist'),
]

NOTIFICATION_CHOICES = [
    ('approved', 'Congratulations, your tattoo artist account has been verified.'),
    ('rejected', 'Unfortunately, your tattoo artist account has not been verified. Contact tech. support for more information.'),
]

VERIFICATION_STATUS_CHOICES = [
    ('pending', 'Pending'),
    ('approved', 'Approved'),
    ('rejected', 'Rejected'),
]

# Варианты документов для подтверждения бизнеса
BUSINESS_DOCUMENT_CHOICES = [
    ('license', 'Лицензия на деятельность'),
    ('sole_proprietor', 'Свидетельство самозанятого'),
    ('business_registration', 'Регистрация тату-салона'),
    ('other', 'Другой (Загрузите официальный документ)'),
]

# Варианты удостоверений личности
ID_DOCUMENT_CHOICES = [
    ('passport', 'Паспорт'),
    ('driver_license', 'Водительское удостоверение'),
    ('national_id', 'Национальное удостоверение личности'),
]

class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    account_type = models.CharField(max_length=20, choices=USER_TYPE_CHOICES)
    status = models.CharField(max_length=20, default='pending', choices=[('pending', 'На проверке'), ('active', 'Активный')])
    bio = models.TextField(blank=True, null=True)
    profile_image = models.ImageField(upload_to='profile_images/', blank=True, null=True)
    verification_status = models.CharField(max_length=20, default='pending', choices=[('pending', 'На проверке'), ('approved', 'Одобрен'), ('rejected', 'Отклонён')])
    is_email_verified = models.BooleanField(default=False)


    def __str__(self):
        return f"{self.user.username} - {self.account_type}"



class VerificationDocument(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)

    # Документ о бизнесе (обязательный)
    business_document_type = models.CharField(
        max_length=50, choices=BUSINESS_DOCUMENT_CHOICES, verbose_name="Тип бизнес-документа"
    )
    business_document_file = models.FileField(
        upload_to='business_docs/', verbose_name="Документ о бизнесе"
    )

    # Документ, удостоверяющий личность (обязательный)
    id_document_type = models.CharField(
        max_length=50, choices=ID_DOCUMENT_CHOICES, verbose_name="Тип документа личности"
    )
    id_document_file = models.FileField(
        upload_to='id_docs/', verbose_name="Документ удостоверяющий личность"
    )

    # Статус верификации
    is_verified = models.BooleanField(default=False, verbose_name="Документ проверен")

    def __str__(self):
        return f"Verification for {self.user.username}"
    
class Post(models.Model):
    LAYOUT_CHOICES = [
        ('grid', 'Grid'),
        ('carousel', 'Carousel'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE)
    content = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    disable_comments = models.BooleanField(default=False)
    is_ad = models.BooleanField(default=False)
    visibility = models.CharField(
        max_length=12,
        choices=[('public','Public'),('followers','Followers'),('private','Private')],
        default='public'
    )
    location = models.CharField(max_length=120, blank=True)

    layout = models.CharField(max_length=10, choices=LAYOUT_CHOICES, default='grid')  # ✅ ВОТ ЭТО

    def __str__(self):
        return f"Post by {self.user.username}"

# ↓↓↓ ДОБАВЬ ЭТО В КОНЕЦ users/models.py ↓↓↓
def post_media_upload_path(instance, filename):
    return f"posts/{instance.post.id}/{filename}"

class PostMedia(models.Model):
    IMAGE = 'image'
    VIDEO = 'video'
    TYPE_CHOICES = [(IMAGE, 'Image'), (VIDEO, 'Video')]

    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='medias')
    file = models.FileField(upload_to=post_media_upload_path)
    media_type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    order = models.PositiveIntegerField(default=0)  # ✅ чтобы фиксировать порядок

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f"{self.media_type} for Post #{self.post.id}"