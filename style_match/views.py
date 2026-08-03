import json

from django.conf import settings
from django.db import transaction
from django.http import Http404, JsonResponse
from django.shortcuts import get_object_or_404, render
from django.urls import reverse
from django.utils.translation import gettext as _
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from users.security import check_rate_limit, rate_limited_json

from .models import StyleMatchResponse, StyleMatchSession, TattooCard
from .services import (
    cards_for_session,
    complete_session,
    result_payload,
    select_balanced_card_ids,
)


def _browser_session_key(request):
    if not request.session.session_key:
        request.session.create()
    return request.session.session_key


def _owned_session(request, session_id, *, lock=False):
    queryset = StyleMatchSession.objects
    if lock:
        queryset = queryset.select_for_update()
    session = get_object_or_404(queryset, pk=session_id)

    if session.user_id:
        if not request.user.is_authenticated or session.user_id != request.user.id:
            raise Http404
    elif session.browser_session_key != _browser_session_key(request):
        raise Http404
    return session


def _json_body(request):
    try:
        data = json.loads(request.body or b"{}")
    except (TypeError, ValueError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


@ensure_csrf_cookie
def index(request):
    preview_cards = list(
        TattooCard.objects.filter(is_active=True, is_approved=True).order_by("card_id")[
            :3
        ]
    )
    if preview_cards:
        original = list(preview_cards)
        while len(preview_cards) < 3:
            preview_cards.append(original[len(preview_cards) % len(original)])

    return render(
        request,
        "style_match/index.html",
        {
            "preview_cards": preview_cards,
            "has_cards": bool(preview_cards),
            "target_count": getattr(settings, "STYLE_MATCH_CARD_COUNT", 30),
        },
    )


@require_POST
def start_session(request):
    allowed, retry_after = check_rate_limit(
        request,
        scope="style-match:start",
        limit=20,
        window_seconds=60 * 60,
        identity="user_or_ip",
    )
    if not allowed:
        return rate_limited_json(
            retry_after,
            _("Too many Style Match sessions. Please wait a bit and try again."),
        )

    browser_key = _browser_session_key(request)
    target_count = max(1, min(30, int(getattr(settings, "STYLE_MATCH_CARD_COUNT", 30))))
    card_order = select_balanced_card_ids(target_count)
    if not card_order:
        return JsonResponse(
            {
                "error": _(
                    "Style Match cards are being prepared. Please try again soon."
                )
            },
            status=503,
        )

    active_sessions = StyleMatchSession.objects.filter(
        status=StyleMatchSession.STATUS_ACTIVE
    )
    if request.user.is_authenticated:
        active_sessions = active_sessions.filter(user=request.user)
    else:
        active_sessions = active_sessions.filter(
            browser_session_key=browser_key, user__isnull=True
        )
    active_sessions.update(status=StyleMatchSession.STATUS_ABANDONED)

    session = StyleMatchSession.objects.create(
        user=request.user if request.user.is_authenticated else None,
        browser_session_key=browser_key,
        target_count=len(card_order),
        card_order=card_order,
    )
    return JsonResponse(
        {
            "session_id": str(session.pk),
            "total": session.target_count,
            "cards": cards_for_session(session),
            "react_url": reverse(
                "style_match:react", kwargs={"session_id": session.pk}
            ),
            "result_url": reverse(
                "style_match:result", kwargs={"session_id": session.pk}
            ),
        },
        status=201,
    )


@require_POST
def react(request, session_id):
    payload = _json_body(request)
    if payload is None:
        return JsonResponse({"error": _("Invalid request body.")}, status=400)

    action = str(payload.get("action", "")).strip().lower()
    allowed = {
        "save",
        StyleMatchResponse.REACTION_REJECT,
        StyleMatchResponse.REACTION_LIKE,
        StyleMatchResponse.REACTION_FAVORITE,
    }
    if action not in allowed:
        return JsonResponse({"error": _("Unknown Style Match action.")}, status=400)

    try:
        card_id = int(payload.get("card_id"))
    except (TypeError, ValueError):
        return JsonResponse({"error": _("A valid card is required.")}, status=400)

    with transaction.atomic():
        session = _owned_session(request, session_id, lock=True)
        if session.is_complete:
            return JsonResponse({"completed": True, "result": result_payload(session)})

        if card_id not in session.card_order:
            return JsonResponse(
                {"error": _("This card is not part of the session.")}, status=400
            )

        position = session.card_order.index(card_id)
        current_card_id = session.card_order[session.current_index]
        existing = StyleMatchResponse.objects.filter(
            session=session, card_id=card_id
        ).first()

        if position < session.current_index and existing and existing.reaction:
            return JsonResponse(
                {
                    "completed": session.is_complete,
                    "current_index": session.current_index,
                    "total": session.target_count,
                    "saved": existing.saved,
                }
            )
        if card_id != current_card_id:
            return JsonResponse(
                {"error": _("Please react to the current card first.")}, status=409
            )

        response, _ = StyleMatchResponse.objects.get_or_create(
            session=session,
            card_id=card_id,
            defaults={"position": session.current_index},
        )

        if action == "save":
            response.saved = bool(payload.get("saved", True))
            response.save(update_fields=("saved", "responded_at"))
            return JsonResponse(
                {
                    "completed": False,
                    "saved": response.saved,
                    "current_index": session.current_index,
                    "total": session.target_count,
                }
            )

        response.position = session.current_index
        response.reaction = action
        response.save(update_fields=("position", "reaction", "responded_at"))
        session.current_index += 1

        if session.current_index >= len(session.card_order):
            complete_session(session)
            return JsonResponse(
                {
                    "completed": True,
                    "current_index": session.current_index,
                    "total": session.target_count,
                    "result_url": reverse(
                        "style_match:result",
                        kwargs={"session_id": session.pk},
                    ),
                }
            )

        session.save(update_fields=("current_index", "updated_at"))
        return JsonResponse(
            {
                "completed": False,
                "current_index": session.current_index,
                "total": session.target_count,
            }
        )


@require_GET
def result(request, session_id):
    session = _owned_session(request, session_id)
    payload = result_payload(session)
    if payload is None:
        return JsonResponse(
            {"error": _("This Style Match is not complete yet.")}, status=409
        )
    return JsonResponse(payload)
