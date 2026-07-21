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
    path("calendar/events/", views.calendar_events, name="calendar_events"),
    path("calendar/events/create/", views.calendar_event_create, name="calendar_event_create"),
    path("calendar/block-time/", views.calendar_block_time, name="calendar_block_time"),
    path("calendar/vacation/", views.calendar_vacation, name="calendar_vacation"),
    path(
        "calendar/events/<int:event_id>/complete/",
        views.calendar_event_complete,
        name="calendar_event_complete",
    ),
    path(
        "calendar/events/<int:event_id>/reschedule/",
        views.calendar_reschedule_request,
        name="calendar_reschedule_request",
    ),
    path(
        "calendar/appointments/<int:appointment_id>/complete/",
        views.calendar_appointment_complete,
        name="calendar_appointment_complete",
    ),
    path(
        "calendar/appointments/<int:appointment_id>/reschedule/",
        views.calendar_appointment_reschedule,
        name="calendar_appointment_reschedule",
    ),
    path(
        "settings/autosave/",
        views.autosave_artist_booking_setting,
        name="autosave_artist_booking_setting",
    ),
    path("settings/", views.artist_booking_settings, name="artist_booking_settings"),
]
