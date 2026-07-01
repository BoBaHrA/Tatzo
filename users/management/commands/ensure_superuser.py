import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Create or update a superuser from environment variables."

    def handle(self, *args, **options):
        username = os.environ.get("DJANGO_SUPERUSER_USERNAME")
        email = os.environ.get("DJANGO_SUPERUSER_EMAIL", "")
        password = os.environ.get("DJANGO_SUPERUSER_PASSWORD")

        if not username or not password:
            self.stdout.write(
                self.style.WARNING(
                    "Superuser was not created: DJANGO_SUPERUSER_USERNAME or DJANGO_SUPERUSER_PASSWORD is missing."
                )
            )
            return

        User = get_user_model()

        user, created = User.objects.get_or_create(
            username=username,
            defaults={
                "email": email,
                "is_staff": True,
                "is_superuser": True,
                "is_active": True,
            },
        )

        changed = False

        if email and user.email != email:
            user.email = email
            changed = True

        if not user.is_staff:
            user.is_staff = True
            changed = True

        if not user.is_superuser:
            user.is_superuser = True
            changed = True

        if not user.is_active:
            user.is_active = True
            changed = True

        # Если пользователь только создан — задаём пароль.
        # Если хочешь принудительно сбросить пароль через Render env,
        # поставь DJANGO_SUPERUSER_RESET_PASSWORD=1
        if created or os.environ.get("DJANGO_SUPERUSER_RESET_PASSWORD") == "1":
            user.set_password(password)
            changed = True

        if changed:
            user.save()

        if created:
            self.stdout.write(self.style.SUCCESS(f"Superuser '{username}' created."))
        else:
            self.stdout.write(self.style.SUCCESS(f"Superuser '{username}' already exists."))