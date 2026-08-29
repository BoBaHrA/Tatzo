from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0008_private_reference_images"),
    ]

    operations = [
        migrations.AddField(
            model_name="appointment",
            name="client_rating",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
    ]
