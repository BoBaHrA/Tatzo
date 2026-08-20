from django.urls import path

from . import views

app_name = "health_safety"

urlpatterns = [
    path("", views.card, name="card"),
    path("delete/", views.delete_card, name="delete_card"),
    path("status/", views.status, name="status"),
    path("share-intent/", views.share_intent, name="share_intent"),
    path(
        "appointments/<int:appointment_id>/context/",
        views.appointment_context,
        name="appointment_context",
    ),
    path(
        "appointments/<int:appointment_id>/share/",
        views.share_appointment,
        name="share_appointment",
    ),
    path(
        "appointments/<int:appointment_id>/revoke/",
        views.revoke_share,
        name="revoke_share",
    ),
]
