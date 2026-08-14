from django.contrib.auth import get_user_model
from django.core import mail
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from posts.models import Post, PostBookmark, PostComment, PostLike, PostMedia
from users.models import UserBlock, UserFollow

User = get_user_model()


@override_settings(
    TATZO_RATE_LIMIT_ENABLED=False,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
)
class MobileAuthenticationTests(APITestCase):
    registration_payload = {
        "username": "mobile-user",
        "email": "mobile@example.com",
        "password": "StrongPassword123",
        "account_type": "regular",
        "accept_terms": True,
    }

    def register(self, **changes):
        payload = {**self.registration_payload, **changes}
        return self.client.post(reverse("mobile_api:register"), payload, format="json")

    def activate(self, user):
        user.is_active = True
        user.save(update_fields=("is_active",))
        user.profile.is_email_verified = True
        user.profile.save(update_fields=("is_email_verified",))

    def login(self, identifier="mobile-user", password="StrongPassword123"):
        return self.client.post(
            reverse("mobile_api:token"),
            {"identifier": identifier, "password": password},
            format="json",
        )

    def authorize(self, response):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")

    def test_registration_requires_terms(self):
        response = self.register(accept_terms=False)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("accept_terms", response.data)

    def test_registration_creates_inactive_user_and_sends_verification_email(self):
        response = self.register()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(username="mobile-user")
        self.assertFalse(user.is_active)
        self.assertFalse(user.profile.is_email_verified)
        self.assertEqual(user.profile.account_type, "regular")
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("verify-email", mail.outbox[0].body)

    def test_unverified_user_cannot_receive_tokens(self):
        self.register()
        response = self.login()
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data["code"], "email_not_verified")

    def test_login_accepts_email_and_returns_profile(self):
        self.register()
        user = User.objects.get(username="mobile-user")
        self.activate(user)
        response = self.login(identifier="MOBILE@example.com")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        self.assertEqual(response.data["user"]["account_type"], "regular")
        self.assertTrue(response.data["user"]["is_email_verified"])
        user.refresh_from_db()
        self.assertIsNotNone(user.last_login)

    def test_me_requires_authentication(self):
        response = self.client.get(reverse("mobile_api:me"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_authenticated_user_can_read_and_update_profile(self):
        self.register()
        user = User.objects.get(username="mobile-user")
        self.activate(user)
        login_response = self.login()
        self.authorize(login_response)

        response = self.client.patch(
            reverse("mobile_api:me"),
            {"bio": "Tattoo collector", "tag": "mobile_collector"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["bio"], "Tattoo collector")
        self.assertEqual(response.data["tag"], "mobile_collector")

    def test_refresh_rotates_refresh_token(self):
        self.register()
        user = User.objects.get(username="mobile-user")
        self.activate(user)
        login_response = self.login()

        response = self.client.post(
            reverse("mobile_api:token_refresh"),
            {"refresh": login_response.data["refresh"]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_delete_account_requires_current_password(self):
        self.register()
        user = User.objects.get(username="mobile-user")
        self.activate(user)
        login_response = self.login()
        self.authorize(login_response)

        wrong = self.client.delete(
            reverse("mobile_api:me"), {"password": "wrong"}, format="json"
        )
        self.assertEqual(wrong.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(User.objects.filter(pk=user.pk).exists())

        deleted = self.client.delete(
            reverse("mobile_api:me"),
            {"password": "StrongPassword123"},
            format="json",
        )
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(User.objects.filter(pk=user.pk).exists())


class MobileFeedTests(APITestCase):
    def setUp(self):
        self.viewer = User.objects.create_user(
            "mobile-viewer",
            email="viewer@example.com",
            password="StrongPassword123",
            is_active=True,
        )
        self.author = User.objects.create_user(
            "feed-artist",
            email="artist@example.com",
            password="StrongPassword123",
            is_active=True,
        )
        self.stranger = User.objects.create_user(
            "feed-stranger",
            email="stranger@example.com",
            password="StrongPassword123",
            is_active=True,
        )
        self.author.profile.account_type = "tattoo_artist"
        self.author.profile.verification_status = "approved"
        self.author.profile.save(update_fields=("account_type", "verification_status"))
        self.client.force_authenticate(self.viewer)

    def test_feed_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(reverse("mobile_api:feed"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_feed_serializes_visible_post_media_and_viewer_state(self):
        post = Post.objects.create(
            user=self.author,
            content="Fresh blackwork piece",
            location="Clermont-Ferrand",
            is_ad=True,
        )
        PostMedia.objects.create(
            post=post,
            file="posts/example/tattoo.jpg",
            media_type=PostMedia.IMAGE,
        )
        PostLike.objects.create(post=post, user=self.viewer)
        PostComment.objects.create(post=post, user=self.stranger, content="Great")
        PostBookmark.objects.create(post=post, user=self.viewer)

        response = self.client.get(reverse("mobile_api:feed"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["has_more"])
        item = response.data["results"][0]
        self.assertEqual(item["id"], post.pk)
        self.assertEqual(item["author"]["username"], self.author.username)
        self.assertTrue(item["author"]["is_verified_artist"])
        self.assertEqual(item["location"], "Clermont-Ferrand")
        self.assertEqual(item["likes_count"], 1)
        self.assertEqual(item["comments_count"], 1)
        self.assertTrue(item["is_liked"])
        self.assertTrue(item["is_bookmarked"])
        self.assertFalse(item["is_owned"])
        self.assertEqual(item["media"][0]["type"], "image")
        self.assertTrue(item["media"][0]["url"].endswith("/posts/example/tattoo.jpg"))

    def test_feed_applies_follow_visibility_and_blocks(self):
        public = Post.objects.create(user=self.author, visibility="public")
        followers = Post.objects.create(user=self.author, visibility="followers")
        private = Post.objects.create(user=self.author, visibility="private")

        first = self.client.get(reverse("mobile_api:feed"))
        self.assertEqual(
            {item["id"] for item in first.data["results"]},
            {public.pk},
        )

        UserFollow.objects.create(follower=self.viewer, following=self.author)
        followed = self.client.get(reverse("mobile_api:feed"))
        self.assertEqual(
            {item["id"] for item in followed.data["results"]},
            {public.pk, followers.pk},
        )
        self.assertNotIn(private.pk, {item["id"] for item in followed.data["results"]})

        UserBlock.objects.create(blocker=self.viewer, blocked=self.author)
        blocked = self.client.get(reverse("mobile_api:feed"))
        self.assertEqual(blocked.data["results"], [])

    def test_feed_uses_cursor_pagination_without_duplicate_posts(self):
        for index in range(7):
            Post.objects.create(user=self.viewer, content=f"Post {index}")

        first = self.client.get(reverse("mobile_api:feed"), {"limit": 3})
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(len(first.data["results"]), 3)
        self.assertTrue(first.data["has_more"])
        self.assertIsNotNone(first.data["next_cursor"])

        second = self.client.get(
            reverse("mobile_api:feed"),
            {"limit": 3, "cursor": first.data["next_cursor"]},
        )
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        first_ids = {item["id"] for item in first.data["results"]}
        second_ids = {item["id"] for item in second.data["results"]}
        self.assertFalse(first_ids & second_ids)

    def test_feed_like_and_bookmark_toggle(self):
        post = Post.objects.create(user=self.author, content="Toggle me")

        liked = self.client.post(reverse("mobile_api:feed_like", args=[post.pk]))
        self.assertEqual(liked.status_code, status.HTTP_200_OK)
        self.assertTrue(liked.data["liked"])
        self.assertEqual(liked.data["likes_count"], 1)

        unliked = self.client.post(reverse("mobile_api:feed_like", args=[post.pk]))
        self.assertFalse(unliked.data["liked"])
        self.assertEqual(unliked.data["likes_count"], 0)

        saved = self.client.post(reverse("mobile_api:feed_bookmark", args=[post.pk]))
        self.assertTrue(saved.data["bookmarked"])
        self.assertTrue(
            PostBookmark.objects.filter(user=self.viewer, post=post).exists()
        )

        unsaved = self.client.post(reverse("mobile_api:feed_bookmark", args=[post.pk]))
        self.assertFalse(unsaved.data["bookmarked"])

    def test_feed_actions_cannot_target_invisible_post(self):
        private = Post.objects.create(
            user=self.author,
            content="Private",
            visibility="private",
        )
        like = self.client.post(reverse("mobile_api:feed_like", args=[private.pk]))
        bookmark = self.client.post(
            reverse("mobile_api:feed_bookmark", args=[private.pk])
        )
        self.assertEqual(like.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(bookmark.status_code, status.HTTP_404_NOT_FOUND)
