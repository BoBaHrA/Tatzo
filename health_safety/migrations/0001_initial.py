import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("appointments", "0008_private_reference_images"),
    ]

    operations = [
        migrations.CreateModel(
            name="HealthSafetyCard",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("bleeding_clotting_condition", models.BooleanField(default=False)),
                ("blood_thinning_medication", models.BooleanField(default=False)),
                ("diabetes_or_blood_sugar_condition", models.BooleanField(default=False)),
                ("relevant_skin_condition", models.BooleanField(default=False)),
                ("relevant_allergy_sensitivity", models.BooleanField(default=False)),
                ("immune_or_healing_condition", models.BooleanField(default=False)),
                ("other_relevant_information", models.TextField(blank=True, max_length=1000)),
                ("explicit_storage_consent", models.BooleanField(default=False)),
                ("consent_version", models.CharField(default="2026-08", max_length=20)),
                ("consented_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "user",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="health_safety_card",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"ordering": ["-updated_at"]},
        ),
        migrations.CreateModel(
            name="HealthSafetyShare",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("granted_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("revoked_at", models.DateTimeField(blank=True, null=True)),
                (
                    "appointment",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="health_safety_share",
                        to="appointments.appointment",
                    ),
                ),
                (
                    "card",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="shares",
                        to="health_safety.healthsafetycard",
                    ),
                ),
            ],
            options={"ordering": ["-granted_at"]},
        ),
        migrations.CreateModel(
            name="HealthSafetyShareIntent",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("appointment_date", models.DateField()),
                ("start_time", models.TimeField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "artist",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="incoming_health_share_intents",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "client",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="health_share_intents",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
        migrations.AddConstraint(
            model_name="healthsafetyshareintent",
            constraint=models.UniqueConstraint(
                fields=("client", "artist", "appointment_date", "start_time"),
                name="unique_health_share_intent_slot",
            ),
        ),
        migrations.AddIndex(
            model_name="healthsafetyshareintent",
            index=models.Index(
                fields=["client", "artist", "appointment_date", "start_time"],
                name="health_intent_slot_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="healthsafetyshareintent",
            index=models.Index(fields=["created_at"], name="health_intent_created_idx"),
        ),
    ]
