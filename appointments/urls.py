from django.urls import path

from . import views


urlpatterns = [
    path("", views.appointments_list, name="appointments_list"),
    path("<int:appointment_id>/", views.appointment_detail, name="appointment_detail"),
    path("<int:appointment_id>/accept/", views.accept_appointment, name="accept_appointment"),
    path("<int:appointment_id>/decline/", views.decline_appointment, name="decline_appointment"),
    path("<int:appointment_id>/need-references/", views.need_more_references, name="need_more_references"),
    path("<int:appointment_id>/consultation-required/", views.consultation_required, name="consultation_required"),
    path("<int:appointment_id>/cancel/", views.cancel_appointment, name="cancel_appointment"),
    path("manual/create/", views.create_manual_appointment, name="create_manual_appointment"),
    path("artist/<str:username>/book/", views.booking_wizard, name="booking_wizard"),
    path("artist/<str:username>/book/create/", views.create_appointment, name="create_appointment"),
    path("settings/", views.artist_booking_settings, name="artist_booking_settings"),
]