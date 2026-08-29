from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView, TokenVerifyView

from .artist_dashboard_views import (
    ArtistAppointmentListView,
    ArtistAppointmentScheduleView,
    ArtistBlockDetailView,
    ArtistBlockListView,
    ArtistBookingPreferencesView,
    ArtistDashboardView,
    ArtistScheduleView,
    ArtistTimeOffDetailView,
    ArtistTimeOffListView,
)
from .booking_views import (
    AppointmentActionView,
    AppointmentDetailView,
    AppointmentArtistNoteView,
    AppointmentListView,
    AppointmentReferenceUploadView,
    AppointmentReferenceView,
    BookingArtistView,
)
from .chat_views import (
    ChatAttachmentView,
    ChatListView,
    ChatMessageCreateView,
    ChatMessageView,
    ChatThreadView,
    StartChatView,
)
from .comment_views import (
    CommentDetailView,
    CommentLikeView,
    CommentListCreateView,
    CommentReplyListView,
    CommentReportView,
)
from .healing_views import (
    HealingAppointmentStartView,
    HealingCheckInMediaView,
    HealingCheckInView,
    HealingDetailView,
    HealingListView,
    HealingMarkHealedView,
    HealingTaskView,
)
from .health_safety_views import (
    AppointmentHealthSafetyView,
    MyHealthSafetyCardView,
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
from .payment_views import (
    AppointmentDepositView,
    ArtistPaymentConnectView,
    ArtistPaymentSettingsView,
    MobileDepositReturnView,
    MobilePaymentReturnView,
)
from .profile_views import ProfileContentView
from .publishing_views import (
    MyPortfolioDetailView,
    MyPortfolioView,
    MyPostDetailView,
    MyPostListView,
)
from .push_views import PushDeviceView
from .search_views import ProfileSearchView
from .style_match_preview_views import StyleMatchPreviewView
from .verification_views import (
    ArtistVerificationDocumentsView,
    ArtistVerificationManualView,
    ArtistVerificationView,
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
    path(
        "me/health-safety/",
        MyHealthSafetyCardView.as_view(),
        name="my_health_safety",
    ),
    path(
        "artist/payments/",
        ArtistPaymentSettingsView.as_view(),
        name="artist_payments",
    ),
    path(
        "artist/payments/connect/",
        ArtistPaymentConnectView.as_view(),
        name="artist_payments_connect",
    ),
    path(
        "payments/mobile-return/",
        MobilePaymentReturnView.as_view(),
        name="mobile_payment_return",
    ),
    path("healing/", HealingListView.as_view(), name="healing_list"),
    path(
        "healing/appointments/<int:appointment_id>/",
        HealingAppointmentStartView.as_view(),
        name="healing_appointment_start",
    ),
    path(
        "healing/<uuid:journey_id>/",
        HealingDetailView.as_view(),
        name="healing_detail",
    ),
    path(
        "healing/<uuid:journey_id>/check-ins/",
        HealingCheckInView.as_view(),
        name="healing_checkin",
    ),
    path(
        "healing/<uuid:journey_id>/tasks/<slug:task_slug>/",
        HealingTaskView.as_view(),
        name="healing_task",
    ),
    path(
        "healing/<uuid:journey_id>/mark-healed/",
        HealingMarkHealedView.as_view(),
        name="healing_mark_healed",
    ),
    path(
        "healing/check-ins/<int:checkin_id>/media/",
        HealingCheckInMediaView.as_view(),
        name="healing_checkin_media",
    ),
    path(
        "me/verification/",
        ArtistVerificationView.as_view(),
        name="artist_verification",
    ),
    path(
        "me/verification/documents/",
        ArtistVerificationDocumentsView.as_view(),
        name="artist_verification_documents",
    ),
    path(
        "me/verification/manual/",
        ArtistVerificationManualView.as_view(),
        name="artist_verification_manual",
    ),
    path("me/posts/", MyPostListView.as_view(), name="my_posts"),
    path(
        "me/posts/<int:post_id>/",
        MyPostDetailView.as_view(),
        name="my_post_detail",
    ),
    path("me/portfolio/", MyPortfolioView.as_view(), name="my_portfolio"),
    path(
        "me/portfolio/<int:work_id>/",
        MyPortfolioDetailView.as_view(),
        name="my_portfolio_detail",
    ),
    path("me/blocked-users/", BlockedUsersView.as_view(), name="blocked_users"),
    path("notifications/", NotificationListView.as_view(), name="notifications"),
    path("push/devices/", PushDeviceView.as_view(), name="push_device"),
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
        "artist/dashboard/",
        ArtistDashboardView.as_view(),
        name="artist_dashboard",
    ),
    path(
        "artist/dashboard/schedule/",
        ArtistScheduleView.as_view(),
        name="artist_schedule",
    ),
    path(
        "artist/dashboard/preferences/",
        ArtistBookingPreferencesView.as_view(),
        name="artist_booking_preferences",
    ),
    path(
        "artist/dashboard/appointments/",
        ArtistAppointmentListView.as_view(),
        name="artist_appointment_list",
    ),
    path(
        "artist/dashboard/appointments/<int:appointment_id>/schedule/",
        ArtistAppointmentScheduleView.as_view(),
        name="artist_appointment_schedule",
    ),
    path(
        "artist/dashboard/time-off/",
        ArtistTimeOffListView.as_view(),
        name="artist_time_off_list",
    ),
    path(
        "artist/dashboard/time-off/<int:time_off_id>/",
        ArtistTimeOffDetailView.as_view(),
        name="artist_time_off_detail",
    ),
    path(
        "artist/dashboard/blocks/",
        ArtistBlockListView.as_view(),
        name="artist_block_list",
    ),
    path(
        "artist/dashboard/blocks/<int:event_id>/",
        ArtistBlockDetailView.as_view(),
        name="artist_block_detail",
    ),
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
        "appointments/<int:appointment_id>/artist-note/",
        AppointmentArtistNoteView.as_view(),
        name="appointment_artist_note",
    ),
    path(
        "appointments/<int:appointment_id>/health-safety/",
        AppointmentHealthSafetyView.as_view(),
        name="appointment_health_safety",
    ),
    path(
        "appointments/<int:appointment_id>/deposit/",
        AppointmentDepositView.as_view(),
        name="appointment_deposit",
    ),
    path(
        "payments/appointments/<int:appointment_id>/return/",
        MobileDepositReturnView.as_view(),
        name="mobile_deposit_return",
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
    path("search/", ProfileSearchView.as_view(), name="profile_search"),
    path(
        "profiles/<str:username>/",
        PublicProfileView.as_view(),
        name="public_profile",
    ),
    path(
        "profiles/<str:username>/content/",
        ProfileContentView.as_view(),
        name="profile_content",
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
    path(
        "feed/<int:post_id>/comments/",
        CommentListCreateView.as_view(),
        name="comment_list_create",
    ),
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
    path(
        "comments/<int:comment_id>/",
        CommentDetailView.as_view(),
        name="comment_detail",
    ),
    path(
        "comments/<int:comment_id>/replies/",
        CommentReplyListView.as_view(),
        name="comment_replies",
    ),
    path(
        "comments/<int:comment_id>/like/",
        CommentLikeView.as_view(),
        name="comment_like",
    ),
    path(
        "comments/<int:comment_id>/report/",
        CommentReportView.as_view(),
        name="comment_report",
    ),
    path("style-match/preview/", StyleMatchPreviewView.as_view(), name="style_match_preview"),
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
