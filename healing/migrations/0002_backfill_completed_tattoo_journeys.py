from django.db import migrations


def backfill_completed_tattoo_journeys(apps, schema_editor):
    Appointment = apps.get_model("appointments", "Appointment")
    HealingJourney = apps.get_model("healing", "HealingJourney")

    appointments = Appointment.objects.filter(
        booking_type="tattoo_session",
        status="completed",
    ).order_by("pk")

    for appointment in appointments.iterator():
        styles = appointment.styles or []
        if isinstance(styles, (list, tuple)):
            styles_text = ", ".join(
                str(item).strip() for item in styles if str(item).strip()
            )
        else:
            styles_text = str(styles).strip()
        placement = str(appointment.placement or "").strip()
        title = " · ".join(part for part in (styles_text, placement) if part)
        HealingJourney.objects.get_or_create(
            appointment_id=appointment.pk,
            defaults={
                "client_id": appointment.client_id,
                "artist_id": appointment.artist_id,
                "title": title[:160] or f"Tattoo #{appointment.pk}",
                "started_on": appointment.date,
                "status": "active",
            },
        )


class Migration(migrations.Migration):
    dependencies = [("healing", "0001_initial")]

    operations = [
        migrations.RunPython(
            backfill_completed_tattoo_journeys,
            migrations.RunPython.noop,
        )
    ]
