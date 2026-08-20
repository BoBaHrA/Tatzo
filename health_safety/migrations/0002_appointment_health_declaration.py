from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ("appointments", "0008_private_reference_images"),
        ("health_safety", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="healthsafetyshareintent",
            name="source",
            field=models.CharField(
                choices=[("card", "Saved card"), ("quick", "One-time declaration")],
                default="card",
                max_length=12,
            ),
        ),
        migrations.AddField(
            model_name="healthsafetyshareintent",
            name="bleeding_clotting_condition",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="healthsafetyshareintent",
            name="blood_thinning_medication",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="healthsafetyshareintent",
            name="diabetes_or_blood_sugar_condition",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="healthsafetyshareintent",
            name="relevant_skin_condition",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="healthsafetyshareintent",
            name="relevant_allergy_sensitivity",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="healthsafetyshareintent",
            name="immune_or_healing_condition",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="healthsafetyshareintent",
            name="other_relevant_information",
            field=models.TextField(blank=True, max_length=1000),
        ),
        migrations.AddField(
            model_name="healthsafetyshareintent",
            name="confirmed_none",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="healthsafetyshareintent",
            name="save_to_card",
            field=models.BooleanField(default=False),
        ),
        migrations.CreateModel(
            name="AppointmentHealthDeclaration",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("bleeding_clotting_condition", models.BooleanField(default=False)),
                ("blood_thinning_medication", models.BooleanField(default=False)),
                ("diabetes_or_blood_sugar_condition", models.BooleanField(default=False)),
                ("relevant_skin_condition", models.BooleanField(default=False)),
                ("relevant_allergy_sensitivity", models.BooleanField(default=False)),
                ("immune_or_healing_condition", models.BooleanField(default=False)),
                ("other_relevant_information", models.TextField(blank=True, max_length=1000)),
                ("confirmed_none", models.BooleanField(default=False)),
                ("shared_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("revoked_at", models.DateTimeField(blank=True, null=True)),
                (
                    "appointment",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="health_safety_declaration",
                        to="appointments.appointment",
                    ),
                ),
            ],
            options={"ordering": ["-shared_at"]},
        ),
    ]
