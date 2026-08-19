from datetime import time, timedelta

from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from appointments.models import Appointment

from .models import (
    AppointmentHealthDeclaration,
    HealthSafetyCard,
    HealthSafetyShare,
    HealthSafetyShareIntent,
)


class HealthSafetyPrivacyTests(TestCase):
    def setUp(self):
        self.client_user = User.objects.create_user(
            username="health-client",
            password="password123",
        )
        self.artist = User.objects.create_user(
            username="health-artist",
            password="password123",
        )
        self.artist.profile.account_type = "tattoo_artist"
        self.artist.profile.status = "active"
        self.artist.profile.verification_status = "approved"
        self.artist.profile.is_email_verified = True
        self.artist.profile.save()
        self.outsider = User.objects.create_user(
            username="health-outsider",
            password="password123",
        )

    def make_card(self, **kwargs):
        defaults = {
            "explicit_storage_consent": True,
            "consent_version": HealthSafetyCard.CONSENT_VERSION,
            "consented_at": timezone.now(),
            "blood_thinning_medication": True,
            "other_relevant_information": "Relevant private note",
        }
        defaults.update(kwargs)
        return HealthSafetyCard.objects.create(user=self.client_user, **defaults)

    def make_appointment(self, **kwargs):
        defaults = {
            "client": self.client_user,
            "artist": self.artist,
            "booking_type": Appointment.TYPE_TATTOO,
            "date": timezone.localdate() + timedelta(days=7),
            "start_time": time(14, 0),
            "end_time": time(16, 0),
            "session_length_minutes": 120,
            "status": Appointment.STATUS_ACCEPTED,
        }
        defaults.update(kwargs)
        return Appointment.objects.create(**defaults)

    def test_card_requires_login(self):
        response = self.client.get(reverse("health_safety:card"))
        self.assertEqual(response.status_code, 302)
        self.assertIn("/login/", response.url)

    def test_card_is_not_saved_without_explicit_health_consent(self):
        self.client.force_login(self.client_user)
        response = self.client.post(
            reverse("health_safety:card"),
            {
                "blood_thinning_medication": "on",
                "other_relevant_information": "private",
            },
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(HealthSafetyCard.objects.filter(user=self.client_user).exists())

    def test_owner_can_save_minimal_private_card(self):
        self.client.force_login(self.client_user)
        response = self.client.post(
            reverse("health_safety:card"),
            {
                "explicit_storage_consent": "on",
                "bleeding_clotting_condition": "on",
                "relevant_skin_condition": "on",
                "other_relevant_information": "  only relevant information  ",
            },
        )
        self.assertEqual(response.status_code, 302)
        card = HealthSafetyCard.objects.get(user=self.client_user)
        self.assertTrue(card.explicit_storage_consent)
        self.assertTrue(card.bleeding_clotting_condition)
        self.assertTrue(card.relevant_skin_condition)
        self.assertEqual(card.other_relevant_information, "only relevant information")

    def test_status_endpoint_never_returns_health_details(self):
        self.make_card(other_relevant_information="do-not-leak")
        self.client.force_login(self.client_user)
        payload = self.client.get(reverse("health_safety:status")).json()
        self.assertTrue(payload["has_card"])
        serialized = str(payload)
        self.assertNotIn("do-not-leak", serialized)
        self.assertNotIn("blood_thinning_medication\': True", serialized)

    def test_client_can_share_and_artist_can_read_only_shared_card(self):
        self.make_card()
        appointment = self.make_appointment()
        self.client.force_login(self.client_user)
        share_response = self.client.post(
            reverse("health_safety:share_appointment", args=[appointment.pk])
        )
        self.assertEqual(share_response.status_code, 200)

        self.client.force_login(self.artist)
        payload = self.client.get(
            reverse("health_safety:appointment_context", args=[appointment.pk])
        ).json()
        self.assertTrue(payload["active"])
        self.assertEqual(payload["source"], "card")
        self.assertTrue(payload["items"])
        self.assertEqual(payload["other"], "Relevant private note")

    def test_artist_cannot_read_unshared_card(self):
        self.make_card(other_relevant_information="secret")
        appointment = self.make_appointment()
        self.client.force_login(self.artist)
        payload = self.client.get(
            reverse("health_safety:appointment_context", args=[appointment.pk])
        ).json()
        self.assertFalse(payload["active"])
        self.assertEqual(payload["items"], [])
        self.assertEqual(payload["other"], "")
        self.assertNotIn("secret", str(payload))

    def test_outsider_cannot_probe_appointment_health_context(self):
        card = self.make_card()
        appointment = self.make_appointment()
        HealthSafetyShare.objects.create(appointment=appointment, card=card)
        self.client.force_login(self.outsider)
        response = self.client.get(
            reverse("health_safety:appointment_context", args=[appointment.pk])
        )
        self.assertEqual(response.status_code, 404)

    def test_client_can_revoke_artist_access(self):
        card = self.make_card()
        appointment = self.make_appointment()
        share = HealthSafetyShare.objects.create(appointment=appointment, card=card)
        self.client.force_login(self.client_user)
        response = self.client.post(
            reverse("health_safety:revoke_share", args=[appointment.pk])
        )
        self.assertEqual(response.status_code, 200)
        share.refresh_from_db()
        self.assertIsNotNone(share.revoked_at)

        self.client.force_login(self.artist)
        payload = self.client.get(
            reverse("health_safety:appointment_context", args=[appointment.pk])
        ).json()
        self.assertFalse(payload["active"])
        self.assertEqual(payload["items"], [])

    def test_cancelled_and_expired_appointments_do_not_disclose_health_data(self):
        card = self.make_card()
        cancelled = self.make_appointment(status=Appointment.STATUS_CANCELLED)
        HealthSafetyShare.objects.create(appointment=cancelled, card=card)

        expired = self.make_appointment(
            date=timezone.localdate() - timedelta(days=61),
            start_time=time(10, 0),
            end_time=time(12, 0),
        )
        HealthSafetyShare.objects.create(appointment=expired, card=card)

        self.client.force_login(self.artist)
        for appointment in (cancelled, expired):
            payload = self.client.get(
                reverse("health_safety:appointment_context", args=[appointment.pk])
            ).json()
            self.assertFalse(payload["active"])
            self.assertEqual(payload["items"], [])
            self.assertEqual(payload["other"], "")

    def test_booking_share_intent_is_consumed_only_by_matching_tattoo_slot(self):
        self.make_card()
        appointment_date = timezone.localdate() + timedelta(days=9)
        self.client.force_login(self.client_user)
        response = self.client.post(
            reverse("health_safety:share_intent"),
            {
                "artist": self.artist.username,
                "date": appointment_date.isoformat(),
                "start_time": "13:30",
                "mode": "card",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(HealthSafetyShareIntent.objects.count(), 1)

        unrelated = self.make_appointment(
            date=appointment_date,
            start_time=time(12, 0),
            end_time=time(13, 0),
        )
        self.assertFalse(HealthSafetyShare.objects.filter(appointment=unrelated).exists())
        self.assertEqual(HealthSafetyShareIntent.objects.count(), 1)

        matching = self.make_appointment(
            date=appointment_date,
            start_time=time(13, 30),
            end_time=time(15, 30),
        )
        self.assertTrue(HealthSafetyShare.objects.filter(appointment=matching).exists())
        self.assertEqual(HealthSafetyShareIntent.objects.count(), 0)

    def test_quick_declaration_requires_explicit_share_consent(self):
        self.client.force_login(self.client_user)
        response = self.client.post(
            reverse("health_safety:share_intent"),
            {
                "artist": self.artist.username,
                "date": (timezone.localdate() + timedelta(days=5)).isoformat(),
                "start_time": "11:00",
                "mode": "quick",
                "relevant_skin_condition": "true",
            },
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(HealthSafetyShareIntent.objects.exists())

    def test_quick_declaration_is_attached_only_to_matching_appointment(self):
        appointment_date = timezone.localdate() + timedelta(days=10)
        self.client.force_login(self.client_user)
        response = self.client.post(
            reverse("health_safety:share_intent"),
            {
                "artist": self.artist.username,
                "date": appointment_date.isoformat(),
                "start_time": "15:30",
                "mode": "quick",
                "relevant_skin_condition": "true",
                "other_relevant_information": "Sensitive skin near placement",
                "share_consent": "true",
            },
        )
        self.assertEqual(response.status_code, 200)

        unrelated = self.make_appointment(
            date=appointment_date,
            start_time=time(14, 0),
            end_time=time(15, 0),
        )
        self.assertFalse(
            AppointmentHealthDeclaration.objects.filter(appointment=unrelated).exists()
        )

        matching = self.make_appointment(
            date=appointment_date,
            start_time=time(15, 30),
            end_time=time(17, 30),
        )
        declaration = AppointmentHealthDeclaration.objects.get(appointment=matching)
        self.assertTrue(declaration.relevant_skin_condition)
        self.assertEqual(declaration.other_relevant_information, "Sensitive skin near placement")

        self.client.force_login(self.artist)
        payload = self.client.get(
            reverse("health_safety:appointment_context", args=[matching.pk])
        ).json()
        self.assertTrue(payload["active"])
        self.assertEqual(payload["source"], "quick")
        self.assertIn("Sensitive skin near placement", payload["other"])

    def test_quick_declaration_can_optionally_create_saved_card(self):
        appointment_date = timezone.localdate() + timedelta(days=11)
        self.client.force_login(self.client_user)
        response = self.client.post(
            reverse("health_safety:share_intent"),
            {
                "artist": self.artist.username,
                "date": appointment_date.isoformat(),
                "start_time": "10:00",
                "mode": "quick",
                "diabetes_or_blood_sugar_condition": "true",
                "share_consent": "true",
                "save_to_card": "true",
            },
        )
        self.assertEqual(response.status_code, 200)
        appointment = self.make_appointment(
            date=appointment_date,
            start_time=time(10, 0),
            end_time=time(12, 0),
        )
        self.assertTrue(AppointmentHealthDeclaration.objects.filter(appointment=appointment).exists())
        card = HealthSafetyCard.objects.get(user=self.client_user)
        self.assertTrue(card.explicit_storage_consent)
        self.assertTrue(card.diabetes_or_blood_sugar_condition)

    def test_quick_declaration_can_be_revoked(self):
        appointment = self.make_appointment()
        declaration = AppointmentHealthDeclaration.objects.create(
            appointment=appointment,
            confirmed_none=True,
        )
        self.client.force_login(self.client_user)
        response = self.client.post(
            reverse("health_safety:revoke_share", args=[appointment.pk])
        )
        self.assertEqual(response.status_code, 200)
        declaration.refresh_from_db()
        self.assertIsNotNone(declaration.revoked_at)

        self.client.force_login(self.artist)
        payload = self.client.get(
            reverse("health_safety:appointment_context", args=[appointment.pk])
        ).json()
        self.assertFalse(payload["active"])

    def test_deleting_card_removes_all_artist_shares(self):
        card = self.make_card()
        appointment = self.make_appointment()
        HealthSafetyShare.objects.create(appointment=appointment, card=card)
        self.client.force_login(self.client_user)
        response = self.client.post(reverse("health_safety:delete_card"))
        self.assertEqual(response.status_code, 302)
        self.assertFalse(HealthSafetyCard.objects.filter(user=self.client_user).exists())
        self.assertFalse(HealthSafetyShare.objects.exists())
