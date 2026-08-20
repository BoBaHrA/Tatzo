import os

from PIL import Image, UnidentifiedImageError
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from posts.models import Post, PostMedia
from users.models import PortfolioWork
from users.security import check_rate_limit, is_new_account

from .serializers import FeedPostSerializer, PortfolioWorkSerializer
from .views import _visible_posts_for


MAX_POST_MEDIA = 10
MAX_IMAGE_UPLOAD_SIZE = int(9.5 * 1024 * 1024)
MAX_VIDEO_UPLOAD_SIZE = int(95 * 1024 * 1024)
MAX_POST_UPLOAD_SIZE = 200 * 1024 * 1024
MAX_IMAGE_PIXELS = 80_000_000

IMAGE_CONTENT_TYPES = {
    "image/gif",
    "image/heic",
    "image/heif",
    "image/jpeg",
    "image/png",
    "image/webp",
}
VIDEO_CONTENT_TYPES = {
    "video/mp4",
    "video/quicktime",
    "video/webm",
    "video/x-matroska",
    "video/x-msvideo",
}
HEIF_CONTENT_TYPES = {"image/heic", "image/heif"}


class PostMutationSerializer(serializers.Serializer):
    content = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=5000,
        trim_whitespace=True,
    )
    location = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=120,
        trim_whitespace=True,
    )
    disable_comments = serializers.BooleanField(required=False)
    visibility = serializers.ChoiceField(
        choices=("public", "followers", "private"),
        required=False,
    )
    layout = serializers.ChoiceField(
        choices=("grid", "carousel"),
        required=False,
    )


class PortfolioWorkMutationSerializer(serializers.Serializer):
    title = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=120,
        trim_whitespace=True,
    )
    description = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=3000,
        trim_whitespace=True,
    )
    style = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=80,
        trim_whitespace=True,
    )
    body_placement = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=80,
        trim_whitespace=True,
    )


def _uploaded_files(request, key):
    if hasattr(request.FILES, "getlist"):
        return request.FILES.getlist(key)
    uploaded = request.FILES.get(key)
    return [uploaded] if uploaded else []


def _invalid_upload(code, detail):
    return {"code": code, "detail": detail}


def _looks_like_heif(uploaded_file):
    header = uploaded_file.read(40)
    uploaded_file.seek(0)
    if len(header) < 16 or header[4:8] != b"ftyp":
        return False
    brands = (b"heic", b"heix", b"hevc", b"hevx", b"heim", b"heis", b"mif1")
    return any(brand in header[8:40] for brand in brands)


def _looks_like_video(uploaded_file, content_type):
    header = uploaded_file.read(64)
    uploaded_file.seek(0)
    if content_type in {"video/mp4", "video/quicktime"}:
        return b"ftyp" in header[:32]
    if content_type in {"video/webm", "video/x-matroska"}:
        return header.startswith(b"\x1aE\xdf\xa3")
    if content_type == "video/x-msvideo":
        return header.startswith(b"RIFF") and header[8:12] == b"AVI "
    return False


def _validate_uploads(files, *, images_only=False, maximum=MAX_POST_MEDIA):
    if len(files) > maximum:
        return _invalid_upload(
            "too_many_media",
            f"You can upload up to {maximum} files at once.",
        )

    if (
        not images_only
        and sum(uploaded_file.size for uploaded_file in files) > MAX_POST_UPLOAD_SIZE
    ):
        return _invalid_upload(
            "media_too_large",
            "The combined post upload must be 200 MB or smaller.",
        )

    for uploaded_file in files:
        content_type = (getattr(uploaded_file, "content_type", "") or "").lower()
        name = os.path.basename(uploaded_file.name or "upload")

        if content_type in IMAGE_CONTENT_TYPES:
            if uploaded_file.size > MAX_IMAGE_UPLOAD_SIZE:
                return _invalid_upload(
                    "image_too_large",
                    f"{name} is too large. Images must be under 10 MB.",
                )
            try:
                if content_type in HEIF_CONTENT_TYPES:
                    valid_image = _looks_like_heif(uploaded_file)
                    if not valid_image:
                        raise ValueError("Invalid HEIF header")
                else:
                    with Image.open(uploaded_file) as image:
                        if image.width * image.height > MAX_IMAGE_PIXELS:
                            raise ValueError("Image dimensions are too large")
                        image.verify()
                    uploaded_file.seek(0)
            except (Image.DecompressionBombError, UnidentifiedImageError, OSError, ValueError):
                uploaded_file.seek(0)
                return _invalid_upload(
                    "invalid_image",
                    f"{name} is not a valid supported image.",
                )
            continue

        if not images_only and content_type in VIDEO_CONTENT_TYPES:
            if uploaded_file.size > MAX_VIDEO_UPLOAD_SIZE:
                return _invalid_upload(
                    "video_too_large",
                    f"{name} is too large. Videos must be under 100 MB.",
                )
            if not _looks_like_video(uploaded_file, content_type):
                return _invalid_upload(
                    "invalid_video",
                    f"{name} is not a valid supported video.",
                )
            continue

        detail = (
            "Portfolio uploads must be JPG, PNG, WEBP, GIF, HEIC, or HEIF images."
            if images_only
            else "Post uploads must be supported image or video files."
        )
        return _invalid_upload("unsupported_media", detail)

    return None


