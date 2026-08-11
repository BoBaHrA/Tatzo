import tempfile
from datetime import time, timedelta

from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from appointments.models import Appointment
from posts.models import Post, PostMedia
from users.models import ChatThread

from .models import HealingJourney


@override_settings(
    MEDIA_ROOT=tempfile.mkdtemp(),
    STORAGES={
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
        "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
    },
)
class HealingIntegrationTests(TestCase):
    def setUp(self):
        self.client_user = User.objects.create_user(username="healing-client", password="password123")
        self.artist = User.objects.create_user(username="healing-artist", password="password123")
        self.thread = ChatThread.get_or_create_for_users(self.client_user, self.artist)

    def _appointment(self, *, status, date=None):
        return Appointment.objects.create(
            client=self.client_user,
            artist=self.artist,
            booking_type=Appointment.TYPE_TATTOO,
            date=date or timezone.localdate(),
            start_time=time(14, 0),
            status=status,
            styles=["Fine Line"],
            placement="Left forearm",
        )

    def test_completed_tattoo_automatically_creates_healing_journey(self):
        appointment = self._appointment(status=Appointment.STATUS_COMPLETED)
        journey = HealingJourney.objects.get(appointment=appointment)
        self.assertEqual(journey.client, self.client_user)
        self.assertEqual(journey.artist, self.artist)
        self.assertIn("Fine Line", journey.title)

    def test_chat_context_switches_from_session_to_healing(self):
        appointment = self._appointment(
            status=Appointment.STATUS_ACCEPTED,
            date=timezone.localdate() + timedelta(days=2),
        )
        self.client.force_login(self.client_user)
        url = reverse("healing:chat_session_context", kwargs={"thread_id": self.thread.pk})

        before = self.client.get(url).json()["context"]
        self.assertEqual(before["mode"], "appointment")
        self.assertEqual(before["url"], reverse("appointment_detail", kwargs={"appointment_id": appointment.pk}))

        appointment.status = Appointment.STATUS_COMPLETED
        appointment.date = timezone.localdate() - timedelta(days=7)
        appointment.save(update_fields=("status", "date"))

        journey = HealingJourney.objects.get(appointment=appointment)
        after = self.client.get(url).json()["context"]
        self.assertEqual(after["mode"], "healing")
        self.assertIn(str(journey.pk), after["url"])

    def test_chat_context_is_private_to_thread_participants(self):
        self._appointment(status=Appointment.STATUS_ACCEPTED)
        outsider = User.objects.create_user(username="healing-outsider", password="password123")
        self.client.force_login(outsider)
        response = self.client.get(
            reverse("healing:chat_session_context", kwargs={"thread_id": self.thread.pk})
        )
        self.assertEqual(response.status_code, 404)

    def test_community_context_uses_visible_public_image_posts(self):
        appointment = self._appointment(status=Appointment.STATUS_COMPLETED)
        journey = HealingJourney.objects.get(appointment=appointment)
        community_artist = User.objects.create_user(username="community-artist", password="password123")
        community_artist.profile.account_type = "tattoo_artist"
        community_artist.profile.save(update_fields=("account_type",))
        post = Post.objects.create(
            user=community_artist,
            content="Fine Line healing story",
            visibility="public",
        )
        PostMedia.objects.create(
            post=post,
            media_type=PostMedia.IMAGE,
            file=SimpleUploadedFile("community.jpg", b"community-image", content_type="image/jpeg"),
        )

        self.client.force_login(self.client_user)
        response = self.client.get(
            reverse("healing:community_context", kwargs={"journey_id": journey.pk})
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["items"][0]["label"], "@community-artist")
        self.assertEqual(payload["items"][0]["url"], reverse("profile", kwargs={"username": "community-artist"}))
