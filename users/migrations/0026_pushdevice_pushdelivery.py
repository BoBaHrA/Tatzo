import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0025_notification"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PushDevice",
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
                ("installation_id", models.UUIDField(unique=True)),
                ("expo_push_token", models.CharField(max_length=255, unique=True)),
                (
                    "platform",
                    models.CharField(
                        choices=[("ios", "iOS"), ("android", "Android")],
                        max_length=12,
                    ),
                ),
                ("locale", models.CharField(default="en", max_length=8)),
                ("app_version", models.CharField(blank=True, max_length=32)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("last_seen_at", models.DateTimeField(auto_now=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="push_devices",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ("-last_seen_at", "-id"),
                "indexes": [
                    models.Index(
                        fields=["user", "is_active"],
                        name="users_push_user_active_idx",
                    )
                ],
            },
        ),
        migrations.CreateModel(
            name="PushDelivery",
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
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "Pending"),
                            ("retry", "Retry"),
                            ("sent", "Sent"),
                            ("delivered", "Delivered"),
                            ("failed", "Failed"),
                        ],
                        default="pending",
                        max_length=12,
                    ),
                ),
                ("attempt_count", models.PositiveSmallIntegerField(default=0)),
                ("next_attempt_at", models.DateTimeField(blank=True, null=True)),
                (
                    "ticket_id",
                    models.CharField(blank=True, db_index=True, max_length=80),
                ),
                ("last_error", models.CharField(blank=True, max_length=500)),
                ("sent_at", models.DateTimeField(blank=True, null=True)),
                ("receipt_checked_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "device",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="deliveries",
                        to="users.pushdevice",
                    ),
                ),
                (
                    "notification",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="push_deliveries",
                        to="users.notification",
                    ),
                ),
            ],
            options={
                "ordering": ("created_at", "id"),
                "indexes": [
                    models.Index(
                        fields=["status", "next_attempt_at", "created_at"],
                        name="users_push_status_retry_idx",
                    )
                ],
                "constraints": [
                    models.UniqueConstraint(
                        fields=("notification", "device"),
                        name="users_push_notif_device_uniq",
                    )
                ],
            },
        ),
    ]
