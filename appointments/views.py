import json
from datetime import datetime, timedelta, time

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.core.serializers.json import DjangoJSONEncoder
from django.http import Http404
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils import timezone
from django.utils.translation import gettext as _
from django.views.decorators.http import require_POST

from .models import (
    Appointment,
    AppointmentReferenceImage,
    ArtistAvailability,
    ArtistBookingSettings,
    ArtistTimeOff,
)

DEFAULT_TATTOO_STYLES = [
    "Fine Line",
    "Blackwork",
    "Realism",
    "Japanese",
    "Minimalist",
    "Lettering",
    "Geometric",
    "Watercolor",
    "Floral",
    "Traditional",
    "Other",
]


def _is_bookable_artist(user):
    profile = getattr(user, "profile", None)

    return bool(
        profile
        and profile.account_type == "tattoo_artist"
        and profile.verification_status == "approved"
        and user.is_active
        and profile.is_email_verified
    )


def _time_to_string(value):
    if not value:
        return None

    return value.strftime("%H:%M")


def _build_schedule_payload(artist):
    rows = ArtistAvailability.objects.filter(artist=artist)

    schedule = {}

    for row in rows:
        schedule[str(row.weekday)] = {
            "open": None if row.is_closed else _time_to_string(row.open_time),
            "close": None if row.is_closed else _time_to_string(row.close_time),
            "breaks": (
                [[_time_to_string(row.break_start), _time_to_string(row.break_end)]]
                if row.break_start and row.break_end and not row.is_closed
                else []
            ),
        }

    for weekday in range(7):
        schedule.setdefault(
            str(weekday),
            {
                "open": None,
                "close": None,
                "breaks": [],
            },
        )

    return schedule


def _build_booking_payload(artist):
    appointments = Appointment.objects.filter(
        artist=artist,
        status__in=[
            Appointment.STATUS_PENDING,
            Appointment.STATUS_ACCEPTED,
        ],
    ).only("date", "start_time", "end_time", "artist_id")

    return [
        {
            "artist_id": appointment.artist_id,
            "date": appointment.date.isoformat(),
            "start_time": _time_to_string(appointment.start_time),
            "end_time": _time_to_string(appointment.end_time),
        }
        for appointment in appointments
        if appointment.end_time
    ]


def _get_artist_settings(artist):
    settings, created = ArtistBookingSettings.objects.get_or_create(artist=artist)
    return settings


@login_required
def booking_wizard(request, username):
    artist = get_object_or_404(
        User.objects.select_related("profile"),
        username=username,
    )

    if artist == request.user:
        messages.error(request, _("You cannot book an appointment with yourself."))
        return redirect("profile", username=artist.username)

    if not _is_bookable_artist(artist):
        raise Http404

    booking_settings = _get_artist_settings(artist)

    if not booking_settings.bookings_enabled:
        messages.error(request, _("This artist is not accepting bookings right now."))
        return redirect("profile", username=artist.username)

    vacations = list(
        ArtistTimeOff.objects.filter(artist=artist).values_list("date", flat=True)
    )

    booking_data = {
        "artist": {
            "id": artist.id,
            "username": artist.username,
            "name": artist.username,
            "profile_url": reverse("profile", kwargs={"username": artist.username}),
            "avatar": (
                artist.profile.profile_image.url
                if artist.profile.profile_image
                else ""
            ),
            "styles": [],
            "rating": None,
            "reviews": 0,
            "location": "",
            "starting_price": "",
            "average_response_hours": 24,
        },
        "settings": {
            "minimum_notice_hours": booking_settings.minimum_notice_hours,
            "slot_step_minutes": booking_settings.slot_step_minutes,
            "default_session_minutes": booking_settings.default_session_minutes,
            "consultation_enabled": booking_settings.consultation_enabled,
            "online_consultation_enabled": booking_settings.online_consultation_enabled,
            "consultation_required_before_booking": booking_settings.consultation_required_before_booking,
            "consultation_price": float(booking_settings.consultation_price),
            "online_consultation_price": float(booking_settings.online_consultation_price),
            "reference_images_required": booking_settings.reference_images_required,
            "minimum_reference_images": booking_settings.minimum_reference_images,
            "maximum_reference_images": booking_settings.maximum_reference_images,
            "maximum_booking_window_days": booking_settings.maximum_booking_window_days,
            "maximum_session_hours": booking_settings.maximum_session_hours,
            "deposit_required": booking_settings.deposit_required,
            "deposit_amount": float(booking_settings.deposit_amount),
            "booking_workflow": booking_settings.booking_workflow,
            "active_styles": booking_settings.active_styles,
        },
        "schedule": _build_schedule_payload(artist),
        "vacations": [date.isoformat() for date in vacations],
        "bookings": _build_booking_payload(artist),
    }

    active_styles = booking_settings.active_styles or DEFAULT_TATTOO_STYLES

    return render(
        request,
        "appointments/booking_wizard.html",
        {
            "artist": artist,
            "booking_data_json": json.dumps(booking_data, cls=DjangoJSONEncoder),
            "active_styles": active_styles,
        },
    )


