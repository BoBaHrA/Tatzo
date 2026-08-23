import os
from urllib.parse import urlencode

from django.contrib.auth import get_user_model
from django.core import signing
from django.db import transaction
from django.db.models import Max, Q
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from users.models import ChatAttachment, ChatMessage, ChatThread, UserBlock
from users.security import check_rate_limit, is_new_account

User = get_user_model()

CHAT_PAGE_SIZE = 50
CHAT_POLL_PAGE_SIZE = 100
MAX_CHAT_ATTACHMENTS = 6
MAX_CHAT_IMAGE_SIZE = int(9.5 * 1024 * 1024)
MAX_CHAT_VIDEO_SIZE = 95 * 1024 * 1024
MAX_CHAT_FILE_SIZE = 25 * 1024 * 1024
CHAT_ATTACHMENT_MAX_AGE = 60 * 60
CHAT_ATTACHMENT_SIGNING_SALT = "mobile-chat-attachment-v1"


def _absolute_profile_image_url(user, request):
    image = user.profile.profile_image
    if not image:
        return None

    try:
        url = image.url
    except (AttributeError, ValueError):
        return None

    return request.build_absolute_uri(url) if url.startswith("/") else url


def _chat_user_payload(user, request):
    return {
        "id": user.pk,
        "username": user.username,
        "tag": user.profile.tag,
        "is_verified_artist": user.profile.is_verified_artist,
        "profile_image_url": _absolute_profile_image_url(user, request),
    }


def _attachment_url(attachment, request):
    token = signing.dumps(
        {
            "attachment_id": attachment.pk,
            "user_id": request.user.pk,
        },
        salt=CHAT_ATTACHMENT_SIGNING_SALT,
        compress=True,
    )
    path = reverse(
        "mobile_api:chat_attachment",
        args=[attachment.pk],
    )
    return request.build_absolute_uri(f"{path}?{urlencode({'token': token})}")


def _attachment_payload(attachment, request):
    return {
        "id": attachment.pk,
        "type": attachment.media_type,
        "name": attachment.original_name or os.path.basename(attachment.file.name),
        "content_type": attachment.content_type,
        "url": _attachment_url(attachment, request),
    }


def _message_payload(message, request):
    return {
        "id": message.pk,
        "sender": _chat_user_payload(message.sender, request),
        "is_mine": message.sender_id == request.user.pk,
        "content": message.content,
        "is_read": message.is_read,
        "is_edited": message.is_edited,
        "created_at": message.created_at,
        "edited_at": message.edited_at,
        "attachments": [
            _attachment_payload(attachment, request)
            for attachment in message.attachments.all()
        ],
    }


def _block_state(thread, user):
    other_user = thread.get_other_user(user)
    is_blocked_by_me = UserBlock.objects.filter(
        blocker=user,
        blocked=other_user,
    ).exists()
    has_blocked_me = UserBlock.objects.filter(
        blocker=other_user,
        blocked=user,
    ).exists()
    return other_user, is_blocked_by_me, has_blocked_me


def _thread_or_404(thread_id, user):
    thread = get_object_or_404(
        ChatThread.objects.select_related(
            "participant_one",
            "participant_one__profile",
            "participant_two",
            "participant_two__profile",
        ),
        pk=thread_id,
    )
    if not thread.has_user(user):
        raise Http404
    return thread


def _thread_summary_payload(thread, request):
    other_user, is_blocked_by_me, has_blocked_me = _block_state(
        thread,
        request.user,
    )
    last_message = (
        thread.messages.filter(is_deleted=False)
        .select_related("sender", "sender__profile")
        .prefetch_related("attachments")
        .order_by("-created_at", "-id")
        .first()
    )
    unread_count = (
        thread.messages.filter(is_read=False, is_deleted=False)
        .exclude(sender=request.user)
        .count()
    )
    last_read_message_id = thread.messages.filter(
        sender=request.user,
        is_read=True,
        is_deleted=False,
    ).aggregate(last_read_id=Max("id"))["last_read_id"]
    return {
        "id": thread.pk,
        "other_user": _chat_user_payload(other_user, request),
        "last_message": (
            _message_payload(last_message, request) if last_message else None
        ),
        "unread_count": unread_count,
        "last_read_message_id": last_read_message_id,
        "updated_at": thread.updated_at,
        "is_blocked_by_me": is_blocked_by_me,
        "has_blocked_me": has_blocked_me,
        "chat_blocked": is_blocked_by_me or has_blocked_me,
    }


def _uploaded_files(request):
    return list(request.FILES.getlist("attachments"))


