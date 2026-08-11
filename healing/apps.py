from django.apps import AppConfig


class HealingConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "healing"
    verbose_name = "Tatzo Healing"

    def ready(self):
        from . import signals  # noqa: F401
