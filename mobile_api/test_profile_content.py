from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from posts.models import Post, PostLike


User = get_user_model()


class MobileProfileContentTests(APITestCase):
    def setUp(self):
        self.viewer = self.make_user("profile-viewer")
        self.target = self.make_user("profile-target")
        self.own_post = Post.objects.create(user=self.target, content="Own work")
        self.liked_post = Post.objects.create(user=self.viewer, content="Liked work")
        PostLike.objects.create(post=self.liked_post, user=self.target)
        self.client.force_authenticate(self.viewer)

    @staticmethod
    def make_user(username):
        user = User.objects.create_user(
            username=username,
            email=f"{username}@example.com",
            password="StrongPassword123",
            is_active=True,
        )
        user.profile.is_email_verified = True
        user.profile.save(update_fields=("is_email_verified",))
        return user

    def url(self, username=None):
        return reverse("mobile_api:profile_content", args=[username or self.target.username])

    def test_posts_tab_returns_target_posts(self):
        response = self.client.get(self.url(), {"tab": "posts"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["tab"], "posts")
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], self.own_post.pk)

    def test_liked_tab_respects_profile_privacy(self):
        self.target.profile.show_liked_posts = False
        self.target.profile.save(update_fields=("show_liked_posts",))

        response = self.client.get(self.url(), {"tab": "liked"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["can_view_liked"])
        self.assertEqual(response.data["results"], [])

        self.target.profile.show_liked_posts = True
        self.target.profile.save(update_fields=("show_liked_posts",))
        response = self.client.get(self.url(), {"tab": "liked"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["can_view_liked"])
        self.assertEqual(response.data["results"][0]["id"], self.liked_post.pk)

    def test_owner_can_always_view_own_liked_posts(self):
        self.target.profile.show_liked_posts = False
        self.target.profile.save(update_fields=("show_liked_posts",))
        self.client.force_authenticate(self.target)

        response = self.client.get(self.url(), {"tab": "liked"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["can_view_liked"])
        self.assertEqual(response.data["results"][0]["id"], self.liked_post.pk)
