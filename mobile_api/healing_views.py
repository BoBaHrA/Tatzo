import logging
import mimetypes
import os
from datetime import timedelta
from urllib.parse import urlencode

from django.core import signing
from django.db import transaction
from django.db.models import Count, Q
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.urls import reverse
from django.utils import timezone
from PIL import Image, UnidentifiedImageError
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from appointments.models import Appointment
from healing.copy import get_copy
from healing.models import HealingCheckIn, HealingJourney, HealingRoutineCompletion
from users.models import ChatThread
from users.security import check_rate_limit

logger = logging.getLogger(__name__)

MAX_HEALING_IMAGE_SIZE = int(9.5 * 1024 * 1024)
MAX_HEALING_IMAGE_PIXELS = 80_000_000
HEALING_IMAGE_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
HEALING_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP"}
HEALING_MEDIA_MAX_AGE = 60 * 60
HEALING_MEDIA_SIGNING_SALT = "mobile-healing-checkin-v1"

SYMPTOM_COPY_KEYS = (
    ("redness", "symptom_redness"),
    ("swelling", "symptom_swelling"),
    ("pain", "symptom_pain"),
    ("itching", "symptom_itching"),
    ("warmth", "symptom_warmth"),
    ("discharge", "symptom_discharge"),
)
ALLOWED_SYMPTOMS = {slug for slug, _copy_key in SYMPTOM_COPY_KEYS}


class PrivateHealingResponseMixin:
    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "private, no-store"
        return response


def _copy(request):
    copy, timeline, language = get_copy(getattr(request, "LANGUAGE_CODE", "en") or "en")
    return copy, timeline, language


def _absolute_profile_image_url(user, request):
    image = user.profile.profile_image
    if not image:
        return None
    try:
        url = image.url
    except (AttributeError, ValueError):
        return None
    return request.build_absolute_uri(url) if url.startswith("/") else url


def _user_payload(user, request):
    return {
        "id": user.pk,
        "username": user.username,
        "tag": user.profile.tag,
        "is_verified_artist": user.profile.is_verified_artist,
        "profile_image_url": _absolute_profile_image_url(user, request),
    }


def _journeys_for_user(user):
    return (
        HealingJourney.objects.filter(Q(client=user) | Q(artist=user))
        .select_related(
            "appointment",
            "client",
            "client__profile",
            "artist",
            "artist__profile",
        )
        .prefetch_related("checkins")
        .distinct()
    )


def _journey_for_user(journey_id, user, *, lock=False):
    queryset = HealingJourney.objects.select_related(
        "appointment",
        "client",
        "client__profile",
        "artist",
        "artist__profile",
    ).prefetch_related("checkins")
    if lock:
        queryset = queryset.select_for_update()
    journey = get_object_or_404(queryset, pk=journey_id)
    if user.pk not in {journey.client_id, journey.artist_id}:
        raise Http404
    return journey


def _journey_title(appointment):
    parts = [
        str(appointment.localized_styles or "").strip(),
        str(appointment.localized_placement or "").strip(),
    ]
    return (
        " · ".join(part for part in parts if part)[:160] or f"Tattoo #{appointment.pk}"
    )


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


def _chat_stats(journey):
    thread = (
        ChatThread.objects.filter(
            Q(participant_one=journey.client, participant_two=journey.artist)
            | Q(participant_one=journey.artist, participant_two=journey.client)
        )
        .prefetch_related("messages")
        .first()
    )
    if not thread:
        return 0
    return thread.messages.filter(
        sender=journey.artist,
        is_deleted=False,
        created_at__date__gte=journey.started_on,
    ).count()


def _stage_key(journey):
    if journey.status == HealingJourney.STATUS_HEALED:
        return "healed"
    day = journey.current_day
    if day >= 30:
        return "30"
    if day >= 14:
        return "14"
    if day >= 7:
        return "7"
    if day >= 3:
        return "3"
    return "1"


def _timeline_payload(journey, timeline):
    current = _stage_key(journey)
    return {
        "current": current,
        "items": [
            {
                "key": key,
                "day": None if key == "healed" else int(key),
                "phase": value["phase"],
                "heading": value["heading"],
                "body": value["copy"],
                "tags": value["tags"],
                "active": key == current,
            }
            for key, value in timeline.items()
        ],
    }