def _validate_attachments(files, *, existing_count=0):
    if existing_count + len(files) > MAX_CHAT_ATTACHMENTS:
        return {
            "code": "too_many_attachments",
            "detail": f"A message can contain up to {MAX_CHAT_ATTACHMENTS} attachments.",
        }

    for uploaded_file in files:
        media_type = ChatAttachment.detect_media_type(uploaded_file)
        size_limit = {
            "image": MAX_CHAT_IMAGE_SIZE,
            "video": MAX_CHAT_VIDEO_SIZE,
            "file": MAX_CHAT_FILE_SIZE,
        }[media_type]
        if uploaded_file.size > size_limit:
            return {
                "code": "attachment_too_large",
                "detail": f"{uploaded_file.name} is too large.",
            }
    return None


def _create_attachments(message, files):
    for uploaded_file in files:
        ChatAttachment.objects.create(
            message=message,
            file=uploaded_file,
            original_name=uploaded_file.name[:255],
            content_type=(uploaded_file.content_type or "")[:120],
            media_type=ChatAttachment.detect_media_type(uploaded_file),
        )


def _parse_positive_int(value):
    if value in (None, ""):
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _delete_attachment_ids(request):
    if hasattr(request.data, "getlist"):
        raw_ids = request.data.getlist("delete_attachment_ids")
    else:
        raw_ids = request.data.get("delete_attachment_ids", [])
        if not isinstance(raw_ids, list):
            raw_ids = [raw_ids]

    attachment_ids = []
    for raw_id in raw_ids:
        parsed = _parse_positive_int(raw_id)
        if parsed is not None:
            attachment_ids.append(parsed)
    return attachment_ids


class ChatListView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        threads = (
            ChatThread.objects.filter(
                Q(participant_one=request.user) | Q(participant_two=request.user),
                messages__is_deleted=False,
            )
            .select_related(
                "participant_one",
                "participant_one__profile",
                "participant_two",
                "participant_two__profile",
            )
            .distinct()
            .order_by("-updated_at", "-id")
        )
        results = [_thread_summary_payload(thread, request) for thread in threads]
        return Response(
            {
                "unread_count": sum(item["unread_count"] for item in results),
                "results": results,
            }
        )


