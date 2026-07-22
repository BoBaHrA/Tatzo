import django.core.validators
import mytattooapp.storage_backends
import users.models
from django.conf import settings
from django.db import migrations, models


def migrate_existing_private_files(apps, schema_editor):
    if not getattr(settings, "USE_CLOUDINARY", False):
        return

    public_storage = mytattooapp.storage_backends.TatzoMediaCloudinaryStorage()
    private_storage = mytattooapp.storage_backends.PrivateMediaStorage()
    fields = {
        "VerificationDocument": ("business_document_file", "id_document_file"),
        "ManualVerificationRequest": ("extra_file",),
        "ChatAttachment": ("file",),
        "UserReport": ("attachment",),
        "LocationClaim": ("proof_document",),
        "LocationRequest": ("supporting_file",),
    }

    for model_name, field_names in fields.items():
        model = apps.get_model("users", model_name)
        for item in model.objects.all().iterator():
            updates = {}
            for field_name in field_names:
                old_name = getattr(item, field_name).name
                if not old_name:
                    continue
                with public_storage.open(old_name, "rb") as source:
                    updates[field_name] = private_storage.save(old_name, source)
                public_storage.delete(old_name)
            if updates:
                model.objects.filter(pk=item.pk).update(**updates)


class Migration(migrations.Migration):
    dependencies = [("users", "0022_locationclaim_proof_document_and_more")]

    operations = [
        migrations.AlterField(
            model_name="chatattachment",
            name="file",
            field=models.FileField(
                storage=mytattooapp.storage_backends.PrivateMediaStorage(),
                upload_to="chat_attachments/",
            ),
        ),
        migrations.AlterField(
            model_name="locationclaim",
            name="proof_document",
            field=models.FileField(
                blank=True,
                storage=mytattooapp.storage_backends.PrivateMediaStorage(),
                upload_to="location_claim_proofs/",
                validators=[
                    django.core.validators.FileExtensionValidator(
                        allowed_extensions=["pdf", "jpg", "jpeg", "png", "webp"]
                    ),
                    users.models.validate_location_upload_size,
                ],
            ),
        ),
        migrations.AlterField(
            model_name="locationrequest",
            name="supporting_file",
            field=models.FileField(
                blank=True,
                storage=mytattooapp.storage_backends.PrivateMediaStorage(),
                upload_to="location_request_supporting_files/",
                validators=[
                    django.core.validators.FileExtensionValidator(
                        allowed_extensions=["pdf", "jpg", "jpeg", "png", "webp"]
                    ),
                    users.models.validate_location_upload_size,
                ],
            ),
        ),
        migrations.AlterField(
            model_name="manualverificationrequest",
            name="extra_file",
            field=models.FileField(
                blank=True,
                null=True,
                storage=mytattooapp.storage_backends.PrivateMediaStorage(),
                upload_to="manual_review_files/",
                verbose_name="Optional file",
            ),
        ),
        migrations.AlterField(
            model_name="userreport",
            name="attachment",
            field=models.FileField(
                blank=True,
                null=True,
                storage=mytattooapp.storage_backends.PrivateMediaStorage(),
                upload_to="reports/",
                verbose_name="Attachment",
            ),
        ),
        migrations.AlterField(
            model_name="verificationdocument",
            name="business_document_file",
            field=models.FileField(
                storage=mytattooapp.storage_backends.PrivateMediaStorage(),
                upload_to="business_docs",
                verbose_name="Business document",
            ),
        ),
        migrations.AlterField(
            model_name="verificationdocument",
            name="id_document_file",
            field=models.FileField(
                storage=mytattooapp.storage_backends.PrivateMediaStorage(),
                upload_to="id_docs",
                verbose_name="Identity document",
            ),
        ),
        migrations.RunPython(migrate_existing_private_files, migrations.RunPython.noop),
    ]
