# users/signals.py
from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Profile


@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        # Создаём профиль только если его ещё нет
        if not hasattr(instance, "profile"):
            Profile.objects.create(user=instance, is_email_verified=False)
        instance.is_active = False
        instance.save()


@receiver(post_save, sender=User)  # 🔴 Важно! Без этого сигнал не сработает
def deactivate_user_after_creation(sender, instance, created, **kwargs):
    if created:
        instance.is_active = False  # Отключаем логин до подтверждения почты
        instance.save()
