import logging
import mimetypes
from datetime import timedelta
from pathlib import Path

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.db.models import Count, Q
from django.http import FileResponse, Http404, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST

from appointments.models import Appointment
from users.models import ChatThread

from .copy import get_copy
from .models import HealingCheckIn, HealingJourney, HealingRoutineCompletion


logger = logging.getLogger(__name__)

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
# Cloudinary Free currently caps image uploads at 10 MB. Keep our validation
# at the same boundary so an accepted Tatzo upload cannot be rejected solely
# because it exceeded the storage plan limit.
MAX_IMAGE_SIZE = 10 * 1024 * 1024

PHOTO_UPLOAD_COPY = {
    "en": {
        "invalid": "Please upload a JPG, PNG or WebP image up to 10 MB.",
        "failed": "We could not save this photo. Please try again with another image or retry in a moment.",
    },
    "fr": {
        "invalid": "Ajoutez une image JPG, PNG ou WebP de 10 Mo maximum.",
        "failed": "Nous n'avons pas pu enregistrer cette photo. Réessayez avec une autre image ou dans un instant.",
    },
    "ru": {
        "invalid": "Загрузите JPG, PNG или WebP размером до 10 МБ.",
        "failed": "Не удалось сохранить фото. Попробуйте ещё раз через минуту или выберите другое изображение.",
    },
}


def _copy(request):
    return get_copy(getattr(request, "LANGUAGE_CODE", "en"))


def _language(request):
    language = (getattr(request, "LANGUAGE_CODE", "en") or "en").split("-")[0]
    return language if language in PHOTO_UPLOAD_COPY else "en"


def _photo_message(request, key):
    return PHOTO_UPLOAD_COPY[_language(request)][key]


def _journey_redirect(journey):
    return f"{reverse('healing:dashboard')}?journey={journey.pk}"


def _journeys_for_user(user):
    return (
        HealingJourney.objects.filter(Q(client=user) | Q(artist=user))
        .select_related("appointment", "client", "client__profile", "artist", "artist__profile")
        .distinct()
    )


def _owned_journey(request, journey_id):
    journey = get_object_or_404(
        HealingJourney.objects.select_related(
            "appointment", "client", "client__profile", "artist", "artist__profile"
        ),
        pk=journey_id,
    )
    if request.user not in {journey.client, journey.artist}:
        raise Http404
    return journey


def _journey_title(appointment):
    styles = appointment.localized_styles
    placement = appointment.localized_placement
    parts = [part for part in (styles, placement) if part]
    return " · ".join(parts)[:160] or f"Tattoo #{appointment.pk}"


def _routine_streak(journey):
    required = len(HealingRoutineCompletion.TASK_SLUGS)
    rows = (
        journey.routine_completions.values("date")
        .annotate(done=Count("task_slug", distinct=True))
        .filter(done__gte=required)
        .order_by("-date")
    )
    completed_dates = {row["date"] for row in rows}
    cursor = timezone.localdate()
    if cursor not in completed_dates:
        cursor -= timedelta(days=1)
    streak = 0
    while cursor in completed_dates:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def _chat_context(journey):
    thread = (
        ChatThread.objects.filter(
            Q(participant_one=journey.client, participant_two=journey.artist)
            | Q(participant_one=journey.artist, participant_two=journey.client)
        )
        .prefetch_related("messages")
        .first()
    )
    if not thread:
        return None, None, 0

    latest_artist_message = (
        thread.messages.filter(sender=journey.artist, is_deleted=False)
        .order_by("-created_at")
        .first()
    )
    artist_reply_count = thread.messages.filter(
        sender=journey.artist,
        is_deleted=False,
        created_at__date__gte=journey.started_on,
    ).count()
    return thread, latest_artist_message, artist_reply_count


