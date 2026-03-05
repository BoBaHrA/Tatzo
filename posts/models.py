from django.conf import settings
from django.db import models


# Create your models here.

class Post(models.Model):
    LAYOUT_CHOICES = [
        ("grid", "Grid"),
        ("carousel", "Carousel"),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    content = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    disable_comments = models.BooleanField(default=False)
    is_ad = models.BooleanField(default=False)
    visibility = models.CharField(
        max_length=12,
        choices=[
            ("public", "Public"),
            ("followers", "Followers"),
            ("private", "Private"),
        ],
        default="public",
    )
    location = models.CharField(max_length=120, blank=True)

    layout = models.CharField(
        max_length=10, choices=LAYOUT_CHOICES, default="grid"
    )  # ✅ ВОТ ЭТО

    def __str__(self):
        return f"Post by {self.user.username}"


# ↓↓↓ ДОБАВЬ ЭТО В КОНЕЦ users/models.py ↓↓↓
def post_media_upload_path(instance, filename):
    return f"posts/{instance.post.id}/{filename}"


class PostMedia(models.Model):
    IMAGE = "image"
    VIDEO = "video"
    TYPE_CHOICES = [(IMAGE, "Image"), (VIDEO, "Video")]

    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="medias")
    file = models.FileField(upload_to=post_media_upload_path)
    media_type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    order = models.PositiveIntegerField(default=0)  # ✅ чтобы фиксировать порядок

    class Meta:
        ordering = ["order"]

    def __str__(self):
        return f"{self.media_type} for Post #{self.post.id}"
