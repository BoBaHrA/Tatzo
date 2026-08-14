from datetime import time, timedelta

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from appointments.models import Appointment
from posts.models import Post, PostComment, PostLike
from users.models import (
    ChatMessage,
    ChatThread,
    Notification,
    UserBlock,
    UserFollow,
)


User = get_user_model()


@override_settings(TATZO_RATE_LIMIT_ENABLED=False)
class MobileNotificationTests(APITestCase):
    def setUp(self):
        self.owner = self.create_user("notification-owner")
        self.actor = self.create_user("notification-actor")
        self.other = self.create_user("notification-other")
        self.post = Post.objects.create(
            user=self.owner,
            content="Fresh blackwork tattoo",
            visibility="public",
        )

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

    def test_activity_signals_create_actionable_notifications(self):
        UserFollow.objects.create(follower=self.actor, following=self.owner)
        PostLike.objects.create(post=self.post, user=self.actor)
        PostComment.objects.create(
            post=self.post,
            user=self.actor,
            content="This linework is excellent",
        )
        parent = PostComment.objects.create(
            post=self.post,
            user=self.owner,
            content="Thank you",
        )
        PostComment.objects.create(
            post=self.post,
            user=self.actor,
            parent=parent,
            content="You are welcome",
        )
        thread = ChatThread.get_or_create_for_users(self.owner, self.actor)
        ChatMessage.objects.create(
            thread=thread,
            sender=self.actor,
            content="Are you available next month?",
        )
        appointment = Appointment.objects.create(
            client=self.actor,
            artist=self.owner,
            date=timezone.localdate() + timedelta(days=10),
            start_time=time(10),
        )

        kinds = list(
            Notification.objects.filter(recipient=self.owner)
            .order_by("kind")
            .values_list("kind", flat=True)
        )
        self.assertCountEqual(
            kinds,
            [
                Notification.KIND_FOLLOW,
                Notification.KIND_POST_LIKE,
                Notification.KIND_POST_COMMENT,
                Notification.KIND_COMMENT_REPLY,
                Notification.KIND_CHAT_MESSAGE,
                Notification.KIND_BOOKING_REQUEST,
            ],
        )
        booking_notification = Notification.objects.get(
            recipient=self.owner,
            kind=Notification.KIND_BOOKING_REQUEST,
        )
        self.assertEqual(booking_notification.appointment_id, appointment.pk)

    def test_appointment_status_change_notifies_client_once(self):
        appointment = Appointment.objects.create(
            client=self.actor,
            artist=self.owner,
            date=timezone.localdate() + timedelta(days=10),
            start_time=time(10),
        )
        appointment.status = Appointment.STATUS_ACCEPTED
        appointment.save(update_fields=("status", "updated_at"))
        appointment.save(update_fields=("status", "updated_at"))

        notification = Notification.objects.get(
            recipient=self.actor,
            kind=Notification.KIND_BOOKING_UPDATE,
        )
        self.assertEqual(notification.actor, self.owner)
        self.assertEqual(notification.appointment_id, appointment.pk)

    def test_self_activity_is_not_notified_and_removed_activity_disappears(self):
        PostLike.objects.create(post=self.post, user=self.owner)
        PostComment.objects.create(post=self.post, user=self.owner, content="Own note")
        self.assertFalse(Notification.objects.filter(recipient=self.owner).exists())

        follow = UserFollow.objects.create(follower=self.actor, following=self.owner)
        like = PostLike.objects.create(post=self.post, user=self.actor)
        self.assertEqual(Notification.objects.filter(recipient=self.owner).count(), 2)
        follow.delete()
        like.delete()
        self.assertFalse(Notification.objects.filter(recipient=self.owner).exists())

    def test_block_removes_existing_notifications_between_users(self):
        PostLike.objects.create(post=self.post, user=self.actor)
        ChatMessage.objects.create(
            thread=ChatThread.get_or_create_for_users(self.owner, self.actor),
            sender=self.actor,
            content="Hello",
        )
        self.assertEqual(Notification.objects.filter(recipient=self.owner).count(), 2)

        UserBlock.objects.create(blocker=self.owner, blocked=self.actor)

        self.assertFalse(Notification.objects.filter(recipient=self.owner).exists())
        second_post = Post.objects.create(
            user=self.owner,
            content="Another tattoo",
            visibility="public",
        )
        PostLike.objects.create(post=second_post, user=self.actor)
        self.assertFalse(Notification.objects.filter(recipient=self.owner).exists())

    def test_list_count_mark_one_and_mark_all_are_recipient_scoped(self):
        UserFollow.objects.create(follower=self.actor, following=self.owner)
        PostLike.objects.create(post=self.post, user=self.other)
        self.client.force_authenticate(self.owner)

        count = self.client.get(reverse("mobile_api:notification_unread_count"))
        listed = self.client.get(reverse("mobile_api:notifications"))

        self.assertEqual(count.status_code, status.HTTP_200_OK)
        self.assertEqual(count.data["unread_count"], 2)
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertEqual(listed.data["unread_count"], 2)
        self.assertEqual(len(listed.data["results"]), 2)
        follow_item = next(
            item
            for item in listed.data["results"]
            if item["kind"] == Notification.KIND_FOLLOW
        )
        self.assertEqual(follow_item["target"]["type"], "profile")
        self.assertEqual(follow_item["target"]["username"], self.actor.username)

        marked = self.client.post(
            reverse("mobile_api:notification_read", args=[follow_item["id"]])
        )
        self.assertEqual(marked.status_code, status.HTTP_200_OK)
        self.assertEqual(marked.data["unread_count"], 1)

        self.client.force_authenticate(self.actor)
        hidden = self.client.post(
            reverse("mobile_api:notification_read", args=[follow_item["id"]])
        )
        self.assertEqual(hidden.status_code, status.HTTP_404_NOT_FOUND)

        self.client.force_authenticate(self.owner)
        all_read = self.client.post(reverse("mobile_api:notification_read_all"))
        self.assertEqual(all_read.status_code, status.HTTP_200_OK)
        self.assertEqual(all_read.data["updated"], 1)
        self.assertEqual(all_read.data["unread_count"], 0)

    def test_notification_list_is_cursor_paginated(self):
        for index in range(23):
            Notification.objects.create(
                recipient=self.owner,
                actor=self.actor,
                kind=Notification.KIND_FOLLOW,
                dedupe_key=f"manual:{index}",
            )
        self.client.force_authenticate(self.owner)

        first = self.client.get(reverse("mobile_api:notifications"), {"limit": 10})
        second = self.client.get(
            reverse("mobile_api:notifications"),
            {"limit": 10, "cursor": first.data["next_cursor"]},
        )

        self.assertEqual(len(first.data["results"]), 10)
        self.assertTrue(first.data["has_more"])
        self.assertEqual(len(second.data["results"]), 10)
        self.assertTrue(
            set(item["id"] for item in first.data["results"]).isdisjoint(
                item["id"] for item in second.data["results"]
            )
        )

    def test_notification_endpoints_require_authentication(self):
        for url in (
            reverse("mobile_api:notifications"),
            reverse("mobile_api:notification_unread_count"),
            reverse("mobile_api:notification_read_all"),
        ):
            response = (
                self.client.post(url)
                if "read-all" in url
                else self.client.get(url)
            )
            self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_feed_detail_enforces_visibility_and_blocks(self):
        self.client.force_authenticate(self.actor)
        visible = self.client.get(
            reverse("mobile_api:feed_detail", args=[self.post.pk])
        )
        self.assertEqual(visible.status_code, status.HTTP_200_OK)

        self.post.visibility = "private"
        self.post.save(update_fields=("visibility",))
        private = self.client.get(
            reverse("mobile_api:feed_detail", args=[self.post.pk])
        )
        self.assertEqual(private.status_code, status.HTTP_404_NOT_FOUND)

        self.post.visibility = "public"
        self.post.save(update_fields=("visibility",))
        UserBlock.objects.create(blocker=self.owner, blocked=self.actor)
        blocked = self.client.get(
            reverse("mobile_api:feed_detail", args=[self.post.pk])
        )
        self.assertEqual(blocked.status_code, status.HTTP_404_NOT_FOUND)
