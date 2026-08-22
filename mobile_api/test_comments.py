from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from posts.models import CommentLike, CommentReport, Post, PostComment
from users.models import Notification, UserBlock, UserFollow

User = get_user_model()


@override_settings(
    TATZO_RATE_LIMIT_ENABLED=False,
    TATZO_PUSH_ENABLED=False,
)
class MobileCommentTests(APITestCase):
    def setUp(self):
        self.author = self.make_user("comment-author")
        self.viewer = self.make_user("comment-viewer")
        self.other = self.make_user("comment-other")
        self.post = Post.objects.create(user=self.author, content="Fresh tattoo")
        self.client.force_authenticate(self.viewer)

    @staticmethod
    def make_user(username):
        user = User.objects.create_user(
            username,
            email=f"{username}@example.com",
            password="StrongPassword123",
            is_active=True,
        )
        user.profile.is_email_verified = True
        user.profile.save(update_fields=("is_email_verified",))
        return user

    def list_url(self, post=None):
        return reverse(
            "mobile_api:comment_list_create",
            args=[(post or self.post).pk],
        )

    def test_comment_endpoints_require_authentication(self):
        comment = PostComment.objects.create(
            post=self.post,
            user=self.author,
            content="Private action",
        )
        self.client.force_authenticate(user=None)

        self.assertEqual(self.client.get(self.list_url()).status_code, 401)
        self.assertEqual(
            self.client.post(
                self.list_url(),
                {"content": "Hello"},
                format="json",
            ).status_code,
            401,
        )
        self.assertEqual(
            self.client.post(
                reverse("mobile_api:comment_like", args=[comment.pk]),
                format="json",
            ).status_code,
            401,
        )

    def test_list_respects_post_visibility_and_uses_private_no_store(self):
        comment = PostComment.objects.create(
            post=self.post,
            user=self.author,
            content="Visible",
        )
        followers_post = Post.objects.create(
            user=self.author,
            visibility="followers",
        )
        PostComment.objects.create(
            post=followers_post,
            user=self.author,
            content="Followers only",
        )

        response = self.client.get(self.list_url())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Cache-Control"], "private, no-store")
        self.assertEqual(response["X-Content-Type-Options"], "nosniff")
        self.assertEqual(response.data["comments_count"], 1)
        self.assertEqual(response.data["results"][0]["id"], comment.pk)

        self.assertEqual(
            self.client.get(self.list_url(followers_post)).status_code, 404
        )
        UserFollow.objects.create(follower=self.viewer, following=self.author)
        self.assertEqual(
            self.client.get(self.list_url(followers_post)).status_code, 200
        )

        private_post = Post.objects.create(user=self.author, visibility="private")
        self.assertEqual(self.client.get(self.list_url(private_post)).status_code, 404)
        self.client.force_authenticate(self.author)
        self.assertEqual(self.client.get(self.list_url(private_post)).status_code, 200)

    def test_blocked_commenters_are_hidden_and_cannot_be_interacted_with(self):
        hidden = PostComment.objects.create(
            post=self.post,
            user=self.other,
            content="Hidden by block",
        )
        visible = PostComment.objects.create(
            post=self.post,
            user=self.author,
            content="Still visible",
        )
        UserBlock.objects.create(blocker=self.viewer, blocked=self.other)

        response = self.client.get(self.list_url())
        self.assertEqual(response.data["comments_count"], 1)
        self.assertEqual(
            [item["id"] for item in response.data["results"]],
            [visible.pk],
        )
        feed_detail = self.client.get(
            reverse("mobile_api:feed_detail", args=[self.post.pk])
        )
        self.assertEqual(feed_detail.data["comments_count"], 1)
        self.assertEqual(
            self.client.post(
                reverse("mobile_api:comment_like", args=[hidden.pk]),
                format="json",
            ).status_code,
            404,
        )

    def test_root_and_reply_pagination_are_separate(self):
        roots = [
            PostComment.objects.create(
                post=self.post,
                user=self.author,
                content=f"Root {index}",
            )
            for index in range(4)
        ]
        replies = [
            PostComment.objects.create(
                post=self.post,
                user=self.other,
                content=f"Reply {index}",
                parent=roots[-1],
            )
            for index in range(3)
        ]
        CommentLike.objects.create(comment=roots[-1], user=self.viewer)
        CommentReport.objects.create(comment=roots[-1], user=self.viewer, reason="spam")

        first = self.client.get(self.list_url(), {"limit": 2})
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(len(first.data["results"]), 2)
        self.assertTrue(first.data["has_more"])
        self.assertEqual(first.data["comments_count"], 7)
        latest = first.data["results"][0]
        self.assertEqual(latest["id"], roots[-1].pk)
        self.assertEqual(latest["replies_count"], 3)
        self.assertEqual(latest["likes_count"], 1)
        self.assertTrue(latest["is_liked"])
        self.assertTrue(latest["is_reported"])

        second = self.client.get(
            self.list_url(),
            {"limit": 2, "cursor": first.data["next_cursor"]},
        )
        self.assertFalse(
            {item["id"] for item in first.data["results"]}
            & {item["id"] for item in second.data["results"]}
        )

        reply_page = self.client.get(
            reverse("mobile_api:comment_replies", args=[roots[-1].pk]),
            {"limit": 2},
        )
        self.assertEqual(reply_page.status_code, status.HTTP_200_OK)
        self.assertEqual(reply_page.data["root_id"], roots[-1].pk)
        self.assertEqual(reply_page.data["replies_count"], 3)
        self.assertEqual(
            [item["id"] for item in reply_page.data["results"]],
            [replies[2].pk, replies[1].pk],
        )
        self.assertTrue(reply_page.data["has_more"])

    def test_create_comment_trims_content_and_notifies_post_owner(self):
        response = self.client.post(
            self.list_url(),
            {"content": "  Beautiful linework  "},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        comment = PostComment.objects.get(pk=response.data["comment"]["id"])
        self.assertEqual(comment.content, "Beautiful linework")
        self.assertEqual(response.data["comments_count"], 1)
        self.assertTrue(response.data["comment"]["is_owned"])
        notification = Notification.objects.get(
            kind=Notification.KIND_POST_COMMENT,
            comment=comment,
        )
        self.assertEqual(notification.recipient, self.author)

    def test_reply_targets_root_and_creates_reply_notifications(self):
        root = PostComment.objects.create(
            post=self.post,
            user=self.viewer,
            content="Root",
        )
        self.client.force_authenticate(self.other)
        response = self.client.post(
            self.list_url(),
            {"content": "Reply", "parent_id": root.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        reply = PostComment.objects.get(pk=response.data["comment"]["id"])
        self.assertEqual(reply.parent, root)
        self.assertTrue(
            Notification.objects.filter(
                recipient=self.viewer,
                kind=Notification.KIND_COMMENT_REPLY,
                comment=reply,
            ).exists()
        )
        self.assertTrue(
            Notification.objects.filter(
                recipient=self.author,
                kind=Notification.KIND_POST_COMMENT,
                comment=reply,
            ).exists()
        )

        nested = self.client.post(
            self.list_url(),
            {"content": "Too deep", "parent_id": reply.pk},
            format="json",
        )
        self.assertEqual(nested.status_code, status.HTTP_404_NOT_FOUND)

        another_post = Post.objects.create(user=self.author)
        wrong_post = self.client.post(
            self.list_url(another_post),
            {"content": "Wrong post", "parent_id": root.pk},
            format="json",
        )
        self.assertEqual(wrong_post.status_code, status.HTTP_404_NOT_FOUND)

    def test_create_rejects_disabled_blank_and_oversized_comments(self):
        existing = PostComment.objects.create(
            post=self.post,
            user=self.author,
            content="Still readable",
        )
        self.post.disable_comments = True
        self.post.save(update_fields=("disable_comments",))
        listed = self.client.get(self.list_url())
        self.assertFalse(listed.data["comments_enabled"])
        self.assertEqual(
            [item["id"] for item in listed.data["results"]],
            [existing.pk],
        )
        disabled = self.client.post(
            self.list_url(),
            {"content": "No comments"},
            format="json",
        )
        self.assertEqual(disabled.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(disabled.data["code"], "comments_disabled")

        self.post.disable_comments = False
        self.post.save(update_fields=("disable_comments",))
        self.assertEqual(
            self.client.post(
                self.list_url(),
                {"content": "   "},
                format="json",
            ).status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertEqual(
            self.client.post(
                self.list_url(),
                {"content": "x" * 1001},
                format="json",
            ).status_code,
            status.HTTP_400_BAD_REQUEST,
        )

    @patch("mobile_api.comment_views.check_rate_limit", return_value=(False, 45))
    def test_create_rate_limit_returns_retry_after(self, _rate_limit):
        response = self.client.post(
            self.list_url(),
            {"content": "Slow down"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(response.data["retry_after"], 45)
        self.assertFalse(PostComment.objects.exists())

    def test_only_owner_can_edit_comment(self):
        comment = PostComment.objects.create(
            post=self.post,
            user=self.viewer,
            content="Before",
        )
        url = reverse("mobile_api:comment_detail", args=[comment.pk])
        self.client.force_authenticate(self.other)
        self.assertEqual(
            self.client.patch(url, {"content": "No"}, format="json").status_code,
            404,
        )

        self.client.force_authenticate(self.viewer)
        updated = self.client.patch(
            url,
            {"content": "  After  "},
            format="json",
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        self.assertEqual(updated.data["comment"]["content"], "After")
        comment.refresh_from_db()
        self.assertEqual(comment.content, "After")

    def test_owner_delete_updates_count_and_cascades_replies_and_notifications(self):
        root = PostComment.objects.create(
            post=self.post,
            user=self.viewer,
            content="Delete me",
        )
        reply = PostComment.objects.create(
            post=self.post,
            user=self.other,
            content="Reply",
            parent=root,
        )
        self.client.force_authenticate(self.other)
        self.assertEqual(
            self.client.delete(
                reverse("mobile_api:comment_detail", args=[root.pk])
            ).status_code,
            404,
        )

        self.client.force_authenticate(self.viewer)
        deleted = self.client.delete(
            reverse("mobile_api:comment_detail", args=[root.pk])
        )
        self.assertEqual(deleted.status_code, status.HTTP_200_OK)
        self.assertEqual(deleted.data["comments_count"], 0)
        self.assertFalse(
            PostComment.objects.filter(pk__in=(root.pk, reply.pk)).exists()
        )
        self.assertFalse(Notification.objects.filter(comment_id=reply.pk).exists())

    def test_comment_like_toggles_and_revalidates_visibility(self):
        comment = PostComment.objects.create(
            post=self.post,
            user=self.author,
            content="Like me",
        )
        url = reverse("mobile_api:comment_like", args=[comment.pk])
        liked = self.client.post(url, format="json")
        self.assertEqual(liked.status_code, status.HTTP_200_OK)
        self.assertTrue(liked.data["liked"])
        self.assertEqual(liked.data["likes_count"], 1)

        unliked = self.client.post(url, format="json")
        self.assertFalse(unliked.data["liked"])
        self.assertEqual(unliked.data["likes_count"], 0)

        UserBlock.objects.create(blocker=self.author, blocked=self.viewer)
        self.assertEqual(self.client.post(url, format="json").status_code, 404)

    def test_comment_reports_are_validated_idempotent_and_owner_safe(self):
        comment = PostComment.objects.create(
            post=self.post,
            user=self.author,
            content="Report me",
        )
        url = reverse("mobile_api:comment_report", args=[comment.pk])
        first = self.client.post(
            url,
            {"reason": "harassment", "details": "Repeated insults"},
            format="json",
        )
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertTrue(first.data["created"])
        second = self.client.post(
            url,
            {"reason": "spam"},
            format="json",
        )
        self.assertFalse(second.data["created"])
        self.assertEqual(CommentReport.objects.filter(comment=comment).count(), 1)
        self.assertEqual(
            CommentReport.objects.get(comment=comment).reason,
            "harassment: Repeated insults",
        )

        invalid = self.client.post(url, {"reason": "not-a-reason"}, format="json")
        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)

        self.client.force_authenticate(self.author)
        own = self.client.post(url, {"reason": "spam"}, format="json")
        self.assertEqual(own.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(own.data["code"], "cannot_report_own_comment")
