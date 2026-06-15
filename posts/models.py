from django.conf import settings
from django.db import models
from django.utils import timezone

from cloudinary.utils import cloudinary_url

# Create your models here.

class Post(models.Model):
    LAYOUT_CHOICES = [
        ("grid", "Grid"),
        ("carousel", "Carousel"),
    ]

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["-created_at"]),
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
    
    @property
    def media_url(self):
        if not self.file:
            return ""

        if self.media_type == "video":
            url, _ = cloudinary_url(
                self.file.name,
                resource_type="video",
                format="mp4",
                secure=True,
            )
            return url

        return self.file.url
    
class PostLike(models.Model):
    post = models.ForeignKey(
        "Post",
        on_delete=models.CASCADE,
        related_name="likes"
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("post", "user")

    def __str__(self):
        return f"{self.user} liked {self.post_id}"
    
class PostComment(models.Model):
    post = models.ForeignKey(
        "Post",
        on_delete=models.CASCADE,
        related_name="comments"
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE
    )

    content = models.TextField()

    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="replies"
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"Comment by {self.user} on post {self.post_id}"
    
    def likes_count(self):
        return self.likes.count()
    
class CommentLike(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    comment = models.ForeignKey(PostComment, on_delete=models.CASCADE, related_name='likes')

    class Meta:
        unique_together = ('user', 'comment')
        
class CommentReport(models.Model):
    comment = models.ForeignKey(
        PostComment,
        on_delete=models.CASCADE,
        related_name="reports"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE
    )
    reason = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    is_resolved = models.BooleanField(default=False)
    resolved_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        unique_together = ("comment", "user")

    def __str__(self):
        return f"{self.user} reported comment {self.comment_id}"

class PostReport(models.Model):
    post = models.ForeignKey(
        Post,
        on_delete=models.CASCADE,
        related_name="reports"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE
    )
    reason = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    is_resolved = models.BooleanField(default=False)
    resolved_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        unique_together = ("post", "user")

    def __str__(self):
        return f"{self.user} reported post {self.post_id}"
    
class PostBookmark(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="post_bookmarks",
    )
    post = models.ForeignKey(
        Post,
        on_delete=models.CASCADE,
        related_name="bookmarks",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "post")
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user} bookmarked {self.post_id}"