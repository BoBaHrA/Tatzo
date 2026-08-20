from django.apps import AppConfig


class HealthSafetyConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "health_safety"
    verbose_name = "Tatzo Health & Safety"

    def ready(self):
        from . import signals  # noqa: F401
        from .legal_patch import apply_health_privacy_policy_patch

        apply_health_privacy_policy_patch()