class StartChatView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, username):
        target_user = get_object_or_404(
            User.objects.select_related("profile").filter(
                is_active=True,
                profile__is_email_verified=True,
            ),
            username=username,
        )
        if target_user.pk == request.user.pk:
            return Response(
                {
                    "code": "cannot_chat_self",
                    "detail": "You cannot start a chat with yourself.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if UserBlock.objects.filter(
            Q(blocker=request.user, blocked=target_user)
            | Q(blocker=target_user, blocked=request.user)
        ).exists():
            raise Http404

        thread = ChatThread.get_or_create_for_users(request.user, target_user)
        return Response(_thread_summary_payload(thread, request))


class ChatThreadView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, thread_id):
        thread = _thread_or_404(thread_id, request.user)
        after = _parse_positive_int(request.query_params.get("after"))
        before = _parse_positive_int(request.query_params.get("before"))
        if request.query_params.get("after") and after is None:
            return Response(
                {"code": "invalid_cursor", "detail": "Invalid after cursor."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if request.query_params.get("before") and before is None:
            return Response(
                {"code": "invalid_cursor", "detail": "Invalid before cursor."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if after and before:
            return Response(
                {
                    "code": "invalid_cursor",
                    "detail": "Use either after or before, not both.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        messages = (
            thread.messages.filter(is_deleted=False)
            .select_related("sender", "sender__profile")
            .prefetch_related("attachments")
        )
        if after:
            selected = list(
                messages.filter(pk__gt=after).order_by("id")[:CHAT_POLL_PAGE_SIZE]
            )
            has_more = (
                bool(selected) and messages.filter(pk__gt=selected[-1].pk).exists()
            )
        else:
            if before:
                messages = messages.filter(pk__lt=before)
            selected = list(messages.order_by("-id")[:CHAT_PAGE_SIZE])
            selected.reverse()
            has_more = (
                bool(selected)
                and thread.messages.filter(
                    is_deleted=False,
                    pk__lt=selected[0].pk,
                ).exists()
            )

        thread.messages.filter(is_read=False).exclude(sender=request.user).update(
            is_read=True
        )
        summary = _thread_summary_payload(thread, request)
        summary.update(
            {
                "messages": [
                    _message_payload(message, request) for message in selected
                ],
                "has_more": has_more,
            }
        )
        return Response(summary)


class ChatMessageCreateView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, thread_id):
        thread = _thread_or_404(thread_id, request.user)
        _other_user, is_blocked_by_me, has_blocked_me = _block_state(
            thread,
            request.user,
        )
        if is_blocked_by_me or has_blocked_me:
            return Response(
                {
                    "code": "chat_blocked",
                    "detail": "You cannot send messages to this user.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        chat_limit = 10 if is_new_account(request.user) else 40
        allowed, retry_after = check_rate_limit(
            request,
            scope="mobile:chat:send",
            limit=chat_limit,
            window_seconds=10 * 60,
            identity="user",
        )
        if not allowed:
            return Response(
                {
                    "code": "rate_limited",
                    "detail": "You are sending messages too quickly. Please wait a bit.",
                    "retry_after": retry_after,
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        content = str(request.data.get("content") or "").strip()
        files = _uploaded_files(request)
        if len(content) > 2000:
            return Response(
                {
                    "code": "message_too_long",
                    "detail": "Messages can contain up to 2000 characters.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        attachment_error = _validate_attachments(files)
        if attachment_error:
            return Response(attachment_error, status=status.HTTP_400_BAD_REQUEST)
        if not content and not files:
            return Response(
                {"code": "empty_message", "detail": "Message cannot be empty."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            message = ChatMessage.objects.create(
                thread=thread,
                sender=request.user,
                content=content,
            )
            _create_attachments(message, files)
            ChatThread.objects.filter(pk=thread.pk).update(updated_at=timezone.now())

        message = (
            ChatMessage.objects.select_related("sender", "sender__profile")
            .prefetch_related("attachments")
            .get(pk=message.pk)
        )
        return Response(
            _message_payload(message, request),
            status=status.HTTP_201_CREATED,
        )


class ChatMessageView(APIView):
    permission_classes = (IsAuthenticated,)

    def patch(self, request, message_id):
        message = get_object_or_404(
            ChatMessage.objects.select_related("thread", "sender"),
            pk=message_id,
            sender=request.user,
            is_deleted=False,
        )
        content = (
            str(request.data.get("content") or "").strip()
            if "content" in request.data
            else message.content
        )
        if len(content) > 2000:
            return Response(
                {
                    "code": "message_too_long",
                    "detail": "Messages can contain up to 2000 characters.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        delete_ids = _delete_attachment_ids(request)
        attachments_to_delete = message.attachments.filter(pk__in=delete_ids)
        remaining_count = message.attachments.exclude(pk__in=delete_ids).count()
        files = _uploaded_files(request)
        attachment_error = _validate_attachments(
            files,
            existing_count=remaining_count,
        )
        if attachment_error:
            return Response(attachment_error, status=status.HTTP_400_BAD_REQUEST)
        if not content and not files and remaining_count == 0:
            return Response(
                {"code": "empty_message", "detail": "Message cannot be empty."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            attachments_to_delete.delete()
            message.content = content
            message.is_edited = True
            message.edited_at = timezone.now()
            message.save(update_fields=("content", "is_edited", "edited_at"))
            _create_attachments(message, files)

        message = (
            ChatMessage.objects.select_related("sender", "sender__profile")
            .prefetch_related("attachments")
            .get(pk=message.pk)
        )
        return Response(_message_payload(message, request))

    def delete(self, request, message_id):
        message = get_object_or_404(
            ChatMessage.objects.select_related("thread"),
            pk=message_id,
            sender=request.user,
            is_deleted=False,
        )
        thread = message.thread
        with transaction.atomic():
            message.is_deleted = True
            message.deleted_at = timezone.now()
            message.content = ""
            message.is_read = True
            message.save(
                update_fields=("is_deleted", "deleted_at", "content", "is_read")
            )
            message.attachments.all().delete()

            last_visible_message = (
                thread.messages.filter(is_deleted=False)
                .order_by("-created_at", "-id")
                .first()
            )
            updated_at = (
                last_visible_message.created_at
                if last_visible_message
                else timezone.now()
            )
            ChatThread.objects.filter(pk=thread.pk).update(updated_at=updated_at)

        return Response(status=status.HTTP_204_NO_CONTENT)


class ChatAttachmentView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)

    def get(self, request, attachment_id):
        token = request.query_params.get("token", "")
        try:
            payload = signing.loads(
                token,
                salt=CHAT_ATTACHMENT_SIGNING_SALT,
                max_age=CHAT_ATTACHMENT_MAX_AGE,
            )
        except signing.BadSignature:
            raise Http404

        if payload.get("attachment_id") != attachment_id:
            raise Http404

        attachment = get_object_or_404(
            ChatAttachment.objects.select_related(
                "message__thread__participant_one",
                "message__thread__participant_two",
            ),
            pk=attachment_id,
            message__is_deleted=False,
        )
        thread = attachment.message.thread
        user_id = payload.get("user_id")
        if user_id not in (thread.participant_one_id, thread.participant_two_id):
            raise Http404

        try:
            file_handle = attachment.file.open("rb")
        except (FileNotFoundError, OSError, ValueError):
            raise Http404

        response = FileResponse(
            file_handle,
            as_attachment=attachment.media_type == "file",
            filename=(
                attachment.original_name or os.path.basename(attachment.file.name)
            ),
            content_type=attachment.content_type or "application/octet-stream",
        )
        response["Cache-Control"] = "private, max-age=300"
        response["X-Content-Type-Options"] = "nosniff"
        return response
