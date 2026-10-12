from django.contrib.admin.models import LogEntry
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APITestCase
from posts.models import Post, PostBookmark, PostComment, PostReport, CommentReport
from users.models import UserBlock, UserReport

User = get_user_model()


@override_settings(TATZO_RATE_LIMIT_ENABLED=False)
class AccountToolsTests(APITestCase):
    def setUp(self):
        self.viewer = User.objects.create_user('viewer', is_active=True)
        self.author = User.objects.create_user('author', is_active=True)
        self.staff = User.objects.create_user('moderator', is_active=True, is_staff=True)
        self.admin = User.objects.create_superuser('admin', 'admin@example.test', 'test-only-password')
        for user in (self.viewer, self.author, self.staff, self.admin):
            user.profile.is_email_verified = True
            user.profile.save(update_fields=['is_email_verified'])
        self.post = Post.objects.create(user=self.author, content='Reported post', visibility='public')
        self.report = PostReport.objects.create(post=self.post, user=self.viewer, reason='spam')
        self.client.force_authenticate(self.viewer)

    def test_bookmarks_are_private_and_recheck_post_visibility(self):
        hidden = Post.objects.create(user=self.author, content='private', visibility='private')
        PostBookmark.objects.create(user=self.viewer, post=self.post)
        PostBookmark.objects.create(user=self.viewer, post=hidden)
        url = reverse('mobile_api:bookmarks')
        self.assertEqual([post['id'] for post in self.client.get(url).data['results']], [self.post.pk])
        UserBlock.objects.create(blocker=self.author, blocked=self.viewer)
        self.assertEqual(self.client.get(url).data['results'], [])
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.get(url).data['results'], [])
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(url).status_code, 401)

    def test_bookmarks_page_without_duplicates(self):
        for i in range(15):
            post = Post.objects.create(user=self.author, content=str(i))
            PostBookmark.objects.create(user=self.viewer, post=post)
        url = reverse('mobile_api:bookmarks')
        first = self.client.get(url).data
        second = self.client.get(url, {'cursor': first['next_cursor']}).data
        self.assertEqual(len(first['results']) + len(second['results']), 15)
        self.assertFalse(set(item['id'] for item in first['results']) & set(item['id'] for item in second['results']))

    def test_support_validates_and_uses_authenticated_author(self):
        url = reverse('mobile_api:support_report')
        self.assertEqual(self.client.post(url, {'title': '', 'message': ''}).status_code, 400)
        self.assertEqual(self.client.post(url, {'title': 'x'*121, 'message': 'text'}).status_code, 400)
        response = self.client.post(url, {'title': 'Map issue', 'message': 'Details', 'report_type': 'bug', 'user': self.admin.pk, 'is_resolved': True})
        self.assertEqual(response.status_code, 201)
        report = UserReport.objects.get(pk=response.data['id'])
        self.assertEqual(report.user, self.viewer)
        self.assertFalse(report.is_resolved)

    def test_moderation_requires_staff_and_model_permissions(self):
        overview = reverse('mobile_api:moderation_overview')
        queue = reverse('mobile_api:moderation_queue', args=['posts'])
        action = reverse('mobile_api:moderation_action', args=['posts', self.report.pk])
        for url in (overview, queue):
            self.assertEqual(self.client.get(url).status_code, 403)
        self.assertEqual(self.client.post(action, {'action': 'resolve'}).status_code, 403)
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.get(overview).data['counts'], {})
        self.assertEqual(self.client.get(queue).status_code, 403)
        self.staff.user_permissions.add(Permission.objects.get(codename='view_postreport'))
        self.staff = User.objects.get(pk=self.staff.pk)
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.get(queue).status_code, 200)
        self.assertEqual(self.client.post(action, {'action': 'resolve'}).status_code, 403)
        self.assertEqual(self.client.post(action, {'action': 'delete'}).status_code, 403)
        self.assertTrue(Post.objects.filter(pk=self.post.pk).exists())

    def test_resolve_and_delete_are_audited_and_validate_actions(self):
        self.client.force_authenticate(self.admin)
        action = reverse('mobile_api:moderation_action', args=['posts', self.report.pk])
        self.assertEqual(self.client.post(action, {'action': 'approve'}).status_code, 400)
        self.assertEqual(self.client.post(action, {'action': 'resolve'}).status_code, 200)
        self.report.refresh_from_db()
        self.assertTrue(self.report.is_resolved)
        self.assertIsNotNone(self.report.resolved_at)
        self.assertTrue(LogEntry.objects.filter(user=self.admin, action_flag=2).exists())
        comment = PostComment.objects.create(post=self.post, user=self.author, content='Comment')
        report = CommentReport.objects.create(comment=comment, user=self.viewer)
        action = reverse('mobile_api:moderation_action', args=['comments', report.pk])
        self.assertEqual(self.client.post(action, {'action': 'delete'}).status_code, 200)
        self.assertFalse(PostComment.objects.filter(pk=comment.pk).exists())
        self.assertTrue(LogEntry.objects.filter(user=self.admin, action_flag=3).exists())

    def test_support_queue_resolves_without_disclosing_private_attachment(self):
        report = UserReport.objects.create(user=self.viewer, title='Help', message='Description', attachment='private/test.png')
        self.client.force_authenticate(self.admin)
        queue = self.client.get(reverse('mobile_api:moderation_queue', args=['support']))
        self.assertEqual(queue.status_code, 200)
        self.assertNotIn('attachment', queue.data['results'][0])
        action = reverse('mobile_api:moderation_action', args=['support', report.pk])
        self.assertEqual(self.client.post(action, {'action': 'delete'}).status_code, 403)
        self.assertEqual(self.client.post(action, {'action': 'resolve'}).status_code, 200)
        report.refresh_from_db()
        self.assertTrue(report.is_resolved)