def _checkin_url(checkin, request):
    token = signing.dumps(
        {"checkin_id": checkin.pk, "user_id": request.user.pk},
        salt=HEALING_MEDIA_SIGNING_SALT,
        compress=True,
    )
    path = reverse("mobile_api:healing_checkin_media", args=[checkin.pk])
    return request.build_absolute_uri(f"{path}?{urlencode({'token': token})}")


def _checkin_payload(checkin, request):
    return {
        "id": checkin.pk,
        "day_number": checkin.day_number,
        "url": _checkin_url(checkin, request),
        "note": checkin.note,
        "symptoms": checkin.symptoms or [],
        "created_at": checkin.created_at,
        "updated_at": checkin.updated_at,
    }


def _summary_payload(journey, request):
    role = "artist" if journey.artist_id == request.user.pk else "client"
    other_user = journey.client if role == "artist" else journey.artist
    checkins = list(journey.checkins.all())
    latest = checkins[-1] if checkins else None
    return {
        "id": str(journey.pk),
        "appointment_id": journey.appointment_id,
        "title": journey.title,
        "role": role,
        "status": journey.status,
        "started_on": journey.started_on,
        "healed_on": journey.healed_on,
        "current_day": journey.current_day,
        "tracking_percent": journey.tracking_percent,
        "days_remaining": journey.days_remaining,
        "checkin_count": len(checkins),
        "latest_photo_url": _checkin_url(latest, request) if latest else None,
        "other_user": _user_payload(other_user, request),
        "updated_at": journey.updated_at,
    }


def _detail_payload(journey, request):
    copy, timeline, language = _copy(request)
    summary = _summary_payload(journey, request)
    checkins = list(journey.checkins.all())
    today = timezone.localdate()
    completed_tasks = set(
        journey.routine_completions.filter(date=today).values_list(
            "task_slug", flat=True
        )
    )
    tasks = [
        {
            "slug": slug,
            "label": copy[copy_key],
            "completed": slug in completed_tasks,
        }
        for slug, copy_key in (
            (HealingRoutineCompletion.TASK_WASH, "task_wash"),
            (HealingRoutineCompletion.TASK_MOISTURIZE, "task_moisturize"),
            (HealingRoutineCompletion.TASK_SUN, "task_sun"),
            (HealingRoutineCompletion.TASK_FRICTION, "task_friction"),
        )
    ]
    chat_template = (
        copy["chat_draft_artist"]
        if summary["role"] == "artist"
        else copy["chat_draft_client"]
    )
    streak = _routine_streak(journey)
    return {
        **summary,
        "language": language,
        "copy": copy,
        "timeline": _timeline_payload(journey, timeline),
        "checkins": [_checkin_payload(checkin, request) for checkin in checkins],
        "tasks": tasks,
        "routine_done_count": len(completed_tasks),
        "routine_total": len(tasks),
        "routine_streak": streak,
        "artist_reply_count": _chat_stats(journey),
        "symptom_options": [
            {"slug": slug, "label": copy[copy_key]}
            for slug, copy_key in SYMPTOM_COPY_KEYS
        ],
        "chat_draft": chat_template.format(
            title=journey.title,
            day=journey.current_day,
        ),
        "can_edit": bool(
            summary["role"] == "client"
            and journey.status == HealingJourney.STATUS_ACTIVE
        ),
        "achievements": {
            "first_checkin": bool(checkins),
            "seven_day_streak": streak >= 7,
            "three_checkins": len(checkins) >= 3,
            "fully_healed": journey.status == HealingJourney.STATUS_HEALED,
        },
    }


def _eligible_appointment_payload(appointment, request):
    return {
        "id": appointment.pk,
        "title": _journey_title(appointment),
        "date": appointment.date,
        "artist": _user_payload(appointment.artist, request),
    }


def _uploaded_symptoms(request):
    if hasattr(request.data, "getlist"):
        values = request.data.getlist("symptoms")
    else:
        values = request.data.get("symptoms", [])
        if not isinstance(values, list):
            values = [values]
    symptoms = []
    for value in values:
        slug = str(value or "").strip().lower()
        if slug and slug not in symptoms:
            symptoms.append(slug)
    if any(slug not in ALLOWED_SYMPTOMS for slug in symptoms):
        return None
    return symptoms


