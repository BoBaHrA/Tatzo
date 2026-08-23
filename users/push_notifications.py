import logging
from datetime import timedelta

import requests
from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .models import Notification, PushDelivery, PushDevice
from .notification_targets import notification_target

logger = logging.getLogger(__name__)

PUSH_BODIES = {
    "en": {
        Notification.KIND_FOLLOW: "You have a new follower.",
        Notification.KIND_POST_LIKE: "Someone liked your post.",
        Notification.KIND_POST_COMMENT: "Your post has a new comment.",
        Notification.KIND_COMMENT_REPLY: "Someone replied to your comment.",
        Notification.KIND_CHAT_MESSAGE: "You have a new message.",
        Notification.KIND_BOOKING_REQUEST: "You have a new booking request.",
        Notification.KIND_BOOKING_UPDATE: "A booking has been updated.",
        Notification.KIND_BOOKING_REMINDER: "Your appointment is coming up.",
    },
    "fr": {
        Notification.KIND_FOLLOW: "Vous avez un nouvel abonné.",
        Notification.KIND_POST_LIKE: "Quelqu’un a aimé votre publication.",
        Notification.KIND_POST_COMMENT: ("Votre publication a un nouveau commentaire."),
        Notification.KIND_COMMENT_REPLY: "Quelqu’un a répondu à votre commentaire.",
        Notification.KIND_CHAT_MESSAGE: "Vous avez un nouveau message.",
        Notification.KIND_BOOKING_REQUEST: (
            "Vous avez une nouvelle demande de réservation."
        ),
        Notification.KIND_BOOKING_UPDATE: "Une réservation a été mise à jour.",
        Notification.KIND_BOOKING_REMINDER: "Votre rendez-vous approche.",
    },
    "ru": {
        Notification.KIND_FOLLOW: "У вас новый подписчик.",
        Notification.KIND_POST_LIKE: "Кто-то оценил вашу публикацию.",
        Notification.KIND_POST_COMMENT: "У вашей публикации новый комментарий.",
        Notification.KIND_COMMENT_REPLY: "Кто-то ответил на ваш комментарий.",
        Notification.KIND_CHAT_MESSAGE: "У вас новое сообщение.",
        Notification.KIND_BOOKING_REQUEST: "У вас новый запрос на запись.",
        Notification.KIND_BOOKING_UPDATE: "Запись была обновлена.",
        Notification.KIND_BOOKING_REMINDER: "Скоро начнётся ваша запись.",
    },
}
PUSH_FALLBACK_BODIES = {
    "en": "You have new activity on Tatzo.",
    "fr": "Vous avez une nouvelle activité sur Tatzo.",
    "ru": "У вас новая активность в Tatzo.",
}

RETRYABLE_ERRORS = {"MessageRateExceeded"}


def _push_headers():
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    access_token = getattr(settings, "EXPO_PUSH_ACCESS_TOKEN", "")
    if access_token:
        headers["Authorization"] = f"Bearer {access_token}"
    return headers


def _target_data(notification):
    target = notification_target(notification)
    data = {
        "notificationId": str(notification.pk),
        "targetType": target["type"],
    }
    if "id" in target:
        data["targetId"] = str(target["id"])
    if "username" in target:
        data["targetUsername"] = target["username"]
    return data


def _message_for_delivery(delivery, unread_count):
    locale = delivery.device.locale if delivery.device.locale in PUSH_BODIES else "en"
    notification = delivery.notification
    return {
        "to": delivery.device.expo_push_token,
        "title": "Tatzo",
        "body": PUSH_BODIES[locale].get(
            notification.kind,
            PUSH_FALLBACK_BODIES[locale],
        ),
        "data": _target_data(notification),
        "sound": "default",
        "badge": unread_count,
        "channelId": "activity",
    }


def queue_notification_push(notification, *, dispatch=True):
    device_ids = PushDevice.objects.filter(
        user_id=notification.recipient_id,
        is_active=True,
    ).values_list("pk", flat=True)
    PushDelivery.objects.bulk_create(
        [
            PushDelivery(notification_id=notification.pk, device_id=device_id)
            for device_id in device_ids
        ],
        ignore_conflicts=True,
    )
    if dispatch and getattr(settings, "TATZO_PUSH_ENABLED", True):
        transaction.on_commit(
            lambda notification_id=notification.pk: dispatch_push_deliveries(
                notification_id=notification_id,
            )
        )


def _schedule_retry(delivery, error):
    if delivery.attempt_count >= getattr(settings, "EXPO_PUSH_MAX_ATTEMPTS", 6):
        _fail_delivery(delivery, error)
        return
    exponent = min(max(delivery.attempt_count - 1, 0), 6)
    delivery.status = PushDelivery.STATUS_RETRY
    delivery.next_attempt_at = timezone.now() + timedelta(minutes=2**exponent)
    delivery.last_error = str(error)[:500]
    delivery.ticket_id = ""
    delivery.sent_at = None
    delivery.receipt_checked_at = None
    delivery.save(
        update_fields=(
            "status",
            "next_attempt_at",
            "last_error",
            "ticket_id",
            "sent_at",
            "receipt_checked_at",
            "updated_at",
        )
    )


def _fail_delivery(delivery, error, *, deactivate=False):
    delivery.status = PushDelivery.STATUS_FAILED
    delivery.next_attempt_at = None
    delivery.last_error = str(error)[:500]
    delivery.receipt_checked_at = timezone.now()
    delivery.save(
        update_fields=(
            "status",
            "next_attempt_at",
            "last_error",
            "receipt_checked_at",
            "updated_at",
        )
    )
    if deactivate:
        PushDevice.objects.filter(pk=delivery.device_id).update(is_active=False)


