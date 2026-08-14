from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView, TokenVerifyView

from .chat_views import (
    ChatAttachmentView,
    ChatListView,
    ChatMessageCreateView,
    ChatMessageView,
    ChatThreadView,
    StartChatView,
)
from .booking_views import (
    AppointmentActionView,
    AppointmentDetailView,
    AppointmentListView,
    AppointmentReferenceView,
    AppointmentReferenceUploadView,
    BookingArtistView,
)
from .map_views import (
    MapLocationClaimView,
    MapLocationListView,
    MapLocationRequestView,
)
from .notification_views import (
    NotificationListView,
    NotificationReadAllView,
    NotificationReadView,
    NotificationUnreadCountView,
)

from .views import (
    BlockedUsersView,
    FeedBookmarkView,
    FeedDetailView,
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
    StyleMatchReactionView,
    StyleMatchResultView,
    StyleMatchView,
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
    path("notifications/", NotificationListView.as_view(), name="notifications"),
    path(
        "notifications/unread-count/",
        NotificationUnreadCountView.as_view(),
        name="notification_unread_count",
    ),
    path(
        "notifications/read-all/",
        NotificationReadAllView.as_view(),
        name="notification_read_all",
    ),
    path(
        "notifications/<int:notification_id>/read/",
        NotificationReadView.as_view(),
        name="notification_read",
    ),
    path("map/locations/", MapLocationListView.as_view(), name="map_locations"),
    path(
        "map/locations/request/",
        MapLocationRequestView.as_view(),
        name="map_location_request",
    ),
    path(
        "map/locations/<int:location_id>/claim/",
        MapLocationClaimView.as_view(),
        name="map_location_claim",
    ),
    path("appointments/", AppointmentListView.as_view(), name="appointment_list"),
    path(
        "appointments/book/<str:username>/",
        BookingArtistView.as_view(),
        name="appointment_booking",
    ),
    path(
        "appointments/<int:appointment_id>/",
        AppointmentDetailView.as_view(),
        name="appointment_detail",
    ),
    path(
        "appointments/<int:appointment_id>/action/",
        AppointmentActionView.as_view(),
        name="appointment_action",
    ),
    path(
        "appointments/<int:appointment_id>/references/",
        AppointmentReferenceUploadView.as_view(),
        name="appointment_reference_upload",
    ),
    path(
        "appointments/references/<int:reference_id>/",
        AppointmentReferenceView.as_view(),
        name="appointment_reference",
    ),
    path("chat/", ChatListView.as_view(), name="chat_list"),
    path(
        "chat/start/<str:username>/",
        StartChatView.as_view(),
        name="chat_start",
    ),
    path(
        "chat/<int:thread_id>/",
        ChatThreadView.as_view(),
        name="chat_thread",
    ),
    path(
        "chat/<int:thread_id>/messages/",
        ChatMessageCreateView.as_view(),
        name="chat_message_create",
    ),
    path(
        "chat/messages/<int:message_id>/",
        ChatMessageView.as_view(),
        name="chat_message",
    ),
    path(
        "chat/attachments/<int:attachment_id>/",
        ChatAttachmentView.as_view(),
        name="chat_attachment",
    ),
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
    path("feed/<int:post_id>/", FeedDetailView.as_view(), name="feed_detail"),
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
    path("style-match/", StyleMatchView.as_view(), name="style_match"),
    path(
        "style-match/<uuid:session_id>/react/",
        StyleMatchReactionView.as_view(),
        name="style_match_react",
    ),
    path(
        "style-match/<uuid:session_id>/result/",
        StyleMatchResultView.as_view(),
        name="style_match_result",
    ),
]
