from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from users.models import UserBlock, UserFollow

from .models import CommentReport, Post, PostComment, PostReport


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


class ModerationDeletionTests(TestCase):
    def setUp(self):
        self.staff = User.objects.create_user("moderator", password="test", is_staff=True)
        self.author = User.objects.create_user("author", password="test")
        self.reporter = User.objects.create_user("reporter", password="test")
        User.objects.filter(
            pk__in=[self.staff.pk, self.author.pk, self.reporter.pk]
        ).update(is_active=True)
        self.staff.refresh_from_db()
        self.client.force_login(self.staff)

    def test_reported_post_is_deleted_without_server_error(self):
        post = Post.objects.create(user=self.author, content="reported")
        report = PostReport.objects.create(post=post, user=self.reporter)
        response = self.client.post(
            reverse("moderation_delete_reported_post", args=[report.pk])
        )
        self.assertRedirects(
            response,
            reverse("moderation_dashboard"),
            fetch_redirect_response=False,
        )
        self.assertFalse(Post.objects.filter(pk=post.pk).exists())

    def test_reported_comment_is_deleted_without_server_error(self):
        post = Post.objects.create(user=self.author, content="post")
        comment = PostComment.objects.create(
            post=post, user=self.author, content="reported"
        )
        report = CommentReport.objects.create(comment=comment, user=self.reporter)
        response = self.client.post(
            reverse("moderation_delete_reported_comment", args=[report.pk])
        )
        self.assertRedirects(
            response,
            reverse("moderation_dashboard"),
            fetch_redirect_response=False,
        )
        self.assertFalse(PostComment.objects.filter(pk=comment.pk).exists())
