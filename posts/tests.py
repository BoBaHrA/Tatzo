from django.contrib.auth import get_user_model
from django.test import TestCase

from users.models import UserBlock, UserFollow

from .models import Post


User = get_user_model()


class PostVisibilityTests(TestCase):
    def setUp(self):
        self.author = User.objects.create_user("artist", password="test")
        self.follower = User.objects.create_user("follower", password="test")
        self.stranger = User.objects.create_user("stranger", password="test")
        UserFollow.objects.create(follower=self.follower, following=self.author)

        self.public = Post.objects.create(user=self.author, visibility="public")
        self.followers = Post.objects.create(user=self.author, visibility="followers")
        self.private = Post.objects.create(user=self.author, visibility="private")

    def ids_visible_to(self, user):
        return set(Post.objects.visible_to(user).values_list("id", flat=True))

    def test_anonymous_only_sees_public_posts(self):
        from django.contrib.auth.models import AnonymousUser

        self.assertEqual(self.ids_visible_to(AnonymousUser()), {self.public.id})

    def test_follower_sees_public_and_followers_posts(self):
        self.assertEqual(
            self.ids_visible_to(self.follower),
            {self.public.id, self.followers.id},
        )

    def test_author_sees_all_own_posts(self):
        self.assertEqual(
            self.ids_visible_to(self.author),
            {self.public.id, self.followers.id, self.private.id},
        )

    def test_block_hides_all_posts_in_both_directions(self):
        UserBlock.objects.create(blocker=self.stranger, blocked=self.author)
        self.assertEqual(self.ids_visible_to(self.stranger), set())

        stranger_post = Post.objects.create(user=self.stranger, visibility="public")
        self.assertNotIn(stranger_post.id, self.ids_visible_to(self.author))
