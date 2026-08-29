from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from style_match.models import TattooCard


class StyleMatchPreviewView(APIView):
    """Return the same three curated preview cards used by the web onboarding."""

    permission_classes = (IsAuthenticated,)

    def get(self, request):
        preview_cards = list(
            TattooCard.objects.filter(is_active=True, is_approved=True)
            .order_by("card_id")[:3]
        )
        if preview_cards:
            original = list(preview_cards)
            while len(preview_cards) < 3:
                preview_cards.append(original[len(preview_cards) % len(original)])

        return Response(
            {
                "results": [
                    {
                        "id": card.pk,
                        "card_id": card.card_id,
                        "image_url": card.delivery_url,
                        "alt": f"Tattoo reference {card.card_id}",
                    }
                    for card in preview_cards
                ]
            }
        )
