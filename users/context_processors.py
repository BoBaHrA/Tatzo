from django.db.models import Q

from .models import ChatMessage


def chat_unread_count(request):
    if not request.user.is_authenticated:
        return {
            "unread_chat_messages_count": 0,
        }

    count = (
        ChatMessage.objects
        .filter(
            Q(thread__participant_one=request.user) |
            Q(thread__participant_two=request.user),
            is_read=False,
        )
        .exclude(sender=request.user)
        .count()
    )

    return {
        "unread_chat_messages_count": count,
    }