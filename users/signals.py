# users/signals.py
import logging

from django.contrib.auth.models import User
from django.db.models import Q
from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from appointments.models import Appointment, AppointmentReferenceImage
from posts.models import PostComment, PostLike, PostMedia
from .models import (
    ChatAttachment,
    ChatMessage,
    LocationClaim,
    LocationRequest,
    ManualVerificationRequest,
    Notification,
    PortfolioAlbum,
    PortfolioWork,
    Profile,
    UserBlock,
    UserFollow,
    UserReport,
    VerificationDocument,
)

logger = logging.getLogger(__name__)


@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        if not hasattr(instance, "profile"):
            Profile.objects.create(
                user=instance,
                is_email_verified=False,
                tag=Profile.generate_unique_tag(instance.username),
            )


def _create_notification(*, recipient_id, actor_id, kind, dedupe_key, **relations):
    if not recipient_id or recipient_id == actor_id:
        return
    if actor_id and UserBlock.objects.filter(
        Q(blocker_id=recipient_id, blocked_id=actor_id)
        | Q(blocker_id=actor_id, blocked_id=recipient_id)
    ).exists():
        return
    notification, created = Notification.objects.get_or_create(
        recipient_id=recipient_id,
        dedupe_key=dedupe_key,
        defaults={
            "actor_id": actor_id,
            "kind": kind,
            **relations,
        },
    )
    if created:
        from .push_notifications import queue_notification_push

        queue_notification_push(notification)


@receiver(post_save, sender=UserFollow)
def notify_new_follow(sender, instance, created, raw=False, **kwargs):
    if raw or not created:
        return
    _create_notification(
        recipient_id=instance.following_id,
        actor_id=instance.follower_id,
        kind=Notification.KIND_FOLLOW,
        dedupe_key=f"follow:{instance.pk}",
    )


@receiver(post_delete, sender=UserFollow)
def remove_follow_notification(sender, instance, **kwargs):
    Notification.objects.filter(
        recipient_id=instance.following_id,
        dedupe_key=f"follow:{instance.pk}",
    ).delete()


@receiver(post_save, sender=PostLike)
def notify_post_like(sender, instance, created, raw=False, **kwargs):
    if raw or not created:
        return
    _create_notification(
        recipient_id=instance.post.user_id,
        actor_id=instance.user_id,
        kind=Notification.KIND_POST_LIKE,
        dedupe_key=f"post-like:{instance.pk}",
        post_id=instance.post_id,
    )


@receiver(post_delete, sender=PostLike)
def remove_post_like_notification(sender, instance, **kwargs):
    Notification.objects.filter(
        dedupe_key=f"post-like:{instance.pk}",
    ).delete()


@receiver(post_save, sender=PostComment)
def notify_post_comment(sender, instance, created, raw=False, **kwargs):
    if raw or not created:
        return
    if instance.parent_id and instance.parent.user_id != instance.user_id:
        _create_notification(
            recipient_id=instance.parent.user_id,
            actor_id=instance.user_id,
            kind=Notification.KIND_COMMENT_REPLY,
            dedupe_key=f"comment:{instance.pk}:reply",
            post_id=instance.post_id,
            comment_id=instance.pk,
        )
    if (
        instance.post.user_id != instance.user_id
        and (not instance.parent_id or instance.parent.user_id != instance.post.user_id)
    ):
        _create_notification(
            recipient_id=instance.post.user_id,
            actor_id=instance.user_id,
            kind=Notification.KIND_POST_COMMENT,
            dedupe_key=f"comment:{instance.pk}:post",
            post_id=instance.post_id,
            comment_id=instance.pk,
        )


@receiver(post_save, sender=ChatMessage)
def notify_chat_message(sender, instance, created, raw=False, **kwargs):
    if raw:
        return
    if instance.is_deleted:
        Notification.objects.filter(
            dedupe_key=f"chat-message:{instance.pk}",
        ).delete()
        return
    if not created:
        return
    recipient = instance.thread.get_other_user(instance.sender)
    _create_notification(
        recipient_id=recipient.pk if recipient else None,
        actor_id=instance.sender_id,
        kind=Notification.KIND_CHAT_MESSAGE,
        dedupe_key=f"chat-message:{instance.pk}",
        thread_id=instance.thread_id,
        message_id=instance.pk,
    )


@receiver(pre_save, sender=Appointment)
def remember_appointment_status(sender, instance, raw=False, **kwargs):
    if raw or not instance.pk:
        instance._notification_previous_status = None
        return
    instance._notification_previous_status = (
        Appointment.objects.filter(pk=instance.pk)
        .values_list("status", flat=True)
        .first()
    )


@receiver(post_save, sender=Appointment)
def notify_appointment(sender, instance, created, raw=False, **kwargs):
    if raw:
        return
    if created:
        _create_notification(
            recipient_id=instance.artist_id,
            actor_id=instance.client_id,
            kind=Notification.KIND_BOOKING_REQUEST,
            dedupe_key=f"appointment:{instance.pk}:created",
            appointment_id=instance.pk,
        )
        return

    previous_status = getattr(instance, "_notification_previous_status", None)
    if not previous_status or previous_status == instance.status:
        return
    client_replied = (
        previous_status == Appointment.STATUS_NEEDS_REFERENCES
        and instance.status == Appointment.STATUS_PENDING
    )
    recipient_id = instance.artist_id if client_replied else instance.client_id
    actor_id = instance.client_id if client_replied else instance.artist_id
    _create_notification(
        recipient_id=recipient_id,
        actor_id=actor_id,
        kind=Notification.KIND_BOOKING_UPDATE,
        dedupe_key=(
            f"appointment:{instance.pk}:{previous_status}:{instance.status}"
        ),
        appointment_id=instance.pk,
    )


@receiver(post_save, sender=UserBlock)
def remove_notifications_between_blocked_users(
    sender,
    instance,
    created,
    raw=False,
    **kwargs,
):
    if raw or not created:
        return
    Notification.objects.filter(
        Q(recipient_id=instance.blocker_id, actor_id=instance.blocked_id)
        | Q(recipient_id=instance.blocked_id, actor_id=instance.blocker_id)
    ).delete()


PRIVATE_FILE_FIELDS = {
    Profile: ("profile_image",),
    VerificationDocument: ("business_document_file", "id_document_file"),
    ManualVerificationRequest: ("extra_file",),
    ChatAttachment: ("file",),
    UserReport: ("attachment",),
    LocationClaim: ("proof_document",),
    LocationRequest: ("supporting_file",),
    AppointmentReferenceImage: ("image",),
    PostMedia: ("file",),
    PortfolioAlbum: ("cover_image",),
    PortfolioWork: ("image",),
}


def delete_stored_files(sender, instance, **kwargs):
    """Delete storage objects when their owning database row is removed."""
    for field_name in PRIVATE_FILE_FIELDS.get(sender, ()):
        file_field = getattr(instance, field_name, None)
        if not file_field or not file_field.name:
            continue
        try:
            file_field.storage.delete(file_field.name)
        except Exception:
            logger.exception(
                "Failed to delete stored file %s for %s(%s)",
                file_field.name,
                sender.__name__,
                instance.pk,
            )


for model_class in PRIVATE_FILE_FIELDS:
    post_delete.connect(
        delete_stored_files,
        sender=model_class,
        dispatch_uid=f"delete_stored_files_{model_class._meta.label_lower}",
    )
