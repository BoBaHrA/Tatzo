import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0029_studio_ownership"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="LocationRemovalRequest",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("reporter_name", models.CharField(max_length=160)),
                ("contact_email", models.EmailField(max_length=254)),
                ("reason", models.TextField()),
                ("evidence_url", models.URLField(blank=True, max_length=500)),
                ("status", models.CharField(
                    choices=[("submitted", "Submitted"), ("approved", "Approved"), ("rejected", "Rejected")],
                    default="submitted", max_length=30,
                )),
                ("reviewed_at", models.DateTimeField(blank=True, null=True)),
                ("admin_notes", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("location", models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name="removal_requests", to="users.location",
                )),
                ("reporter_user", models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name="submitted_location_removal_requests", to=settings.AUTH_USER_MODEL,
                )),
                ("reviewed_by", models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name="reviewed_location_removal_requests", to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.AddIndex(
            model_name="locationremovalrequest",
            index=models.Index(fields=["status", "created_at"], name="users_locrem_status_3ab49_idx"),
        ),
    ]
