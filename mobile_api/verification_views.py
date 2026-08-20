import logging
import os

from PIL import Image, UnidentifiedImageError
from django.db import transaction
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from users.models import (
    BUSINESS_DOCUMENT_CHOICES,
    ID_DOCUMENT_CHOICES,
    ManualVerificationRequest,
    Profile,
    VerificationDocument,
)
from users.security import check_rate_limit


logger = logging.getLogger(__name__)

MAX_VERIFICATION_FILE_SIZE = int(9.5 * 1024 * 1024)
MAX_VERIFICATION_IMAGE_PIXELS = 80_000_000
LOCKED_VERIFICATION_STATUSES = {
    "approved",
    "pending",
    "pending_documents",
    "pending_manual_review",
}

FILE_FORMATS = {
    ".pdf": ("pdf", {"application/pdf"}),
    ".jpg": ("jpeg", {"image/jpeg"}),
    ".jpeg": ("jpeg", {"image/jpeg"}),
    ".png": ("png", {"image/png"}),
    ".webp": ("webp", {"image/webp"}),
    ".heic": ("heif", {"image/heic", "image/heif"}),
    ".heif": ("heif", {"image/heic", "image/heif"}),
}
GENERIC_CONTENT_TYPES = {"", "application/octet-stream"}


def _looks_like_heif(uploaded_file):
    header = uploaded_file.read(40)
    uploaded_file.seek(0)
    if len(header) < 16 or header[4:8] != b"ftyp":
        return False
    brands = (b"heic", b"heix", b"hevc", b"hevx", b"heim", b"heis", b"mif1")
    return any(brand in header[8:40] for brand in brands)


def _validate_verification_upload(uploaded_file):
    name = os.path.basename(uploaded_file.name or "upload")
    extension = os.path.splitext(name)[1].lower()
    expected = FILE_FORMATS.get(extension)
    if expected is None:
        raise serializers.ValidationError(
            "Use a PDF, JPG, PNG, WEBP, HEIC, or HEIF file."
        )

    if uploaded_file.size <= 0:
        raise serializers.ValidationError("The selected file is empty.")
    if uploaded_file.size > MAX_VERIFICATION_FILE_SIZE:
        raise serializers.ValidationError("Each file must be smaller than 10 MB.")

    file_format, expected_content_types = expected
    content_type = (getattr(uploaded_file, "content_type", "") or "").lower()
    if (
        content_type not in GENERIC_CONTENT_TYPES
        and content_type not in expected_content_types
    ):
        raise serializers.ValidationError(
            "The file extension and content type do not match."
        )

    try:
        if file_format == "pdf":
            header = uploaded_file.read(5)
            uploaded_file.seek(0)
            if header != b"%PDF-":
                raise ValueError("Invalid PDF header")
        elif file_format == "heif":
            if not _looks_like_heif(uploaded_file):
                raise ValueError("Invalid HEIF header")
        else:
            with Image.open(uploaded_file) as image:
                if image.width * image.height > MAX_VERIFICATION_IMAGE_PIXELS:
                    raise ValueError("Image dimensions are too large")
                if (image.format or "").lower() != file_format:
                    raise ValueError("Image format does not match its extension")
                image.verify()
            uploaded_file.seek(0)
    except (
        Image.DecompressionBombError,
        UnidentifiedImageError,
        OSError,
        ValueError,
    ):
        uploaded_file.seek(0)
        raise serializers.ValidationError(
            "The selected file is not a valid supported document."
        )

    return uploaded_file


class VerificationDocumentsSerializer(serializers.Serializer):
    business_document_type = serializers.ChoiceField(
        choices=[value for value, _label in BUSINESS_DOCUMENT_CHOICES]
    )
    business_document_file = serializers.FileField()
    id_document_type = serializers.ChoiceField(
        choices=[value for value, _label in ID_DOCUMENT_CHOICES]
    )
    id_document_file = serializers.FileField()

    def validate_business_document_file(self, value):
        return _validate_verification_upload(value)

    def validate_id_document_file(self, value):
        return _validate_verification_upload(value)


class ManualVerificationSerializer(serializers.Serializer):
    portfolio_link = serializers.URLField(
        required=False,
        allow_blank=True,
        max_length=500,
    )
    social_link = serializers.URLField(
        required=False,
        allow_blank=True,
        max_length=500,
    )
    city_country = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=120,
        trim_whitespace=True,
    )
    explanation = serializers.CharField(
        max_length=5000,
        trim_whitespace=True,
    )
    extra_file = serializers.FileField(required=False, allow_null=True)

    def validate_extra_file(self, value):
        return _validate_verification_upload(value) if value else value


def _artist_forbidden():
    return Response(
        {
            "code": "verification_forbidden",
            "detail": "Artist verification is available only to tattoo artist accounts.",
        },
        status=status.HTTP_403_FORBIDDEN,
    )


def _verification_locked(profile):
    return Response(
        {
            "code": "verification_locked",
            "detail": "This verification request cannot be changed while it is under review or approved.",
            "verification_status": profile.verification_status,
        },
        status=status.HTTP_409_CONFLICT,
    )


