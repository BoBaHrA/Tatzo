import os

from django.contrib.auth.hashers import make_password
from django.db import migrations

def reset_superuser_password(apps, schema_editor):
    username = os.environ.get("DJANGO_SUPERUSER_USERNAME")
    email = os.environ.get("DJANGO_SUPERUSER_EMAIL", "")
    password = os.environ.get("DJANGO_SUPERUSER_PASSWORD")

    if not username or not password:
        return

    User = apps.get_model("auth", "User")

    user, created = User.objects.get_or_create(
        username=username,
        defaults={
            "email": email,
            "is_staff": True,
            "is_superuser": True,
            "is_active": True,
        },
    )

    user.email = email or user.email
    user.is_staff = True
    user.is_superuser = True
    user.is_active = True
    user.password = make_password(password)
    user.save()

class Migration(migrations.Migration):

    dependencies = [
        ("users", "0011_alter_profile_account_type_alter_profile_status_and_more"),
    ]

    operations = [
        migrations.RunPython(reset_superuser_password, migrations.RunPython.noop),
    ]
