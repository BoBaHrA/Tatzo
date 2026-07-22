import os

import cloudinary
import cloudinary.uploader
from django.conf import settings
from django.core.files.storage import FileSystemStorage, Storage
from django.utils.deconstruct import deconstructible
from cloudinary_storage.storage import MediaCloudinaryStorage, RESOURCE_TYPES


class TatzoMediaCloudinaryStorage(MediaCloudinaryStorage):
    VIDEO_EXTENSIONS = {
        ".mp4",
        ".mov",
        ".m4v",
        ".webm",
        ".avi",
        ".mkv",
    }

    RAW_EXTENSIONS = {
        ".pdf",
        ".doc",
        ".docx",
        ".txt",
        ".rtf",
    }

    def _get_resource_type(self, name):
        extension = os.path.splitext(name)[1].lower()

        if extension in self.VIDEO_EXTENSIONS:
            return RESOURCE_TYPES["VIDEO"]

        if extension in self.RAW_EXTENSIONS:
            return RESOURCE_TYPES["RAW"]

        return RESOURCE_TYPES["IMAGE"]


class PrivateCloudinaryStorage(TatzoMediaCloudinaryStorage):
    """Cloudinary storage whose objects cannot be delivered as public media."""

    def _upload(self, name, content):
        options = {
            "use_filename": True,
            "resource_type": self._get_resource_type(name),
            "type": "authenticated",
            "tags": "tatzo-private-media",
        }
        folder = os.path.dirname(name)
        if folder:
            options["folder"] = folder
        return cloudinary.uploader.upload(content, **options)

    def _get_url(self, name):
        name = self._prepend_prefix(name)
        resource = cloudinary.CloudinaryResource(
            name,
            default_resource_type=self._get_resource_type(name),
            type="authenticated",
        )
        return resource.build_url(secure=True, sign_url=True)

    def delete(self, name):
        response = cloudinary.uploader.destroy(
            name,
            invalidate=True,
            resource_type=self._get_resource_type(name),
            type="authenticated",
        )
        return response["result"] in {"ok", "not found"}


@deconstructible
class PrivateMediaStorage(Storage):
    """Private storage selected at runtime for local and production deployments.

    Its URL is intentionally unavailable: downloads must pass through an
    authorised Django view, so an object name alone never grants access.
    """

    def __init__(self):
        self._backend = None

    @property
    def backend(self):
        if self._backend is None:
            if getattr(settings, "USE_CLOUDINARY", False):
                self._backend = PrivateCloudinaryStorage()
            else:
                self._backend = FileSystemStorage(location=settings.MEDIA_ROOT)
        return self._backend

    def _open(self, name, mode="rb"):
        return self.backend.open(name, mode)

    def _save(self, name, content):
        return self.backend.save(name, content)

    def delete(self, name):
        return self.backend.delete(name)

    def exists(self, name):
        return self.backend.exists(name)

    def size(self, name):
        return self.backend.size(name)

    def url(self, name):
        raise ValueError("Private media must be served through an authorised endpoint.")


private_media_storage = PrivateMediaStorage()
