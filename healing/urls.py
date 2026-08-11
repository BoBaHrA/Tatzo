from django.urls import path

from . import integrations, views

app_name = "healing"

urlpatterns = [
    path("", views.dashboard, name="dashboard"),
    path("appointments/<int:appointment_id>/start/", views.start_journey, name="start_journey"),
    path("chat-context/<int:thread_id>/", integrations.chat_session_context, name="chat_session_context"),
    path("<uuid:journey_id>/community/", integrations.community_context, name="community_context"),
    path("<uuid:journey_id>/check-ins/upload/", views.upload_checkin, name="upload_checkin"),
    path("<uuid:journey_id>/tasks/<slug:task_slug>/toggle/", views.toggle_task, name="toggle_task"),
    path("<uuid:journey_id>/mark-healed/", views.mark_healed, name="mark_healed"),
    path("<uuid:journey_id>/chat/", views.open_chat, name="open_chat"),
    path("<uuid:journey_id>/chat-draft/", views.chat_draft, name="chat_draft"),
    path("check-ins/<int:checkin_id>/media/", views.checkin_media, name="checkin_media"),
]
