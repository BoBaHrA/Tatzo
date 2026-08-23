from urllib.parse import parse_qs, urlparse

from django.db import transaction
from django.db.models import Count, Exists, OuterRef, Q
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.pagination import CursorPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from posts.models import CommentLike, CommentReport, Post, PostComment
from users.models import UserBlock
from users.security import check_rate_limit, is_new_account

from .serializers import FeedAuthorSerializer, PostReportRequestSerializer


class CommentWriteSerializer(serializers.Serializer):
    content = serializers.CharField(max_length=1000, trim_whitespace=True)
    parent_id = serializers.IntegerField(
        min_value=1,
        required=False,
        allow_null=True,
    )


class CommentContentSerializer(serializers.Serializer):
    content = serializers.CharField(max_length=1000, trim_whitespace=True)


class PrivateNoStoreMixin:
    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response


class CommentCursorPagination(CursorPagination):
    page_size = 15
    page_size_query_param = "limit"
    max_page_size = 30
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
                "next_cursor": next_cursor,
                "has_more": next_cursor is not None,
                "results": data,
            }
        )


class ReplyCursorPagination(CommentCursorPagination):
    ordering = ("-created_at", "-id")


def _blocked_user_ids(user):
    relations = UserBlock.objects.filter(Q(blocker=user) | Q(blocked=user)).values_list(
        "blocker_id", "blocked_id"
    )
    return {
        blocked_id if blocker_id == user.pk else blocker_id
        for blocker_id, blocked_id in relations
    }


def _visible_post(user, post_id):
    return get_object_or_404(Post.objects.visible_to(user), pk=post_id)


def _decorate_comments(queryset, user, *, include_replies_count=True):
    blocked_ids = _blocked_user_ids(user)
    queryset = (
        queryset.filter(
            user__is_active=True,
            user__profile__is_email_verified=True,
        )
        .exclude(user_id__in=blocked_ids)
        .select_related("user", "user__profile", "post")
        .annotate(
            mobile_likes_count=Count("likes", distinct=True),
            viewer_liked=Exists(
                CommentLike.objects.filter(
                    comment_id=OuterRef("pk"),
                    user=user,
                )
            ),
            viewer_reported=Exists(
                CommentReport.objects.filter(
                    comment_id=OuterRef("pk"),
                    user=user,
                )
            ),
        )
    )
    if include_replies_count:
        visible_replies = Q(
            replies__user__is_active=True,
            replies__user__profile__is_email_verified=True,
        )
        if blocked_ids:
            visible_replies &= ~Q(replies__user_id__in=blocked_ids)
        queryset = queryset.annotate(
            mobile_replies_count=Count(
                "replies",
                filter=visible_replies,
                distinct=True,
            )
        )
    return queryset


def _visible_comments(user):
    return _decorate_comments(
        PostComment.objects.filter(post__in=Post.objects.visible_to(user)),
        user,
    )


def _visible_comments_count(post, user):
    blocked_ids = _blocked_user_ids(user)
    return (
        PostComment.objects.filter(
            post=post,
            user__is_active=True,
            user__profile__is_email_verified=True,
        )
        .exclude(user_id__in=blocked_ids)
        .count()
    )


def _comment_payload(comment, request):
    return {
        "id": comment.pk,
        "author": FeedAuthorSerializer(
            comment.user,
            context={"request": request},
        ).data,
        "content": comment.content,
        "created_at": comment.created_at,
        "parent_id": comment.parent_id,
        "likes_count": getattr(comment, "mobile_likes_count", comment.likes.count()),
        "replies_count": getattr(comment, "mobile_replies_count", 0),
        "is_liked": bool(getattr(comment, "viewer_liked", False)),
        "is_reported": bool(getattr(comment, "viewer_reported", False)),
        "is_owned": comment.user_id == request.user.pk,
        "is_post_owner": comment.user_id == comment.post.user_id,
    }


