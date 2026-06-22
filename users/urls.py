from django.conf import settings
from django.conf.urls.static import static
from django.contrib.auth import views as auth_views
from django.urls import include, path

from users.forms_custom import CustomSetPasswordForm
from users import views as users_views

from . import views
from .views import create_post

urlpatterns = [
    path("signup/", views.signup, name="signup"),
    path(
    "moderation/",
    views.moderation_dashboard,
    name="moderation_dashboard",
    ),
    path(
        "moderation/artist/<str:username>/approve/",
        views.moderation_approve_artist,
        name="moderation_approve_artist",
    ),
    path(
        "moderation/artist/<str:username>/reject/",
        views.moderation_reject_artist,
        name="moderation_reject_artist",
    ),
    path(
        "moderation/reports/posts/<int:report_id>/resolve/",
        views.moderation_resolve_post_report,
        name="moderation_resolve_post_report",
    ),
    path(
        "moderation/reports/posts/<int:report_id>/delete-post/",
        views.moderation_delete_reported_post,
        name="moderation_delete_reported_post",
    ),
    path(
        "moderation/reports/comments/<int:report_id>/resolve/",
        views.moderation_resolve_comment_report,
        name="moderation_resolve_comment_report",
    ),
    path(
        "moderation/reports/comments/<int:report_id>/delete-comment/",
        views.moderation_delete_reported_comment,
        name="moderation_delete_reported_comment",
    ),
    path("chats/", views.chats_list, name="chats_list"),
    path("chats/start/<str:username>/", views.start_chat, name="start_chat"),
    path("chats/<int:thread_id>/", views.chat_thread, name="chat_thread"),
    path("chats/<int:thread_id>/send/", views.send_chat_message, name="send_chat_message"),
    path(
        "chats/messages/<int:message_id>/delete/",
        views.delete_chat_message,
        name="delete_chat_message",
    ),
    path(
        "chats/<int:thread_id>/new/",
        views.chat_new_messages,
        name="chat_new_messages",
    ),
    path("search/", views.search_page, name="search_page"),
    path(
    "profile/<str:username>/follow/",
    views.toggle_follow,
    name="toggle_follow",
    ),
    path(
        "profile/<str:username>/portfolio/",
        views.artist_portfolio,
        name="artist_portfolio",
    ),
    path(
        "profile/<str:username>/portfolio/add/",
        views.add_portfolio_work,
        name="add_portfolio_work",
    ),
    path(
        "profile/<str:username>/portfolio/albums/create/",
        views.create_portfolio_album,
        name="create_portfolio_album",
    ),
    path(
        "profile/<str:username>/portfolio/album/<int:album_id>/",
        views.artist_portfolio_album,
        name="artist_portfolio_album",
    ),
    path(
    "profile/<str:username>/portfolio/album/<int:album_id>/edit/",
    views.edit_portfolio_album,
    name="edit_portfolio_album",
    ),
    path(
        "profile/<str:username>/portfolio/album/<int:album_id>/delete/",
        views.delete_portfolio_album,
        name="delete_portfolio_album",
    ),
    path(
        "profile/<str:username>/portfolio/work/<int:work_id>/delete/",
        views.delete_portfolio_work,
        name="delete_portfolio_work",
    ),
    path(
        "profile/<str:username>/followers/",
        views.followers_list,
        name="followers_list",
    ),
    path(
        "profile/<str:username>/following/",
        views.following_list,
        name="following_list",
    ),
    path("profiles/", views.profile_list, name="profile_list"),
    path(
        "admin/verification/<int:profile_id>/",
        views.admin_verification,
        name="admin_verification",
    ),
    path("profile/edit/", views.edit_profile, name="edit_profile"),
    path("profile/", views.user_profile, name="user_profile"),
    path("verification/", views.verification_page, name="verification_page"),
    path(
        "review-verifications/", views.review_verifications, name="review_verifications"
    ),
    path(
        "verify-document/<int:document_id>/",
        views.verify_document,
        name="verify_document",
    ),
    path(
        "pending-verifications/",
        views.pending_verifications,
        name="pending_verifications",
    ),
    path("", views.home, name="home"),
    path("contests/", views.contests_page, name="contests_page"),
    path("posts/create/", views.create_post, name="create_post"),
    path(
        "review-profile/<int:profile_id>/", views.review_profile, name="review_profile"
    ),  # Добавлен маршрут для просмотра профиля
    path("logout/", auth_views.LogoutView.as_view(), name="logout"),
    # Новые маршруты для подтверждения и отклонения профиля
    path(
        "approve-profile/<int:profile_id>/",
        views.approve_profile,
        name="approve_profile",
    ),
    path(
        "reject-profile/<int:profile_id>/", views.reject_profile, name="reject_profile"
    ),
    path(
        "login/",
        auth_views.LoginView.as_view(template_name="registration/login.html"),
        name="login",
    ),
    path(
        "upload-verification-documents/",
        views.upload_verification_documents,
        name="upload_verification_documents",
    ),
    path("verify-email/<uidb64>/<token>/", views.verify_email, name="verify_email"),
    path(
        "password-reset/",
        auth_views.PasswordResetView.as_view(
            template_name="users/password_reset.html",
            email_template_name="emails/password_reset_email.txt",
            html_email_template_name="emails/password_reset_email.html",
            subject_template_name="emails/password_reset_subject.txt",
        ),
        name="password_reset",
    ),
    path(
        "password-reset/done/",
        auth_views.PasswordResetDoneView.as_view(
            template_name="users/password_reset_done.html"
        ),
        name="password_reset_done",
    ),
    path(
        "reset/<uidb64>/<token>/",
        auth_views.PasswordResetConfirmView.as_view(
            template_name="users/password_reset_confirm.html",
            form_class=CustomSetPasswordForm,
        ),
        name="password_reset_confirm",
    ),
    path(
        "reset/done/",
        auth_views.PasswordResetCompleteView.as_view(
            template_name="users/password_reset_complete.html"
        ),
        name="password_reset_complete",
    ),
    path("profile/<str:username>/", views.profile_view, name="profile"),
    # ... другие маршруты
    
    path("coming-soon/<str:feature>/", users_views.coming_soon, name="coming_soon"),
    path("report-problem/", views.report_problem, name="report_problem"),
]

urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
