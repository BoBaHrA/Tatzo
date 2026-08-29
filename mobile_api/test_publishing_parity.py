from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from posts.models import Post


User = get_user_model()


class MobilePublishingParityTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            "publishing-parity-user",
            email="publishing-parity@example.com",
            password="StrongPassword123",
            is_active=True,
        )
        self.user.profile.is_email_verified = True
        self.user.profile.save(update_fields=("is_email_verified",))
        self.client.force_authenticate(self.user)

    def test_create_and_edit_post_preserve_ad_flag_and_layout(self):
        created = self.client.post(
            reverse("mobile_api:my_posts"),
            {
                "content": "Sponsored grid post",
                "is_ad": True,
                "layout": "grid",
                "visibility": "public",
                "disable_comments": False,
            },
            format="json",
        )

        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertTrue(created.data["is_ad"])
        self.assertEqual(created.data["layout"], "grid")

        post = Post.objects.get(pk=created.data["id"])
        self.assertTrue(post.is_ad)
        self.assertEqual(post.layout, "grid")

        updated = self.client.patch(
            reverse("mobile_api:my_post_detail", args=[post.pk]),
            {"is_ad": False, "layout": "carousel"},
            format="json",
        )

        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        self.assertFalse(updated.data["is_ad"])
        self.assertEqual(updated.data["layout"], "carousel")

        post.refresh_from_db()
        self.assertFalse(post.is_ad)
        self.assertEqual(post.layout, "carousel")

    def test_post_ad_flag_defaults_to_false_when_omitted(self):
        created = self.client.post(
            reverse("mobile_api:my_posts"),
            {"content": "Ordinary post", "layout": "grid"},
            format="json",
        )

        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertFalse(created.data["is_ad"])
        self.assertFalse(Post.objects.get(pk=created.data["id"]).is_ad)
