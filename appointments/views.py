import json
from datetime import datetime, timedelta, time

from django.db.models import Count, Q

from users.models import ChatMessage, ChatThread, PortfolioWork

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.core.serializers.json import DjangoJSONEncoder
from django.http import Http404, JsonResponse
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
            Appointment.STATUS_NEEDS_REFERENCES,
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


def _get_booking_status_block_message(booking_status):
    blocked_messages = {
        ArtistBookingSettings.BOOKING_STATUS_PAUSED: _(
            "This artist has paused bookings right now."
        ),
        ArtistBookingSettings.BOOKING_STATUS_VACATION: _(
            "This artist is currently on vacation."
        ),
        ArtistBookingSettings.BOOKING_STATUS_FULLY_BOOKED: _(
            "This artist is fully booked right now."
        ),
        ArtistBookingSettings.BOOKING_STATUS_EMERGENCY: _(
            "This artist is temporarily unavailable."
        ),
    }
    return blocked_messages.get(booking_status)


def _get_booking_status_label(booking_status):
    labels = {
        ArtistBookingSettings.BOOKING_STATUS_OPEN: _("Accepting bookings"),
        ArtistBookingSettings.BOOKING_STATUS_PAUSED: _("Bookings paused"),
        ArtistBookingSettings.BOOKING_STATUS_VACATION: _("On vacation"),
        ArtistBookingSettings.BOOKING_STATUS_FULLY_BOOKED: _("Fully booked"),
        ArtistBookingSettings.BOOKING_STATUS_CONSULTATION_ONLY: _("Consultation only"),
        ArtistBookingSettings.BOOKING_STATUS_EMERGENCY: _("Emergency closure"),
    }
    return labels.get(booking_status, labels[ArtistBookingSettings.BOOKING_STATUS_OPEN])


def _clean_auto_response_text(value):
    return (value or "").strip()[:2000]


def _send_artist_auto_response(appointment, message_text):
    message_text = _clean_auto_response_text(message_text)

    if not message_text:
        return

    thread = ChatThread.get_or_create_for_users(
        appointment.artist,
        appointment.client,
    )
    ChatMessage.objects.create(
        thread=thread,
        sender=appointment.artist,
        content=message_text,
    )
    thread.save(update_fields=["updated_at"])


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

    block_message = _get_booking_status_block_message(
        getattr(
            booking_settings,
            "booking_status",
            ArtistBookingSettings.BOOKING_STATUS_OPEN,
        )
    )

    if block_message:
        messages.error(request, block_message)
        return redirect("profile", username=artist.username)

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
            "studio_consultation_enabled": booking_settings.studio_consultation_enabled,
            "phone_consultation_enabled": booking_settings.phone_consultation_enabled,
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
    block_message = _get_booking_status_block_message(
        getattr(
            booking_settings,
            "booking_status",
            ArtistBookingSettings.BOOKING_STATUS_OPEN,
        )
    )

    if block_message:
        messages.error(request, block_message)
        return redirect("profile", username=artist.username)

    date_raw = request.POST.get("date")
    start_time_raw = request.POST.get("start_time")
    duration_raw = request.POST.get("session_length_minutes") or "60"
    booking_type = request.POST.get("booking_type") or Appointment.TYPE_TATTOO
    valid_booking_types = {choice[0] for choice in Appointment.BOOKING_TYPE_CHOICES}
    consultation_already_completed = (
        request.POST.get("consultation_already_completed") == "true"
    )
    consultation_note = (request.POST.get("consultation_note") or "").strip()[:240]

    if booking_type not in valid_booking_types:
        booking_type = Appointment.TYPE_TATTOO

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

    is_consultation_booking = booking_type in [
        Appointment.TYPE_CONSULTATION,
        Appointment.TYPE_ONLINE_CONSULTATION,
    ]

    if is_consultation_booking:
        duration = 60
        consultation_already_completed = False
    elif (
        booking_settings.consultation_required_before_booking
        and not consultation_already_completed
    ):
        messages.error(
            request,
            _("This artist requires a consultation before booking a tattoo session."),
        )
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

    if ArtistTimeOff.objects.filter(artist=artist, date=date_value).exists():
        messages.error(request, _("This date is blocked by the artist."))
        return redirect("booking_wizard", username=artist.username)

    if start_dt < minimum_start:
        messages.error(request, _("This time slot is no longer available."))
        return redirect("booking_wizard", username=artist.username)

    end_dt = start_dt + timedelta(minutes=duration)

    files = request.FILES.getlist("references")

    minimum_reference_images = booking_settings.minimum_reference_images or 0

    if minimum_reference_images > 0 and len(files) < minimum_reference_images:
        messages.error(request, _("Please upload the required reference images."))
        return redirect("booking_wizard", username=artist.username)

    if len(files) > booking_settings.maximum_reference_images:
        messages.error(request, _("You uploaded too many reference images."))
        return redirect("booking_wizard", username=artist.username)

    initial_status = (
        Appointment.STATUS_ACCEPTED
        if booking_settings.booking_workflow == "auto"
        else Appointment.STATUS_PENDING
    )

    appointment = Appointment.objects.create(
        client=request.user,
        artist=artist,
        booking_type=booking_type,
        consultation_already_completed=consultation_already_completed,
        consultation_note=consultation_note,
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
            "booking_type": booking_type,
            "consultation_already_completed": consultation_already_completed,
            "consultation_note": consultation_note,
        },
    )

    for index, file in enumerate(files[: booking_settings.maximum_reference_images]):
        AppointmentReferenceImage.objects.create(
            appointment=appointment,
            image=file,
            original_name=file.name,
            order=index,
        )

    _send_artist_auto_response(
        appointment,
        booking_settings.auto_response_booking_received,
    )

    if booking_settings.consultation_required_before_booking:
        _send_artist_auto_response(
            appointment,
            booking_settings.auto_response_consultation_required,
        )

    messages.success(
        request,
        _("Your appointment request has been sent to the artist."),
    )

    return redirect("appointment_detail", appointment_id=appointment.id)