def _validate_photo(photo):
    if not photo:
        return False
    content_type = (getattr(photo, "content_type", "") or "").lower()
    if (
        photo.size > MAX_HEALING_IMAGE_SIZE
        or content_type not in HEALING_IMAGE_CONTENT_TYPES
    ):
        return False
    detected_format = ""
    try:
        with Image.open(photo) as image:
            if image.format not in HEALING_IMAGE_FORMATS:
                return False
            detected_format = image.format
            if image.width * image.height > MAX_HEALING_IMAGE_PIXELS:
                return False
            image.verify()
        photo.seek(0)
    except (Image.DecompressionBombError, UnidentifiedImageError, OSError, ValueError):
        try:
            photo.seek(0)
        except (AttributeError, OSError):
            pass
        return False
    extension = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}[detected_format]
    stem = os.path.splitext(os.path.basename(photo.name or "healing"))[0][:120]
    photo.name = f"{stem or 'healing'}.{extension}"
    return True


class HealingListView(PrivateHealingResponseMixin, APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        copy, _timeline, language = _copy(request)
        journeys = list(_journeys_for_user(request.user))
        eligible = (
            Appointment.objects.filter(
                client=request.user,
                booking_type=Appointment.TYPE_TATTOO,
                status=Appointment.STATUS_COMPLETED,
                healing_journey__isnull=True,
            )
            .select_related("artist", "artist__profile")
            .order_by("-date", "-start_time")
        )
        return Response(
            {
                "language": language,
                "copy": copy,
                "journeys": [
                    _summary_payload(journey, request) for journey in journeys
                ],
                "eligible_appointments": [
                    _eligible_appointment_payload(appointment, request)
                    for appointment in eligible
                ],
            }
        )


class HealingDetailView(PrivateHealingResponseMixin, APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, journey_id):
        journey = _journey_for_user(journey_id, request.user)
        return Response(_detail_payload(journey, request))


class HealingAppointmentStartView(PrivateHealingResponseMixin, APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, appointment_id):
        with transaction.atomic():
            appointment = get_object_or_404(
                Appointment.objects.select_for_update().select_related(
                    "client",
                    "client__profile",
                    "artist",
                    "artist__profile",
                ),
                pk=appointment_id,
                client=request.user,
                booking_type=Appointment.TYPE_TATTOO,
                status=Appointment.STATUS_COMPLETED,
            )
            journey, created = HealingJourney.objects.get_or_create(
                appointment=appointment,
                defaults={
                    "client": appointment.client,
                    "artist": appointment.artist,
                    "title": _journey_title(appointment),
                    "started_on": appointment.date,
                },
            )
        journey = _journey_for_user(journey.pk, request.user)
        return Response(
            _detail_payload(journey, request),
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class HealingCheckInView(PrivateHealingResponseMixin, APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, journey_id):
        copy, _timeline, _language = _copy(request)
        photo = request.FILES.get("photo")
        if not _validate_photo(photo):
            return Response(
                {"code": "invalid_healing_photo", "detail": copy["invalid_photo"]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        note = str(request.data.get("note") or "").strip()
        if len(note) > 1000:
            return Response(
                {
                    "code": "healing_note_too_long",
                    "detail": "Keep the healing note under 1000 characters.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        symptoms = _uploaded_symptoms(request)
        if symptoms is None:
            return Response(
                {
                    "code": "invalid_healing_symptoms",
                    "detail": "Choose only the available healing tracking options.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        allowed, retry_after = check_rate_limit(
            request,
            scope=f"mobile:healing:checkin:{journey_id}",
            limit=20,
            window_seconds=60 * 60,
            identity="user",
        )
        if not allowed:
            return Response(
                {
                    "code": "rate_limited",
                    "detail": "Too many healing photo attempts. Try again later.",
                    "retry_after": retry_after,
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        old_photo_name = ""
        checkin = None
        try:
            with transaction.atomic():
                journey = _journey_for_user(journey_id, request.user, lock=True)
                if (
                    journey.client_id != request.user.pk
                    or journey.status != HealingJourney.STATUS_ACTIVE
                ):
                    raise Http404
                day_number = journey.current_day
                checkin = (
                    HealingCheckIn.objects.select_for_update()
                    .filter(journey=journey, day_number=day_number)
                    .first()
                )
                old_photo_name = checkin.photo.name if checkin and checkin.photo else ""
                if checkin is None:
                    checkin = HealingCheckIn(
                        journey=journey,
                        day_number=day_number,
                    )
                checkin.photo = photo
                checkin.note = note
                checkin.symptoms = symptoms
                checkin.save()
        except Http404:
            raise
        except Exception:
            logger.exception(
                "Mobile healing photo upload failed",
                extra={
                    "journey_id": str(journey_id),
                    "user_id": request.user.pk,
                    "photo_size": getattr(photo, "size", None),
                },
            )
            return Response(
                {"code": "healing_upload_failed", "detail": copy["upload_failed"]},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        if old_photo_name and old_photo_name != checkin.photo.name:
            try:
                checkin.photo.storage.delete(old_photo_name)
            except Exception:
                logger.warning(
                    "Could not remove replaced mobile Healing photo",
                    exc_info=True,
                    extra={"journey_id": str(journey_id)},
                )
        journey = _journey_for_user(journey_id, request.user)
        return Response(_detail_payload(journey, request))


class HealingTaskView(PrivateHealingResponseMixin, APIView):
    permission_classes = (IsAuthenticated,)

    def _set(self, request, journey_id, task_slug, completed):
        if task_slug not in HealingRoutineCompletion.TASK_SLUGS:
            raise Http404
        with transaction.atomic():
            journey = _journey_for_user(journey_id, request.user, lock=True)
            if (
                journey.client_id != request.user.pk
                or journey.status != HealingJourney.STATUS_ACTIVE
            ):
                raise Http404
            queryset = HealingRoutineCompletion.objects.filter(
                journey=journey,
                date=timezone.localdate(),
                task_slug=task_slug,
            )
            if completed:
                queryset.get_or_create(
                    defaults={},
                    journey=journey,
                    date=timezone.localdate(),
                    task_slug=task_slug,
                )
            else:
                queryset.delete()
            done_count = journey.routine_completions.filter(
                date=timezone.localdate()
            ).count()
        return Response(
            {
                "slug": task_slug,
                "completed": completed,
                "done_count": done_count,
                "total": len(HealingRoutineCompletion.TASK_SLUGS),
            }
        )

    def put(self, request, journey_id, task_slug):
        return self._set(request, journey_id, task_slug, True)

    def delete(self, request, journey_id, task_slug):
        return self._set(request, journey_id, task_slug, False)


class HealingMarkHealedView(PrivateHealingResponseMixin, APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, journey_id):
        with transaction.atomic():
            journey = _journey_for_user(journey_id, request.user, lock=True)
            if journey.client_id != request.user.pk:
                raise Http404
            if journey.status == HealingJourney.STATUS_ACTIVE:
                journey.status = HealingJourney.STATUS_HEALED
                journey.healed_on = timezone.localdate()
                journey.save(update_fields=("status", "healed_on", "updated_at"))
        journey = _journey_for_user(journey_id, request.user)
        return Response(_detail_payload(journey, request))


class HealingCheckInMediaView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)

    def get(self, request, checkin_id):
        try:
            payload = signing.loads(
                request.query_params.get("token", ""),
                salt=HEALING_MEDIA_SIGNING_SALT,
                max_age=HEALING_MEDIA_MAX_AGE,
            )
        except signing.BadSignature:
            raise Http404
        if payload.get("checkin_id") != checkin_id:
            raise Http404
        checkin = get_object_or_404(
            HealingCheckIn.objects.select_related("journey"),
            pk=checkin_id,
        )
        if payload.get("user_id") not in {
            checkin.journey.client_id,
            checkin.journey.artist_id,
        }:
            raise Http404
        try:
            file_handle = checkin.photo.open("rb")
        except (FileNotFoundError, OSError, ValueError):
            raise Http404
        response = FileResponse(
            file_handle,
            as_attachment=False,
            filename=os.path.basename(checkin.photo.name),
            content_type=(
                mimetypes.guess_type(checkin.photo.name)[0]
                or "application/octet-stream"
            ),
        )
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response
