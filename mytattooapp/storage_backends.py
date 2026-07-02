import os

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