from django.urls import path

from . import views


urlpatterns = [
    path("", views.appointments_list, name="appointments_list"),
    path("<int:appointment_id>/", views.appointment_detail, name="appointment_detail"),
    path("<int:appointment_id>/accept/", views.accept_appointment, name="accept_appointment"),
    path("<int:appointment_id>/decline/", views.decline_appointment, name="decline_appointment"),
    path("artist/<str:username>/book/", views.booking_wizard, name="booking_wizard"),
    path("artist/<str:username>/book/create/", views.create_appointment, name="create_appointment"),
    path("settings/", views.artist_booking_settings, name="artist_booking_settings"),
]