@login_required
@require_POST
def create_manual_appointment(request):
    if not _is_verified_artist(request.user):
        messages.error(request, _("Only verified artists can create manual bookings."))
        return redirect("artist_booking_settings")

    booking_settings = _get_artist_settings(request.user)
    client_username = (request.POST.get("client_username") or "").strip()
    date_raw = request.POST.get("date")
    start_time_raw = request.POST.get("start_time")
    duration_raw = request.POST.get("session_length_minutes") or "60"
    booking_type = request.POST.get("booking_type") or Appointment.TYPE_TATTOO

    if not client_username:
        messages.error(request, _("Enter an existing client username."))
        return redirect("artist_booking_settings")

    client = User.objects.filter(username__iexact=client_username).first()

    if not client:
        messages.error(request, _("No user was found with that username."))
        return redirect("artist_booking_settings")

    if client == request.user:
        messages.error(request, _("You cannot create a booking with yourself."))
        return redirect("artist_booking_settings")

    try:
        date_value = datetime.strptime(date_raw, "%Y-%m-%d").date()
        start_time_value = datetime.strptime(start_time_raw, "%H:%M").time()
        duration = int(duration_raw)
    except (TypeError, ValueError):
        messages.error(request, _("Enter a valid manual booking date and time."))
        return redirect("artist_booking_settings")

    if duration <= 0:
        messages.error(request, _("Duration must be greater than zero."))
        return redirect("artist_booking_settings")

    if duration > booking_settings.maximum_session_hours * 60:
        messages.error(request, _("This session is longer than your booking settings allow."))
        return redirect("artist_booking_settings")

    start_dt = timezone.make_aware(
        datetime.combine(date_value, start_time_value),
        timezone.get_current_timezone(),
    )

    if start_dt < timezone.now():
        messages.error(request, _("Manual bookings cannot be created in the past."))
        return redirect("artist_booking_settings")

    if ArtistTimeOff.objects.filter(artist=request.user, date=date_value).exists():
        messages.error(request, _("This date is blocked on your calendar."))
        return redirect("artist_booking_settings")

    if booking_type not in dict(Appointment.BOOKING_TYPE_CHOICES):
        booking_type = Appointment.TYPE_TATTOO

    end_dt = start_dt + timedelta(minutes=duration)
    styles = [
        item.strip()
        for item in (request.POST.get("styles") or "").split(",")
        if item.strip()
    ]

    appointment = Appointment.objects.create(
        client=client,
        artist=request.user,
        booking_type=booking_type,
        status=Appointment.STATUS_ACCEPTED,
        date=date_value,
        start_time=start_time_value,
        end_time=end_dt.time(),
        session_length_minutes=duration,
        styles=styles,
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

    messages.success(request, _("Manual booking created."))
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
def calendar_page(request):
    if _is_verified_artist(request.user):
        return redirect("artist_booking_settings")

    return redirect("appointments_list")


@login_required
def calendar_events(request):
    return JsonResponse({"events": []})


@login_required
@require_POST
def calendar_event_create(request):
    return JsonResponse(
        {"ok": False, "detail": "Calendar events API is not implemented yet."},
        status=501,
    )


@login_required
@require_POST
def calendar_event_complete(request, event_id):
    return JsonResponse(
        {"ok": False, "detail": "Calendar events API is not implemented yet."},
        status=501,
    )


@login_required
@require_POST
def calendar_reschedule_request(request, event_id):
    return JsonResponse(
        {"ok": False, "detail": "Calendar events API is not implemented yet."},
        status=501,
    )


@login_required
@require_POST
def calendar_block_time(request):
    return JsonResponse(
        {"ok": False, "detail": "Use artist dashboard blocked periods instead."},
        status=501,
    )


@login_required
@require_POST
def calendar_vacation(request):
    return JsonResponse(
        {"ok": False, "detail": "Use artist dashboard blocked periods instead."},
        status=501,
    )


@login_required
def appointment_detail(request, appointment_id):
    appointment = get_object_or_404(
        Appointment.objects.select_related(
            "client",
            "client__profile",
            "artist",
            "artist__profile",
            "artist__booking_settings",
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

    if appointment.status not in [
        Appointment.STATUS_PENDING,
        Appointment.STATUS_NEEDS_REFERENCES,
    ]:
        messages.error(request, _("This appointment cannot be accepted."))
        return redirect("appointment_detail", appointment_id=appointment.id)

    appointment.accept()
    booking_settings = _get_artist_settings(appointment.artist)
    _send_artist_auto_response(
        appointment,
        booking_settings.auto_response_booking_approved,
    )

    messages.success(request, _("Appointment accepted."))
    return redirect("appointment_detail", appointment_id=appointment.id)


@login_required
@require_POST
def decline_appointment(request, appointment_id):
    appointment = get_object_or_404(Appointment, id=appointment_id, artist=request.user)

    if appointment.status not in [
        Appointment.STATUS_PENDING,
        Appointment.STATUS_NEEDS_REFERENCES,
    ]:
        messages.error(request, _("This appointment cannot be declined."))
        return redirect("appointment_detail", appointment_id=appointment.id)

    appointment.decline()
    booking_settings = _get_artist_settings(appointment.artist)
    _send_artist_auto_response(
        appointment,
        booking_settings.auto_response_booking_declined,
    )

    messages.success(request, _("Appointment declined."))
    return redirect("appointment_detail", appointment_id=appointment.id)


@login_required
@require_POST
def need_more_references(request, appointment_id):
    appointment = get_object_or_404(Appointment, id=appointment_id, artist=request.user)

    if appointment.status not in [
        Appointment.STATUS_PENDING,
        Appointment.STATUS_NEEDS_REFERENCES,
    ]:
        messages.error(request, _("More references cannot be requested for this appointment."))
        return redirect("appointment_detail", appointment_id=appointment.id)

    appointment.status = Appointment.STATUS_NEEDS_REFERENCES
    appointment.save(update_fields=["status", "updated_at"])
    booking_settings = _get_artist_settings(appointment.artist)
    _send_artist_auto_response(
        appointment,
        booking_settings.auto_response_need_more_references,
    )

    messages.success(request, _("Reference request sent."))
    return redirect("appointment_detail", appointment_id=appointment.id)


@login_required
@require_POST
def consultation_required(request, appointment_id):
    appointment = get_object_or_404(Appointment, id=appointment_id, artist=request.user)

    if appointment.status not in [
        Appointment.STATUS_PENDING,
        Appointment.STATUS_NEEDS_REFERENCES,
    ]:
        messages.error(request, _("Consultation cannot be required for this appointment."))
        return redirect("appointment_detail", appointment_id=appointment.id)

    appointment.status = Appointment.STATUS_CONSULTATION_REQUIRED
    appointment.responded_at = timezone.now()
    appointment.save(update_fields=["status", "responded_at", "updated_at"])
    booking_settings = _get_artist_settings(appointment.artist)
    _send_artist_auto_response(
        appointment,
        booking_settings.auto_response_consultation_required,
    )

    messages.success(request, _("Consultation required response sent."))
    return redirect("appointment_detail", appointment_id=appointment.id)


@login_required
@require_POST
def cancel_appointment(request, appointment_id):
    appointment = get_object_or_404(Appointment, id=appointment_id, artist=request.user)

    if appointment.status != Appointment.STATUS_ACCEPTED:
        messages.error(request, _("Only accepted appointments can be cancelled."))
        return redirect("appointment_detail", appointment_id=appointment.id)

    appointment.status = Appointment.STATUS_CANCELLED
    appointment.responded_at = timezone.now()
    appointment.save(update_fields=["status", "responded_at", "updated_at"])

    messages.success(request, _("Appointment cancelled."))
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
        
def _save_artist_availability_from_post(artist, post_data):
    for weekday in range(7):
        row, created = ArtistAvailability.objects.get_or_create(
            artist=artist,
            weekday=weekday,
            defaults={
                "is_closed": True,
                "open_time": None,
                "close_time": None,
            },
        )

        is_open = post_data.get(f"weekday_{weekday}_open") == "on"
        row.is_closed = not is_open

        if is_open:
            row.open_time = (
                _parse_time_or_none(post_data.get(f"weekday_{weekday}_open_time"))
                or time(10, 0)
            )
            row.close_time = (
                _parse_time_or_none(post_data.get(f"weekday_{weekday}_close_time"))
                or time(18, 0)
            )
            row.break_start = _parse_time_or_none(
                post_data.get(f"weekday_{weekday}_break_start")
            )
            row.break_end = _parse_time_or_none(
                post_data.get(f"weekday_{weekday}_break_end")
            )

            if row.close_time <= row.open_time:
                row.close_time = time(23, 0) if row.open_time >= time(18, 0) else time(18, 0)
        else:
            row.open_time = None
            row.close_time = None
            row.break_start = None
            row.break_end = None

        row.save()

def _save_artist_blocked_dates_from_post(artist, post_data):
    raw_dates = post_data.getlist("blocked_dates")
    raw_reasons = post_data.getlist("blocked_reasons")
    blocked_dates = {}
    default_reason = _("Blocked from artist dashboard")

    for index, raw_date in enumerate(raw_dates):
        try:
            blocked_date = datetime.strptime(raw_date, "%Y-%m-%d").date()
        except (TypeError, ValueError):
            continue

        raw_reason = raw_reasons[index] if index < len(raw_reasons) else ""
        reason = raw_reason.strip()[:160] if raw_reason else ""
        blocked_dates.setdefault(blocked_date, reason or default_reason)

    ArtistTimeOff.objects.filter(artist=artist).delete()

    for blocked_date, reason in sorted(blocked_dates.items()):
        ArtistTimeOff.objects.create(
            artist=artist,
            date=blocked_date,
            reason=reason,
        )


@login_required
def artist_booking_settings(request, active_panel="dashboard"):
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
        form_kind = request.POST.get("dashboard_form", "settings")

        if form_kind == "settings":
            allowed_booking_statuses = dict(ArtistBookingSettings.BOOKING_STATUS_CHOICES)
            booking_status = request.POST.get("booking_status") or getattr(
                booking_settings,
                "booking_status",
                ArtistBookingSettings.BOOKING_STATUS_OPEN,
            )

            if booking_status not in allowed_booking_statuses:
                booking_status = ArtistBookingSettings.BOOKING_STATUS_OPEN

            booking_settings.booking_status = booking_status
            booking_settings.bookings_enabled = booking_status in {
                ArtistBookingSettings.BOOKING_STATUS_OPEN,
                ArtistBookingSettings.BOOKING_STATUS_CONSULTATION_ONLY,
            }

            booking_settings.consultation_required_before_booking = (
                request.POST.get("consultation_required_before_booking") == "on"
            )
            booking_settings.consultation_enabled = (
                request.POST.get("consultation_enabled") == "on"
            )
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
            booking_settings.deposit_required = (
                request.POST.get("deposit_required") == "on"
            )

            booking_settings.booking_workflow = request.POST.get(
                "booking_workflow",
                "manual",
            )

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

            booking_settings.consultation_price = (
                request.POST.get("consultation_price") or 0
            )
            booking_settings.online_consultation_price = (
                request.POST.get("online_consultation_price") or 0
            )
            booking_settings.deposit_amount = request.POST.get("deposit_amount") or 0
            booking_settings.active_styles = request.POST.getlist("active_styles")
            booking_settings.auto_response_booking_received = _clean_auto_response_text(
                request.POST.get("auto_response_booking_received")
            )
            booking_settings.auto_response_consultation_required = _clean_auto_response_text(
                request.POST.get("auto_response_consultation_required")
            )
            booking_settings.auto_response_need_more_references = _clean_auto_response_text(
                request.POST.get("auto_response_need_more_references")
            )
            booking_settings.auto_response_booking_approved = _clean_auto_response_text(
                request.POST.get("auto_response_booking_approved")
            )
            booking_settings.auto_response_booking_declined = _clean_auto_response_text(
                request.POST.get("auto_response_booking_declined")
            )
            # TODO: Send auto_response_need_more_references when a dedicated
            # dashboard action exists for requesting more references.

            booking_settings.save()
            
            messages.success(request, _("Booking settings saved."))
            return redirect("artist_booking_settings")

        if form_kind == "calendar":
            _save_artist_availability_from_post(request.user, request.POST)
            _save_artist_blocked_dates_from_post(request.user, request.POST)

            messages.success(request, _("Calendar settings saved."))
            return redirect("artist_dashboard_calendar")

        messages.error(request, _("Unknown dashboard form."))
        return redirect("artist_booking_settings")

    availability_rows = ArtistAvailability.objects.filter(
        artist=request.user,
    ).order_by("weekday")

    today = timezone.localdate()
    month_start = today.replace(day=1)

    artist_appointments = (
        Appointment.objects
        .filter(artist=request.user)
        .select_related("client", "client__profile")
        .prefetch_related("reference_images")
    )

    today_appointments_count = artist_appointments.filter(
        date=today,
        status=Appointment.STATUS_ACCEPTED,
    ).count()

    upcoming_consultations_count = artist_appointments.filter(
        date__gte=today,
        booking_type__in=[
            Appointment.TYPE_CONSULTATION,
            Appointment.TYPE_ONLINE_CONSULTATION,
        ],
        status__in=[
            Appointment.STATUS_PENDING,
            Appointment.STATUS_ACCEPTED,
        ],
    ).count()

    pending_requests_count = artist_appointments.filter(
        status__in=[
            Appointment.STATUS_PENDING,
            Appointment.STATUS_NEEDS_REFERENCES,
        ],
    ).count()

    unread_messages_count = (
        ChatMessage.objects
        .filter(is_read=False, is_deleted=False)
        .exclude(sender=request.user)
        .filter(
            Q(thread__participant_one=request.user)
            | Q(thread__participant_two=request.user)
        )
        .count()
    )

    references_waiting_count = (
        artist_appointments
        .filter(
            status__in=[
                Appointment.STATUS_PENDING,
                Appointment.STATUS_NEEDS_REFERENCES,
            ],
            reference_images__isnull=True,
        )
        .distinct()
        .count()
    )

    accepted_this_month_count = artist_appointments.filter(
        date__gte=month_start,
        status=Appointment.STATUS_ACCEPTED,
    ).count()

    estimated_revenue = (
        accepted_this_month_count * booking_settings.deposit_amount
        if booking_settings.deposit_required
        else 0
    )

    profile_checks = [
        bool(getattr(request.user.profile, "profile_image", None)),
        bool(request.user.profile.bio),
        bool(booking_settings.active_styles),
        availability_rows.filter(is_closed=False).exists(),
        request.user.profile.verification_status == "approved",
    ]

    profile_score = round(
        sum(1 for item in profile_checks if item) / len(profile_checks) * 100
    )

    next_appointment = (
        artist_appointments
        .filter(
            date__gte=today,
            status=Appointment.STATUS_ACCEPTED,
        )
        .order_by("date", "start_time")
        .first()
    )

    pending_appointments = (
        artist_appointments
        .filter(
            status__in=[
                Appointment.STATUS_PENDING,
                Appointment.STATUS_NEEDS_REFERENCES,
            ]
        )
        .order_by("date", "start_time")[:6]
    )

    upcoming_appointments = (
        artist_appointments
        .filter(date__gte=today)
        .order_by("date", "start_time")[:6]
    )

    clients = (
        User.objects
        .filter(client_appointments__artist=request.user)
        .annotate(artist_sessions_count=Count("client_appointments"))
        .distinct()
        .order_by("-artist_sessions_count")[:6]
    )

    portfolio_preview = (
        PortfolioWork.objects
        .filter(user=request.user)
        .order_by("-created_at")[:4]
    )

    unread_messages_preview = (
        ChatMessage.objects
        .filter(is_read=False, is_deleted=False)
        .exclude(sender=request.user)
        .filter(
            Q(thread__participant_one=request.user)
            | Q(thread__participant_two=request.user)
        )
        .select_related("sender")
        .order_by("-created_at")[:5]
    )

    dashboard_stats = [
        {
            "icon": "calendar-check",
            "value": today_appointments_count,
            "label": _("Today's appointments"),
        },
        {
            "icon": "camera",
            "value": upcoming_consultations_count,
            "label": _("Upcoming consultations"),
        },
        {
            "icon": "bell",
            "value": pending_requests_count,
            "label": _("Pending booking requests"),
            "accent": True,
        },
        {
            "icon": "letter",
            "value": unread_messages_count,
            "label": _("Unread messages"),
            "accent": True,
        },
        {
            "icon": "image",
            "value": references_waiting_count,
            "label": _("Projects waiting for references"),
        },
        {
            "icon": "euro",
            "value": f"€{estimated_revenue:.0f}",
            "label": _("Estimated deposits this month"),
            "strong": True,
        },
        {
            "icon": "timer",
            "value": "—",
            "label": _("Average response time"),
        },
        {
            "icon": "verified",
            "value": f"{profile_score}%",
            "label": _("Profile completeness"),
            "accent": True,
        },
    ]

    stats_bars = [
        {
            "label": _("Monthly bookings"),
            "value": accepted_this_month_count,
            "percent": min(100, accepted_this_month_count * 12),
        },
        {
            "label": _("Pending requests"),
            "value": pending_requests_count,
            "percent": min(100, pending_requests_count * 15),
        },
        {
            "label": _("Unread messages"),
            "value": unread_messages_count,
            "percent": min(100, unread_messages_count * 12),
        },
        {
            "label": _("Profile completeness"),
            "value": f"{profile_score}%",
            "percent": profile_score,
        },
    ]

    blocked_dates = ArtistTimeOff.objects.filter(
        artist=request.user,
    ).order_by("date")
    
    reviews_preview = (
        artist_appointments
        .filter(status=Appointment.STATUS_COMPLETED)
        .select_related("client")
        .order_by("-date", "-start_time")[:5]
    )

    return render(
        request,
        "appointments/artist_booking_settings.html",
        {
            "booking_settings": booking_settings,
            "availability_rows": availability_rows,
            "blocked_dates": blocked_dates,
            "default_styles": DEFAULT_TATTOO_STYLES,
            "dashboard_stats": dashboard_stats,
            "stats_bars": stats_bars,
            "today": today,
            "next_appointment": next_appointment,
            "pending_appointments": pending_appointments,
            "upcoming_appointments": upcoming_appointments,
            "clients": clients,
            "portfolio_preview": portfolio_preview,
            "unread_messages_preview": unread_messages_preview,
            "reviews_preview": reviews_preview,
            "active_dashboard_panel": active_panel,
            "current_status": _get_booking_status_label(
                getattr(
                    booking_settings,
                    "booking_status",
                    ArtistBookingSettings.BOOKING_STATUS_OPEN,
                )
            ),
        },
    )

# Calendar integration
from django.core.exceptions import ValidationError
from django.http import JsonResponse
from django.views.decorators.http import require_GET
from django.utils.dateparse import parse_date, parse_datetime
from .models import CalendarEvent, CalendarRescheduleRequest

CALENDAR_DAILY_CAPACITY_HOURS = 10  # TODO: Move to artist settings when capacity settings exist.

APPOINTMENT_CALENDAR_STATUSES = [
    Appointment.STATUS_ACCEPTED,
    Appointment.STATUS_COMPLETED,
    Appointment.STATUS_CONSULTATION_REQUIRED,
]


def _calendar_role(user):
    profile = getattr(user, "profile", None)
    return "artist" if profile and profile.account_type == "tattoo_artist" else "client"


def _calendar_queryset(user):
    qs = CalendarEvent.objects.select_related("artist", "client", "project").prefetch_related("reschedule_requests")
    # Appointment is the canonical source for appointment-backed calendar entries.
    qs = qs.filter(project__isnull=True)
    return qs.filter(artist=user) if _calendar_role(user) == "artist" else qs.filter(client=user)


def _appointment_queryset(user):
    qs = Appointment.objects.select_related("artist", "client").filter(
        status__in=APPOINTMENT_CALENDAR_STATUSES,
    )
    return qs.filter(artist=user) if _calendar_role(user) == "artist" else qs.filter(client=user)


def _parse_local_datetime(date_value, time_value):
    current_tz = timezone.get_current_timezone()
    naive = datetime.combine(datetime.strptime(date_value, "%Y-%m-%d").date(), datetime.strptime(time_value, "%H:%M").time())
    return timezone.make_aware(naive, current_tz)


def _appointment_start_end(appointment):
    current_tz = timezone.get_current_timezone()
    starts_at = timezone.make_aware(
        datetime.combine(appointment.date, appointment.start_time),
        current_tz,
    )

    if appointment.end_time:
        ends_at = timezone.make_aware(
            datetime.combine(appointment.date, appointment.end_time),
            current_tz,
        )
        if ends_at <= starts_at:
            ends_at += timedelta(days=1)
        return starts_at, ends_at

    duration_minutes = appointment.session_length_minutes or 60
    return starts_at, starts_at + timedelta(minutes=duration_minutes)


def _chat_url_for(event, user):
    other = event.client if user == event.artist else event.artist
    if not other:
        return ""
    thread = ChatThread.get_or_create_for_users(user, other)
    return reverse("chat_thread", kwargs={"thread_id": thread.id})


def _appointment_chat_url_for(appointment, user):
    other = appointment.client if user == appointment.artist else appointment.artist
    thread = ChatThread.get_or_create_for_users(user, other)
    return reverse("chat_thread", kwargs={"thread_id": thread.id})


def _appointment_event_type(appointment):
    if appointment.booking_type in [Appointment.TYPE_CONSULTATION, Appointment.TYPE_ONLINE_CONSULTATION]:
        return CalendarEvent.TYPE_CONSULTATION
    if appointment.status == Appointment.STATUS_CONSULTATION_REQUIRED:
        return CalendarEvent.TYPE_CONSULTATION
    return CalendarEvent.TYPE_TATTOO_SESSION


def _appointment_status(appointment):
    if appointment.status == Appointment.STATUS_COMPLETED:
        return CalendarEvent.STATUS_COMPLETED
    return CalendarEvent.STATUS_CONFIRMED


def _appointment_title(appointment):
    description = (appointment.description or "").strip()
    if description:
        return description[:80]
    return appointment.get_booking_type_display()


def _duration_hours(starts_at, ends_at):
    return round((ends_at - starts_at).total_seconds() / 3600, 2)


def _appointment_payload(appointment, user):
    starts_at, ends_at = _appointment_start_end(appointment)
    is_artist = user == appointment.artist
    event_type = _appointment_event_type(appointment)
    status = _appointment_status(appointment)
    style = ", ".join(appointment.styles or [])
    detail_url = reverse("appointment_detail", kwargs={"appointment_id": appointment.id})
    complete_url = reverse("calendar_appointment_complete", kwargs={"appointment_id": appointment.id}) if is_artist and status != CalendarEvent.STATUS_COMPLETED else ""

    return {
        "id": f"appointment-{appointment.id}",
        "source_type": "appointment",
        "source_id": appointment.id,
        "event_type": event_type,
        "event_type_label": dict(CalendarEvent.EVENT_TYPE_CHOICES).get(event_type, appointment.get_booking_type_display()),
        "status": status,
        "status_label": dict(CalendarEvent.STATUS_CHOICES).get(status, status),
        "title": _appointment_title(appointment),
        "starts_at": starts_at.isoformat(),
        "ends_at": ends_at.isoformat(),
        "duration_hours": _duration_hours(starts_at, ends_at),
        "location": "",
        "notes": appointment.description,
        "placement": appointment.placement,
        "tattoo_style": style,
        "deposit_status": CalendarEvent.DEPOSIT_UNKNOWN,
        "deposit_status_label": dict(CalendarEvent.DEPOSIT_STATUS_CHOICES).get(CalendarEvent.DEPOSIT_UNKNOWN),
        "client_name": appointment.client.username if is_artist else "",
        "artist_name": appointment.artist.username,
        "project_title": appointment.get_booking_type_display(),
        "project_url": detail_url,
        "chat_url": _appointment_chat_url_for(appointment, user),
        "can_complete": bool(complete_url),
        "can_request_reschedule": user == appointment.client,
        "pending_reschedule": False,
        "preparation_note": _("Please confirm the studio address and arrive on time."),
        "actions": {
            "complete_url": complete_url,
            "reschedule_url": "",
            "detail_url": detail_url,
            "chat_url": _appointment_chat_url_for(appointment, user),
        },
    }


def _event_payload(event, user):
    is_artist = user == event.artist
    pending_reschedule = event.reschedule_requests.filter(status=CalendarRescheduleRequest.STATUS_PENDING).exists()
    client_name = event.client.username if event.client else ""
    artist_name = event.artist.username
    detail_url = reverse("appointment_detail", kwargs={"appointment_id": event.project_id}) if event.project_id else ""
    chat_url = _chat_url_for(event, user) if event.client_id else ""
    complete_url = reverse("calendar_event_complete", kwargs={"event_id": event.id}) if is_artist and event.status != CalendarEvent.STATUS_COMPLETED else ""
    reschedule_url = reverse("calendar_reschedule_request", kwargs={"event_id": event.id}) if user == event.client else ""
    return {
        "id": f"calendar-event-{event.id}",
        "source_type": "calendar_event",
        "source_id": event.id,
        "event_type": event.event_type,
        "event_type_label": event.get_event_type_display(),
        "status": event.status,
        "status_label": event.get_status_display(),
        "title": event.title,
        "starts_at": event.starts_at.isoformat(),
        "ends_at": event.ends_at.isoformat(),
        "duration_hours": event.duration_hours,
        "location": event.location,
        "notes": event.notes,
        "placement": event.placement,
        "tattoo_style": event.tattoo_style,
        "deposit_status": event.deposit_status,
        "deposit_status_label": event.get_deposit_status_display(),
        "client_name": client_name if is_artist else "",
        "artist_name": artist_name,
        "project_title": str(event.project) if event.project else "",
        "project_url": detail_url,
        "chat_url": chat_url,
        "can_complete": bool(complete_url),
        "can_request_reschedule": user == event.client,
        "pending_reschedule": pending_reschedule,
        "preparation_note": _("Please confirm the studio address and arrive on time."),
        "actions": {
            "complete_url": complete_url,
            "reschedule_url": reschedule_url,
            "detail_url": detail_url,
            "chat_url": chat_url,
        },
    }


def _payload_start(payload):
    return datetime.fromisoformat(payload["starts_at"])


def _calendar_summary(payloads, role):
    days = {}
    insights = []
    for payload in payloads:
        if payload["status"] in [CalendarEvent.STATUS_CANCELLED]:
            continue
        local_start = timezone.localtime(_payload_start(payload))
        day_key = local_start.date().isoformat()
        bucket = days.setdefault(day_key, {"sessions": 0, "consultations": 0, "booked_hours": 0, "events": 0, "workload": "empty"})
        bucket["events"] += 1
        if payload["event_type"] == CalendarEvent.TYPE_TATTOO_SESSION:
            bucket["sessions"] += 1
            bucket["booked_hours"] += payload["duration_hours"]
        elif payload["event_type"] == CalendarEvent.TYPE_CONSULTATION:
            bucket["consultations"] += 1
            bucket["booked_hours"] += payload["duration_hours"]
        elif payload["event_type"] == CalendarEvent.TYPE_VACATION:
            bucket["workload"] = "vacation"
        elif payload["event_type"] == CalendarEvent.TYPE_BLOCKED and bucket["workload"] != "vacation":
            bucket["workload"] = "blocked"
        if role == "client" and payload["status"] == CalendarEvent.STATUS_DEPOSIT_PENDING:
            insights.append(_("A deposit is pending for an upcoming event."))
    for day, bucket in days.items():
        if bucket["workload"] in ["vacation", "blocked"]:
            continue
        hours = bucket["booked_hours"]
        bucket["workload"] = "full" if hours >= CALENDAR_DAILY_CAPACITY_HOURS else "busy" if hours >= 8 else "light" if hours > 0 else "empty"
        if role == "artist" and hours > 8:
            insights.append(_("One day has more than 8 booked tattoo hours."))
        if role == "artist" and hours >= CALENDAR_DAILY_CAPACITY_HOURS:
            insights.append(_("One day is fully booked."))
    return days, list(dict.fromkeys([str(item) for item in insights]))[:5]


@login_required
def calendar_page(request):
    role = _calendar_role(request.user)
    clients = User.objects.filter(calendar_client_events__artist=request.user).distinct().order_by("username") if role == "artist" else User.objects.none()
    return render(request, "users/calendar.html", {"calendar_context": "user", "calendar_role": role, "calendar_capacity_hours": CALENDAR_DAILY_CAPACITY_HOURS, "calendar_clients": clients})


@login_required
def artist_dashboard_calendar(request):
    if _calendar_role(request.user) != "artist":
        return JsonResponse({"error": _("Artist dashboard calendar is available only for tattoo artists.")}, status=403)
    return artist_booking_settings(request, active_panel="calendar")


@login_required
@require_GET
def calendar_events(request):
    start = parse_date(request.GET.get("start", ""))
    end = parse_date(request.GET.get("end", ""))
    if not start or not end:
        return JsonResponse({"error": _("Valid start and end dates are required.")}, status=400)
    current_tz = timezone.get_current_timezone()
    start_dt = timezone.make_aware(datetime.combine(start, time.min), current_tz)
    end_dt = timezone.make_aware(datetime.combine(end, time.max), current_tz)

    calendar_event_payloads = [
        _event_payload(event, request.user)
        for event in _calendar_queryset(request.user).filter(starts_at__lte=end_dt, ends_at__gte=start_dt)
    ]
    appointment_payloads = [
        _appointment_payload(appointment, request.user)
        for appointment in _appointment_queryset(request.user).filter(date__gte=start, date__lte=end)
    ]
    payloads = sorted(appointment_payloads + calendar_event_payloads, key=lambda item: item["starts_at"])
    summary, insights = _calendar_summary(payloads, _calendar_role(request.user))
    return JsonResponse({"role": _calendar_role(request.user), "capacity_hours": CALENDAR_DAILY_CAPACITY_HOURS, "events": payloads, "days": summary, "insights": insights})


def _create_calendar_event(request, forced_type=None):
    if _calendar_role(request.user) != "artist":
        return JsonResponse({"error": _("Only artists can create calendar events.")}, status=403)
    event_type = forced_type or request.POST.get("event_type")
    client_id = request.POST.get("client") or None
    client = get_object_or_404(User, pk=client_id) if client_id else None
    try:
        starts_at = _parse_local_datetime(request.POST["date"], request.POST["start_time"])
        ends_at = _parse_local_datetime(request.POST["date"], request.POST["end_time"])
    except (KeyError, ValueError):
        return JsonResponse({"error": _("Valid date, start time and end time are required.")}, status=400)
    event = CalendarEvent(artist=request.user, client=client, event_type=event_type, status=CalendarEvent.STATUS_PLANNED, title=(request.POST.get("title") or dict(CalendarEvent.EVENT_TYPE_CHOICES).get(event_type, _("Calendar event"))), starts_at=starts_at, ends_at=ends_at, location=request.POST.get("location", ""), notes=request.POST.get("notes", ""))
    try:
        event.full_clean()
    except ValidationError as exc:
        return JsonResponse({"error": exc.message_dict if hasattr(exc, "message_dict") else exc.messages}, status=400)
    if event.overlaps_for_artist():
        return JsonResponse({"error": _("This event overlaps another artist event.")}, status=409)
    event.save()
    return JsonResponse({"event": _event_payload(event, request.user)}, status=201)


@login_required
@require_POST
def calendar_event_create(request):
    return _create_calendar_event(request)


@login_required
@require_POST
def calendar_block_time(request):
    return _create_calendar_event(request, CalendarEvent.TYPE_BLOCKED)


@login_required
@require_POST
def calendar_vacation(request):
    return _create_calendar_event(request, CalendarEvent.TYPE_VACATION)


@login_required
@require_POST
def calendar_event_complete(request, event_id):
    event = get_object_or_404(CalendarEvent, pk=event_id)
    if event.artist_id != request.user.id:
        return JsonResponse({"error": _("You cannot complete this event.")}, status=403)
    event.status = CalendarEvent.STATUS_COMPLETED
    event.save(update_fields=["status", "updated_at"])
    return JsonResponse({"event": _event_payload(event, request.user)})


@login_required
@require_POST
def calendar_appointment_complete(request, appointment_id):
    appointment = get_object_or_404(Appointment, pk=appointment_id, artist=request.user)
    if appointment.status not in [Appointment.STATUS_ACCEPTED, Appointment.STATUS_CONSULTATION_REQUIRED]:
        return JsonResponse({"error": _("This appointment cannot be completed from calendar.")}, status=400)
    appointment.status = Appointment.STATUS_COMPLETED
    appointment.save(update_fields=["status", "updated_at"])
    return JsonResponse({"event": _appointment_payload(appointment, request.user)})


@login_required
@require_POST
def calendar_reschedule_request(request, event_id):
    event = get_object_or_404(CalendarEvent, pk=event_id)
    if event.client_id != request.user.id:
        return JsonResponse({"error": _("You can request reschedule only for your own event.")}, status=403)
    proposed_start = parse_datetime(request.POST.get("proposed_start", "")) if request.POST.get("proposed_start") else None
    proposed_end = parse_datetime(request.POST.get("proposed_end", "")) if request.POST.get("proposed_end") else None
    req = CalendarRescheduleRequest(event=event, requested_by=request.user, proposed_start=proposed_start, proposed_end=proposed_end, reason=request.POST.get("reason", ""))
    try:
        req.full_clean()
    except ValidationError as exc:
        return JsonResponse({"error": exc.message_dict if hasattr(exc, "message_dict") else exc.messages}, status=400)
    req.save()
    event.status = CalendarEvent.STATUS_RESCHEDULE_REQUESTED
    event.save(update_fields=["status", "updated_at"])
    return JsonResponse({"status": req.status, "event": _event_payload(event, request.user)}, status=201)