def _eligible_deliveries(*, notification_id=None, limit=100):
    now = timezone.now()
    queryset = PushDelivery.objects.filter(
        Q(status=PushDelivery.STATUS_PENDING)
        | Q(status=PushDelivery.STATUS_RETRY, next_attempt_at__lte=now),
        device__is_active=True,
    )
    if notification_id is not None:
        queryset = queryset.filter(notification_id=notification_id)
    return list(
        queryset.select_related("device", "notification").order_by("created_at", "id")[
            : min(max(limit, 1), 100)
        ]
    )


def dispatch_push_deliveries(*, notification_id=None, limit=100):
    deliveries = _eligible_deliveries(
        notification_id=notification_id,
        limit=limit,
    )
    if not deliveries:
        return 0

    recipient_ids = {delivery.notification.recipient_id for delivery in deliveries}
    unread_counts = {
        recipient_id: Notification.objects.filter(
            recipient_id=recipient_id,
            is_read=False,
        ).count()
        for recipient_id in recipient_ids
    }
    messages = [
        _message_for_delivery(
            delivery,
            unread_counts[delivery.notification.recipient_id],
        )
        for delivery in deliveries
    ]
    for delivery in deliveries:
        delivery.attempt_count += 1
        delivery.save(update_fields=("attempt_count", "updated_at"))

    try:
        response = requests.post(
            getattr(
                settings,
                "EXPO_PUSH_URL",
                "https://exp.host/--/api/v2/push/send",
            ),
            json=messages,
            headers=_push_headers(),
            timeout=getattr(settings, "EXPO_PUSH_TIMEOUT_SECONDS", 8),
        )
        if response.status_code == 429 or response.status_code >= 500:
            raise requests.RequestException(f"Expo push HTTP {response.status_code}")
        if response.status_code >= 400:
            error = f"Expo push HTTP {response.status_code}"
            for delivery in deliveries:
                _fail_delivery(delivery, error)
            return 0
        response.raise_for_status()
        tickets = response.json().get("data", [])
        if (
            not isinstance(tickets, list)
            or len(tickets) != len(deliveries)
            or not all(isinstance(ticket, dict) for ticket in tickets)
        ):
            raise ValueError("Expo returned an unexpected ticket response")
    except (requests.RequestException, ValueError, TypeError) as exc:
        logger.warning("Expo push request failed: %s", exc)
        for delivery in deliveries:
            _schedule_retry(delivery, exc)
        return 0

    sent = 0
    now = timezone.now()
    for delivery, ticket in zip(deliveries, tickets):
        if ticket.get("status") == "ok" and ticket.get("id"):
            delivery.status = PushDelivery.STATUS_SENT
            delivery.ticket_id = str(ticket["id"])
            delivery.sent_at = now
            delivery.next_attempt_at = None
            delivery.last_error = ""
            delivery.save(
                update_fields=(
                    "status",
                    "ticket_id",
                    "sent_at",
                    "next_attempt_at",
                    "last_error",
                    "updated_at",
                )
            )
            sent += 1
            continue

        details = ticket.get("details") or {}
        if not isinstance(details, dict):
            details = {}
        error_code = (
            details.get("error") or ticket.get("message") or "Expo rejected push"
        )
        if error_code == "DeviceNotRegistered":
            _fail_delivery(delivery, error_code, deactivate=True)
        elif error_code in RETRYABLE_ERRORS:
            _schedule_retry(delivery, error_code)
        else:
            _fail_delivery(delivery, error_code)
    return sent


def check_push_receipts(*, limit=1000):
    cutoff = timezone.now() - timedelta(
        minutes=getattr(settings, "EXPO_PUSH_RECEIPT_DELAY_MINUTES", 15)
    )
    deliveries = list(
        PushDelivery.objects.filter(
            status=PushDelivery.STATUS_SENT,
            sent_at__lte=cutoff,
            receipt_checked_at__isnull=True,
        )
        .exclude(ticket_id="")
        .select_related("device")
        .order_by("sent_at", "id")[: min(max(limit, 1), 1000)]
    )
    if not deliveries:
        return 0

    try:
        response = requests.post(
            getattr(
                settings,
                "EXPO_PUSH_RECEIPTS_URL",
                "https://exp.host/--/api/v2/push/getReceipts",
            ),
            json={"ids": [delivery.ticket_id for delivery in deliveries]},
            headers=_push_headers(),
            timeout=getattr(settings, "EXPO_PUSH_TIMEOUT_SECONDS", 8),
        )
        response.raise_for_status()
        receipts = response.json().get("data", {})
        if not isinstance(receipts, dict):
            raise ValueError("Expo returned an unexpected receipt response")
    except (requests.RequestException, ValueError, TypeError) as exc:
        logger.warning("Expo receipt request failed: %s", exc)
        return 0

    checked = 0
    now = timezone.now()
    for delivery in deliveries:
        receipt = receipts.get(delivery.ticket_id)
        if not isinstance(receipt, dict):
            continue
        checked += 1
        if receipt.get("status") == "ok":
            delivery.status = PushDelivery.STATUS_DELIVERED
            delivery.receipt_checked_at = now
            delivery.last_error = ""
            delivery.save(
                update_fields=(
                    "status",
                    "receipt_checked_at",
                    "last_error",
                    "updated_at",
                )
            )
            continue

        details = receipt.get("details") or {}
        if not isinstance(details, dict):
            details = {}
        error_code = (
            details.get("error") or receipt.get("message") or "Push delivery failed"
        )
        if error_code == "DeviceNotRegistered":
            _fail_delivery(delivery, error_code, deactivate=True)
        elif error_code in RETRYABLE_ERRORS:
            _schedule_retry(delivery, error_code)
        else:
            _fail_delivery(delivery, error_code)
    return checked
