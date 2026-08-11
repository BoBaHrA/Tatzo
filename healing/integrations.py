from __future__ import annotations

from django.contrib.auth.decorators import login_required
from django.db.models import Prefetch, Q
from django.http import Http404, JsonResponse
from django.shortcuts import get_object_or_404
from django.urls import reverse
from django.utils import timezone
from django.utils.formats import date_format, time_format
from django.views.decorators.http import require_GET

from appointments.models import Appointment
from posts.models import Post, PostMedia
from users.models import ChatThread

from .models import HealingJourney


CHAT_COPY = {
    "en": {
        "appointment_eyebrow": "Tattoo session",
        "appointment_action": "Open session",
        "healing_eyebrow": "Healing journey",
        "healing_action": "Open healing",
        "fallback_title": "Tattoo appointment",
    },
    "fr": {
        "appointment_eyebrow": "Séance de tatouage",
        "appointment_action": "Ouvrir la séance",
        "healing_eyebrow": "Suivi de cicatrisation",
        "healing_action": "Ouvrir le suivi",
        "fallback_title": "Rendez-vous tatouage",
    },
    "ru": {
        "appointment_eyebrow": "Тату-сеанс",
        "appointment_action": "Открыть сеанс",
        "healing_eyebrow": "Сопровождение заживления",
        "healing_action": "Открыть заживление",
        "fallback_title": "Запись на татуировку",
    },
}

COMMUNITY_COPY = {
    "en": {
        "eyebrow": "Never heal alone",
        "title": "You are part of something bigger",
        "subtitle": "Discover recent tattoo stories from the Tatzo community.",
        "empty": "The community gallery is still growing. Explore Tatzo and meet more artists.",
        "action": "Explore community",
    },
    "fr": {
        "eyebrow": "Ne cicatrisez jamais seul",
        "title": "Vous faites partie de quelque chose de plus grand",
        "subtitle": "Découvrez des histoires récentes de la communauté Tatzo.",
        "empty": "La galerie communautaire grandit encore. Explorez Tatzo et découvrez plus d'artistes.",
        "action": "Explorer la communauté",
    },
    "ru": {
        "eyebrow": "Не проходите заживление в одиночку",
        "title": "Вы — часть чего-то большего",
        "subtitle": "Посмотрите свежие истории и работы сообщества Tatzo.",
        "empty": "Галерея сообщества ещё растёт. Откройте Tatzo и познакомьтесь с другими мастерами.",
        "action": "Открыть сообщество",
    },
}


def _language(request) -> str:
    language = (getattr(request, "LANGUAGE_CODE", "en") or "en").split("-")[0]
    return language if language in CHAT_COPY else "en"


def _appointment_title(appointment: Appointment, fallback: str) -> str:
    parts = [
        str(appointment.localized_styles or "").strip(),
        str(appointment.localized_placement or "").strip(),
    ]
    title = " · ".join(part for part in parts if part)
    return title or fallback


def _appointment_meta(appointment: Appointment) -> str:
    date_text = date_format(appointment.date, "DATE_FORMAT")
    time_text = time_format(appointment.start_time, "TIME_FORMAT")
    return f"{date_text} · {time_text}"


def _thread_for_user(request, thread_id: int) -> ChatThread:
    thread = get_object_or_404(
        ChatThread.objects.select_related("participant_one", "participant_two"),
        pk=thread_id,
    )
    if not thread.has_user(request.user):
        raise Http404
    return thread


def _journey_for_user(request, journey_id) -> HealingJourney:
    journey = get_object_or_404(
        HealingJourney.objects.select_related("client", "artist", "appointment"),
        pk=journey_id,
    )
    if request.user not in {journey.client, journey.artist}:
        raise Http404
    return journey


