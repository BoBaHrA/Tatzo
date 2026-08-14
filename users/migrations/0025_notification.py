import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("appointments", "0008_private_reference_images"),
        ("posts", "0007_commentreport_is_resolved_commentreport_resolved_at_and_more"),
        ("users", "0024_add_profile_timezone"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Notification",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "kind",
                    models.CharField(
                        choices=[
                            ("follow", "Follow"),
                            ("post_like", "Post like"),
                            ("post_comment", "Post comment"),
                            ("comment_reply", "Comment reply"),
                            ("chat_message", "Chat message"),
                            ("booking_request", "Booking request"),
                            ("booking_update", "Booking update"),
                        ],
                        max_length=32,
                    ),
                ),
                ("dedupe_key", models.CharField(max_length=120)),
                ("is_read", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("read_at", models.DateTimeField(blank=True, null=True)),
                (
                    "actor",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="triggered_notifications",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "appointment",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="+",
                        to="appointments.appointment",
                    ),
                ),
                (
                    "comment",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="+",
                        to="posts.postcomment",
                    ),
                ),
                (
                    "message",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="+",
                        to="users.chatmessage",
                    ),
                ),
                (
                    "post",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="+",
                        to="posts.post",
                    ),
                ),
                (
                    "recipient",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="notifications",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "thread",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="+",
                        to="users.chatthread",
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at", "-id"],
                "indexes": [
                    models.Index(
                        fields=["recipient", "is_read", "-created_at"],
                        name="users_notif_rec_read_idx",
                    ),
                    models.Index(
                        fields=["recipient", "-created_at"],
                        name="users_notif_rec_date_idx",
                    ),
                ],
                "constraints": [
                    models.UniqueConstraint(
                        fields=("recipient", "dedupe_key"),
                        name="users_notif_rec_dedupe_uniq",
                    )
                ],
            },
        )
    ]
