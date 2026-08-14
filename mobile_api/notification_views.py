from urllib.parse import parse_qs, urlparse

from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.encoding import force_str
from rest_framework.pagination import CursorPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from posts.models import Post
from users.models import Notification, UserBlock


def _absolute_profile_image_url(user, request):
    if not user or not hasattr(user, "profile") or not user.profile.profile_image:
        return None
    try:
        url = user.profile.profile_image.url
    except (AttributeError, ValueError):
        return None
    return request.build_absolute_uri(url) if url.startswith("/") else url


def _visible_notifications(user):
    blocked_user_ids = set(
        UserBlock.objects.filter(blocker=user).values_list("blocked_id", flat=True)
    )
    blocked_user_ids.update(
        UserBlock.objects.filter(blocked=user).values_list("blocker_id", flat=True)
    )
    visible_post_ids = Post.objects.visible_to(user).values_list("pk", flat=True)
    return (
        Notification.objects.filter(recipient=user)
        .exclude(actor_id__in=blocked_user_ids)
        .filter(
            Q(actor__isnull=True)
            | Q(actor__is_active=True, actor__profile__is_email_verified=True)
        )
        .filter(Q(message__isnull=True) | Q(message__is_deleted=False))
        .filter(Q(post__isnull=True) | Q(post_id__in=visible_post_ids))
        .select_related(
            "actor",
            "actor__profile",
            "post",
            "comment",
            "appointment",
            "thread",
            "message",
        )
        .order_by("-created_at", "-id")
    )


def _target_payload(notification):
    if notification.kind == Notification.KIND_FOLLOW and notification.actor:
        return {"type": "profile", "username": notification.actor.username}
    if notification.post_id:
        return {"type": "post", "id": notification.post_id}
    if notification.appointment_id:
        return {"type": "appointment", "id": notification.appointment_id}
    if notification.thread_id:
        return {"type": "chat", "id": notification.thread_id}
    if notification.actor:
        return {"type": "profile", "username": notification.actor.username}
    return {"type": "none"}


def _notification_payload(notification, request):
    actor = notification.actor
    preview = ""
    if notification.comment_id:
        preview = notification.comment.content
    elif notification.message_id:
        preview = notification.message.content
    preview = " ".join(str(preview or "").split())[:160]

    appointment = notification.appointment
    return {
        "id": notification.pk,
        "kind": notification.kind,
        "actor": (
            {
                "id": actor.pk,
                "username": actor.username,
                "tag": actor.profile.tag,
                "is_verified_artist": actor.profile.is_verified_artist,
                "profile_image_url": _absolute_profile_image_url(actor, request),
            }
            if actor
            else None
        ),
        "target": _target_payload(notification),
        "preview": preview,
        "appointment_status": appointment.status if appointment else None,
        "appointment_status_label": (
            force_str(appointment.get_status_display()) if appointment else None
        ),
        "appointment_date": appointment.date if appointment else None,
        "is_read": notification.is_read,
        "created_at": notification.created_at,
        "read_at": notification.read_at,
    }


class NotificationCursorPagination(CursorPagination):
    page_size = 20
    page_size_query_param = "limit"
    max_page_size = 50
    ordering = ("-created_at", "-id")

    @staticmethod
    def _cursor_from_link(link):
        if not link:
            return None
        return parse_qs(urlparse(link).query).get("cursor", [None])[0]

    def get_paginated_response(self, data):
        next_cursor = self._cursor_from_link(self.get_next_link())
        return Response(
            {
                "unread_count": _visible_notifications(
                    self.request.user
                ).filter(is_read=False).count(),
                "next_cursor": next_cursor,
                "has_more": next_cursor is not None,
                "results": data,
            }
        )


class NotificationListView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        paginator = NotificationCursorPagination()
        page = paginator.paginate_queryset(
            _visible_notifications(request.user),
            request,
            view=self,
        )
        results = [_notification_payload(item, request) for item in page]
        return paginator.get_paginated_response(results)


class NotificationUnreadCountView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        return Response(
            {
                "unread_count": _visible_notifications(request.user)
                .filter(is_read=False)
                .count()
            }
        )


class NotificationReadView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, notification_id):
        notification = get_object_or_404(
            _visible_notifications(request.user),
            pk=notification_id,
        )
        if not notification.is_read:
            notification.is_read = True
            notification.read_at = timezone.now()
            notification.save(update_fields=("is_read", "read_at"))
        return Response(
            {
                "id": notification.pk,
                "is_read": True,
                "unread_count": _visible_notifications(request.user)
                .filter(is_read=False)
                .count(),
            }
        )


class NotificationReadAllView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        notification_ids = list(
            _visible_notifications(request.user)
            .filter(is_read=False)
            .values_list("pk", flat=True)
        )
        updated = Notification.objects.filter(pk__in=notification_ids).update(
            is_read=True,
            read_at=timezone.now(),
        )
        return Response({"updated": updated, "unread_count": 0})