@login_required
@require_GET
def chat_session_context(request, thread_id):
    thread = _thread_for_user(request, thread_id)
    other_user = thread.get_other_user(request.user)
    language = _language(request)
    copy = CHAT_COPY[language]

    appointments = Appointment.objects.filter(
        Q(client=request.user, artist=other_user)
        | Q(client=other_user, artist=request.user),
        booking_type=Appointment.TYPE_TATTOO,
    ).exclude(
        status__in=[Appointment.STATUS_DECLINED, Appointment.STATUS_CANCELLED]
    )

    open_statuses = [
        Appointment.STATUS_PENDING,
        Appointment.STATUS_ACCEPTED,
        Appointment.STATUS_NEEDS_REFERENCES,
        Appointment.STATUS_CONSULTATION_REQUIRED,
    ]
    today = timezone.localdate()
    appointment = (
        appointments.filter(status__in=open_statuses, date__gte=today)
        .order_by("date", "start_time")
        .first()
    )
    if appointment is None:
        appointment = (
            appointments.filter(status__in=open_statuses)
            .order_by("-date", "-start_time")
            .first()
        )
    if appointment is None:
        appointment = (
            appointments.filter(status=Appointment.STATUS_COMPLETED)
            .order_by("-date", "-start_time")
            .first()
        )

    if appointment is None:
        return JsonResponse({"ok": True, "context": None})

    title = _appointment_title(appointment, copy["fallback_title"])
    if appointment.status == Appointment.STATUS_COMPLETED:
        journey = HealingJourney.objects.filter(appointment=appointment).first()
        target_url = reverse("healing:dashboard")
        if journey:
            target_url = f"{target_url}?journey={journey.pk}"
        context = {
            "mode": "healing",
            "eyebrow": copy["healing_eyebrow"],
            "title": title,
            "meta": _appointment_meta(appointment),
            "status": appointment.get_status_display(),
            "action": copy["healing_action"],
            "url": target_url,
        }
    else:
        context = {
            "mode": "appointment",
            "eyebrow": copy["appointment_eyebrow"],
            "title": title,
            "meta": _appointment_meta(appointment),
            "status": appointment.get_status_display(),
            "action": copy["appointment_action"],
            "url": reverse("appointment_detail", kwargs={"appointment_id": appointment.pk}),
        }

    return JsonResponse({"ok": True, "context": context})


@login_required
@require_GET
def community_context(request, journey_id):
    journey = _journey_for_user(request, journey_id)
    language = _language(request)
    copy = COMMUNITY_COPY[language]

    image_media = PostMedia.objects.filter(media_type=PostMedia.IMAGE).order_by("order")
    candidates = list(
        Post.objects.visible_to(request.user)
        .filter(
            medias__media_type=PostMedia.IMAGE,
            user__profile__account_type="tattoo_artist",
        )
        .exclude(user_id__in=[journey.client_id, journey.artist_id])
        .select_related("user", "user__profile")
        .prefetch_related(Prefetch("medias", queryset=image_media, to_attr="healing_images"))
        .distinct()
        .order_by("-created_at")[:18]
    )

    styles = journey.appointment.styles or []
    if not isinstance(styles, (list, tuple)):
        styles = [str(styles)]
    style_tokens = [str(style).strip().lower() for style in styles if str(style).strip()]

    def score(post):
        content = (post.content or "").lower()
        return sum(1 for token in style_tokens if token in content)

    candidates.sort(key=lambda post: (score(post), post.created_at), reverse=True)
    items = []
    for post in candidates:
        media = post.healing_images[0] if post.healing_images else None
        if not media or not media.media_url:
            continue
        caption = " ".join((post.content or "").split())
        items.append(
            {
                "image_url": media.media_url,
                "label": f"@{post.user.username}",
                "caption": caption[:72],
                "url": reverse("profile", kwargs={"username": post.user.username}),
            }
        )
        if len(items) == 3:
            break

    return JsonResponse(
        {
            "ok": True,
            "copy": copy,
            "items": items,
            "feed_url": reverse("home"),
        }
    )
