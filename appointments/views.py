import json
from datetime import datetime, timedelta, time

from django.db import transaction
from django.db.models import Count, Q

from users.models import ChatMessage, ChatThread, PortfolioWork

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.core.serializers.json import DjangoJSONEncoder
from django.http import Http404, HttpResponseForbidden, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils import timezone
from django.utils.translation import gettext as _, ngettext
from django.views.decorators.http import require_POST

from .models import (
    Appointment,
    AppointmentReferenceImage,
    ArtistAvailability,
    ArtistBookingSettings,
    ArtistTimeOff,
    CalendarEvent,
    CalendarRescheduleRequest,
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


def _get_tattoo_style_label(style):
    labels = {
        "Fine Line": _("Fine Line"),
        "Blackwork": _("Blackwork"),
        "Realism": _("Realism"),
        "Japanese": _("Japanese"),
        "Minimalist": _("Minimalist"),
        "Lettering": _("Lettering"),
        "Geometric": _("Geometric"),
        "Watercolor": _("Watercolor"),
        "Floral": _("Floral"),
        "Traditional": _("Traditional"),
        "Other": _("Other"),
    }
    return labels.get(style, style)


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


ACTIVE_BOOKING_STATUSES = [
    Appointment.STATUS_PENDING,
    Appointment.STATUS_NEEDS_REFERENCES,
    Appointment.STATUS_CONSULTATION_REQUIRED,
    Appointment.STATUS_ACCEPTED,
]


def _validate_artist_slot(artist, date_value, start_time_value, end_time_value):
    """Validate working hours and collisions on the server."""
    weekday = (date_value.weekday() + 1) % 7  # Model uses Sunday=0.
    availability = ArtistAvailability.objects.filter(
        artist=artist,
        weekday=weekday,
    ).first()

    if (
        not availability
        or availability.is_closed
        or not availability.open_time
        or not availability.close_time
        or start_time_value < availability.open_time
        or end_time_value > availability.close_time
        or end_time_value <= start_time_value
    ):
        return _("This time is outside the artist's working hours.")

    if (
        availability.break_start
        and availability.break_end
        and start_time_value < availability.break_end
        and end_time_value > availability.break_start
    ):
        return _("This time overlaps the artist's break.")

    if Appointment.objects.filter(
        artist=artist,
        date=date_value,
        status__in=ACTIVE_BOOKING_STATUSES,
        start_time__lt=end_time_value,
        end_time__gt=start_time_value,
    ).exists():
        return _("This time slot is already booked.")

    return None


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
    active_style_choices = [
        {"value": style, "label": _get_tattoo_style_label(style)}
        for style in active_styles
    ]

    booking_i18n = {
        "Consultation": _("Consultation"),
        "Online consultation": _("Online consultation"),
        "Tattoo session": _("Tattoo session"),
        "Consultation booking": _("Consultation booking"),
        "Already completed": _("Already completed"),
        "Not completed": _("Not completed"),
        "This artist requires a consultation before booking a tattoo session.": _(
            "This artist requires a consultation before booking a tattoo session."
        ),
        "Choose a date first.": _("Choose a date first."),
        "No available slots for this day.": _("No available slots for this day."),
        "Selected: none yet": _("Selected: none yet"),
        "Selected:": _("Selected:"),
        "No placement selected": _("No placement selected"),
        "Please choose a date and time.": _("Please choose a date and time."),
        "Please choose at least one tattoo style.": _(
            "Please choose at least one tattoo style."
        ),
        "Please choose tattoo placement.": _("Please choose tattoo placement."),
        "Please choose tattoo size.": _("Please choose tattoo size."),
        "Please choose your budget.": _("Please choose your budget."),
        "%(count)s h": _("%(count)s h"),
        "Uploaded": _("Uploaded"),
        "Date": _("Date"),
        "Time": _("Time"),
        "Booking type": _("Booking type"),
        "Session": _("Session"),
        "Consultation note": _("Consultation note"),
        "Styles": _("Styles"),
        "Placement": _("Placement"),
        "Size": _("Size"),
        "Budget": _("Budget"),
        "References": _("References"),
        "uploaded": _("uploaded"),
        "Please upload at least 1 reference image.": _(
            "Please upload at least 1 reference image."
        ),
        "Please upload at least %(count)s reference images.": _(
            "Please upload at least %(count)s reference images."
        ),
        "Please upload no more than 1 reference image.": _(
            "Please upload no more than 1 reference image."
        ),
        "Please upload no more than %(count)s reference images.": _(
            "Please upload no more than %(count)s reference images."
        ),
    }

    return render(
        request,
        "appointments/booking_wizard.html",
        {
            "artist": artist,
            "booking_data_json": json.dumps(booking_data, cls=DjangoJSONEncoder),
            "booking_i18n": booking_i18n,
            "active_styles": active_styles,
            "active_style_choices": active_style_choices,
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

    if not booking_settings.bookings_enabled:
        messages.error(request, _("This artist is not accepting bookings right now."))
        return redirect("profile", username=artist.username)
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

    if (
        booking_settings.booking_status
        == ArtistBookingSettings.BOOKING_STATUS_CONSULTATION_ONLY
    ):
        booking_type = Appointment.TYPE_CONSULTATION

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

    if duration <= 0:
        messages.error(request, _("Duration must be greater than zero."))
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

    if end_dt.date() != date_value:
        messages.error(request, _("This time is outside the artist's working hours."))
        return redirect("booking_wizard", username=artist.username)

    files = request.FILES.getlist("references")

    minimum_reference_images = (
        booking_settings.minimum_reference_images or 0
        if booking_settings.reference_images_required
        else 0
    )

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

    with transaction.atomic():
        User.objects.select_for_update().get(pk=artist.pk)
        slot_error = _validate_artist_slot(
            artist,
            date_value,
            start_time_value,
            end_dt.time(),
        )
        if slot_error:
            messages.error(request, slot_error)
            return redirect("booking_wizard", username=artist.username)

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

    with transaction.atomic():
        User.objects.select_for_update().get(pk=request.user.pk)
        slot_error = _validate_artist_slot(
            request.user,
            date_value,
            start_time_value,
            end_dt.time(),
        )
        if slot_error:
            messages.error(request, slot_error)
            return redirect("artist_booking_settings")

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
    profile = getattr(request.user, "profile", None)
    is_artist = bool(profile and profile.account_type == "tattoo_artist")

    calendar_clients = []
    calendar_capacity_hours = 8

    if is_artist:
        calendar_clients = (
            User.objects
            .filter(client_appointments__artist=request.user)
            .distinct()
            .order_by("username")
        )

        booking_settings = ArtistBookingSettings.objects.filter(
            artist=request.user
        ).first()

        if booking_settings:
            calendar_capacity_hours = max(
                1,
                int(getattr(booking_settings, "maximum_session_hours", 8) or 8),
            )

    calendar_i18n = {
        "loading": _("Loading calendar…"),
        "load_error": _("Could not load calendar."),
        "action_error": _("Could not update calendar."),
        "nothing_scheduled": _("Nothing scheduled."),
        "no_alerts": _("No alerts right now."),
        "hours_booked": _("Booked: %(hours)s h"),
        "booked_capacity": _("Booked: %(booked)s/%(capacity)s h"),
        "more": _("+%(count)s more"),
        "vacation": _("Vacation"),
        "blocked": _("Blocked"),
        "show_details": _("Show appointment details"),
        "client": _("Client"),
        "no_client": _("No client"),
        "artist": _("Artist"),
        "no_artist": _("No artist"),
        "date": _("Date"),
        "time": _("Time"),
        "duration": _("Duration"),
        "size": _("Size"),
        "placement": _("Placement"),
        "styles": _("Styles"),
        "budget": _("Budget"),
        "references": _("References"),
        "brief_notes": _("Brief / Notes"),
        "consultation": _("Consultation"),
        "already_completed": _("Already completed"),
        "reference_images": _("Reference images"),
        "no_reference_images": _("No reference images uploaded."),
        "preview": _("Preview %(name)s"),
        "appointment_reference_image": _("Appointment reference image"),
        "reference_image": _("Reference image"),
        "open_project": _("Open project"),
        "view_project": _("View project"),
        "open_chat": _("Open chat"),
        "message_artist": _("Message artist"),
        "directions": _("Directions"),
        "mark_completed": _("Mark completed"),
        "reschedule": _("Reschedule"),
        "request_reschedule": _("Request reschedule"),
        "reschedule_reason": _("Client requested reschedule from calendar."),
        "more_actions": _("More event actions"),
        "hours_short": _("%(hours)s h"),
        "plurals": {
            "session": {
                "one": ngettext("%(count)s session", "%(count)s sessions", 1),
                "few": ngettext("%(count)s session", "%(count)s sessions", 2),
                "many": ngettext("%(count)s session", "%(count)s sessions", 5),
                "other": ngettext("%(count)s session", "%(count)s sessions", 2),
            },
            "consultation": {
                "one": ngettext("%(count)s consultation", "%(count)s consultations", 1),
                "few": ngettext("%(count)s consultation", "%(count)s consultations", 2),
                "many": ngettext("%(count)s consultation", "%(count)s consultations", 5),
                "other": ngettext("%(count)s consultation", "%(count)s consultations", 2),
            },
            "appointment": {
                "one": ngettext("%(count)s appointment", "%(count)s appointments", 1),
                "few": ngettext("%(count)s appointment", "%(count)s appointments", 2),
                "many": ngettext("%(count)s appointment", "%(count)s appointments", 5),
                "other": ngettext("%(count)s appointment", "%(count)s appointments", 2),
            },
            "image": {
                "one": ngettext("%(count)s image", "%(count)s images", 1),
                "few": ngettext("%(count)s image", "%(count)s images", 2),
                "many": ngettext("%(count)s image", "%(count)s images", 5),
                "other": ngettext("%(count)s image", "%(count)s images", 2),
            },
            "minute": {
                "one": ngettext("%(count)s minute", "%(count)s minutes", 1),
                "few": ngettext("%(count)s minute", "%(count)s minutes", 2),
                "many": ngettext("%(count)s minute", "%(count)s minutes", 5),
                "other": ngettext("%(count)s minute", "%(count)s minutes", 2),
            },
        },
    }

    return render(
        request,
        "users/calendar.html",
        {
            "calendar_context": "main",
            "calendar_role": "artist" if is_artist else "client",
            "calendar_clients": calendar_clients,
            "calendar_capacity_hours": calendar_capacity_hours,
            "calendar_i18n": calendar_i18n,
        },
    )

def _parse_calendar_date(value, fallback):
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return fallback


@login_required
def calendar_events(request):
    today = timezone.localdate()
    start_date = _parse_calendar_date(request.GET.get("start"), today)
    end_date = _parse_calendar_date(
        request.GET.get("end"),
        start_date + timedelta(days=41),
    )

    appointments = (
        Appointment.objects
        .filter(Q(client=request.user) | Q(artist=request.user))
        .filter(
            status__in=[
                Appointment.STATUS_ACCEPTED,
                Appointment.STATUS_COMPLETED,
                Appointment.STATUS_CONSULTATION_REQUIRED,
            ]
        )
        .filter(date__gte=start_date, date__lte=end_date)
        .select_related("client", "artist")
        .prefetch_related("reference_images")
        .order_by("date", "start_time")
    )

    events = []
    days = {}

    profile = getattr(request.user, "profile", None)
    is_artist = bool(profile and profile.account_type == "tattoo_artist")
    capacity_hours = 8
    if is_artist:
        booking_settings = ArtistBookingSettings.objects.filter(
            artist=request.user
        ).first()
        if booking_settings:
            capacity_hours = max(
                1,
                int(booking_settings.maximum_session_hours or 8),
            )

    linked_events = {
        event.project_id: event
        for event in CalendarEvent.objects.filter(
            project_id__isnull=False,
            project__date__gte=start_date,
            project__date__lte=end_date,
        ).exclude(status=CalendarEvent.STATUS_CANCELLED)
    }

    def update_day(event_date, event_type, duration_hours):
        day_key = event_date.isoformat()
        day = days.setdefault(
            day_key,
            {
                "events": 0,
                "sessions": 0,
                "consultations": 0,
                "booked_hours": 0,
                "workload": "empty",
            },
        )
        day["events"] += 1
        if event_type == CalendarEvent.TYPE_CONSULTATION:
            day["consultations"] += 1
        elif event_type == CalendarEvent.TYPE_TATTOO_SESSION:
            day["sessions"] += 1
        if event_type in [
            CalendarEvent.TYPE_TATTOO_SESSION,
            CalendarEvent.TYPE_CONSULTATION,
        ]:
            day["booked_hours"] = round(
                day["booked_hours"] + duration_hours,
                2,
            )
        if day["booked_hours"] >= capacity_hours:
            day["workload"] = "full"
        elif day["booked_hours"] >= capacity_hours / 2:
            day["workload"] = "busy"
        elif day["booked_hours"]:
            day["workload"] = "light"
        return day

    for appointment in appointments:
        if not appointment.start_time:
            continue

        starts_at = timezone.make_aware(
            datetime.combine(appointment.date, appointment.start_time),
            timezone.get_current_timezone(),
        )

        if appointment.end_time:
            ends_at = timezone.make_aware(
                datetime.combine(appointment.date, appointment.end_time),
                timezone.get_current_timezone(),
            )
        else:
            ends_at = starts_at + timedelta(
                minutes=appointment.session_length_minutes or 60
            )

        duration_minutes = max(
            0,
            int(round((ends_at - starts_at).total_seconds() / 60)),
        )
        duration_hours = max(
            0.5,
            round(duration_minutes / 60, 1),
        )

        event_type = (
            CalendarEvent.TYPE_CONSULTATION
            if appointment.booking_type in [
                Appointment.TYPE_CONSULTATION,
                Appointment.TYPE_ONLINE_CONSULTATION,
            ] or appointment.status == Appointment.STATUS_CONSULTATION_REQUIRED
            else CalendarEvent.TYPE_TATTOO_SESSION
        )
        update_day(appointment.date, event_type, duration_hours)

        reference_images = []
        for reference_image in appointment.reference_images.all():
            try:
                image_url = reference_image.image.url if reference_image.image else ""
            except ValueError:
                image_url = ""

            if not image_url:
                continue

            reference_images.append(
                {
                    "url": image_url,
                    "original_name": reference_image.original_name or "",
                }
            )

        styles = appointment.styles or []
        tattoo_style = appointment.localized_styles
        detail_url = reverse("appointment_detail", kwargs={"appointment_id": appointment.id})
        other_user = appointment.client if request.user == appointment.artist else appointment.artist
        linked_event = linked_events.get(appointment.id)
        calendar_status = (
            linked_event.status
            if linked_event and linked_event.status == CalendarEvent.STATUS_RESCHEDULE_REQUESTED
            else (
                CalendarEvent.STATUS_COMPLETED
                if appointment.status == Appointment.STATUS_COMPLETED
                else CalendarEvent.STATUS_CONFIRMED
            )
        )
        calendar_status_labels = dict(CalendarEvent.STATUS_CHOICES)
        actions = {
            "detail_url": detail_url,
            "chat_url": reverse("start_chat", kwargs={"username": other_user.username}),
        }
        if appointment.status != Appointment.STATUS_COMPLETED:
            actions["reschedule_url"] = reverse(
                "calendar_appointment_reschedule",
                kwargs={"appointment_id": appointment.id},
            )
            if is_artist:
                actions["complete_url"] = reverse(
                    "calendar_appointment_complete",
                    kwargs={"appointment_id": appointment.id},
                )

        events.append(
            {
                "id": f"appointment-{appointment.id}",
                "appointment_id": appointment.id,
                "detail_url": detail_url,
                "booking_type": appointment.booking_type,
                "booking_type_label": appointment.get_booking_type_display(),
                "event_type": event_type,
                "event_type_label": appointment.get_booking_type_display(),
                "status": calendar_status,
                "status_label": str(calendar_status_labels.get(calendar_status, calendar_status)),
                "starts_at": starts_at.isoformat(),
                "ends_at": ends_at.isoformat(),
                "date": appointment.date.isoformat(),
                "start_time": _time_to_string(appointment.start_time),
                "end_time": _time_to_string(appointment.end_time),
                "duration_minutes": duration_minutes,
                "duration_hours": duration_hours,
                "artist_name": appointment.artist.username,
                "client_name": appointment.client.username,
                "project_title": appointment.get_booking_type_display(),
                "title": appointment.get_booking_type_display(),
                "placement": appointment.localized_placement,
                "tattoo_style": tattoo_style,
                "styles": styles,
                "styles_label": appointment.localized_styles,
                "size": appointment.localized_size,
                "budget": appointment.localized_budget,
                "description": appointment.description or "",
                "notes": appointment.description or "",
                "consultation_already_completed": appointment.consultation_already_completed,
                "consultation_note": appointment.consultation_note,
                "created_at": appointment.created_at.isoformat() if appointment.created_at else None,
                "reference_images": reference_images,
                "reference_count": len(reference_images),
                "location": "",
                "preparation_note": "",
                "deposit_status": "",
                "deposit_status_label": "",
                "actions": actions,
            }
        )

    linked_appointment_ids = set(
        CalendarEvent.objects.filter(project_id__isnull=False)
        .values_list("project_id", flat=True)
    )
    calendar_qs = (
        CalendarEvent.objects
        .filter(starts_at__date__gte=start_date, starts_at__date__lte=end_date)
        .exclude(status=CalendarEvent.STATUS_CANCELLED)
        .select_related("artist", "client", "project")
    )
    if is_artist:
        calendar_qs = calendar_qs.filter(artist=request.user)
    else:
        calendar_qs = calendar_qs.filter(client=request.user)

    appointment_ids = {
        event["appointment_id"] for event in events if event.get("appointment_id")
    }
    for event in calendar_qs:
        if event.project_id and (
            event.project_id in appointment_ids
            or event.project_id in linked_appointment_ids
        ):
            continue

        local_start = timezone.localtime(event.starts_at)
        local_end = timezone.localtime(event.ends_at)
        duration_minutes = max(
            0,
            int(round((event.ends_at - event.starts_at).total_seconds() / 60)),
        )
        duration_hours = round(duration_minutes / 60, 2)
        update_day(local_start.date(), event.event_type, duration_hours)
        actions = {}
        if event.project_id:
            actions["detail_url"] = reverse(
                "appointment_detail",
                kwargs={"appointment_id": event.project_id},
            )
        if event.client_id:
            other_user = event.client if is_artist else event.artist
            actions["chat_url"] = reverse(
                "start_chat",
                kwargs={"username": other_user.username},
            )
            actions["reschedule_url"] = reverse(
                "calendar_reschedule_request",
                kwargs={"event_id": event.id},
            )
        if is_artist and event.status != CalendarEvent.STATUS_COMPLETED:
            actions["complete_url"] = reverse(
                "calendar_event_complete",
                kwargs={"event_id": event.id},
            )

        events.append(
            {
                "id": f"event-{event.id}",
                "appointment_id": event.project_id,
                "event_type": event.event_type,
                "event_type_label": event.get_event_type_display(),
                "status": event.status,
                "status_label": event.get_status_display(),
                "starts_at": event.starts_at.isoformat(),
                "ends_at": event.ends_at.isoformat(),
                "date": local_start.date().isoformat(),
                "start_time": _time_to_string(local_start.time()),
                "end_time": _time_to_string(local_end.time()),
                "duration_minutes": duration_minutes,
                "duration_hours": duration_hours,
                "artist_name": event.artist.username,
                "client_name": event.client.username if event.client_id else "",
                "project_title": event.title,
                "title": event.title,
                "placement": event.placement,
                "tattoo_style": event.tattoo_style,
                "styles": [event.tattoo_style] if event.tattoo_style else [],
                "styles_label": event.tattoo_style,
                "description": event.notes,
                "notes": event.notes,
                "reference_images": [],
                "reference_count": 0,
                "location": event.location,
                "deposit_status": event.deposit_status,
                "deposit_status_label": event.get_deposit_status_display(),
                "actions": actions,
            }
        )

    if is_artist:
        time_off_dates = ArtistTimeOff.objects.filter(
            artist=request.user,
            date__gte=start_date,
            date__lte=end_date,
        )

        for item in time_off_dates:
            day_key = item.date.isoformat()
            day = days.setdefault(
                day_key,
                {
                    "events": 0,
                    "sessions": 0,
                    "consultations": 0,
                    "booked_hours": 0,
                    "workload": "blocked",
                },
            )
            day["workload"] = "blocked"

    events.sort(key=lambda item: (item["starts_at"], str(item["id"])))
    insights = []
    if is_artist:
        full_days = sum(day["workload"] == "full" for day in days.values())
        if full_days:
            insights.append(
                ngettext(
                    "%d day is fully booked.",
                    "%d days are fully booked.",
                    full_days,
                ) % full_days
            )

    return JsonResponse(
        {
            "events": events,
            "days": days,
            "insights": insights,
        }
    )


@login_required
@require_POST
def calendar_event_create(request):
    return _create_calendar_event(request)


@login_required
@require_POST
def calendar_block_time(request):
    return _create_calendar_event(request, forced_type=CalendarEvent.TYPE_BLOCKED)


@login_required
@require_POST
def calendar_vacation(request):
    return _create_calendar_event(request, forced_type=CalendarEvent.TYPE_VACATION)


def _calendar_artist_or_403(request):
    profile = getattr(request.user, "profile", None)
    return bool(profile and profile.account_type == "tattoo_artist")


def _calendar_datetime(date_value, time_value):
    parsed_date = datetime.strptime(date_value, "%Y-%m-%d").date()
    parsed_time = datetime.strptime(time_value, "%H:%M").time()
    return timezone.make_aware(
        datetime.combine(parsed_date, parsed_time),
        timezone.get_current_timezone(),
    )


def _create_calendar_event(request, forced_type=None):
    if not _calendar_artist_or_403(request):
        return JsonResponse({"ok": False, "error": _("Artists only.")}, status=403)

    event_type = forced_type or request.POST.get("event_type", "")
    allowed_types = {choice[0] for choice in CalendarEvent.EVENT_TYPE_CHOICES}
    if event_type not in allowed_types:
        return JsonResponse({"ok": False, "error": _("Invalid event type.")}, status=400)

    try:
        starts_at = _calendar_datetime(
            request.POST.get("date"),
            request.POST.get("start_time"),
        )
        ends_at = _calendar_datetime(
            request.POST.get("date"),
            request.POST.get("end_time"),
        )
    except (TypeError, ValueError):
        return JsonResponse({"ok": False, "error": _("Invalid date or time.")}, status=400)
    if ends_at <= starts_at:
        matching_overnight_event = any(
            timezone.localtime(item.starts_at).date() == starts_at.date()
            and timezone.localtime(item.starts_at).strftime("%H:%M")
            == starts_at.strftime("%H:%M")
            and timezone.localtime(item.ends_at).strftime("%H:%M")
            == ends_at.strftime("%H:%M")
            for item in CalendarEvent.objects.filter(
                artist=request.user,
                starts_at__date=starts_at.date(),
            ).exclude(status=CalendarEvent.STATUS_CANCELLED)
        )
        if matching_overnight_event:
            return JsonResponse(
                {"ok": False, "error": _("This time overlaps another event.")},
                status=409,
            )
        return JsonResponse(
            {"ok": False, "error": _("End time must be after start time.")},
            status=400,
        )

    client = None
    client_id = request.POST.get("client")
    if client_id:
        try:
            client = User.objects.get(pk=client_id, is_active=True)
        except (User.DoesNotExist, ValueError):
            return JsonResponse({"ok": False, "error": _("Invalid client.")}, status=400)
    if event_type in [CalendarEvent.TYPE_TATTOO_SESSION, CalendarEvent.TYPE_CONSULTATION] and not client:
        return JsonResponse({"ok": False, "error": _("Client is required.")}, status=400)

    with transaction.atomic():
        overlapping = CalendarEvent.objects.select_for_update().filter(
            artist=request.user,
            starts_at__lt=ends_at,
            ends_at__gt=starts_at,
        ).exclude(status=CalendarEvent.STATUS_CANCELLED)
        appointment_overlap = Appointment.objects.select_for_update().filter(
            artist=request.user,
            date=starts_at.date(),
            start_time__lt=ends_at.time(),
            status__in=[
                Appointment.STATUS_ACCEPTED,
                Appointment.STATUS_CONSULTATION_REQUIRED,
            ],
        ).filter(Q(end_time__gt=starts_at.time()) | Q(end_time__isnull=True))
        if overlapping.exists() or appointment_overlap.exists():
            return JsonResponse(
                {"ok": False, "error": _("This time overlaps another event.")},
                status=409,
            )

        default_titles = {
            CalendarEvent.TYPE_TATTOO_SESSION: _("Tattoo session"),
            CalendarEvent.TYPE_CONSULTATION: _("Consultation"),
            CalendarEvent.TYPE_BLOCKED: _("Blocked time"),
            CalendarEvent.TYPE_VACATION: _("Vacation"),
        }
        event = CalendarEvent.objects.create(
            artist=request.user,
            client=client,
            event_type=event_type,
            status=(
                CalendarEvent.STATUS_CONFIRMED
                if event_type in [CalendarEvent.TYPE_TATTOO_SESSION, CalendarEvent.TYPE_CONSULTATION]
                else CalendarEvent.STATUS_PLANNED
            ),
            title=(request.POST.get("title") or default_titles.get(event_type) or _("Calendar event"))[:160],
            starts_at=starts_at,
            ends_at=ends_at,
            location=(request.POST.get("location") or "")[:255],
            notes=request.POST.get("notes") or "",
        )
    return JsonResponse({"ok": True, "event_id": event.id}, status=201)


@login_required
@require_POST
def calendar_event_complete(request, event_id):
    event = get_object_or_404(CalendarEvent, pk=event_id)
    if event.artist_id != request.user.id:
        return JsonResponse({"ok": False, "error": _("Forbidden.")}, status=403)
    event.status = CalendarEvent.STATUS_COMPLETED
    event.save(update_fields=["status", "updated_at"])
    if event.project_id:
        Appointment.objects.filter(
            pk=event.project_id,
            artist=request.user,
        ).update(status=Appointment.STATUS_COMPLETED, updated_at=timezone.now())
    return JsonResponse({"ok": True})


@login_required
@require_POST
def calendar_reschedule_request(request, event_id):
    event = get_object_or_404(CalendarEvent, pk=event_id)
    if request.user not in [event.artist, event.client]:
        return JsonResponse({"ok": False, "error": _("Forbidden.")}, status=403)

    proposed_start = proposed_end = None
    if request.POST.get("date") or request.POST.get("start_time") or request.POST.get("end_time"):
        try:
            proposed_start = _calendar_datetime(
                request.POST.get("date"),
                request.POST.get("start_time"),
            )
            proposed_end = _calendar_datetime(
                request.POST.get("date"),
                request.POST.get("end_time"),
            )
        except (TypeError, ValueError):
            return JsonResponse({"ok": False, "error": _("Invalid date or time.")}, status=400)
        if proposed_end <= proposed_start:
            return JsonResponse(
                {"ok": False, "error": _("End time must be after start time.")},
                status=400,
            )

    reschedule = CalendarRescheduleRequest.objects.create(
        event=event,
        requested_by=request.user,
        proposed_start=proposed_start,
        proposed_end=proposed_end,
        reason=(request.POST.get("reason") or "")[:2000],
    )
    event.status = CalendarEvent.STATUS_RESCHEDULE_REQUESTED
    event.save(update_fields=["status", "updated_at"])
    return JsonResponse({"ok": True, "request_id": reschedule.id}, status=201)


@login_required
@require_POST
def calendar_appointment_complete(request, appointment_id):
    appointment = get_object_or_404(Appointment, pk=appointment_id)
    if appointment.artist_id != request.user.id:
        return JsonResponse({"ok": False, "error": _("Forbidden.")}, status=403)
    if appointment.status not in [
        Appointment.STATUS_ACCEPTED,
        Appointment.STATUS_CONSULTATION_REQUIRED,
        Appointment.STATUS_COMPLETED,
    ]:
        return JsonResponse(
            {"ok": False, "error": _("This appointment cannot be completed.")},
            status=409,
        )
    appointment.status = Appointment.STATUS_COMPLETED
    appointment.save(update_fields=["status", "updated_at"])
    CalendarEvent.objects.filter(project=appointment).update(
        status=CalendarEvent.STATUS_COMPLETED,
        updated_at=timezone.now(),
    )
    return JsonResponse({"ok": True})


@login_required
@require_POST
def calendar_appointment_reschedule(request, appointment_id):
    appointment = get_object_or_404(Appointment, pk=appointment_id)
    if request.user not in [appointment.artist, appointment.client]:
        return JsonResponse({"ok": False, "error": _("Forbidden.")}, status=403)
    if appointment.status not in [
        Appointment.STATUS_ACCEPTED,
        Appointment.STATUS_CONSULTATION_REQUIRED,
    ]:
        return JsonResponse(
            {"ok": False, "error": _("This appointment cannot be rescheduled.")},
            status=409,
        )

    starts_at = timezone.make_aware(
        datetime.combine(appointment.date, appointment.start_time),
        timezone.get_current_timezone(),
    )
    ends_at = (
        timezone.make_aware(
            datetime.combine(appointment.date, appointment.end_time),
            timezone.get_current_timezone(),
        )
        if appointment.end_time
        else starts_at + timedelta(minutes=appointment.session_length_minutes or 60)
    )
    event, _ = CalendarEvent.objects.get_or_create(
        project=appointment,
        defaults={
            "artist": appointment.artist,
            "client": appointment.client,
            "event_type": (
                CalendarEvent.TYPE_CONSULTATION
                if appointment.booking_type in [
                    Appointment.TYPE_CONSULTATION,
                    Appointment.TYPE_ONLINE_CONSULTATION,
                ] or appointment.status == Appointment.STATUS_CONSULTATION_REQUIRED
                else CalendarEvent.TYPE_TATTOO_SESSION
            ),
            "status": CalendarEvent.STATUS_CONFIRMED,
            "title": appointment.get_booking_type_display(),
            "starts_at": starts_at,
            "ends_at": ends_at,
            "notes": appointment.description,
            "placement": appointment.placement,
            "tattoo_style": appointment.localized_styles,
        },
    )
    return calendar_reschedule_request(request, event.id)

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
@require_POST
def autosave_artist_booking_setting(request):
    if not _is_verified_artist(request.user):
        return JsonResponse(
            {
                "ok": False,
                "error": _("Only verified tattoo artists can change these settings."),
            },
            status=403,
        )

    try:
        payload = json.loads(request.body.decode("utf-8") or "{}")
    except json.JSONDecodeError:
        return JsonResponse(
            {"ok": False, "error": _("Invalid JSON payload.")},
            status=400,
        )

    setting = payload.get("setting")
    value = payload.get("value")

    booking_settings, created = ArtistBookingSettings.objects.get_or_create(
        artist=request.user,
        defaults={"active_styles": ["Fine Line", "Blackwork", "Geometric"]},
    )

    boolean_settings = {
        "bookings_enabled",
        "consultation_enabled",
        "online_consultation_enabled",
        "studio_consultation_enabled",
        "phone_consultation_enabled",
        "consultation_required_before_booking",
        "reference_images_required",
        "deposit_required",
    }

    update_fields = [setting]

    if setting in boolean_settings:
        value = value if isinstance(value, bool) else str(value).lower() == "true"
        setattr(booking_settings, setting, value)

    elif setting == "booking_status":
        allowed_statuses = dict(
            getattr(ArtistBookingSettings, "BOOKING_STATUS_CHOICES", [])
        )

        if value not in allowed_statuses or not hasattr(
            booking_settings,
            "booking_status",
        ):
            return JsonResponse(
                {"ok": False, "error": _("Invalid booking status.")},
                status=400,
            )

        booking_settings.booking_status = value
        booking_settings.bookings_enabled = value in {
            getattr(ArtistBookingSettings, "BOOKING_STATUS_OPEN", "open"),
            getattr(
                ArtistBookingSettings,
                "BOOKING_STATUS_CONSULTATION_ONLY",
                "consultation_only",
            ),
        }
        update_fields = ["booking_status", "bookings_enabled"]

    elif setting == "active_styles":
        if not isinstance(value, list):
            return JsonResponse(
                {"ok": False, "error": _("Active styles must be a list.")},
                status=400,
            )

        cleaned_styles = []
        for style in value:
            if not isinstance(style, str):
                continue

            style = style.strip()[:80]
            if style and style not in cleaned_styles:
                cleaned_styles.append(style)

            if len(cleaned_styles) >= 30:
                break

        value = cleaned_styles
        booking_settings.active_styles = cleaned_styles

    else:
        return JsonResponse(
            {"ok": False, "error": _("This setting cannot be autosaved.")},
            status=400,
        )

    booking_settings.save(update_fields=update_fields)
    booking_settings.refresh_from_db()

    if setting == "booking_status":
        persisted_value = getattr(booking_settings, "booking_status", value)
    else:
        persisted_value = getattr(booking_settings, setting)

    if "_get_booking_status_label" in globals():
        current_status = str(
            _get_booking_status_label(
                getattr(
                    booking_settings,
                    "booking_status",
                    getattr(ArtistBookingSettings, "BOOKING_STATUS_OPEN", "open"),
                )
            )
        )
    else:
        current_status = str(
            _("Accepting bookings")
            if booking_settings.bookings_enabled
            else _("Bookings paused")
        )

    response_payload = {
        "ok": True,
        "setting": setting,
        "value": persisted_value,
        "current_status": current_status,
    }

    if setting == "booking_status":
        response_payload.update(
            {
                "booking_status": getattr(booking_settings, "booking_status", None),
                "bookings_enabled": booking_settings.bookings_enabled,
            }
        )

    return JsonResponse(response_payload)

@login_required
def artist_dashboard_calendar(request):
    if not _is_verified_artist(request.user):
        return HttpResponseForbidden(
            _("Booking settings are available only for verified tattoo artists.")
        )
    return artist_booking_settings(request, active_panel="calendar")


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
            "default_style_choices": [
                {"value": style, "label": _get_tattoo_style_label(style)}
                for style in DEFAULT_TATTOO_STYLES
            ],
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
            "current_status": _get_booking_status_label(
                getattr(
                    booking_settings,
                    "booking_status",
                    ArtistBookingSettings.BOOKING_STATUS_OPEN,
                )
            ),
            "active_dashboard_panel": active_panel,
        },
    )
