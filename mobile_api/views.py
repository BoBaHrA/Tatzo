import logging
from urllib.parse import parse_qs, urlparse

from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.models import update_last_login
from django.db import transaction
from django.db.models import Count, Exists, OuterRef, Q
from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.pagination import CursorPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken, TokenError

from posts.models import Post, PostBookmark, PostComment, PostLike, PostReport
from users.models import PortfolioWork, UserBlock, UserFollow
from users.security import check_rate_limit
from users.utils import send_verification_email
from users.views import delete_expired_unverified_duplicate_users

from .serializers import (
    BlockedUserSerializer,
    FeedPostSerializer,
    MeSerializer,
    MeUpdateSerializer,
    PostReportRequestSerializer,
    PublicProfileSerializer,
    RegistrationSerializer,
)

logger = logging.getLogger(__name__)
User = get_user_model()


def _user_payload(user, request):
    return MeSerializer(user, context={"request": request}).data


def _visible_posts_for(viewer):
    return (
        Post.objects.visible_to(viewer)
        .select_related("user", "user__profile")
        .prefetch_related("medias")
        .annotate(
            feed_likes_count=Count("likes", distinct=True),
            feed_comments_count=Count("comments", distinct=True),
            viewer_liked=Exists(
                PostLike.objects.filter(post_id=OuterRef("pk"), user=viewer)
            ),
            viewer_bookmarked=Exists(
                PostBookmark.objects.filter(
                    post_id=OuterRef("pk"),
                    user=viewer,
                )
            ),
            viewer_reported=Exists(
                PostReport.objects.filter(post_id=OuterRef("pk"), user=viewer)
            ),
        )
    )


def _visible_profile_user(request, username):
    target = get_object_or_404(
        User.objects.select_related("profile"),
        username=username,
    )

    if (
        (not target.is_active or not target.profile.is_email_verified)
        and not request.user.is_staff
    ):
        raise Http404

    if target.pk != request.user.pk and UserBlock.objects.filter(
        Q(blocker=request.user, blocked=target)
        | Q(blocker=target, blocked=request.user)
    ).exists():
        raise Http404

    return target


