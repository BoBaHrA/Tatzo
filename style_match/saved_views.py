from django.http import Http404, JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_GET

from .models import StyleMatchSession


def _browser_session_key(request):
    if not request.session.session_key:
        request.session.create()
    return request.session.session_key


def _owned_completed_session(request, session_id):
    session = get_object_or_404(
        StyleMatchSession,
        pk=session_id,
        status=StyleMatchSession.STATUS_COMPLETED,
    )
    if session.user_id:
        if not request.user.is_authenticated or session.user_id != request.user.id:
            raise Http404
    elif session.browser_session_key != _browser_session_key(request):
        raise Http404
    return session


@require_GET
def saved_references(request, session_id):
    session = _owned_completed_session(request, session_id)
    responses = (
        session.responses.filter(saved=True)
        .select_related("card")
        .order_by("position", "card__card_id")
    )
    return JsonResponse(
        {
            "session_id": str(session.pk),
            "cards": [
                {
                    "id": response.card_id,
                    "card_id": response.card.card_id,
                    "image_url": response.card.delivery_url,
                    "alt": f"Tattoo reference {response.card.card_id}",
                }
                for response in responses
            ],
        }
    )