class CommentListCreateView(PrivateNoStoreMixin, APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, post_id):
        post = _visible_post(request.user, post_id)
        comments = _visible_comments(request.user).filter(
            post=post,
            parent__isnull=True,
        )
        paginator = CommentCursorPagination()
        page = paginator.paginate_queryset(comments, request, view=self)
        response = paginator.get_paginated_response(
            [_comment_payload(comment, request) for comment in page]
        )
        response.data.update(
            {
                "comments_count": _visible_comments_count(post, request.user),
                "comments_enabled": not post.disable_comments,
            }
        )
        return response

    def post(self, request, post_id):
        post = _visible_post(request.user, post_id)
        if post.disable_comments:
            return Response(
                {
                    "code": "comments_disabled",
                    "detail": "Comments are disabled for this post.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = CommentWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        allowed, retry_after = check_rate_limit(
            request,
            scope="mobile:comments:create",
            limit=20 if is_new_account(request.user) else 60,
            window_seconds=60 * 60,
            identity="user",
        )
        if not allowed:
            return Response(
                {
                    "code": "rate_limited",
                    "detail": "You are commenting too quickly.",
                    "retry_after": retry_after,
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        parent = None
        parent_id = serializer.validated_data.get("parent_id")
        if parent_id:
            parent = get_object_or_404(
                _visible_comments(request.user),
                pk=parent_id,
                post=post,
                parent__isnull=True,
            )

        with transaction.atomic():
            comment = PostComment.objects.create(
                post=post,
                user=request.user,
                content=serializer.validated_data["content"],
                parent=parent,
            )

        comment = _visible_comments(request.user).get(pk=comment.pk)
        return Response(
            {
                "comment": _comment_payload(comment, request),
                "comments_count": _visible_comments_count(post, request.user),
            },
            status=status.HTTP_201_CREATED,
        )


class CommentReplyListView(PrivateNoStoreMixin, APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, comment_id):
        root = get_object_or_404(
            _visible_comments(request.user),
            pk=comment_id,
            parent__isnull=True,
        )
        replies = _decorate_comments(
            PostComment.objects.filter(parent=root),
            request.user,
            include_replies_count=False,
        )
        paginator = ReplyCursorPagination()
        page = paginator.paginate_queryset(replies, request, view=self)
        response = paginator.get_paginated_response(
            [_comment_payload(reply, request) for reply in page]
        )
        response.data.update(
            {
                "root_id": root.pk,
                "replies_count": replies.count(),
            }
        )
        return response


class CommentDetailView(PrivateNoStoreMixin, APIView):
    permission_classes = (IsAuthenticated,)

    def patch(self, request, comment_id):
        comment = get_object_or_404(
            PostComment.objects.select_related("user", "user__profile", "post"),
            pk=comment_id,
            user=request.user,
        )
        serializer = CommentContentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        comment.content = serializer.validated_data["content"]
        comment.save(update_fields=("content",))

        comment = _decorate_comments(
            PostComment.objects.filter(pk=comment.pk),
            request.user,
        ).get()
        return Response({"comment": _comment_payload(comment, request)})

    def delete(self, request, comment_id):
        comment = get_object_or_404(
            PostComment.objects.select_related("post"),
            pk=comment_id,
            user=request.user,
        )
        post = comment.post
        parent_id = comment.parent_id
        comment.delete()
        return Response(
            {
                "deleted": True,
                "id": comment_id,
                "parent_id": parent_id,
                "comments_count": _visible_comments_count(post, request.user),
            }
        )


class CommentLikeView(PrivateNoStoreMixin, APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, comment_id):
        comment = get_object_or_404(
            _visible_comments(request.user),
            pk=comment_id,
        )
        allowed, retry_after = check_rate_limit(
            request,
            scope="mobile:comments:like",
            limit=180,
            window_seconds=60 * 60,
            identity="user",
        )
        if not allowed:
            return Response(
                {
                    "code": "rate_limited",
                    "detail": "You are reacting too quickly.",
                    "retry_after": retry_after,
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        with transaction.atomic():
            like, created = CommentLike.objects.get_or_create(
                comment=comment,
                user=request.user,
            )
            if not created:
                like.delete()

        return Response(
            {
                "liked": created,
                "likes_count": CommentLike.objects.filter(comment=comment).count(),
            }
        )


class CommentReportView(PrivateNoStoreMixin, APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, comment_id):
        comment = get_object_or_404(
            _visible_comments(request.user),
            pk=comment_id,
        )
        if comment.user_id == request.user.pk:
            return Response(
                {
                    "code": "cannot_report_own_comment",
                    "detail": "You cannot report your own comment.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = PostReportRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        allowed, retry_after = check_rate_limit(
            request,
            scope="mobile:reports:comment",
            limit=10,
            window_seconds=60 * 60,
            identity="user",
        )
        if not allowed:
            return Response(
                {
                    "code": "rate_limited",
                    "detail": "You are sending reports too quickly.",
                    "retry_after": retry_after,
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        reason = serializer.validated_data["reason"]
        details = serializer.validated_data.get("details", "")
        report_reason = f"{reason}: {details}" if details else reason
        report, created = CommentReport.objects.get_or_create(
            comment=comment,
            user=request.user,
            defaults={"reason": report_reason[:255]},
        )
        if not created and not report.reason:
            report.reason = report_reason[:255]
            report.save(update_fields=("reason",))
        return Response({"reported": True, "created": created})
