# users/signals.py
import logging

from django.contrib.auth.models import User
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from appointments.models import AppointmentReferenceImage
from posts.models import PostMedia
from .models import (
    ChatAttachment,
    LocationClaim,
    LocationRequest,
    ManualVerificationRequest,
    PortfolioAlbum,
    PortfolioWork,
    Profile,
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