@login_required
@require_POST
def create_appointment(request, username):
    artist = get_object_or_404(
        User.objects.select_related("profile"),
        username=username,
    )

    if artist == request.user:
        messages.error(request, _("You cannot book an appointment with yourself."))
        return redirect("profile", username=artist.username)

    if not _is_bookable_artist(artist):
        raise Http404

    booking_settings = _get_artist_settings(artist)

    date_raw = request.POST.get("date")
    start_time_raw = request.POST.get("start_time")
    duration_raw = request.POST.get("session_length_minutes") or "60"
    booking_type = request.POST.get("booking_type") or Appointment.TYPE_TATTOO

    if not date_raw or not start_time_raw:
        messages.error(request, _("Please choose a date and time."))
        return redirect("booking_wizard", username=artist.username)

    try:
        date_value = datetime.strptime(date_raw, "%Y-%m-%d").date()
        start_time_value = datetime.strptime(start_time_raw, "%H:%M").time()
        duration = int(duration_raw)
    except ValueError:
        messages.error(request, _("Invalid booking date or time."))
        return redirect("booking_wizard", username=artist.username)

    start_dt = timezone.make_aware(
        datetime.combine(date_value, start_time_value),
        timezone.get_current_timezone(),
    )

    minimum_start = timezone.now() + timedelta(
        hours=booking_settings.minimum_notice_hours
    )
    
    if duration > booking_settings.maximum_session_hours * 60:
        messages.error(request, _("This session is longer than the artist allows."))
        return redirect("booking_wizard", username=artist.username)

    latest_allowed_date = timezone.localdate() + timedelta(
        days=booking_settings.maximum_booking_window_days
    )

    if date_value > latest_allowed_date:
        messages.error(request, _("This date is too far in the future."))
        return redirect("booking_wizard", username=artist.username)

    if start_dt < minimum_start:
        messages.error(request, _("This time slot is no longer available."))
        return redirect("booking_wizard", username=artist.username)

    end_dt = start_dt + timedelta(minutes=duration)

    initial_status = (
        Appointment.STATUS_ACCEPTED
        if booking_settings.booking_workflow == "auto"
        else Appointment.STATUS_PENDING
    )

    appointment = Appointment.objects.create(
        client=request.user,
        artist=artist,
        booking_type=booking_type,
        status=initial_status,
        date=date_value,
        start_time=start_time_value,
        end_time=end_dt.time(),
        session_length_minutes=duration,
        client_comfort_limit=request.POST.get("client_comfort_limit", ""),
        styles=[
            item.strip()
            for item in request.POST.get("styles", "").split(",")
            if item.strip()
        ],
        placement=request.POST.get("placement", ""),
        size=request.POST.get("size", ""),
        budget=request.POST.get("budget", ""),
        description=request.POST.get("description", ""),
        ai_ready_payload={
            "placement": request.POST.get("placement", ""),
            "styles": request.POST.get("styles", ""),
            "size": request.POST.get("size", ""),
            "budget": request.POST.get("budget", ""),
            "description": request.POST.get("description", ""),
        },
    )

    files = request.FILES.getlist("references")

    for index, file in enumerate(files[: booking_settings.maximum_reference_images]):
        AppointmentReferenceImage.objects.create(
            appointment=appointment,
            image=file,
            original_name=file.name,
            order=index,
        )

    messages.success(
        request,
        _("Your appointment request has been sent to the artist."),
    )

    return redirect("appointment_detail", appointment_id=appointment.id)


@login_required
def appointments_list(request):
    client_appointments = Appointment.objects.filter(
        client=request.user,
    ).select_related("artist", "artist__profile")

    artist_appointments = Appointment.objects.filter(
        artist=request.user,
    ).select_related("client", "client__profile")

    return render(
        request,
        "appointments/appointments_list.html",
        {
            "client_appointments": client_appointments,
            "artist_appointments": artist_appointments,
        },
    )


@login_required
def appointment_detail(request, appointment_id):
    appointment = get_object_or_404(
        Appointment.objects.select_related(
            "client",
            "client__profile",
            "artist",
            "artist__profile",
        ).prefetch_related("reference_images"),
        id=appointment_id,
    )

    if request.user not in [appointment.client, appointment.artist] and not request.user.is_staff:
        raise Http404

    return render(
        request,
        "appointments/appointment_detail.html",
        {
            "appointment": appointment,
        },
    )


@login_required
@require_POST
def accept_appointment(request, appointment_id):
    appointment = get_object_or_404(Appointment, id=appointment_id, artist=request.user)
    appointment.accept()

    messages.success(request, _("Appointment accepted."))
    return redirect("appointment_detail", appointment_id=appointment.id)


@login_required
@require_POST
def decline_appointment(request, appointment_id):
    appointment = get_object_or_404(Appointment, id=appointment_id, artist=request.user)
    appointment.decline()

    messages.success(request, _("Appointment declined."))
    return redirect("appointment_detail", appointment_id=appointment.id)

