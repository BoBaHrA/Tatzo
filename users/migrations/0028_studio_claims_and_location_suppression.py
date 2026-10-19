from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.core.validators
import users.models
import mytattooapp.storage_backends


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0027_alter_notification_kind"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="location", name="is_suppressed",
            field=models.BooleanField(default=False, db_index=True),
        ),
        migrations.AddField(
            model_name="location", name="suppressed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="location", name="suppression_reason",
            field=models.CharField(blank=True, max_length=300),
        ),
        migrations.AddField(
            model_name="location", name="suppressed_by",
            field=models.ForeignKey(
                to=settings.AUTH_USER_MODEL, on_delete=django.db.models.deletion.SET_NULL,
                blank=True, null=True, related_name="suppressed_locations",
            ),
        ),
        migrations.AddField(
            model_name="location", name="studio_owner",
            field=models.ForeignKey(
                to=settings.AUTH_USER_MODEL, on_delete=django.db.models.deletion.SET_NULL,
                blank=True, null=True, related_name="owned_studios",
            ),
        ),
        migrations.AlterField(
            model_name="locationclaim", name="status",
            field=models.CharField(max_length=30, default="draft", choices=[
                ("draft", "Draft"), ("submitted", "Submitted"),
                ("under_review", "Under review"), ("awaiting_email", "Awaiting email confirmation"),
                ("awaiting_account", "Verified, awaiting account connection"),
                ("needs_information", "Needs additional information"),
                ("approved", "Approved"), ("rejected", "Rejected"),
            ]),
        ),
        migrations.AddField(model_name="locationclaim", name="email_verified_at",
                            field=models.DateTimeField(null=True, blank=True)),
        migrations.AddField(model_name="locationclaim", name="evidence_verified_at",
                            field=models.DateTimeField(null=True, blank=True)),
        migrations.AddField(model_name="locationclaim", name="reviewed_at",
                            field=models.DateTimeField(null=True, blank=True)),
        migrations.AddField(model_name="locationclaim", name="decision",
                            field=models.CharField(max_length=300, blank=True)),
        migrations.AddField(
            model_name="locationclaim", name="reviewed_by",
            field=models.ForeignKey(
                to=settings.AUTH_USER_MODEL, null=True, blank=True,
                on_delete=django.db.models.deletion.SET_NULL, related_name="reviewed_studio_claims",
            ),
        ),
        migrations.CreateModel(
            name="LocationCorrectionRequest",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False, auto_created=True, verbose_name="ID")),
                ("reporter_name", models.CharField(max_length=160)),
                ("contact_email", models.EmailField(max_length=254)),
                ("reason", models.CharField(max_length=20, choices=[
                    ("closed", "Business permanently closed"), ("moved", "Business moved"),
                    ("address", "Incorrect address"), ("duplicate", "Duplicate listing"),
                    ("nonexistent", "Business does not exist"), ("other", "Other"),
                ])),
                ("explanation", models.TextField(blank=True)),
                ("new_address", models.CharField(max_length=255, blank=True)),
                ("supporting_file", models.FileField(
                    upload_to="location_correction_proofs/",
                    storage=mytattooapp.storage_backends.private_media_storage,
                    blank=True, validators=[
                        django.core.validators.FileExtensionValidator(allowed_extensions=["pdf","jpg","jpeg","png","webp"]),
                        users.models.validate_location_upload_size,
                    ],
                )),
                ("status", models.CharField(max_length=30, default="submitted", choices=[
                    ("submitted","Submitted"),("under_review","Under review"),
                    ("needs_information","Needs information"),("approved","Approved"),("rejected","Rejected"),
                ])),
                ("admin_notes", models.TextField(blank=True)),
                ("reviewed_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("location", models.ForeignKey(to="users.location", related_name="correction_requests",
                    on_delete=django.db.models.deletion.PROTECT)),
                ("reviewed_by", models.ForeignKey(to=settings.AUTH_USER_MODEL,
                    on_delete=django.db.models.deletion.SET_NULL, null=True, blank=True,
                    related_name="reviewed_location_corrections")),
            ],
            options={"ordering":["-created_at"]},
        ),
        migrations.AddIndex(
            model_name="locationcorrectionrequest",
            index=models.Index(fields=["status","created_at"], name="users_loccor_status_idx"),
        ),
        migrations.CreateModel(
            name="LocationSuppression",
            fields=[
                ("id",models.BigAutoField(primary_key=True, serialize=False, auto_created=True, verbose_name="ID")),
                ("source",models.CharField(max_length=30)),
                ("source_place_id",models.CharField(max_length=255, blank=True)),
                ("fingerprint",models.CharField(max_length=64, blank=True, db_index=True)),
                ("created_at",models.DateTimeField(auto_now_add=True)),
                ("location",models.ForeignKey(to="users.location", related_name="import_suppressions",
                    on_delete=django.db.models.deletion.CASCADE)),
            ],
        ),
        migrations.AddConstraint(
            model_name="locationsuppression",
            constraint=models.UniqueConstraint(fields=("location","source","source_place_id"),
                name="unique_location_import_tombstone"),
        ),
    ]
