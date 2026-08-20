from datetime import datetime, time, timedelta
from io import BytesIO
import shutil
import tempfile
from urllib.parse import urlparse

from PIL import Image
from django.contrib.auth import get_user_model
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db.models import Q
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from appointments.models import (
    Appointment,
    AppointmentReferenceImage,
    ArtistAvailability,
    ArtistBookingSettings,
    ArtistTimeOff,
    CalendarEvent,
)
from posts.models import (
    Post,
    PostBookmark,
    PostComment,
    PostLike,
    PostMedia,
    PostReport,
)
from style_match.models import StyleMatchResponse, StyleMatchSession, TattooCard
from mytattooapp.storage_backends import private_media_storage
from users.models import (
    ChatAttachment,
    ChatMessage,
    ChatThread,
    PortfolioWork,
    UserBlock,
    UserFollow,
)

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
        self.assertFalse(item["is_reported"])
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

    def test_feed_report_is_idempotent_and_marks_viewer_state(self):
        post = Post.objects.create(user=self.author, content="Report me")
        url = reverse("mobile_api:feed_report", args=[post.pk])

        first = self.client.post(url, {"reason": "spam"}, format="json")
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertTrue(first.data["reported"])
        self.assertTrue(first.data["created"])
        self.assertEqual(
            PostReport.objects.get(post=post, user=self.viewer).reason,
            "spam",
        )

        duplicate = self.client.post(url, {"reason": "other"}, format="json")
        self.assertEqual(duplicate.status_code, status.HTTP_200_OK)
        self.assertFalse(duplicate.data["created"])
        self.assertEqual(PostReport.objects.filter(post=post).count(), 1)

        feed = self.client.get(reverse("mobile_api:feed"))
        self.assertTrue(feed.data["results"][0]["is_reported"])

    def test_feed_report_rejects_invalid_own_and_invisible_posts(self):
        own = Post.objects.create(user=self.viewer, content="Mine")
        invalid = self.client.post(
            reverse("mobile_api:feed_report", args=[own.pk]),
            {"reason": "not-a-reason"},
            format="json",
        )
        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(invalid.data["code"], "cannot_report_own_post")

        visible = Post.objects.create(user=self.author, content="Visible")
        bad_reason = self.client.post(
            reverse("mobile_api:feed_report", args=[visible.pk]),
            {"reason": "not-a-reason"},
            format="json",
        )
        self.assertEqual(bad_reason.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("reason", bad_reason.data)

        private = Post.objects.create(user=self.author, visibility="private")
        hidden = self.client.post(
            reverse("mobile_api:feed_report", args=[private.pk]),
            {"reason": "spam"},
            format="json",
        )
        self.assertEqual(hidden.status_code, status.HTTP_404_NOT_FOUND)


@override_settings(TATZO_RATE_LIMIT_ENABLED=False)
class MobilePublishingTests(APITestCase):
    def setUp(self):
        self.media_root = tempfile.mkdtemp(prefix="tatzo-mobile-publishing-")
        self.media_override = override_settings(MEDIA_ROOT=self.media_root)
        self.media_override.enable()

        self.artist = User.objects.create_user(
            "publishing-artist",
            email="publishing-artist@example.com",
            password="StrongPassword123",
            is_active=True,
        )
        self.artist.profile.account_type = "tattoo_artist"
        self.artist.profile.verification_status = "approved"
        self.artist.profile.is_email_verified = True
        self.artist.profile.save(
            update_fields=(
                "account_type",
                "verification_status",
                "is_email_verified",
            )
        )
        self.regular = User.objects.create_user(
            "publishing-client",
            email="publishing-client@example.com",
            password="StrongPassword123",
            is_active=True,
        )
        self.other = User.objects.create_user(
            "publishing-other",
            email="publishing-other@example.com",
            password="StrongPassword123",
            is_active=True,
        )
        self.client.force_authenticate(self.artist)

    def tearDown(self):
        self.media_override.disable()
        shutil.rmtree(self.media_root, ignore_errors=True)

    @staticmethod
    def image_upload(name="tattoo.png"):
        output = BytesIO()
        Image.new("RGB", (3, 3), color="black").save(output, format="PNG")
        return SimpleUploadedFile(
            name,
            output.getvalue(),
            content_type="image/png",
        )

    def test_create_post_accepts_media_and_returns_owned_feed_payload(self):
        response = self.client.post(
            reverse("mobile_api:my_posts"),
            {
                "content": "Fresh ornamental piece",
                "location": "Paris",
                "visibility": "followers",
                "disable_comments": "true",
                "media": self.image_upload(),
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["is_owned"])
        self.assertEqual(response.data["visibility"], "followers")
        self.assertTrue(response.data["disable_comments"])
        self.assertEqual(response.data["media"][0]["type"], "image")
        post = Post.objects.get(pk=response.data["id"])
        self.assertEqual(post.user, self.artist)
        self.assertEqual(post.medias.count(), 1)

    def test_create_post_rejects_empty_and_spoofed_image_uploads(self):
        empty = self.client.post(
            reverse("mobile_api:my_posts"),
            {},
            format="json",
        )
        self.assertEqual(empty.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(empty.data["code"], "empty_post")

        spoofed = self.client.post(
            reverse("mobile_api:my_posts"),
            {
                "media": SimpleUploadedFile(
                    "not-an-image.png",
                    b"definitely-not-an-image",
                    content_type="image/png",
                )
            },
            format="multipart",
        )
        self.assertEqual(spoofed.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(spoofed.data["code"], "invalid_image")
        self.assertFalse(Post.objects.filter(user=self.artist).exists())

    def test_post_update_and_delete_are_owner_only(self):
        own = Post.objects.create(user=self.artist, content="Before")
        stranger_post = Post.objects.create(user=self.other, content="Not mine")

        updated = self.client.patch(
            reverse("mobile_api:my_post_detail", args=[own.pk]),
            {"content": "After", "visibility": "private"},
            format="json",
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        self.assertEqual(updated.data["content"], "After")
        self.assertEqual(updated.data["visibility"], "private")

        forbidden = self.client.delete(
            reverse("mobile_api:my_post_detail", args=[stranger_post.pk])
        )
        self.assertEqual(forbidden.status_code, status.HTTP_404_NOT_FOUND)

        deleted = self.client.delete(
            reverse("mobile_api:my_post_detail", args=[own.pk])
        )
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Post.objects.filter(pk=own.pk).exists())

    def test_verified_artist_can_create_edit_list_and_delete_portfolio_work(self):
        created = self.client.post(
            reverse("mobile_api:my_portfolio"),
            {
                "image": self.image_upload("portfolio.png"),
                "title": "Ornamental sleeve",
                "style": "Blackwork",
                "body_placement": "Forearm",
            },
            format="multipart",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        work_id = created.data["id"]
        self.assertEqual(created.data["style"], "Blackwork")

        listed = self.client.get(reverse("mobile_api:my_portfolio"))
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertEqual(listed.data["count"], 1)
        self.assertEqual(listed.data["results"][0]["id"], work_id)

        updated = self.client.patch(
            reverse("mobile_api:my_portfolio_detail", args=[work_id]),
            {"title": "Finished sleeve", "body_placement": "Full arm"},
            format="json",
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        self.assertEqual(updated.data["title"], "Finished sleeve")
        self.assertEqual(updated.data["body_placement"], "Full arm")

        deleted = self.client.delete(
            reverse("mobile_api:my_portfolio_detail", args=[work_id])
        )
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(PortfolioWork.objects.filter(pk=work_id).exists())

    def test_portfolio_is_verified_artist_only_and_ownership_is_hidden(self):
        other_work = PortfolioWork.objects.create(
            user=self.other,
            image="portfolio/works/other.png",
        )
        hidden = self.client.patch(
            reverse("mobile_api:my_portfolio_detail", args=[other_work.pk]),
            {"title": "Taken over"},
            format="json",
        )
        self.assertEqual(hidden.status_code, status.HTTP_404_NOT_FOUND)

        self.client.force_authenticate(self.regular)
        listed = self.client.get(reverse("mobile_api:my_portfolio"))
        created = self.client.post(
            reverse("mobile_api:my_portfolio"),
            {"image": self.image_upload()},
            format="multipart",
        )
        self.assertEqual(listed.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(created.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(listed.data["code"], "artist_portfolio_forbidden")


class MobilePublicProfileTests(APITestCase):
    def setUp(self):
        self.viewer = User.objects.create_user(
            "profile-viewer",
            email="profile-viewer@example.com",
            password="StrongPassword123",
            is_active=True,
        )
        self.artist = User.objects.create_user(
            "profile-artist",
            email="profile-artist@example.com",
            password="StrongPassword123",
            is_active=True,
        )
        self.stranger = User.objects.create_user(
            "profile-stranger",
            email="profile-stranger@example.com",
            password="StrongPassword123",
            is_active=True,
        )
        self.artist.profile.account_type = "tattoo_artist"
        self.artist.profile.verification_status = "approved"
        self.artist.profile.is_email_verified = True
        self.artist.profile.bio = "Blackwork and ornamental tattoo artist"
        self.artist.profile.save(
            update_fields=(
                "account_type",
                "verification_status",
                "is_email_verified",
                "bio",
            )
        )
        self.client.force_authenticate(self.viewer)

    def test_public_profile_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(
            reverse("mobile_api:public_profile", args=[self.artist.username])
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_profile_returns_portfolio_stats_and_only_visible_recent_posts(self):
        public_post = Post.objects.create(
            user=self.artist,
            content="Public profile post",
            visibility="public",
        )
        Post.objects.create(
            user=self.artist,
            content="Followers-only post",
            visibility="followers",
        )
        Post.objects.create(
            user=self.artist,
            content="Private post",
            visibility="private",
        )
        work = PortfolioWork.objects.create(
            user=self.artist,
            image="portfolio/works/blackwork.jpg",
            title="Ornamental sleeve",
            style="Blackwork",
        )
        UserFollow.objects.create(follower=self.stranger, following=self.artist)

        response = self.client.get(
            reverse("mobile_api:public_profile", args=[self.artist.username])
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], self.artist.username)
        self.assertEqual(response.data["bio"], self.artist.profile.bio)
        self.assertTrue(response.data["is_verified_artist"])
        self.assertFalse(response.data["is_following"])
        self.assertFalse(response.data["is_self"])
        self.assertEqual(response.data["followers_count"], 1)
        self.assertEqual(response.data["posts_count"], 1)
        self.assertEqual(response.data["portfolio_works_count"], 1)
        self.assertEqual(response.data["portfolio"][0]["id"], work.pk)
        self.assertTrue(
            response.data["portfolio"][0]["image_url"].endswith(
                "/portfolio/works/blackwork.jpg"
            )
        )
        self.assertEqual(
            [post["id"] for post in response.data["recent_posts"]],
            [public_post.pk],
        )

    def test_follow_toggle_updates_profile_state(self):
        follow_url = reverse(
            "mobile_api:public_profile_follow",
            args=[self.artist.username],
        )
        followed = self.client.post(follow_url)
        self.assertEqual(followed.status_code, status.HTTP_200_OK)
        self.assertTrue(followed.data["is_following"])
        self.assertEqual(followed.data["followers_count"], 1)

        profile = self.client.get(
            reverse("mobile_api:public_profile", args=[self.artist.username])
        )
        self.assertTrue(profile.data["is_following"])

        unfollowed = self.client.post(follow_url)
        self.assertFalse(unfollowed.data["is_following"])
        self.assertEqual(unfollowed.data["followers_count"], 0)

    def test_self_follow_is_rejected(self):
        self.viewer.profile.is_email_verified = True
        self.viewer.profile.save(update_fields=("is_email_verified",))
        response = self.client.post(
            reverse(
                "mobile_api:public_profile_follow",
                args=[self.viewer.username],
            )
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "cannot_follow_self")

    def test_blocked_and_unverified_profiles_are_hidden(self):
        UserBlock.objects.create(blocker=self.artist, blocked=self.viewer)
        blocked = self.client.get(
            reverse("mobile_api:public_profile", args=[self.artist.username])
        )
        self.assertEqual(blocked.status_code, status.HTTP_404_NOT_FOUND)

        UserBlock.objects.all().delete()
        self.artist.profile.is_email_verified = False
        self.artist.profile.save(update_fields=("is_email_verified",))
        unverified = self.client.get(
            reverse("mobile_api:public_profile", args=[self.artist.username])
        )
        self.assertEqual(unverified.status_code, status.HTTP_404_NOT_FOUND)


class MobileSafetyTests(APITestCase):
    def setUp(self):
        self.viewer = User.objects.create_user(
            "safety-viewer",
            email="safety-viewer@example.com",
            password="StrongPassword123",
            is_active=True,
        )
        self.target = User.objects.create_user(
            "safety-target",
            email="safety-target@example.com",
            password="StrongPassword123",
            is_active=True,
        )
        self.target.profile.is_email_verified = True
        self.target.profile.save(update_fields=("is_email_verified",))
        self.client.force_authenticate(self.viewer)

    def test_block_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.post(
            reverse("mobile_api:public_profile_block", args=[self.target.username])
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_block_hides_user_removes_follows_and_can_be_reversed(self):
        post = Post.objects.create(user=self.target, content="Hidden after block")
        UserFollow.objects.create(follower=self.viewer, following=self.target)
        UserFollow.objects.create(follower=self.target, following=self.viewer)
        block_url = reverse(
            "mobile_api:public_profile_block",
            args=[self.target.username],
        )

        blocked = self.client.post(block_url)
        self.assertEqual(blocked.status_code, status.HTTP_200_OK)
        self.assertTrue(blocked.data["is_blocked"])
        self.assertTrue(
            UserBlock.objects.filter(
                blocker=self.viewer,
                blocked=self.target,
            ).exists()
        )
        self.assertFalse(
            UserFollow.objects.filter(
                Q(follower=self.viewer, following=self.target)
                | Q(follower=self.target, following=self.viewer)
            ).exists()
        )

        profile = self.client.get(
            reverse("mobile_api:public_profile", args=[self.target.username])
        )
        self.assertEqual(profile.status_code, status.HTTP_404_NOT_FOUND)
        feed = self.client.get(reverse("mobile_api:feed"))
        self.assertNotIn(post.pk, {item["id"] for item in feed.data["results"]})

        blocked_users = self.client.get(reverse("mobile_api:blocked_users"))
        self.assertEqual(blocked_users.status_code, status.HTTP_200_OK)
        self.assertEqual(
            blocked_users.data["results"][0]["username"],
            self.target.username,
        )

        unblocked = self.client.post(block_url)
        self.assertFalse(unblocked.data["is_blocked"])
        self.assertFalse(
            UserBlock.objects.filter(
                blocker=self.viewer,
                blocked=self.target,
            ).exists()
        )
        restored_profile = self.client.get(
            reverse("mobile_api:public_profile", args=[self.target.username])
        )
        self.assertEqual(restored_profile.status_code, status.HTTP_200_OK)

    def test_user_cannot_block_self(self):
        response = self.client.post(
            reverse("mobile_api:public_profile_block", args=[self.viewer.username])
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "cannot_block_self")


@override_settings(TATZO_RATE_LIMIT_ENABLED=False, USE_CLOUDINARY=False)
class MobileChatTests(APITestCase):
    def setUp(self):
        self.media_root = tempfile.mkdtemp(prefix="tatzo-mobile-chat-", dir="/tmp")
        self.media_override = self.settings(MEDIA_ROOT=self.media_root)
        self.media_override.enable()
        private_media_storage._backend = None

        self.viewer = User.objects.create_user(
            "chat-viewer",
            email="chat-viewer@example.com",
            password="StrongPassword123",
            is_active=True,
        )
        self.target = User.objects.create_user(
            "chat-target",
            email="chat-target@example.com",
            password="StrongPassword123",
            is_active=True,
        )
        self.stranger = User.objects.create_user(
            "chat-stranger",
            email="chat-stranger@example.com",
            password="StrongPassword123",
            is_active=True,
        )
        for user in (self.viewer, self.target, self.stranger):
            user.profile.is_email_verified = True
            user.profile.save(update_fields=("is_email_verified",))

        self.client.force_authenticate(self.viewer)

    def tearDown(self):
        private_media_storage._backend = None
        self.media_override.disable()
        shutil.rmtree(self.media_root, ignore_errors=True)

    def start_chat(self):
        return self.client.post(
            reverse("mobile_api:chat_start", args=[self.target.username])
        )

    def send_message(self, thread_id, content="Hello from mobile"):
        return self.client.post(
            reverse("mobile_api:chat_message_create", args=[thread_id]),
            {"content": content},
            format="json",
        )

    def test_chat_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(reverse("mobile_api:chat_list"))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_start_chat_rejects_self_unverified_and_blocked_users(self):
        self_chat = self.client.post(
            reverse("mobile_api:chat_start", args=[self.viewer.username])
        )
        self.assertEqual(self_chat.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self_chat.data["code"], "cannot_chat_self")

        self.target.profile.is_email_verified = False
        self.target.profile.save(update_fields=("is_email_verified",))
        unverified = self.start_chat()
        self.assertEqual(unverified.status_code, status.HTTP_404_NOT_FOUND)

        self.target.profile.is_email_verified = True
        self.target.profile.save(update_fields=("is_email_verified",))
        UserBlock.objects.create(blocker=self.target, blocked=self.viewer)
        blocked = self.start_chat()
        self.assertEqual(blocked.status_code, status.HTTP_404_NOT_FOUND)

    def test_empty_chat_is_hidden_until_first_message_and_unread_is_cleared(self):
        started = self.start_chat()
        self.assertEqual(started.status_code, status.HTTP_200_OK)
        thread_id = started.data["id"]

        empty_list = self.client.get(reverse("mobile_api:chat_list"))
        self.assertEqual(empty_list.data["results"], [])

        sent = self.send_message(thread_id)
        self.assertEqual(sent.status_code, status.HTTP_201_CREATED)
        self.assertTrue(sent.data["is_mine"])

        sender_list = self.client.get(reverse("mobile_api:chat_list"))
        self.assertEqual(len(sender_list.data["results"]), 1)
        self.assertEqual(sender_list.data["unread_count"], 0)
        self.assertEqual(
            sender_list.data["results"][0]["last_message"]["content"],
            "Hello from mobile",
        )

        self.client.force_authenticate(self.target)
        recipient_list = self.client.get(reverse("mobile_api:chat_list"))
        self.assertEqual(recipient_list.data["unread_count"], 1)
        thread = self.client.get(reverse("mobile_api:chat_thread", args=[thread_id]))
        self.assertEqual(thread.status_code, status.HTTP_200_OK)
        self.assertEqual(thread.data["unread_count"], 0)
        self.assertFalse(thread.data["messages"][0]["is_mine"])

        refreshed_list = self.client.get(reverse("mobile_api:chat_list"))
        self.assertEqual(refreshed_list.data["unread_count"], 0)

        self.client.force_authenticate(self.viewer)
        receipt = self.client.get(
            reverse("mobile_api:chat_thread", args=[thread_id]),
            {"after": sent.data["id"]},
        )
        self.assertEqual(receipt.data["last_read_message_id"], sent.data["id"])

    def test_thread_poll_returns_only_messages_after_cursor(self):
        thread_id = self.start_chat().data["id"]
        first = self.send_message(thread_id, "First").data
        second = self.send_message(thread_id, "Second").data

        self.client.force_authenticate(self.target)
        initial = self.client.get(reverse("mobile_api:chat_thread", args=[thread_id]))
        self.assertEqual(
            [message["id"] for message in initial.data["messages"]],
            [first["id"], second["id"]],
        )

        self.client.force_authenticate(self.viewer)
        third = self.send_message(thread_id, "Third").data
        self.client.force_authenticate(self.target)
        polled = self.client.get(
            reverse("mobile_api:chat_thread", args=[thread_id]),
            {"after": second["id"]},
        )
        self.assertEqual(
            [message["id"] for message in polled.data["messages"]],
            [third["id"]],
        )

    def test_non_participant_cannot_read_thread_and_block_prevents_sending(self):
        thread_id = self.start_chat().data["id"]
        self.client.force_authenticate(self.stranger)
        hidden = self.client.get(reverse("mobile_api:chat_thread", args=[thread_id]))
        self.assertEqual(hidden.status_code, status.HTTP_404_NOT_FOUND)

        UserBlock.objects.create(blocker=self.target, blocked=self.viewer)
        self.client.force_authenticate(self.viewer)
        blocked = self.send_message(thread_id)
        self.assertEqual(blocked.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(blocked.data["code"], "chat_blocked")

    def test_sender_can_edit_and_delete_but_recipient_cannot(self):
        thread_id = self.start_chat().data["id"]
        sent = self.send_message(thread_id).data
        message_url = reverse("mobile_api:chat_message", args=[sent["id"]])

        self.client.force_authenticate(self.target)
        forbidden_edit = self.client.patch(
            message_url,
            {"content": "Changed by recipient"},
            format="json",
        )
        self.assertEqual(forbidden_edit.status_code, status.HTTP_404_NOT_FOUND)
        forbidden_delete = self.client.delete(message_url)
        self.assertEqual(forbidden_delete.status_code, status.HTTP_404_NOT_FOUND)

        self.client.force_authenticate(self.viewer)
        edited = self.client.patch(
            message_url,
            {"content": "Edited message"},
            format="json",
        )
        self.assertEqual(edited.status_code, status.HTTP_200_OK)
        self.assertEqual(edited.data["content"], "Edited message")
        self.assertTrue(edited.data["is_edited"])

        deleted = self.client.delete(message_url)
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        message = ChatMessage.objects.get(pk=sent["id"])
        self.assertTrue(message.is_deleted)
        self.assertEqual(message.content, "")
        self.assertEqual(
            self.client.get(reverse("mobile_api:chat_list")).data["results"],
            [],
        )

    def test_attachment_uses_expiring_signed_private_url(self):
        thread_id = self.start_chat().data["id"]
        attachment = SimpleUploadedFile(
            "reference.png",
            b"not-a-real-png-but-private",
            content_type="image/png",
        )
        sent = self.client.post(
            reverse("mobile_api:chat_message_create", args=[thread_id]),
            {"content": "Reference", "attachments": attachment},
            format="multipart",
        )
        self.assertEqual(sent.status_code, status.HTTP_201_CREATED)
        self.assertEqual(sent.data["attachments"][0]["type"], "image")
        self.assertEqual(ChatAttachment.objects.count(), 1)

        signed_url = urlparse(sent.data["attachments"][0]["url"])
        self.client.force_authenticate(user=None)
        download = self.client.get(f"{signed_url.path}?{signed_url.query}")
        self.assertEqual(download.status_code, status.HTTP_200_OK)
        self.assertEqual(download["X-Content-Type-Options"], "nosniff")

        tampered = self.client.get(f"{signed_url.path}?{signed_url.query}x")
        self.assertEqual(tampered.status_code, status.HTTP_404_NOT_FOUND)

    def test_message_validation_rejects_empty_and_invalid_cursor(self):
        thread_id = self.start_chat().data["id"]
        empty = self.send_message(thread_id, "   ")
        self.assertEqual(empty.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(empty.data["code"], "empty_message")

        invalid_cursor = self.client.get(
            reverse("mobile_api:chat_thread", args=[thread_id]),
            {"after": "not-a-number"},
        )
        self.assertEqual(invalid_cursor.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(invalid_cursor.data["code"], "invalid_cursor")


@override_settings(TATZO_RATE_LIMIT_ENABLED=False, USE_CLOUDINARY=False)
class MobileBookingTests(APITestCase):
    def setUp(self):
        self.media_root = tempfile.mkdtemp(prefix="tatzo-mobile-booking-", dir="/tmp")
        self.media_override = self.settings(MEDIA_ROOT=self.media_root)
        self.media_override.enable()
        private_media_storage._backend = None

        self.viewer = User.objects.create_user(
            "booking-viewer",
            email="booking-viewer@example.com",
            password="StrongPassword123",
            is_active=True,
        )
        self.artist = User.objects.create_user(
            "booking-artist",
            email="booking-artist@example.com",
            password="StrongPassword123",
            is_active=True,
        )
        self.stranger = User.objects.create_user(
            "booking-stranger",
            email="booking-stranger@example.com",
            password="StrongPassword123",
            is_active=True,
        )
        for user in (self.viewer, self.artist, self.stranger):
            user.profile.is_email_verified = True
            user.profile.save(update_fields=("is_email_verified",))
        self.artist.profile.account_type = "tattoo_artist"
        self.artist.profile.verification_status = "approved"
        self.artist.profile.timezone = "Europe/Paris"
        self.artist.profile.save(
            update_fields=("account_type", "verification_status", "timezone")
        )

        self.settings = ArtistBookingSettings.objects.update_or_create(
            artist=self.artist,
            defaults={
                "minimum_notice_hours": 0,
                "maximum_booking_window_days": 90,
                "maximum_session_hours": 8,
                "active_styles": ["Blackwork", "Fine Line"],
                "booking_workflow": "manual",
            },
        )[0]
        self.booking_date = timezone.localdate() + timedelta(days=14)
        ArtistAvailability.objects.update_or_create(
            artist=self.artist,
            weekday=(self.booking_date.weekday() + 1) % 7,
            defaults={
                "is_closed": False,
                "open_time": time(9),
                "close_time": time(18),
                "break_start": time(12),
                "break_end": time(13),
            },
        )
        self.client.force_authenticate(self.viewer)

    def tearDown(self):
        private_media_storage._backend = None
        self.media_override.disable()
        shutil.rmtree(self.media_root, ignore_errors=True)

    @property
    def booking_url(self):
        return reverse("mobile_api:appointment_booking", args=[self.artist.username])

    def booking_payload(self, **changes):
        return {
            "booking_type": Appointment.TYPE_TATTOO,
            "date": self.booking_date.isoformat(),
            "start_time": "09:00",
            "session_length_minutes": 120,
            "styles": ["Blackwork"],
            "placements": ["Left arm"],
            "size": "A5",
            "budget": "€300–600",
            "description": "Ornamental blackwork concept",
            **changes,
        }

    @staticmethod
    def reference_image(name="reference.png"):
        output = BytesIO()
        Image.new("RGB", (2, 2), color="black").save(output, format="PNG")
        return SimpleUploadedFile(name, output.getvalue(), content_type="image/png")

    def make_calendar_block(self, start_hour=15, end_hour=16):
        artist_timezone = timezone.get_fixed_timezone(120)
        return CalendarEvent.objects.create(
            artist=self.artist,
            event_type=CalendarEvent.TYPE_BLOCKED,
            status=CalendarEvent.STATUS_PLANNED,
            title="Blocked for studio work",
            starts_at=timezone.make_aware(
                datetime.combine(self.booking_date, time(start_hour)),
                artist_timezone,
            ),
            ends_at=timezone.make_aware(
                datetime.combine(self.booking_date, time(end_hour)),
                artist_timezone,
            ),
        )

    def test_booking_config_includes_rules_schedule_and_blocked_dates(self):
        self.make_calendar_block()
        vacation_date = self.booking_date + timedelta(days=1)
        ArtistTimeOff.objects.create(artist=self.artist, date=vacation_date)

        response = self.client.get(self.booking_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["available"])
        self.assertEqual(response.data["artist"]["username"], self.artist.username)
        self.assertIn(Appointment.TYPE_TATTOO, response.data["booking_types"])
        self.assertEqual(response.data["settings"]["minimum_notice_hours"], 0)
        weekday = str((self.booking_date.weekday() + 1) % 7)
        self.assertEqual(response.data["schedule"][weekday]["open"], "09:00")
        self.assertIn(vacation_date.isoformat(), response.data["vacations"])
        self.assertIn(
            {
                "date": self.booking_date.isoformat(),
                "start_time": "15:00",
                "end_time": "16:00",
            },
            response.data["occupied_slots"],
        )

    def test_client_can_create_list_and_open_a_booking(self):
        response = self.client.post(
            self.booking_url, self.booking_payload(), format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        appointment = Appointment.objects.get()
        self.assertEqual(appointment.status, Appointment.STATUS_PENDING)
        self.assertEqual(appointment.placement, "Left arm")
        self.assertEqual(response.data["role"], "client")
        self.assertEqual(response.data["reference_images"], [])

        listed = self.client.get(reverse("mobile_api:appointment_list"))
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertEqual(listed.data["results"][0]["id"], appointment.pk)

        detail = self.client.get(
            reverse("mobile_api:appointment_detail", args=[appointment.pk])
        )
        self.assertEqual(detail.status_code, status.HTTP_200_OK)
        self.client.force_authenticate(self.stranger)
        hidden = self.client.get(
            reverse("mobile_api:appointment_detail", args=[appointment.pk])
        )
        self.assertEqual(hidden.status_code, status.HTTP_404_NOT_FOUND)

    def test_required_reference_is_validated_and_served_with_signed_url(self):
        self.settings.reference_images_required = True
        self.settings.minimum_reference_images = 1
        self.settings.maximum_reference_images = 2
        self.settings.save(
            update_fields=(
                "reference_images_required",
                "minimum_reference_images",
                "maximum_reference_images",
            )
        )

        missing = self.client.post(
            self.booking_url, self.booking_payload(), format="json"
        )
        self.assertEqual(missing.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(missing.data["code"], "references_required")

        created = self.client.post(
            self.booking_url,
            {**self.booking_payload(), "references": [self.reference_image()]},
            format="multipart",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(AppointmentReferenceImage.objects.count(), 1)
        signed_url = urlparse(created.data["reference_images"][0]["url"])

        self.client.force_authenticate(user=None)
        download = self.client.get(f"{signed_url.path}?{signed_url.query}")
        self.assertEqual(download.status_code, status.HTTP_200_OK)
        self.assertEqual(download["Content-Type"], "image/png")
        self.assertEqual(download["X-Content-Type-Options"], "nosniff")
        tampered = self.client.get(f"{signed_url.path}?{signed_url.query}x")
        self.assertEqual(tampered.status_code, status.HTTP_404_NOT_FOUND)

    def test_calendar_break_and_vacation_slots_are_rejected(self):
        self.make_calendar_block(start_hour=10, end_hour=11)
        blocked = self.client.post(
            self.booking_url,
            self.booking_payload(start_time="10:00", session_length_minutes=60),
            format="json",
        )
        self.assertEqual(blocked.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(blocked.data["code"], "slot_unavailable")

        break_overlap = self.client.post(
            self.booking_url,
            self.booking_payload(start_time="11:30", session_length_minutes=60),
            format="json",
        )
        self.assertEqual(break_overlap.status_code, status.HTTP_409_CONFLICT)

        ArtistTimeOff.objects.create(artist=self.artist, date=self.booking_date)
        vacation = self.client.post(
            self.booking_url, self.booking_payload(), format="json"
        )
        self.assertEqual(vacation.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(vacation.data["code"], "date_blocked")

    def test_calendar_reminders_do_not_consume_booking_time(self):
        artist_timezone = timezone.get_fixed_timezone(120)
        CalendarEvent.objects.create(
            artist=self.artist,
            event_type=CalendarEvent.TYPE_SKETCH_DEADLINE,
            status=CalendarEvent.STATUS_PLANNED,
            title="Sketch deadline",
            starts_at=timezone.make_aware(
                datetime.combine(self.booking_date, time(9)),
                artist_timezone,
            ),
            ends_at=timezone.make_aware(
                datetime.combine(self.booking_date, time(10)),
                artist_timezone,
            ),
        )

        response = self.client.post(
            self.booking_url,
            self.booking_payload(session_length_minutes=60),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_daily_workload_capacity_is_enforced_and_exposed(self):
        self.settings.maximum_session_hours = 2
        self.settings.save(update_fields=("maximum_session_hours",))
        first = self.client.post(
            self.booking_url,
            self.booking_payload(session_length_minutes=120),
            format="json",
        )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)

        config = self.client.get(self.booking_url)
        self.assertEqual(
            config.data["booked_minutes_by_date"][self.booking_date.isoformat()],
            120,
        )
        over_capacity = self.client.post(
            self.booking_url,
            self.booking_payload(start_time="14:00", session_length_minutes=60),
            format="json",
        )
        self.assertEqual(over_capacity.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(over_capacity.data["code"], "slot_unavailable")

    def test_consultation_only_mode_forces_one_hour_consultations(self):
        self.settings.booking_status = (
            ArtistBookingSettings.BOOKING_STATUS_CONSULTATION_ONLY
        )
        self.settings.save(update_fields=("booking_status",))

        config = self.client.get(self.booking_url)
        self.assertNotIn(Appointment.TYPE_TATTOO, config.data["booking_types"])
        self.assertIn(Appointment.TYPE_CONSULTATION, config.data["booking_types"])

        tattoo = self.client.post(
            self.booking_url, self.booking_payload(), format="json"
        )
        self.assertEqual(tattoo.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(tattoo.data["code"], "invalid_booking_type")

        consultation = self.client.post(
            self.booking_url,
            {
                "booking_type": Appointment.TYPE_CONSULTATION,
                "date": self.booking_date.isoformat(),
                "start_time": "14:00",
                "session_length_minutes": 180,
                "description": "Discuss the concept",
            },
            format="json",
        )
        self.assertEqual(consultation.status_code, status.HTTP_201_CREATED)
        appointment = Appointment.objects.get()
        self.assertEqual(appointment.session_length_minutes, 60)
        self.assertEqual(appointment.styles, [])

    def test_booking_visibility_respects_blocks_and_artist_availability(self):
        UserBlock.objects.create(blocker=self.artist, blocked=self.viewer)
        hidden = self.client.get(self.booking_url)
        self.assertEqual(hidden.status_code, status.HTTP_404_NOT_FOUND)

        UserBlock.objects.all().delete()
        self.settings.booking_status = ArtistBookingSettings.BOOKING_STATUS_PAUSED
        self.settings.save(update_fields=("booking_status",))
        config = self.client.get(self.booking_url)
        self.assertFalse(config.data["available"])
        self.assertEqual(config.data["unavailable_code"], "paused")
        rejected = self.client.post(
            self.booking_url, self.booking_payload(), format="json"
        )
        self.assertEqual(rejected.status_code, status.HTTP_409_CONFLICT)

    def test_only_artist_can_apply_valid_status_actions(self):
        created = self.client.post(
            self.booking_url, self.booking_payload(), format="json"
        )
        appointment_id = created.data["id"]
        action_url = reverse("mobile_api:appointment_action", args=[appointment_id])

        forbidden = self.client.post(action_url, {"action": "accept"}, format="json")
        self.assertEqual(forbidden.status_code, status.HTTP_404_NOT_FOUND)

        self.client.force_authenticate(self.artist)
        accepted = self.client.post(action_url, {"action": "accept"}, format="json")
        self.assertEqual(accepted.status_code, status.HTTP_200_OK)
        self.assertEqual(accepted.data["status"], Appointment.STATUS_ACCEPTED)
        self.assertIn("complete", accepted.data["available_actions"])

        completed = self.client.post(action_url, {"action": "complete"}, format="json")
        self.assertEqual(completed.status_code, status.HTTP_200_OK)
        self.assertEqual(completed.data["status"], Appointment.STATUS_COMPLETED)
        invalid = self.client.post(action_url, {"action": "accept"}, format="json")
        self.assertEqual(invalid.status_code, status.HTTP_409_CONFLICT)

    def test_client_can_add_references_when_artist_requests_them(self):
        created = self.client.post(
            self.booking_url,
            self.booking_payload(),
            format="json",
        )
        appointment = Appointment.objects.get(pk=created.data["id"])
        appointment.status = Appointment.STATUS_NEEDS_REFERENCES
        appointment.save(update_fields=("status", "updated_at"))
        upload_url = reverse(
            "mobile_api:appointment_reference_upload",
            args=[appointment.pk],
        )

        uploaded = self.client.post(
            upload_url,
            {"references": [self.reference_image("follow-up.png")]},
            format="multipart",
        )

        self.assertEqual(uploaded.status_code, status.HTTP_200_OK)
        self.assertEqual(uploaded.data["status"], Appointment.STATUS_PENDING)
        self.assertFalse(uploaded.data["can_add_references"])
        self.assertEqual(len(uploaded.data["reference_images"]), 1)
        self.client.force_authenticate(self.artist)
        artist_upload = self.client.post(
            upload_url,
            {"references": [self.reference_image("artist.png")]},
            format="multipart",
        )
        self.assertEqual(artist_upload.status_code, status.HTTP_404_NOT_FOUND)


@override_settings(
    TATZO_RATE_LIMIT_ENABLED=False,
    STYLE_MATCH_CARD_COUNT=2,
    STYLE_MATCH_MAX_CARD_COUNT=2,
    STYLE_MATCH_CONFIDENCE_THRESHOLD=0,
)
class MobileStyleMatchTests(APITestCase):
    def setUp(self):
        TattooCard.objects.all().delete()
        self.viewer = User.objects.create_user(
            "match-viewer",
            email="match-viewer@example.com",
            password="StrongPassword123",
            is_active=True,
        )
        self.cards = [
            self.make_card("MOBILE001", "fine_line"),
            self.make_card("MOBILE002", "blackwork"),
            self.make_card("MOBILE003", "geometric"),
        ]
        self.client.force_authenticate(self.viewer)

    @staticmethod
    def make_card(card_id, primary_style):
        return TattooCard.objects.create(
            card_id=card_id,
            image_url=f"https://example.com/{card_id}.jpg",
            cloudinary_public_id=f"style_match/cards/{card_id}",
            primary_style=primary_style,
            style_weights={primary_style: 0.9},
            visual_traits={"organic": 0.8},
            motifs=["reference"],
            is_active=True,
            is_approved=True,
        )

    def start(self):
        return self.client.post(reverse("mobile_api:style_match"), {}, format="json")

    def react(self, session_id, card_id, action, **payload):
        return self.client.post(
            reverse("mobile_api:style_match_react", args=[session_id]),
            {"card_id": card_id, "action": action, **payload},
            format="json",
        )

    def test_style_match_requires_authentication_and_resumes_active_session(self):
        self.client.force_authenticate(user=None)
        self.assertEqual(
            self.client.get(reverse("mobile_api:style_match")).status_code,
            status.HTTP_401_UNAUTHORIZED,
        )
        self.assertEqual(
            self.client.post(reverse("mobile_api:style_match")).status_code,
            status.HTTP_401_UNAUTHORIZED,
        )

        self.client.force_authenticate(self.viewer)
        started = self.start()
        self.assertEqual(started.status_code, status.HTTP_201_CREATED)
        self.assertEqual(started.data["total"], 2)
        self.assertEqual(started.data["current_index"], 0)
        self.assertNotIn("primary_style", started.data["cards"][0])
        self.assertNotIn("style_weights", started.data["cards"][0])

        overview = self.client.get(reverse("mobile_api:style_match"))
        self.assertEqual(
            overview.data["active_session"]["session_id"],
            started.data["session_id"],
        )

        replacement = self.start()
        self.assertNotEqual(replacement.data["session_id"], started.data["session_id"])
        self.assertEqual(
            StyleMatchSession.objects.get(pk=started.data["session_id"]).status,
            StyleMatchSession.STATUS_ABANDONED,
        )
        abandoned = self.react(
            started.data["session_id"],
            started.data["cards"][0]["id"],
            "like",
        )
        self.assertEqual(abandoned.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(abandoned.data["code"], "match_abandoned")

    def test_save_react_complete_and_load_latest_result(self):
        started = self.start().data
        first, second = started["cards"]
        first_style = TattooCard.objects.get(pk=first["id"]).primary_style
        hidden_artist = User.objects.create_user(
            "hidden-match-artist",
            password="StrongPassword123",
            is_active=True,
        )
        hidden_artist.profile.account_type = "tattoo_artist"
        hidden_artist.profile.verification_status = "approved"
        hidden_artist.profile.is_email_verified = True
        hidden_artist.profile.save()
        ArtistBookingSettings.objects.create(
            artist=hidden_artist,
            active_styles=[first_style],
        )
        UserBlock.objects.create(blocker=self.viewer, blocked=hidden_artist)

        saved = self.react(
            started["session_id"],
            first["id"],
            "save",
            saved=True,
        )
        self.assertTrue(saved.data["saved"])
        self.assertEqual(saved.data["current_index"], 0)
        resumed = self.client.get(reverse("mobile_api:style_match"))
        self.assertTrue(resumed.data["active_session"]["current_saved"])

        first_reaction = self.react(
            started["session_id"],
            first["id"],
            "favorite",
        )
        self.assertFalse(first_reaction.data["completed"])
        completed = self.react(
            started["session_id"],
            second["id"],
            "reject",
        )
        self.assertTrue(completed.data["completed"])
        self.assertEqual(completed.data["result"]["saved_cards"][0]["id"], first["id"])
        self.assertEqual(
            completed.data["result"]["top_style"]["slug"],
            first_style,
        )
        self.assertNotIn(
            hidden_artist.username,
            {artist["username"] for artist in completed.data["result"]["artists"]},
        )

        session = StyleMatchSession.objects.get(pk=started["session_id"])
        self.assertEqual(session.status, StyleMatchSession.STATUS_COMPLETED)
        self.assertTrue(
            StyleMatchResponse.objects.get(session=session, card_id=first["id"]).saved
        )

        result = self.client.get(
            reverse("mobile_api:style_match_result", args=[session.pk])
        )
        self.assertEqual(result.status_code, status.HTTP_200_OK)
        overview = self.client.get(reverse("mobile_api:style_match"))
        self.assertIsNone(overview.data["active_session"])
        self.assertEqual(overview.data["latest_result"]["session_id"], str(session.pk))

    def test_future_card_and_foreign_session_are_hidden(self):
        started = self.start().data
        future = self.react(
            started["session_id"],
            started["cards"][1]["id"],
            "like",
        )
        self.assertEqual(future.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(future.data["code"], "current_card_required")

        stranger = User.objects.create_user(
            "match-stranger",
            password="StrongPassword123",
            is_active=True,
        )
        self.client.force_authenticate(stranger)
        hidden = self.client.get(
            reverse("mobile_api:style_match_result", args=[started["session_id"]])
        )
        self.assertEqual(hidden.status_code, status.HTTP_404_NOT_FOUND)

    @override_settings(
        STYLE_MATCH_CLARIFICATION_BATCH_SIZE=1,
        STYLE_MATCH_MAX_CARD_COUNT=3,
        STYLE_MATCH_CONFIDENCE_THRESHOLD=100,
    )
    def test_uncertain_mobile_match_receives_adaptive_card(self):
        started = self.start().data
        first = self.react(
            started["session_id"],
            started["cards"][0]["id"],
            "like",
        )
        self.assertFalse(first.data["completed"])

        extension = self.react(
            started["session_id"],
            started["cards"][1]["id"],
            "like",
        )
        self.assertTrue(extension.data["clarification"])
        self.assertEqual(extension.data["total"], 3)
        self.assertEqual(len(extension.data["cards"]), 1)

        completed = self.react(
            started["session_id"],
            extension.data["cards"][0]["id"],
            "like",
        )
        self.assertTrue(completed.data["completed"])
        self.assertEqual(completed.data["current_index"], 3)
