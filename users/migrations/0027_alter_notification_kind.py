from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0026_pushdevice_pushdelivery"),
    ]

    operations = [
        migrations.AlterField(
            model_name="notification",
            name="kind",
            field=models.CharField(
                choices=[
                    ("follow", "Follow"),
                    ("post_like", "Post like"),
                    ("post_comment", "Post comment"),
                    ("comment_reply", "Comment reply"),
                    ("chat_message", "Chat message"),
                    ("booking_request", "Booking request"),
                    ("booking_update", "Booking update"),
                    ("booking_reminder", "Booking reminder"),
                ],
                max_length=32,
            ),
        ),
    ]
