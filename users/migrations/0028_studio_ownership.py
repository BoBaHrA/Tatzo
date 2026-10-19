import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0027_alter_notification_kind"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="location",
            name="studio_owner",
            field=models.ForeignKey(
                to=settings.AUTH_USER_MODEL,
                on_delete=django.db.models.deletion.SET_NULL,
                null=True, blank=True, related_name="owned_studios",
                help_text="Reviewed owner of this studio; independent from linked tattoo artists.",
            ),
        ),
        migrations.AlterField(
            model_name="location",
            name="status",
            field=models.CharField(
                max_length=30, default="imported",
                choices=[
                    ("imported", "Imported"), ("unclaimed", "Unclaimed"),
                    ("pending_claim", "Pending claim"), ("claimed", "Claimed"),
                    ("verified", "Verified"), ("rejected", "Rejected"),
                    ("removed", "Removed from public maps"),
                ],
            ),
        ),
        migrations.AddField(
            model_name="locationrequest", name="requested_by",
            field=models.ForeignKey(to=settings.AUTH_USER_MODEL, on_delete=django.db.models.deletion.SET_NULL, null=True, blank=True, related_name="submitted_location_requests"),
        ),
        migrations.AddField(
            model_name="locationrequest", name="wants_ownership",
            field=models.BooleanField(default=False, help_text="Applicant asks to manage this new location after staff review."),
        ),
        migrations.AddField(
            model_name="locationrequest", name="approved_location",
            field=models.ForeignKey(to="users.location", on_delete=django.db.models.deletion.SET_NULL, null=True, blank=True, related_name="approved_from_requests"),
        ),
        migrations.AddField(
            model_name="locationrequest", name="reviewed_by",
            field=models.ForeignKey(to=settings.AUTH_USER_MODEL, on_delete=django.db.models.deletion.SET_NULL, null=True, blank=True, related_name="reviewed_location_requests"),
        ),
        migrations.AddField(
            model_name="locationrequest", name="reviewed_at",
            field=models.DateTimeField(null=True, blank=True),
        ),
        migrations.AddField(
            model_name="locationclaim", name="reviewed_by",
            field=models.ForeignKey(to=settings.AUTH_USER_MODEL, on_delete=django.db.models.deletion.SET_NULL, null=True, blank=True, related_name="reviewed_location_claims"),
        ),
        migrations.AddField(
            model_name="locationclaim", name="reviewed_at",
            field=models.DateTimeField(null=True, blank=True),
        ),
        migrations.CreateModel(
            name="LocationOwnershipAudit",
            fields=[
                ("id", models.AutoField(primary_key=True, serialize=False, auto_created=True)),
                ("decision", models.CharField(max_length=40)),
                ("source", models.CharField(max_length=40)),
                ("source_id", models.PositiveIntegerField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("actor", models.ForeignKey(to=settings.AUTH_USER_MODEL, on_delete=django.db.models.deletion.SET_NULL, null=True, related_name="+")),
                ("previous_owner", models.ForeignKey(to=settings.AUTH_USER_MODEL, on_delete=django.db.models.deletion.SET_NULL, null=True, blank=True, related_name="+")),
                ("new_owner", models.ForeignKey(to=settings.AUTH_USER_MODEL, on_delete=django.db.models.deletion.SET_NULL, null=True, blank=True, related_name="+")),
                ("location", models.ForeignKey(to="users.location", on_delete=django.db.models.deletion.CASCADE, related_name="ownership_audit")),
            ],
            options={"ordering": ["-created_at"]},
        ),
    ]
