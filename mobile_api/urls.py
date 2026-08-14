from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView, TokenVerifyView

from .views import (
    BlockedUsersView,
    FeedBookmarkView,
    FeedLikeView,
    FeedReportView,
    FeedView,
    LoginView,
    LogoutView,
    MeView,
    PublicProfileBlockView,
    PublicProfileFollowView,
    PublicProfileView,
    RegisterView,
)

app_name = "mobile_api"

urlpatterns = [
    path("auth/register/", RegisterView.as_view(), name="register"),
    path("auth/token/", LoginView.as_view(), name="token"),
    path("auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("auth/token/verify/", TokenVerifyView.as_view(), name="token_verify"),
    path("auth/logout/", LogoutView.as_view(), name="logout"),
    path("me/", MeView.as_view(), name="me"),
    path("me/blocked-users/", BlockedUsersView.as_view(), name="blocked_users"),
    path(
        "profiles/<str:username>/",
        PublicProfileView.as_view(),
        name="public_profile",
    ),
    path(
        "profiles/<str:username>/follow/",
        PublicProfileFollowView.as_view(),
        name="public_profile_follow",
    ),
    path(
        "profiles/<str:username>/block/",
        PublicProfileBlockView.as_view(),
        name="public_profile_block",
    ),
    path("feed/", FeedView.as_view(), name="feed"),
    path("feed/<int:post_id>/like/", FeedLikeView.as_view(), name="feed_like"),
    path(
        "feed/<int:post_id>/bookmark/",
        FeedBookmarkView.as_view(),
        name="feed_bookmark",
    ),
    path(
        "feed/<int:post_id>/report/",
        FeedReportView.as_view(),
        name="feed_report",
    ),
]
