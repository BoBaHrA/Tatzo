from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("appointments", "0008_private_reference_images"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ArtistStripeAccount",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("stripe_account_id", models.CharField(max_length=255, unique=True)),
                ("charges_enabled", models.BooleanField(default=False)),
                ("payouts_enabled", models.BooleanField(default=False)),
                ("details_submitted", models.BooleanField(default=False)),
                ("last_synced_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "artist",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="stripe_connect_account",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"ordering": ["artist_id"]},
        ),
        migrations.CreateModel(
            name="AppointmentDeposit",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("amount", models.DecimalField(decimal_places=2, max_digits=8)),
                ("currency", models.CharField(default="eur", max_length=3)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("pending", "Pending"),
                            ("checkout_created", "Checkout created"),
                            ("paid", "Paid"),
                            ("failed", "Failed"),
                            ("refunded", "Refunded"),
                            ("cancelled", "Cancelled"),
                            ("expired", "Expired"),
                        ],
                        default="pending",
                        max_length=24,
                    ),
                ),
                ("connected_account_id", models.CharField(max_length=255)),
                ("checkout_session_id", models.CharField(blank=True, max_length=255)),
                ("payment_intent_id", models.CharField(blank=True, max_length=255)),
                ("last_stripe_event_id", models.CharField(blank=True, max_length=255)),
                ("expires_at", models.DateTimeField(blank=True, null=True)),
                ("paid_at", models.DateTimeField(blank=True, null=True)),
                ("refunded_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "appointment",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="deposit",
                        to="appointments.appointment",
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
                "indexes": [
                    models.Index(fields=["status", "expires_at"], name="payments_ap_status_752624_idx"),
                    models.Index(fields=["connected_account_id"], name="payments_ap_connect_d699a0_idx"),
                ],
            },
        ),
    ]
