"""Native saved posts, support and permission-checked moderation."""
from django.contrib.admin.models import CHANGE, DELETION, LogEntry
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from posts.models import CommentReport, PostReport
from users.models import ManualVerificationRequest, UserReport, VerificationDocument
from users.security import check_rate_limit
from .serializers import FeedPostSerializer
from .views import FeedCursorPagination, _visible_posts_for


class BookmarksView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        posts = _visible_posts_for(request.user).filter(viewer_bookmarked=True)
        paginator = FeedCursorPagination()
        page = paginator.paginate_queryset(posts, request, view=self)
        return paginator.get_paginated_response(
            FeedPostSerializer(page, many=True, context={"request": request}).data
        )


class SupportReportSerializer(serializers.ModelSerializer):
    message = serializers.CharField(max_length=10000)

    class Meta:
        model = UserReport
        fields = ("report_type", "title", "message", "page_url")


class SupportReportView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        serializer = SupportReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        allowed, retry_after = check_rate_limit(
            request, scope="reports:problem", limit=5, window_seconds=3600,
        )
        if not allowed:
            return Response({"code": "rate_limited"}, status=429,
                            headers={"Retry-After": str(retry_after)})
        report = serializer.save(user=request.user)
        return Response({"id": report.pk}, status=status.HTTP_201_CREATED)


REPORT_MODELS = {"posts": PostReport, "comments": CommentReport, "support": UserReport}


def _permission(user, model, action):
    return user.has_perm(f"{model._meta.app_label}.{action}_{model._meta.model_name}")


def _queue(user, kind):
    model = REPORT_MODELS.get(kind)
    if model is None:
        raise serializers.ValidationError({"kind": "Unknown moderation queue."})
    if not _permission(user, model, "view"):
        raise PermissionDenied()
    qs = model.objects.filter(is_resolved=False).select_related("user")
    if kind == "posts":
        qs = qs.select_related("post", "post__user")
    elif kind == "comments":
        qs = qs.select_related("comment", "comment__user")
    return model, qs.order_by("-created_at", "-id")


def _report_payload(report, kind, user):
    target = report.post if kind == "posts" else report.comment if kind == "comments" else report
    return {
        "id": report.pk, "kind": kind,
        "reporter": report.user.username,
        "author": target.user.username,
        "text": report.message if kind == "support" else target.content,
        "reason": report.title if kind == "support" else report.reason,
        "created_at": report.created_at,
        "can_resolve": _permission(user, type(report), "change"),
        "can_delete": kind != "support" and _permission(user, type(target), "delete"),
    }


class ModerationOverviewView(APIView):
    permission_classes = (IsAdminUser,)

    def get(self, request):
        counts = {
            kind: model.objects.filter(is_resolved=False).count()
            for kind, model in REPORT_MODELS.items()
            if _permission(request.user, model, "view")
        }
        if _permission(request.user, VerificationDocument, "view"):
            counts["documents"] = VerificationDocument.objects.filter(
                is_verified=False, user__profile__verification_status="pending_documents"
            ).count()
        if _permission(request.user, ManualVerificationRequest, "view"):
            counts["manual"] = ManualVerificationRequest.objects.filter(
                is_reviewed=False, user__profile__verification_status="pending_manual_review"
            ).count()
        return Response({"counts": counts})


class ModerationQueueView(APIView):
    permission_classes = (IsAdminUser,)

    def get(self, request, kind):
        _model, qs = _queue(request.user, kind)
        paginator = FeedCursorPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response([
            _report_payload(report, kind, request.user) for report in page
        ])


class ModerationActionView(APIView):
    permission_classes = (IsAdminUser,)

    def post(self, request, kind, report_id):
        action = request.data.get("action")
        if action not in {"resolve", "delete"}:
            raise serializers.ValidationError({"action": "Choose resolve or delete."})
        model, qs = _queue(request.user, kind)
        with transaction.atomic():
            report = get_object_or_404(qs.select_for_update(), pk=report_id)
            target = report.post if kind == "posts" else report.comment if kind == "comments" else report
            if action == "delete":
                if kind == "support" or not _permission(request.user, type(target), "delete"):
                    raise PermissionDenied()
                audit_target, flag = target, DELETION
            else:
                if not _permission(request.user, model, "change"):
                    raise PermissionDenied()
                audit_target, flag = report, CHANGE
            LogEntry.objects.log_actions(
                user_id=request.user.pk, queryset=[audit_target], action_flag=flag,
                change_message=f"Mobile moderation: {action} ({kind}, report {report.pk})",
            )
            if action == "delete":
                target.delete()
            else:
                report.is_resolved = True
                fields = ["is_resolved"]
                if kind != "support":
                    report.resolved_at = timezone.now()
                    fields.append("resolved_at")
                report.save(update_fields=fields)
        return Response({"ok": True})