class RegisterView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)

    def post(self, request):
        email = str(request.data.get("email", "")).strip().lower()
        checks = (
            check_rate_limit(
                request,
                scope="mobile:auth:signup:ip:hour",
                limit=3,
                window_seconds=60 * 60,
                identity="ip",
            ),
            check_rate_limit(
                request,
                scope="mobile:auth:signup:ip:day",
                limit=8,
                window_seconds=24 * 60 * 60,
                identity="ip",
            ),
            check_rate_limit(
                request,
                scope="mobile:auth:signup:email",
                limit=3,
                window_seconds=60 * 60,
                value=email,
            ),
        )
        if not all(allowed for allowed, _retry_after in checks):
            retry_after = max(retry_after for _allowed, retry_after in checks)
            return Response(
                {
                    "code": "rate_limited",
                    "detail": "Too many signup attempts. Please try again later.",
                    "retry_after": retry_after,
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        delete_expired_unverified_duplicate_users(
            username=request.data.get("username", ""),
            email=email,
        )
        serializer = RegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            with transaction.atomic():
                user = serializer.save()
                send_verification_email(request, user)
        except Exception:
            logger.exception("Mobile signup failed while sending verification email")
            return Response(
                {
                    "code": "verification_email_unavailable",
                    "detail": "We could not send the confirmation email. Please try again later.",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(
            {
                "code": "verification_required",
                "detail": "Account created. Check your email to confirm it before signing in.",
                "email": user.email,
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)

    def post(self, request):
        identifier = str(request.data.get("identifier", "")).strip()
        password = str(request.data.get("password", ""))

        checks = (
            check_rate_limit(
                request,
                scope="mobile:auth:login:ip",
                limit=10,
                window_seconds=10 * 60,
                identity="ip",
            ),
            check_rate_limit(
                request,
                scope="mobile:auth:login:identifier",
                limit=8,
                window_seconds=30 * 60,
                value=identifier,
            ),
        )
        if not all(allowed for allowed, _retry_after in checks):
            retry_after = max(retry_after for _allowed, retry_after in checks)
            return Response(
                {
                    "code": "rate_limited",
                    "detail": "Too many login attempts. Please try again later.",
                    "retry_after": retry_after,
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        candidate = (
            User.objects.select_related("profile")
            .filter(Q(username__iexact=identifier) | Q(email__iexact=identifier))
            .first()
        )
        if candidate is None or not candidate.check_password(password):
            return Response(
                {"code": "invalid_credentials", "detail": "Invalid credentials."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if not candidate.is_active or not candidate.profile.is_email_verified:
            return Response(
                {
                    "code": "email_not_verified",
                    "detail": "Confirm your email before signing in.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        user = authenticate(
            request=request,
            username=candidate.username,
            password=password,
        )
        if user is None:
            return Response(
                {"code": "invalid_credentials", "detail": "Invalid credentials."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        refresh = RefreshToken.for_user(user)
        update_last_login(None, user)
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": _user_payload(user, request),
            }
        )


class LogoutView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        refresh_value = request.data.get("refresh")
        if not refresh_value:
            return Response(
                {"refresh": ["This field is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            RefreshToken(refresh_value).blacklist()
        except TokenError:
            return Response(
                {"code": "invalid_token", "detail": "Refresh token is invalid."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        return Response(_user_payload(request.user, request))

    def patch(self, request):
        serializer = MeUpdateSerializer(
            request.user,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(_user_payload(user, request))

    def delete(self, request):
        password = str(request.data.get("password", ""))
        if not password or not request.user.check_password(password):
            return Response(
                {"password": ["The password is incorrect."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = request.user
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class FeedCursorPagination(CursorPagination):
    page_size = 10
    page_size_query_param = "limit"
    max_page_size = 30
    ordering = "-created_at"

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


class FeedView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        posts = _visible_posts_for(request.user)

        paginator = FeedCursorPagination()
        page = paginator.paginate_queryset(posts, request, view=self)
        serializer = FeedPostSerializer(
            page,
            many=True,
            context={"request": request},
        )
        return paginator.get_paginated_response(serializer.data)


class FeedLikeView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, post_id):
        post = get_object_or_404(
            Post.objects.visible_to(request.user),
            pk=post_id,
        )

        with transaction.atomic():
            like, created = PostLike.objects.get_or_create(
                post=post,
                user=request.user,
            )
            if not created:
                like.delete()

        return Response(
            {
                "liked": created,
                "likes_count": PostLike.objects.filter(post=post).count(),
            }
        )


class FeedBookmarkView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, post_id):
        post = get_object_or_404(
            Post.objects.visible_to(request.user),
            pk=post_id,
        )

        with transaction.atomic():
            bookmark, created = PostBookmark.objects.get_or_create(
                post=post,
                user=request.user,
            )
            if not created:
                bookmark.delete()

        return Response({"bookmarked": created})


class FeedReportView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, post_id):
        post = get_object_or_404(
            Post.objects.visible_to(request.user),
            pk=post_id,
        )
        if post.user_id == request.user.pk:
            return Response(
                {
                    "code": "cannot_report_own_post",
                    "detail": "You cannot report your own post.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        allowed, retry_after = check_rate_limit(
            request,
            scope="mobile:reports:post",
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

        serializer = PostReportRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data["reason"]
        details = serializer.validated_data.get("details", "")
        report_reason = f"{reason}: {details}" if details else reason

        report, created = PostReport.objects.get_or_create(
            post=post,
            user=request.user,
            defaults={"reason": report_reason[:255]},
        )
        if not created and details and not report.reason:
            report.reason = report_reason[:255]
            report.save(update_fields=("reason",))

        return Response({"reported": True, "created": created})


class PublicProfileView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, username):
        target = _visible_profile_user(request, username)
        posts = _visible_posts_for(request.user).filter(user=target)

        portfolio_works = PortfolioWork.objects.none()
        if target.profile.is_verified_artist:
            portfolio_works = PortfolioWork.objects.filter(user=target).order_by(
                "-created_at"
            )

        target.followers_count = UserFollow.objects.filter(following=target).count()
        target.following_count = UserFollow.objects.filter(follower=target).count()
        target.posts_count = posts.count()
        target.portfolio_works_count = portfolio_works.count()
        target.is_self = target.pk == request.user.pk
        target.is_following = (
            not target.is_self
            and UserFollow.objects.filter(
                follower=request.user,
                following=target,
            ).exists()
        )
        target.portfolio = list(portfolio_works[:18])
        target.recent_posts = list(posts[:6])

        serializer = PublicProfileSerializer(
            target,
            context={"request": request},
        )
        return Response(serializer.data)


class PublicProfileFollowView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, username):
        target = _visible_profile_user(request, username)
        if target.pk == request.user.pk:
            return Response(
                {
                    "code": "cannot_follow_self",
                    "detail": "You cannot follow yourself.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            relation, created = UserFollow.objects.get_or_create(
                follower=request.user,
                following=target,
            )
            if not created:
                relation.delete()

        return Response(
            {
                "is_following": created,
                "followers_count": UserFollow.objects.filter(
                    following=target
                ).count(),
                "following_count": UserFollow.objects.filter(
                    follower=target
                ).count(),
            }
        )


class PublicProfileBlockView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, username):
        target = get_object_or_404(
            User.objects.select_related("profile"),
            username=username,
        )
        if target.pk == request.user.pk:
            return Response(
                {
                    "code": "cannot_block_self",
                    "detail": "You cannot block yourself.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing = UserBlock.objects.filter(
            blocker=request.user,
            blocked=target,
        ).first()
        if existing:
            existing.delete()
            return Response({"is_blocked": False})

        if (
            (not target.is_active or not target.profile.is_email_verified)
            and not request.user.is_staff
        ):
            raise Http404

        if UserBlock.objects.filter(
            blocker=target,
            blocked=request.user,
        ).exists():
            raise Http404

        with transaction.atomic():
            UserBlock.objects.get_or_create(
                blocker=request.user,
                blocked=target,
            )
            UserFollow.objects.filter(
                Q(follower=request.user, following=target)
                | Q(follower=target, following=request.user)
            ).delete()

        return Response({"is_blocked": True})


class BlockedUsersView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        relations = (
            UserBlock.objects.filter(blocker=request.user)
            .select_related("blocked", "blocked__profile")
            .order_by("-created_at")
        )
        users = [relation.blocked for relation in relations]
        serializer = BlockedUserSerializer(
            users,
            many=True,
            context={"request": request},
        )
        return Response({"results": serializer.data})
