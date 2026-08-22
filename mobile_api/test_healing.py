import tempfile
from datetime import time, timedelta
from io import BytesIO
from unittest.mock import patch
from urllib.parse import urlparse

from django.contrib.auth import get_user_model
from django.core import signing
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from appointments.models import Appointment
from healing.models import HealingCheckIn, HealingJourney, HealingRoutineCompletion
from mobile_api.healing_views import HEALING_MEDIA_SIGNING_SALT
from mytattooapp.storage_backends import private_media_storage

User = get_user_model()

TEST_STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}


@override_settings(
    MEDIA_ROOT=tempfile.mkdtemp(),
    STORAGES=TEST_STORAGES,
    TATZO_RATE_LIMIT_ENABLED=False,
)
class MobileHealingTests(APITestCase):
    def setUp(self):
        self.original_private_backend = private_media_storage._backend
        private_media_storage._backend = None
        self.client_user = self.create_user("mobile-healing-client")
        self.artist = self.create_user("mobile-healing-artist", artist=True)
        self.outsider = self.create_user("mobile-healing-outsider")
        self.appointment = Appointment.objects.create(
            client=self.client_user,
            artist=self.artist,
            booking_type=Appointment.TYPE_TATTOO,
            status=Appointment.STATUS_COMPLETED,
            date=timezone.localdate() - timedelta(days=6),
            start_time=time(14),
            session_length_minutes=120,
            styles=["Fine Line"],
            placement="Left forearm",
        )
        self.journey = HealingJourney.objects.get(appointment=self.appointment)
        self.client.force_authenticate(self.client_user)

    def tearDown(self):
        private_media_storage._backend = self.original_private_backend

    @staticmethod
    def create_user(username, artist=False):
        user = User.objects.create_user(
            username,
            email=f"{username}@example.com",
            password="StrongPassword123",
            is_active=True,
        )
        user.profile.is_email_verified = True
        if artist:
            user.profile.account_type = "tattoo_artist"
            user.profile.verification_status = "approved"
        user.profile.save(
            update_fields=(
                "is_email_verified",
                "account_type",
                "verification_status",
            )
        )
        return user

    @staticmethod
    def image_file(name="healing.png", color=(4, 197, 191)):
        output = BytesIO()
        Image.new("RGB", (12, 12), color).save(output, format="PNG")
        return SimpleUploadedFile(name, output.getvalue(), content_type="image/png")

    @property
    def list_url(self):
        return reverse("mobile_api:healing_list")

    @property
    def detail_url(self):
        return reverse("mobile_api:healing_detail", args=[self.journey.pk])

    @property
    def checkin_url(self):
        return reverse("mobile_api:healing_checkin", args=[self.journey.pk])

    def test_list_requires_authentication_and_is_role_aware(self):
        self.client.force_authenticate(user=None)
        self.assertEqual(
            self.client.get(self.list_url).status_code,
            status.HTTP_401_UNAUTHORIZED,
        )

        self.client.force_authenticate(self.client_user)
        client_response = self.client.get(self.list_url)
        self.assertEqual(client_response.status_code, status.HTTP_200_OK)
        self.assertEqual(client_response["Cache-Control"], "private, no-store")
        self.assertEqual(client_response.data["journeys"][0]["role"], "client")

        self.client.force_authenticate(self.artist)
        artist_response = self.client.get(self.list_url)
        self.assertEqual(artist_response.data["journeys"][0]["role"], "artist")
        self.assertEqual(
            artist_response.data["journeys"][0]["other_user"]["username"],
            self.client_user.username,
        )

    def test_detail_is_participant_only_and_contains_real_tracking_state(self):
        response = self.client.get(self.detail_url, HTTP_ACCEPT_LANGUAGE="ru")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["current_day"], 7)
        self.assertEqual(response.data["timeline"]["current"], "7")
        self.assertEqual(len(response.data["tasks"]), 4)
        self.assertEqual(len(response.data["symptom_options"]), 6)
        self.assertTrue(response.data["can_edit"])
        self.assertIn("заживление", response.data["chat_draft"].lower())

        self.client.force_authenticate(self.outsider)
        outsider_response = self.client.get(self.detail_url)
        self.assertEqual(outsider_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertNotIn("Fine Line", str(outsider_response.data))

    def test_client_can_recreate_missing_legacy_journey_idempotently(self):
        self.journey.delete()
        listed = self.client.get(self.list_url)
        self.assertEqual(len(listed.data["journeys"]), 0)
        self.assertEqual(
            listed.data["eligible_appointments"][0]["id"],
            self.appointment.pk,
        )
        start_url = reverse(
            "mobile_api:healing_appointment_start",
            args=[self.appointment.pk],
        )
        created = self.client.post(start_url, {}, format="json")
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(HealingJourney.objects.count(), 1)

        repeated = self.client.post(start_url, {}, format="json")
        self.assertEqual(repeated.status_code, status.HTTP_200_OK)
        self.assertEqual(HealingJourney.objects.count(), 1)

        self.client.force_authenticate(self.outsider)
        self.assertEqual(
            self.client.post(start_url, {}, format="json").status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_valid_photo_checkin_is_private_and_replaces_only_the_same_day(self):
        created = self.client.post(
            self.checkin_url,
            {
                "photo": self.image_file(),
                "note": "Looks calmer today",
                "symptoms": ["redness", "itching"],
            },
            format="multipart",
        )
        self.assertEqual(created.status_code, status.HTTP_200_OK)
        self.assertEqual(created["Cache-Control"], "private, no-store")
        self.assertEqual(len(created.data["checkins"]), 1)
        self.assertEqual(created.data["checkins"][0]["day_number"], 7)
        self.assertEqual(
            created.data["checkins"][0]["symptoms"],
            ["redness", "itching"],
        )

        replaced = self.client.post(
            self.checkin_url,
            {
                "photo": self.image_file("replacement.png", (238, 12, 111)),
                "note": "Replacement",
            },
            format="multipart",
        )
        self.assertEqual(replaced.status_code, status.HTTP_200_OK)
        self.assertEqual(HealingCheckIn.objects.count(), 1)
        self.assertEqual(HealingCheckIn.objects.get().note, "Replacement")

        self.client.force_authenticate(self.artist)
        artist_detail = self.client.get(self.detail_url)
        self.assertFalse(artist_detail.data["can_edit"])
        self.assertEqual(len(artist_detail.data["checkins"]), 1)

    def test_invalid_photo_and_unknown_symptoms_are_rejected_before_storage(self):
        fake_photo = SimpleUploadedFile(
            "fake.jpg",
            b"not-an-image",
            content_type="image/jpeg",
        )
        invalid_photo = self.client.post(
            self.checkin_url,
            {"photo": fake_photo},
            format="multipart",
        )
        self.assertEqual(invalid_photo.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(invalid_photo.data["code"], "invalid_healing_photo")

        invalid_symptom = self.client.post(
            self.checkin_url,
            {"photo": self.image_file(), "symptoms": ["diagnosis"]},
            format="multipart",
        )
        self.assertEqual(invalid_symptom.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(invalid_symptom.data["code"], "invalid_healing_symptoms")
        self.assertFalse(HealingCheckIn.objects.exists())

    def test_valid_photo_filename_is_normalized_to_the_verified_image_format(self):
        response = self.client.post(
            self.checkin_url,
            {"photo": self.image_file("misleading.html")},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        checkin = HealingCheckIn.objects.get()
        self.assertTrue(checkin.photo.name.endswith(".png"))
        media_url = urlparse(response.data["checkins"][0]["url"])
        media = self.client.get(f"{media_url.path}?{media_url.query}")
        self.assertEqual(media["Content-Type"], "image/png")

    def test_only_active_journey_client_can_mutate_tracking(self):
        task_url = reverse(
            "mobile_api:healing_task",
            args=[self.journey.pk, HealingRoutineCompletion.TASK_WASH],
        )
        self.client.force_authenticate(self.artist)
        self.assertEqual(
            self.client.put(task_url, {}, format="json").status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.assertEqual(
            self.client.post(
                self.checkin_url,
                {"photo": self.image_file()},
                format="multipart",
            ).status_code,
            status.HTTP_404_NOT_FOUND,
        )

        self.client.force_authenticate(self.client_user)
        marked = self.client.put(task_url, {}, format="json")
        self.assertEqual(marked.status_code, status.HTTP_200_OK)
        self.assertTrue(marked.data["completed"])
        repeated = self.client.put(task_url, {}, format="json")
        self.assertTrue(repeated.data["completed"])
        self.assertEqual(HealingRoutineCompletion.objects.count(), 1)
        removed = self.client.delete(task_url)
        self.assertFalse(removed.data["completed"])
        self.assertFalse(HealingRoutineCompletion.objects.exists())

    def test_routine_streak_requires_every_daily_task(self):
        for days_ago in (1, 0):
            for task_slug in HealingRoutineCompletion.TASK_SLUGS:
                HealingRoutineCompletion.objects.create(
                    journey=self.journey,
                    date=timezone.localdate() - timedelta(days=days_ago),
                    task_slug=task_slug,
                )
        response = self.client.get(self.detail_url)
        self.assertEqual(response.data["routine_streak"], 2)
        self.assertTrue(response.data["achievements"]["first_checkin"] is False)

    def test_mark_healed_is_idempotent_and_closes_client_writes(self):
        mark_url = reverse(
            "mobile_api:healing_mark_healed",
            args=[self.journey.pk],
        )
        marked = self.client.post(mark_url, {}, format="json")
        self.assertEqual(marked.status_code, status.HTTP_200_OK)
        self.assertEqual(marked.data["status"], HealingJourney.STATUS_HEALED)
        self.assertFalse(marked.data["can_edit"])
        self.assertTrue(marked.data["achievements"]["fully_healed"])

        repeated = self.client.post(mark_url, {}, format="json")
        self.assertEqual(repeated.status_code, status.HTTP_200_OK)
        self.assertEqual(repeated.data["healed_on"], marked.data["healed_on"])

        closed_upload = self.client.post(
            self.checkin_url,
            {"photo": self.image_file()},
            format="multipart",
        )
        self.assertEqual(closed_upload.status_code, status.HTTP_404_NOT_FOUND)

    def test_signed_checkin_media_is_short_lived_and_never_cacheable(self):
        checkin = HealingCheckIn.objects.create(
            journey=self.journey,
            day_number=7,
            photo=self.image_file(),
        )
        detail = self.client.get(self.detail_url)
        signed_url = urlparse(detail.data["checkins"][0]["url"])
        media = self.client.get(f"{signed_url.path}?{signed_url.query}")
        self.assertEqual(media.status_code, status.HTTP_200_OK)
        self.assertEqual(media["Cache-Control"], "private, no-store")
        self.assertEqual(media["X-Content-Type-Options"], "nosniff")

        self.assertEqual(
            self.client.get(f"{signed_url.path}?{signed_url.query}x").status_code,
            status.HTTP_404_NOT_FOUND,
        )
        outsider_token = signing.dumps(
            {"checkin_id": checkin.pk, "user_id": self.outsider.pk},
            salt=HEALING_MEDIA_SIGNING_SALT,
            compress=True,
        )
        self.assertEqual(
            self.client.get(f"{signed_url.path}?token={outsider_token}").status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_storage_failure_preserves_existing_same_day_checkin(self):
        existing = HealingCheckIn.objects.create(
            journey=self.journey,
            day_number=7,
            photo=self.image_file("existing.png"),
            note="Keep me",
        )
        original_name = existing.photo.name
        with patch(
            "mobile_api.healing_views.HealingCheckIn.save",
            side_effect=RuntimeError("storage unavailable"),
        ):
            response = self.client.post(
                self.checkin_url,
                {"photo": self.image_file("failed.png")},
                format="multipart",
            )
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        existing.refresh_from_db()
        self.assertEqual(existing.photo.name, original_name)
        self.assertEqual(existing.note, "Keep me")

    def test_completed_appointment_payload_links_to_healing(self):
        appointment_url = reverse(
            "mobile_api:appointment_detail",
            args=[self.appointment.pk],
        )
        response = self.client.get(appointment_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["healing_journey"]["id"],
            str(self.journey.pk),
        )
        self.assertEqual(response.data["healing_journey"]["current_day"], 7)
