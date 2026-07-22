import mytattooapp.storage_backends
from django.conf import settings
from django.db import migrations, models


def migrate_existing_reference_images(apps, schema_editor):
    if not getattr(settings, "USE_CLOUDINARY", False):
        return

    public_storage = mytattooapp.storage_backends.TatzoMediaCloudinaryStorage()
    private_storage = mytattooapp.storage_backends.PrivateMediaStorage()
    reference_model = apps.get_model("appointments", "AppointmentReferenceImage")
    for item in reference_model.objects.exclude(image="").iterator():
        old_name = item.image.name
        with public_storage.open(old_name, "rb") as source:
            new_name = private_storage.save(old_name, source)
        reference_model.objects.filter(pk=item.pk).update(image=new_name)
        public_storage.delete(old_name)


class Migration(migrations.Migration):
    dependencies = [("appointments", "0007_merge_0003_appointment_consultation_already_completed_and_more_0006_calendarevent_calendarreschedulerequest_and_more")]

    operations = [
        migrations.AlterField(
            model_name="appointmentreferenceimage",
            name="image",
            field=models.ImageField(
                storage=mytattooapp.storage_backends.PrivateMediaStorage(),
                upload_to="appointments/references/",
            ),
        ),
        migrations.RunPython(migrate_existing_reference_images, migrations.RunPython.noop),
    ]
