from datetime import timedelta
from unittest.mock import Mock, patch
from uuid import UUID

import requests
from django.contrib.auth import get_user_model
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from users.models import Notification, PushDelivery, PushDevice, UserFollow
from users.push_notifications import (
    check_push_receipts,
    dispatch_push_deliveries,
    queue_notification_push,
)

User = get_user_model()


@override_settings(
    TATZO_PUSH_ENABLED=False,
    TATZO_RATE_LIMIT_ENABLED=False,
    EXPO_PUSH_RECEIPT_DELAY_MINUTES=15,
)
class MobilePushNotificationTests(APITestCase):
    owner_installation_id = "039ef003-921b-441a-a5c7-ff431b6fe70c"
    other_installation_id = "759cd092-b025-4424-8389-6195d8c4aca9"
    owner_token = "ExpoPushToken[owner-token-123]"
    other_token = "ExponentPushToken[other-token-456]"

    def setUp(self):
        self.owner = self.create_user("push-owner")
        self.actor = self.create_user("push-actor")

    @staticmethod
    def create_user(username):
        user = User.objects.create_user(
            username,
            email=f"{username}@example.com",
            password="StrongPassword123",
            is_active=True,
        )
        user.profile.is_email_verified = True
        user.profile.save(update_fields=("is_email_verified",))
        return user

    def register_device(
        self,
        *,
        user=None,
        installation_id=None,
        token=None,
        locale="en",
    ):
        user = user or self.owner
        self.client.force_authenticate(user)
        return self.client.put(
            reverse("mobile_api:push_device"),
            {
                "installation_id": (installation_id or self.owner_installation_id),
                "expo_push_token": token or self.owner_token,
                "platform": "ios",
                "locale": locale,
                "app_version": "0.1.0",
            },
            format="json",
        )

    def create_delivery(self, *, locale="en"):
        response = self.register_device(locale=locale)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        notification = Notification.objects.create(
            recipient=self.owner,
            actor=self.actor,
            kind=Notification.KIND_FOLLOW,
            dedupe_key=f"manual-push:{locale}",
        )
        queue_notification_push(notification)
        return PushDelivery.objects.get(notification=notification)

    def test_device_registration_is_idempotent_and_can_follow_account_login(self):
        created = self.register_device(locale="fr")
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertNotIn("expo_push_token", created.data)

        updated = self.register_device(
            token=self.other_token,
            locale="ru",
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        self.assertEqual(PushDevice.objects.count(), 1)
        device = PushDevice.objects.get()
        self.assertEqual(device.installation_id, UUID(self.owner_installation_id))
        self.assertEqual(device.expo_push_token, self.other_token)
        self.assertEqual(device.locale, "ru")

        switched = self.register_device(
            user=self.actor,
            token=self.other_token,
        )
        self.assertEqual(switched.status_code, status.HTTP_200_OK)
        device.refresh_from_db()
        self.assertEqual(device.user, self.actor)

    def test_registration_rejects_invalid_or_conflicting_tokens(self):
        self.client.force_authenticate(self.owner)
        invalid = self.client.put(
            reverse("mobile_api:push_device"),
            {
                "installation_id": self.owner_installation_id,
                "expo_push_token": "not-a-push-token",
                "platform": "ios",
                "locale": "en",
            },
            format="json",
        )
        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)

        self.assertEqual(
            self.register_device().status_code,
            status.HTTP_201_CREATED,
        )
        conflict = self.register_device(
            user=self.actor,
            installation_id=self.other_installation_id,
            token=self.owner_token,
        )
        self.assertEqual(conflict.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(PushDevice.objects.get().user, self.owner)

    def test_device_removal_is_owner_scoped_and_endpoint_requires_auth(self):
        self.assertEqual(
            self.register_device().status_code,
            status.HTTP_201_CREATED,
        )
        self.client.force_authenticate(self.actor)
        not_owner = self.client.delete(
            reverse("mobile_api:push_device"),
            {"installation_id": self.owner_installation_id},
            format="json",
        )
        self.assertEqual(not_owner.status_code, status.HTTP_204_NO_CONTENT)
        self.assertTrue(PushDevice.objects.exists())

        self.client.force_authenticate(self.owner)
        removed = self.client.delete(
            reverse("mobile_api:push_device"),
            {"installation_id": self.owner_installation_id},
            format="json",
        )
        self.assertEqual(removed.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(PushDevice.objects.exists())

        self.client.force_authenticate(None)
        unauthenticated = self.client.put(
            reverse("mobile_api:push_device"),
            {},
            format="json",
        )
        self.assertEqual(
            unauthenticated.status_code,
            status.HTTP_401_UNAUTHORIZED,
        )

    def test_notification_signal_queues_one_delivery_per_active_device(self):
        self.assertEqual(
            self.register_device().status_code,
            status.HTTP_201_CREATED,
        )
        UserFollow.objects.create(follower=self.actor, following=self.owner)

        notification = Notification.objects.get(
            recipient=self.owner,
            kind=Notification.KIND_FOLLOW,
        )
        self.assertEqual(notification.push_deliveries.count(), 1)
        self.assertEqual(
            notification.push_deliveries.get().status,
            PushDelivery.STATUS_PENDING,
        )

        queue_notification_push(notification)
        self.assertEqual(notification.push_deliveries.count(), 1)

    @patch("users.push_notifications.requests.post")
    def test_dispatch_sends_localized_private_payload_and_records_ticket(
        self,
        post,
    ):
        delivery = self.create_delivery(locale="ru")
        response = Mock(status_code=200)
        response.json.return_value = {"data": [{"status": "ok", "id": "expo-ticket-1"}]}
        response.raise_for_status.return_value = None
        post.return_value = response

        sent = dispatch_push_deliveries()

        self.assertEqual(sent, 1)
        delivery.refresh_from_db()
        self.assertEqual(delivery.status, PushDelivery.STATUS_SENT)
        self.assertEqual(delivery.ticket_id, "expo-ticket-1")
        message = post.call_args.kwargs["json"][0]
        self.assertEqual(message["body"], "У вас новый подписчик.")
        self.assertEqual(message["data"]["targetType"], "profile")
        self.assertEqual(message["data"]["targetUsername"], self.actor.username)
        self.assertNotIn(self.actor.username, message["body"])
        self.assertNotIn("preview", message["data"])

    @patch("users.push_notifications.requests.post")
    def test_transient_failure_is_retained_for_retry(self, post):
        delivery = self.create_delivery()
        post.side_effect = requests.RequestException("temporary outage")

        sent = dispatch_push_deliveries()

        self.assertEqual(sent, 0)
        delivery.refresh_from_db()
        self.assertEqual(delivery.status, PushDelivery.STATUS_RETRY)
        self.assertEqual(delivery.attempt_count, 1)
        self.assertGreater(delivery.next_attempt_at, timezone.now())
        self.assertIn("temporary outage", delivery.last_error)

    @patch("users.push_notifications.requests.post")
    def test_device_not_registered_receipt_disables_token(self, post):
        delivery = self.create_delivery()
        delivery.status = PushDelivery.STATUS_SENT
        delivery.ticket_id = "expired-device-ticket"
        delivery.sent_at = timezone.now() - timedelta(minutes=16)
        delivery.save(update_fields=("status", "ticket_id", "sent_at", "updated_at"))
        response = Mock(status_code=200)
        response.json.return_value = {
            "data": {
                delivery.ticket_id: {
                    "status": "error",
                    "message": "Device is no longer registered",
                    "details": {"error": "DeviceNotRegistered"},
                }
            }
        }
        response.raise_for_status.return_value = None
        post.return_value = response

        checked = check_push_receipts()

        self.assertEqual(checked, 1)
        delivery.refresh_from_db()
        delivery.device.refresh_from_db()
        self.assertEqual(delivery.status, PushDelivery.STATUS_FAILED)
        self.assertFalse(delivery.device.is_active)
