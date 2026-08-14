from django.contrib.auth import get_user_model
from django.core import mail
from django.db.models import Q
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from appointments.models import ArtistBookingSettings
from posts.models import (
    Post,
    PostBookmark,
    PostComment,
    PostLike,
    PostMedia,
    PostReport,
)
from style_match.models import StyleMatchResponse, StyleMatchSession, TattooCard
from users.models import PortfolioWork, UserBlock, UserFollow

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