@login_required
def dashboard(request):
    copy, timeline, language = _copy(request)
    journeys = list(_journeys_for_user(request.user))
    selected_id = request.GET.get("journey")
    journey = next((item for item in journeys if str(item.pk) == selected_id), None)
    if not journey and journeys:
        active = [item for item in journeys if item.status == HealingJourney.STATUS_ACTIVE]
        journey = active[0] if active else journeys[0]

    eligible_appointments = (
        Appointment.objects.filter(
            client=request.user,
            booking_type=Appointment.TYPE_TATTOO,
            status=Appointment.STATUS_COMPLETED,
            healing_journey__isnull=True,
        )
        .select_related("artist", "artist__profile")
        .order_by("-date", "-start_time")
    )

    context = {
        "copy": copy,
        "language": language,
        "timeline_data": timeline,
        "journeys": journeys,
        "journey": journey,
        "eligible_appointments": eligible_appointments,
        "is_artist_view": bool(journey and request.user == journey.artist),
    }

    if journey:
        checkins = list(journey.checkins.all())
        today = timezone.localdate()
        completed_tasks = set(
            journey.routine_completions.filter(date=today).values_list("task_slug", flat=True)
        )
        _thread, latest_artist_message, artist_reply_count = _chat_context(journey)
        tasks = [
            (HealingRoutineCompletion.TASK_WASH, copy["task_wash"]),
            (HealingRoutineCompletion.TASK_MOISTURIZE, copy["task_moisturize"]),
            (HealingRoutineCompletion.TASK_SUN, copy["task_sun"]),
            (HealingRoutineCompletion.TASK_FRICTION, copy["task_friction"]),
        ]
        checkins_payload = [
            {"day": checkin.day_number, "url": checkin.private_url, "note": checkin.note}
            for checkin in checkins
        ]
        other_user = journey.client if request.user == journey.artist else journey.artist
        streak = _routine_streak(journey)
        context.update(
            {
                "checkins": checkins,
                "first_checkin": checkins[0] if checkins else None,
                "latest_checkin": checkins[-1] if checkins else None,
                "checkins_data": checkins_payload,
                "tasks": tasks,
                "completed_tasks": completed_tasks,
                "routine_streak": streak,
                "latest_artist_message": latest_artist_message,
                "artist_reply_count": artist_reply_count,
                "other_user": other_user,
                "chat_url": reverse("healing:open_chat", kwargs={"journey_id": journey.pk}),
                "achievement_first": bool(checkins),
                "achievement_streak": streak >= 7,
                "achievement_three": len(checkins) >= 3,
                "achievement_healed": journey.status == HealingJourney.STATUS_HEALED,
            }
        )

    return render(request, "healing/dashboard.html", context)


@login_required
@require_POST
def start_journey(request, appointment_id):
    copy, _timeline, _language = _copy(request)
    appointment = get_object_or_404(
        Appointment.objects.select_related("client", "artist"),
        pk=appointment_id,
        client=request.user,
        booking_type=Appointment.TYPE_TATTOO,
        status=Appointment.STATUS_COMPLETED,
    )
    journey, _created = HealingJourney.objects.get_or_create(
        appointment=appointment,
        defaults={
            "client": appointment.client,
            "artist": appointment.artist,
            "title": _journey_title(appointment),
            "started_on": appointment.date,
        },
    )
    messages.success(request, copy["journey_started"])
    return redirect(_journey_redirect(journey))


