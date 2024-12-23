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

class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    account_type = models.CharField(max_length=20, choices=USER_TYPE_CHOICES, default='regular')
    bio = models.TextField(blank=True, null=True)
    profile_image = models.ImageField(upload_to='profile_images/', blank=True, null=True)
    verification_status = models.CharField(max_length=20, choices=VERIFICATION_STATUS_CHOICES, default='pending')
    last_notification = models.CharField(max_length=20, blank=True, null=True, choices=NOTIFICATION_CHOICES)

    def __str__(self):
        return f"{self.user.username} ({self.get_account_type_display()})"


class VerificationDocument(models.Model):
    DOCUMENT_TYPE_CHOICES = [
        ('certificate', 'Certificate of Qualification'),
        ('license', 'License'),
        ('registration', 'Registration Document'),
    ]
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    document_type = models.CharField(max_length=20, choices=DOCUMENT_TYPE_CHOICES)
    document_file = models.FileField(upload_to='verification_documents/')
    created_at = models.DateTimeField(auto_now_add=True)
    is_verified = models.BooleanField(default=False)
    identity_document = models.FileField(upload_to='identity_documents/', blank=True, null=True)

class Post(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Post by {self.user.username}"
