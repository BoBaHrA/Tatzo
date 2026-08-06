import tempfile
from datetime import time

from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from appointments.models import Appointment
from users.models import ChatThread

from .models import HealingCheckIn, HealingJourney, HealingRoutineCompletion


TEST_STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}


@override_settings(MEDIA_ROOT=tempfile.mkdtemp(), STORAGES=TEST_STORAGES)
class HealingFoundationTests(TestCase):
    def setUp(self):
        self.client_user = User.objects.create_user(username="client", password="password123")
        self.artist = User.objects.create_user(username="artist", password="password123")
        self.appointment = Appointment.objects.create(
            client=self.client_user,
            artist=self.artist,
            booking_type=Appointment.TYPE_TATTOO,
            date=timezone.localdate(),
            start_time=time(12, 0),
            status=Appointment.STATUS_COMPLETED,
            styles=["Fine Line"],
            placement="Left forearm",
        )
        self.journey = HealingJourney.objects.get(appointment=self.appointment)

    def test_client_can_start_real_journey_from_completed_tattoo(self):
        self.client.force_login(self.client_user)
        response = self.client.post(
            reverse("healing:start_journey", kwargs={"appointment_id": self.appointment.pk})
        )
        journey = HealingJourney.objects.get(appointment=self.appointment)
        self.assertRedirects(
            response,
            f"{reverse('healing:dashboard')}?journey={journey.pk}",
            fetch_redirect_response=False,
        )
        self.assertEqual(journey.client, self.client_user)
        self.assertEqual(journey.artist, self.artist)

    def test_other_user_cannot_start_journey(self):
        outsider = User.objects.create_user(username="outsider", password="password123")
        self.client.force_login(outsider)
        response = self.client.post(
            reverse("healing:start_journey", kwargs={"appointment_id": self.appointment.pk})
        )
        self.assertEqual(response.status_code, 404)

    def test_daily_task_is_toggled_and_scoped_to_client(self):
        self.client.force_login(self.client_user)
        url = reverse(
            "healing:toggle_task",
            kwargs={
                "journey_id": self.journey.pk,
                "task_slug": HealingRoutineCompletion.TASK_WASH,
            },
        )
        response = self.client.post(url)
        self.assertTrue(response.json()["completed"])
        self.assertTrue(
            HealingRoutineCompletion.objects.filter(
                journey=self.journey,
                task_slug=HealingRoutineCompletion.TASK_WASH,
            ).exists()
        )
        response = self.client.post(url)
        self.assertFalse(response.json()["completed"])

    def test_private_checkin_photo_is_visible_only_to_participants(self):
        checkin = HealingCheckIn.objects.create(
            journey=self.journey,
            day_number=1,
            photo=SimpleUploadedFile(
                "checkin.png",
                b"\x89PNG\r\n\x1a\nprivate-healing-photo",
                content_type="image/png",
            ),
        )
        url = reverse("healing:checkin_media", kwargs={"checkin_id": checkin.pk})
        self.client.force_login(self.artist)
        self.assertEqual(self.client.get(url).status_code, 200)

        outsider = User.objects.create_user(username="outsider-photo", password="password123")
        self.client.force_login(outsider)
        self.assertEqual(self.client.get(url).status_code, 404)

    def test_chat_link_uses_existing_chat_core_and_returns_context_draft(self):
        self.client.force_login(self.client_user)
        response = self.client.get(
            reverse("healing:open_chat", kwargs={"journey_id": self.journey.pk})
        )
        thread = ChatThread.objects.get()
        self.assertIn(reverse("chat_thread", kwargs={"thread_id": thread.pk}), response.url)
        self.assertIn(str(self.journey.pk), response.url)

        draft = self.client.get(
            reverse("healing:chat_draft", kwargs={"journey_id": self.journey.pk})
        ).json()
        self.assertIn("Fine Line", draft["draft"])

    def test_dashboard_contains_no_fake_ai_assistant(self):
        self.client.force_login(self.client_user)
        response = self.client.get(
            f"{reverse('healing:dashboard')}?journey={self.journey.pk}"
        )
        self.assertEqual(response.status_code, 200)
        self.assertNotContains(response, "Healing Assistant")
        self.assertNotContains(response, "confidence")