def _is_verified_artist(user):
    profile = getattr(user, "profile", None)

    return bool(
        profile
        and profile.account_type == "tattoo_artist"
        and profile.verification_status == "approved"
    )


def _parse_time_or_none(value):
    if not value:
        return None

    try:
        return datetime.strptime(value, "%H:%M").time()
    except ValueError:
        return None


def _ensure_default_artist_availability(artist):
    defaults = {
        0: {"is_closed": True, "open_time": None, "close_time": None},
        1: {"is_closed": False, "open_time": time(10, 0), "close_time": time(18, 0)},
        2: {"is_closed": False, "open_time": time(10, 0), "close_time": time(18, 0)},
        3: {"is_closed": False, "open_time": time(12, 0), "close_time": time(20, 0)},
        4: {"is_closed": False, "open_time": time(10, 0), "close_time": time(18, 0)},
        5: {"is_closed": False, "open_time": time(10, 0), "close_time": time(16, 0)},
        6: {"is_closed": True, "open_time": None, "close_time": None},
    }

    for weekday, values in defaults.items():
        ArtistAvailability.objects.get_or_create(
            artist=artist,
            weekday=weekday,
            defaults={
                **values,
                "break_start": time(13, 0) if not values["is_closed"] else None,
                "break_end": time(14, 0) if not values["is_closed"] else None,
            },
        )
        
        
@login_required
def artist_booking_settings(request):
    if not _is_verified_artist(request.user):
        messages.error(
            request,
            _("Booking settings are available only for verified tattoo artists."),
        )
        return redirect("user_profile")

    booking_settings, created = ArtistBookingSettings.objects.get_or_create(
        artist=request.user,
        defaults={
            "active_styles": ["Fine Line", "Blackwork", "Geometric"],
        },
    )

    if not booking_settings.active_styles:
        booking_settings.active_styles = ["Fine Line", "Blackwork", "Geometric"]
        booking_settings.save(update_fields=["active_styles"])

    _ensure_default_artist_availability(request.user)

    if request.method == "POST":
        booking_settings.bookings_enabled = request.POST.get("bookings_enabled") == "on"

        booking_settings.consultation_required_before_booking = (
            request.POST.get("consultation_required_before_booking") == "on"
        )
        booking_settings.consultation_enabled = request.POST.get("consultation_enabled") == "on"
        booking_settings.online_consultation_enabled = (
            request.POST.get("online_consultation_enabled") == "on"
        )
        booking_settings.studio_consultation_enabled = (
            request.POST.get("studio_consultation_enabled") == "on"
        )
        booking_settings.phone_consultation_enabled = (
            request.POST.get("phone_consultation_enabled") == "on"
        )

        booking_settings.reference_images_required = (
            request.POST.get("reference_images_required") == "on"
        )
        booking_settings.deposit_required = request.POST.get("deposit_required") == "on"

        booking_settings.booking_workflow = request.POST.get("booking_workflow", "manual")

        booking_settings.minimum_notice_hours = int(
            request.POST.get("minimum_notice_hours") or 24
        )
        booking_settings.maximum_booking_window_days = int(
            request.POST.get("maximum_booking_window_days") or 60
        )
        booking_settings.maximum_session_hours = int(
            request.POST.get("maximum_session_hours") or 6
        )
        booking_settings.minimum_reference_images = int(
            request.POST.get("minimum_reference_images") or 1
        )
        booking_settings.maximum_reference_images = int(
            request.POST.get("maximum_reference_images") or 10
        )

        booking_settings.consultation_price = request.POST.get("consultation_price") or 0
        booking_settings.online_consultation_price = (
            request.POST.get("online_consultation_price") or 0
        )
        booking_settings.deposit_amount = request.POST.get("deposit_amount") or 0

        booking_settings.active_styles = request.POST.getlist("active_styles")

        booking_settings.save()

        for weekday in range(7):
            is_open = request.POST.get(f"weekday_{weekday}_open") == "on"

            ArtistAvailability.objects.update_or_create(
                artist=request.user,
                weekday=weekday,
                defaults={
                    "is_closed": not is_open,
                    "open_time": _parse_time_or_none(
                        request.POST.get(f"weekday_{weekday}_open_time")
                    )
                    if is_open
                    else None,
                    "close_time": _parse_time_or_none(
                        request.POST.get(f"weekday_{weekday}_close_time")
                    )
                    if is_open
                    else None,
                    "break_start": _parse_time_or_none(
                        request.POST.get(f"weekday_{weekday}_break_start")
                    )
                    if is_open
                    else None,
                    "break_end": _parse_time_or_none(
                        request.POST.get(f"weekday_{weekday}_break_end")
                    )
                    if is_open
                    else None,
                },
            )

        messages.success(request, _("Booking settings saved."))
        return redirect("artist_booking_settings")

    availability_rows = ArtistAvailability.objects.filter(
        artist=request.user,
    ).order_by("weekday")

    return render(
        request,
        "appointments/artist_booking_settings.html",
        {
            "booking_settings": booking_settings,
            "availability_rows": availability_rows,
            "default_styles": DEFAULT_TATTOO_STYLES,
        },
    )