def _verification_payload(user):
    profile = user.profile
    document_request = VerificationDocument.objects.filter(user=user).first()
    manual_request = ManualVerificationRequest.objects.filter(user=user).first()

    selected_path = None
    if profile.verification_status == "pending_documents":
        selected_path = "documents"
    elif profile.verification_status == "pending_manual_review":
        selected_path = "manual"

    return {
        "account_type": profile.account_type,
        "status": profile.verification_status,
        "can_submit": profile.verification_status not in LOCKED_VERIFICATION_STATUSES,
        "selected_path": selected_path,
        "business_document_types": [
            {"value": value, "label": str(label)}
            for value, label in BUSINESS_DOCUMENT_CHOICES
        ],
        "id_document_types": [
            {"value": value, "label": str(label)}
            for value, label in ID_DOCUMENT_CHOICES
        ],
        "documents": (
            {
                "business_document_type": document_request.business_document_type,
                "id_document_type": document_request.id_document_type,
                "has_business_document": bool(
                    document_request.business_document_file
                ),
                "has_id_document": bool(document_request.id_document_file),
            }
            if document_request
            else None
        ),
        "manual": (
            {
                "portfolio_link": manual_request.portfolio_link or "",
                "social_link": manual_request.social_link or "",
                "city_country": manual_request.city_country or "",
                "explanation": manual_request.explanation,
                "has_extra_file": bool(manual_request.extra_file),
                "updated_at": manual_request.updated_at.isoformat(),
            }
            if manual_request
            else None
        ),
    }


def _rate_limit_response(request, scope):
    allowed, retry_after = check_rate_limit(
        request,
        scope=scope,
        limit=4,
        window_seconds=24 * 60 * 60,
        identity="user",
    )
    if allowed:
        return None
    return Response(
        {
            "code": "rate_limited",
            "detail": "Too many verification submissions. Please try again later.",
            "retry_after": retry_after,
        },
        status=status.HTTP_429_TOO_MANY_REQUESTS,
    )


def _delete_replaced_files(files):
    for storage, name in files:
        try:
            storage.delete(name)
        except Exception:
            logger.exception("Failed to delete replaced verification file %s", name)


class ArtistVerificationView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        if request.user.profile.account_type != "tattoo_artist":
            return _artist_forbidden()
        return Response(_verification_payload(request.user))


class ArtistVerificationDocumentsView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        if request.user.profile.account_type != "tattoo_artist":
            return _artist_forbidden()
        if request.user.profile.verification_status in LOCKED_VERIFICATION_STATUSES:
            return _verification_locked(request.user.profile)

        limited = _rate_limit_response(request, "mobile:verification:documents")
        if limited:
            return limited

        serializer = VerificationDocumentsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            profile = Profile.objects.select_for_update().get(user=request.user)
            if profile.verification_status in LOCKED_VERIFICATION_STATUSES:
                return _verification_locked(profile)

            document_request = (
                VerificationDocument.objects.select_for_update()
                .filter(user=request.user)
                .first()
            )
            replaced_files = []
            if document_request is None:
                document_request = VerificationDocument(user=request.user)
            else:
                for field_name in (
                    "business_document_file",
                    "id_document_file",
                ):
                    current_file = getattr(document_request, field_name)
                    if current_file and current_file.name:
                        replaced_files.append((current_file.storage, current_file.name))

            for field_name, value in serializer.validated_data.items():
                setattr(document_request, field_name, value)
            document_request.is_verified = False
            document_request.save()

            new_names = {
                document_request.business_document_file.name,
                document_request.id_document_file.name,
            }
            replaced_files = [
                (storage, name)
                for storage, name in replaced_files
                if name not in new_names
            ]
            if replaced_files:
                transaction.on_commit(lambda: _delete_replaced_files(replaced_files))

            profile.verification_status = "pending_documents"
            profile.save(update_fields=("verification_status",))

        request.user.profile = profile
        return Response(
            _verification_payload(request.user),
            status=status.HTTP_201_CREATED,
        )


class ArtistVerificationManualView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        if request.user.profile.account_type != "tattoo_artist":
            return _artist_forbidden()
        if request.user.profile.verification_status in LOCKED_VERIFICATION_STATUSES:
            return _verification_locked(request.user.profile)

        limited = _rate_limit_response(request, "mobile:verification:manual")
        if limited:
            return limited

        serializer = ManualVerificationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            profile = Profile.objects.select_for_update().get(user=request.user)
            if profile.verification_status in LOCKED_VERIFICATION_STATUSES:
                return _verification_locked(profile)

            manual_request = (
                ManualVerificationRequest.objects.select_for_update()
                .filter(user=request.user)
                .first()
            )
            if manual_request is None:
                manual_request = ManualVerificationRequest(user=request.user)

            replaced_file = None
            new_extra_file = serializer.validated_data.get("extra_file")
            if (
                new_extra_file
                and manual_request.extra_file
                and manual_request.extra_file.name
            ):
                replaced_file = (
                    manual_request.extra_file.storage,
                    manual_request.extra_file.name,
                )

            for field_name, value in serializer.validated_data.items():
                setattr(manual_request, field_name, value)
            manual_request.is_reviewed = False
            manual_request.save()

            if (
                replaced_file
                and replaced_file[1] != manual_request.extra_file.name
            ):
                transaction.on_commit(
                    lambda: _delete_replaced_files([replaced_file])
                )

            profile.verification_status = "pending_manual_review"
            profile.save(update_fields=("verification_status",))

        request.user.profile = profile
        return Response(
            _verification_payload(request.user),
            status=status.HTTP_201_CREATED,
        )