def _post_payload(post, request):
    hydrated = get_object_or_404(_visible_posts_for(request.user), pk=post.pk)
    return FeedPostSerializer(hydrated, context={"request": request}).data


def _portfolio_forbidden():
    return Response(
        {
            "code": "artist_portfolio_forbidden",
            "detail": "Portfolio tools are available only to verified tattoo artists.",
        },
        status=status.HTTP_403_FORBIDDEN,
    )


class MyPostListView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        allowed, retry_after = check_rate_limit(
            request,
            scope="mobile:posts:create",
            limit=5 if is_new_account(request.user) else 20,
            window_seconds=60 * 60,
            identity="user",
        )
        if not allowed:
            return Response(
                {
                    "code": "rate_limited",
                    "detail": "You are posting too quickly. Please try again later.",
                    "retry_after": retry_after,
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        serializer = PostMutationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        files = _uploaded_files(request, "media")
        upload_error = _validate_uploads(files)
        if upload_error:
            return Response(upload_error, status=status.HTTP_400_BAD_REQUEST)

        values = serializer.validated_data
        if not values.get("content", "").strip() and not files:
            return Response(
                {"code": "empty_post", "detail": "Post cannot be empty."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            post = Post.objects.create(
                user=request.user,
                content=values.get("content", ""),
                location=values.get("location", ""),
                disable_comments=values.get("disable_comments", False),
                visibility=values.get("visibility", "public"),
                layout=values.get("layout", "carousel" if len(files) > 1 else "grid"),
            )
            for order, uploaded_file in enumerate(files):
                content_type = (uploaded_file.content_type or "").lower()
                PostMedia.objects.create(
                    post=post,
                    file=uploaded_file,
                    media_type=(
                        PostMedia.VIDEO
                        if content_type in VIDEO_CONTENT_TYPES
                        else PostMedia.IMAGE
                    ),
                    order=order,
                )

        return Response(_post_payload(post, request), status=status.HTTP_201_CREATED)


class MyPostDetailView(APIView):
    permission_classes = (IsAuthenticated,)

    def patch(self, request, post_id):
        post = get_object_or_404(Post, pk=post_id, user=request.user)
        serializer = PostMutationSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        if not serializer.validated_data:
            return Response(
                {"detail": "Add at least one field to update."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        content = serializer.validated_data.get("content", post.content)
        if not content.strip() and not post.medias.exists():
            return Response(
                {"code": "empty_post", "detail": "Post cannot be empty."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        update_fields = []
        for field, value in serializer.validated_data.items():
            setattr(post, field, value)
            update_fields.append(field)
        post.save(update_fields=update_fields)
        return Response(_post_payload(post, request))

    def delete(self, request, post_id):
        post = get_object_or_404(Post, pk=post_id, user=request.user)
        post.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MyPortfolioView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        if not request.user.profile.is_verified_artist:
            return _portfolio_forbidden()
        works = PortfolioWork.objects.filter(user=request.user).order_by("-created_at")
        return Response(
            {
                "count": works.count(),
                "results": PortfolioWorkSerializer(
                    works,
                    many=True,
                    context={"request": request},
                ).data,
            }
        )

    def post(self, request):
        if not request.user.profile.is_verified_artist:
            return _portfolio_forbidden()

        allowed, retry_after = check_rate_limit(
            request,
            scope="mobile:portfolio:create",
            limit=30,
            window_seconds=60 * 60,
            identity="user",
        )
        if not allowed:
            return Response(
                {
                    "code": "rate_limited",
                    "detail": "You are adding portfolio work too quickly. Try again later.",
                    "retry_after": retry_after,
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        serializer = PortfolioWorkMutationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        files = _uploaded_files(request, "image")
        if len(files) != 1:
            return Response(
                {"image": ["Choose exactly one portfolio image."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        upload_error = _validate_uploads(files, images_only=True, maximum=1)
        if upload_error:
            return Response(upload_error, status=status.HTTP_400_BAD_REQUEST)

        work = PortfolioWork.objects.create(
            user=request.user,
            image=files[0],
            **serializer.validated_data,
        )
        return Response(
            PortfolioWorkSerializer(work, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class MyPortfolioDetailView(APIView):
    permission_classes = (IsAuthenticated,)

    def patch(self, request, work_id):
        if not request.user.profile.is_verified_artist:
            return _portfolio_forbidden()
        work = get_object_or_404(PortfolioWork, pk=work_id, user=request.user)
        serializer = PortfolioWorkMutationSerializer(
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        if not serializer.validated_data:
            return Response(
                {"detail": "Add at least one field to update."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        update_fields = []
        for field, value in serializer.validated_data.items():
            setattr(work, field, value)
            update_fields.append(field)
        work.save(update_fields=update_fields)
        return Response(
            PortfolioWorkSerializer(work, context={"request": request}).data
        )

    def delete(self, request, work_id):
        if not request.user.profile.is_verified_artist:
            return _portfolio_forbidden()
        work = get_object_or_404(PortfolioWork, pk=work_id, user=request.user)
        work.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
