from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from style_match.models import TattooCard
from style_match.services import serialize_card


def _preview_cards():
    cards = list(
        TattooCard.objects.filter(is_active=True, is_approved=True).order_by("card_id")[:3]
    )
    if cards:
        original = list(cards)
        while len(cards) < 3:
            cards.append(original[len(cards) % len(original)])
    return cards


class StyleMatchPreviewView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        return Response({"cards": [serialize_card(card) for card in _preview_cards()]})
