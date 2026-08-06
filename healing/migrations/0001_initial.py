import django.db.models.deletion
import healing.models
import mytattooapp.storage_backends
import uuid
from django.conf import settings
from django.db import migrations, models
from django.utils import timezone


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("appointments", "0008_private_reference_images"),
    ]

    operations = [
        migrations.CreateModel(
            name="HealingJourney",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("title", models.CharField(blank=True, max_length=160)),
                ("started_on", models.DateField()),
                ("status", models.CharField(choices=[("active", "Active"), ("healed", "Healed"), ("archived", "Archived")], default="active", max_length=16)),
                ("healed_on", models.DateField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("appointment", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="healing_journey", to="appointments.appointment")),
                ("artist", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="healing_journeys_as_artist", to=settings.AUTH_USER_MODEL)),
                ("client", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="healing_journeys_as_client", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ("-started_on", "-created_at")},
        ),
        migrations.CreateModel(
            name="HealingCheckIn",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("day_number", models.PositiveSmallIntegerField()),
                ("photo", models.ImageField(storage=mytattooapp.storage_backends.PrivateMediaStorage(), upload_to=healing.models.healing_checkin_upload_path)),
                ("note", models.CharField(blank=True, max_length=1000)),
                ("symptoms", models.JSONField(blank=True, default=list)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("journey", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="checkins", to="healing.healingjourney")),
            ],
            options={"ordering": ("day_number", "created_at")},
        ),
        migrations.CreateModel(
            name="HealingRoutineCompletion",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("date", models.DateField(default=timezone.localdate)),
                ("task_slug", models.CharField(choices=[("wash", "Wash gently"), ("moisturize", "Moisturize"), ("sun", "Avoid direct sun"), ("friction", "Avoid friction")], max_length=24)),
                ("completed_at", models.DateTimeField(auto_now_add=True)),
                ("journey", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="routine_completions", to="healing.healingjourney")),
            ],
            options={"ordering": ("-date", "task_slug")},
        ),
        migrations.AddIndex(
            model_name="healingjourney",
            index=models.Index(fields=["client", "status", "-started_on"], name="healing_hea_client__e92473_idx"),
        ),
        migrations.AddIndex(
            model_name="healingjourney",
            index=models.Index(fields=["artist", "status", "-started_on"], name="healing_hea_artist__83182f_idx"),
        ),
        migrations.AddConstraint(
            model_name="healingcheckin",
            constraint=models.UniqueConstraint(fields=("journey", "day_number"), name="unique_healing_checkin_day"),
        ),
        migrations.AddIndex(
            model_name="healingroutinecompletion",
            index=models.Index(fields=["journey", "-date"], name="healing_hea_journey_ac79be_idx"),
        ),
        migrations.AddConstraint(
            model_name="healingroutinecompletion",
            constraint=models.UniqueConstraint(fields=("journey", "date", "task_slug"), name="unique_healing_routine_task_day"),
        ),
    ]