@login_required
@require_POST
def upload_checkin(request, journey_id):
    copy, _timeline, _language = _copy(request)
    journey = _owned_journey(request, journey_id)
    if request.user != journey.client or journey.status != HealingJourney.STATUS_ACTIVE:
        raise Http404

    photo = request.FILES.get("photo")
    suffix = Path(getattr(photo, "name", "")).suffix.lower() if photo else ""
    content_type = (getattr(photo, "content_type", "") or "").lower() if photo else ""
    if (
        not photo
        or photo.size > MAX_IMAGE_SIZE
        or suffix not in ALLOWED_IMAGE_SUFFIXES
        or (content_type and content_type not in ALLOWED_IMAGE_TYPES)
    ):
        messages.error(request, _photo_message(request, "invalid"))
        return redirect(_journey_redirect(journey))

    day_number = journey.current_day
    note = (request.POST.get("note") or "").strip()[:1000]
    symptoms = request.POST.getlist("symptoms")[:12]

    # Save the new object/file first. For a same-day replacement the previous
    # private asset is only deleted after the new file and database row have
    # been saved successfully, so a storage failure cannot destroy the user's
    # existing check-in.
    checkin = HealingCheckIn.objects.filter(
        journey=journey,
        day_number=day_number,
    ).first()
    old_photo_name = checkin.photo.name if checkin and checkin.photo else ""
    if checkin is None:
        checkin = HealingCheckIn(journey=journey, day_number=day_number)

    checkin.photo = photo
    checkin.note = note
    checkin.symptoms = symptoms

    try:
        checkin.save()
    except Exception:
        logger.exception(
            "Healing photo upload failed",
            extra={
                "journey_id": str(journey.pk),
                "day_number": day_number,
                "user_id": request.user.pk,
                "photo_size": getattr(photo, "size", None),
                "photo_suffix": suffix,
            },
        )
        messages.error(request, _photo_message(request, "failed"))
        return redirect(_journey_redirect(journey))

    if old_photo_name and old_photo_name != checkin.photo.name:
        try:
            checkin.photo.storage.delete(old_photo_name)
        except Exception:
            # The new check-in is already safe and usable. A stale private
            # object is preferable to failing the request or losing the new one.
            logger.warning(
                "Could not remove replaced Healing photo",
                exc_info=True,
                extra={"journey_id": str(journey.pk), "day_number": day_number},
            )

    messages.success(request, copy["photo_saved"])
    return redirect(_journey_redirect(journey))


@login_required
@require_POST
def toggle_task(request, journey_id, task_slug):
    copy, _timeline, _language = _copy(request)
    journey = _owned_journey(request, journey_id)
    if (
        request.user != journey.client
        or journey.status != HealingJourney.STATUS_ACTIVE
        or task_slug not in HealingRoutineCompletion.TASK_SLUGS
    ):
        raise Http404

    completion, created = HealingRoutineCompletion.objects.get_or_create(
        journey=journey,
        date=timezone.localdate(),
        task_slug=task_slug,
    )
    completed = created
    if not created:
        completion.delete()
        completed = False

    done_count = journey.routine_completions.filter(date=timezone.localdate()).count()
    return JsonResponse(
        {
            "ok": True,
            "completed": completed,
            "done_count": done_count,
            "total": len(HealingRoutineCompletion.TASK_SLUGS),
            "message": copy["task_saved"],
        }
    )


@login_required
@require_POST
def mark_healed(request, journey_id):
    copy, _timeline, _language = _copy(request)
    journey = _owned_journey(request, journey_id)
    if request.user != journey.client:
        raise Http404
    journey.mark_healed()
    messages.success(request, copy["journey_healed"])
    return redirect(_journey_redirect(journey))


@login_required
@require_GET
def checkin_media(request, checkin_id):
    checkin = get_object_or_404(
        HealingCheckIn.objects.select_related("journey"),
        pk=checkin_id,
    )
    if request.user not in {checkin.journey.client, checkin.journey.artist}:
        raise Http404

    content_type = mimetypes.guess_type(checkin.photo.name)[0] or "application/octet-stream"
    response = FileResponse(checkin.photo.open("rb"), content_type=content_type)
    response["Content-Disposition"] = f'inline; filename="{Path(checkin.photo.name).name}"'
    response["Cache-Control"] = "private, max-age=300"
    return response


@login_required
def open_chat(request, journey_id):
    journey = _owned_journey(request, journey_id)
    other_user = journey.artist if request.user == journey.client else journey.client
    thread = ChatThread.get_or_create_for_users(request.user, other_user)
    chat_url = reverse("chat_thread", kwargs={"thread_id": thread.pk})
    return redirect(f"{chat_url}?healing_journey={journey.pk}")


@login_required
@require_GET
def chat_draft(request, journey_id):
    copy, _timeline, _language = _copy(request)
    journey = _owned_journey(request, journey_id)
    template = copy["chat_draft_artist"] if request.user == journey.artist else copy["chat_draft_client"]
    return JsonResponse(
        {
            "draft": template.format(title=journey.title, day=journey.current_day),
            "label": f'{copy["chat_context"]}: {journey.title} · {copy["day"]} {journey.current_day}',
            "journey_url": f"{reverse('healing:dashboard')}?journey={journey.pk}",
        }
    )
