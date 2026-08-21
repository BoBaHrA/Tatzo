from datetime import time, timedelta

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from appointments.models import Appointment, ArtistAvailability, ArtistBookingSettings
from health_safety.models import (
    AppointmentHealthDeclaration,
    HealthSafetyCard,
    HealthSafetyShare,
    HealthSafetyShareIntent,
)

User = get_user_model()


@override_settings(TATZO_RATE_LIMIT_ENABLED=False)
class MobileHealthSafetyTests(APITestCase):
    def setUp(self):
        self.client_user = self.create_user("mobile-health-client")
        self.artist = self.create_user("mobile-health-artist", artist=True)
        self.outsider = self.create_user("mobile-health-outsider")
        self.booking_date = timezone.localdate() + timedelta(days=14)
        self.booking_settings = ArtistBookingSettings.objects.update_or_create(
            artist=self.artist,
            defaults={
                "minimum_notice_hours": 0,
                "maximum_booking_window_days": 90,
                "maximum_session_hours": 8,
                "active_styles": ["Blackwork"],
                "booking_workflow": "manual",
            },
        )[0]
        ArtistAvailability.objects.update_or_create(
            artist=self.artist,
            weekday=(self.booking_date.weekday() + 1) % 7,
            defaults={
                "is_closed": False,
                "open_time": time(9),
                "close_time": time(18),
            },
        )
        self.client.force_authenticate(self.client_user)

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

    @property
    def card_url(self):
        return reverse("mobile_api:my_health_safety")

    @property
    def booking_url(self):
        return reverse(
            "mobile_api:appointment_booking",
            args=[self.artist.username],
        )

    def card_payload(self, **changes):
        return {
            "explicit_storage_consent": True,
            "bleeding_clotting_condition": False,
            "blood_thinning_medication": True,
            "diabetes_or_blood_sugar_condition": False,
            "relevant_skin_condition": True,
            "relevant_allergy_sensitivity": False,
            "immune_or_healing_condition": False,
            "other_relevant_information": "Private safety note",
            **changes,
        }

    def booking_payload(self, **changes):
        return {
            "booking_type": Appointment.TYPE_TATTOO,
            "date": self.booking_date.isoformat(),
            "start_time": "09:00",
            "session_length_minutes": 120,
            "styles": ["Blackwork"],
            "placements": ["Left arm"],
            "size": "A5",
            "budget": "€300–600",
            "description": "Health-safe tattoo booking",
            **changes,
        }

    def appointment(self, **changes):
        values = {
            "client": self.client_user,
            "artist": self.artist,
            "booking_type": Appointment.TYPE_TATTOO,
            "date": self.booking_date,
            "start_time": time(14),
            "end_time": time(16),
            "session_length_minutes": 120,
            "status": Appointment.STATUS_ACCEPTED,
        }
        values.update(changes)
        return Appointment.objects.create(**values)

    def test_card_requires_authentication_and_explicit_consent(self):
        self.client.force_authenticate(user=None)
        self.assertEqual(
            self.client.get(self.card_url).status_code,
            status.HTTP_401_UNAUTHORIZED,
        )

        self.client.force_authenticate(self.client_user)
        missing_consent = self.client.put(
            self.card_url,
            self.card_payload(explicit_storage_consent=False),
            format="json",
        )
        self.assertEqual(missing_consent.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(missing_consent.data["code"], "health_consent_required")
        self.assertFalse(HealthSafetyCard.objects.exists())

    def test_owner_can_create_read_update_and_delete_private_card(self):
        created = self.client.put(self.card_url, self.card_payload(), format="json")
        self.assertEqual(created.status_code, status.HTTP_200_OK)
        self.assertEqual(created["Cache-Control"], "private, no-store")
        self.assertTrue(created.data["has_card"])
        self.assertTrue(created.data["values"]["blood_thinning_medication"])
        self.assertEqual(
            created.data["other_relevant_information"],
            "Private safety note",
        )
        self.assertEqual(len(created.data["fields"]), 6)

        updated = self.client.put(
            self.card_url,
            self.card_payload(
                blood_thinning_medication=False,
                other_relevant_information="Updated private note",
            ),
            format="json",
        )
        self.assertFalse(updated.data["values"]["blood_thinning_medication"])
        self.assertEqual(
            HealthSafetyCard.objects.get().other_relevant_information,
            "Updated private note",
        )

        deleted = self.client.delete(self.card_url)
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(HealthSafetyCard.objects.exists())

    def test_artist_sees_only_health_data_explicitly_shared_for_appointment(self):
        self.client.put(self.card_url, self.card_payload(), format="json")
        appointment = self.appointment()
        context_url = reverse(
            "mobile_api:appointment_health_safety",
            args=[appointment.pk],
        )

        self.client.force_authenticate(self.artist)
        unshared = self.client.get(context_url)
        self.assertEqual(unshared.status_code, status.HTTP_200_OK)
        self.assertFalse(unshared.data["active"])
        self.assertEqual(unshared.data["items"], [])
        self.assertNotIn("Private safety note", str(unshared.data))

        self.client.force_authenticate(self.client_user)
        shared = self.client.post(context_url, {"mode": "card"}, format="json")
        self.assertEqual(shared.status_code, status.HTTP_200_OK)
        self.assertTrue(shared.data["active"])

        self.client.force_authenticate(self.artist)
        disclosed = self.client.get(context_url)
        self.assertTrue(disclosed.data["active"])
        self.assertEqual(disclosed.data["source"], "card")
        self.assertIn("Private safety note", disclosed.data["other"])
        self.assertEqual(len(disclosed.data["items"]), 2)

        self.client.force_authenticate(self.outsider)
        self.assertEqual(
            self.client.get(context_url).status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_client_can_revoke_appointment_health_access(self):
        card = HealthSafetyCard.objects.create(
            user=self.client_user,
            explicit_storage_consent=True,
            consented_at=timezone.now(),
            relevant_skin_condition=True,
        )
        appointment = self.appointment()
        share = HealthSafetyShare.objects.create(appointment=appointment, card=card)
        context_url = reverse(
            "mobile_api:appointment_health_safety",
            args=[appointment.pk],
        )

        revoked = self.client.delete(context_url)
        self.assertEqual(revoked.status_code, status.HTTP_204_NO_CONTENT)
        share.refresh_from_db()
        self.assertIsNotNone(share.revoked_at)

        self.client.force_authenticate(self.artist)
        self.assertFalse(self.client.get(context_url).data["active"])

    def test_quick_declaration_requires_consent_and_non_conflicting_answer(self):
        appointment = self.appointment()
        context_url = reverse(
            "mobile_api:appointment_health_safety",
            args=[appointment.pk],
        )
        missing_consent = self.client.post(
            context_url,
            {"mode": "quick", "relevant_skin_condition": True},
            format="json",
        )
        self.assertEqual(missing_consent.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            missing_consent.data["code"],
            "health_share_consent_required",
        )

        conflicting = self.client.post(
            context_url,
            {
                "mode": "quick",
                "share_consent": True,
                "relevant_skin_condition": True,
                "confirmed_none": True,
            },
            format="json",
        )
        self.assertEqual(conflicting.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            conflicting.data["code"],
            "conflicting_health_declaration",
        )
        self.assertFalse(AppointmentHealthDeclaration.objects.exists())

    def test_quick_declaration_can_be_saved_to_card_and_read_by_artist(self):
        appointment = self.appointment()
        context_url = reverse(
            "mobile_api:appointment_health_safety",
            args=[appointment.pk],
        )
        response = self.client.post(
            context_url,
            {
                "mode": "quick",
                "share_consent": True,
                "save_to_card": True,
                "relevant_allergy_sensitivity": True,
                "other_relevant_information": "Sensitive to a tattoo product",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["source"], "quick")
        self.assertTrue(HealthSafetyCard.objects.get().relevant_allergy_sensitivity)

        self.client.force_authenticate(self.artist)
        artist_context = self.client.get(context_url)
        self.assertTrue(artist_context.data["active"])
        self.assertIn("Sensitive to a tattoo product", artist_context.data["other"])

    def test_cancelled_and_expired_appointments_hide_shared_health_data(self):
        card = HealthSafetyCard.objects.create(
            user=self.client_user,
            explicit_storage_consent=True,
            consented_at=timezone.now(),
            other_relevant_information="Never leak when inactive",
        )
        cancelled = self.appointment(status=Appointment.STATUS_CANCELLED)
        expired = self.appointment(
            date=timezone.localdate() - timedelta(days=61),
            start_time=time(10),
            end_time=time(12),
        )
        HealthSafetyShare.objects.create(appointment=cancelled, card=card)
        HealthSafetyShare.objects.create(appointment=expired, card=card)

        self.client.force_authenticate(self.artist)
        for appointment in (cancelled, expired):
            response = self.client.get(
                reverse(
                    "mobile_api:appointment_health_safety",
                    args=[appointment.pk],
                )
            )
            self.assertFalse(response.data["active"])
            self.assertNotIn("Never leak when inactive", str(response.data))

    def test_booking_config_and_saved_card_sharing_are_native(self):
        config = self.client.get(self.booking_url)
        self.assertEqual(config.status_code, status.HTTP_200_OK)
        self.assertFalse(config.data["health_safety"]["has_card"])
        self.assertEqual(len(config.data["health_safety"]["fields"]), 6)

        missing_card = self.client.post(
            self.booking_url,
            self.booking_payload(health_mode="card"),
            format="json",
        )
        self.assertEqual(missing_card.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(missing_card.data["code"], "health_card_required")

        self.client.put(self.card_url, self.card_payload(), format="json")
        created = self.client.post(
            self.booking_url,
            self.booking_payload(health_mode="card"),
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        appointment = Appointment.objects.get(pk=created.data["id"])
        self.assertTrue(
            HealthSafetyShare.objects.filter(appointment=appointment).exists()
        )

    def test_booking_quick_declaration_is_attached_atomically(self):
        created = self.client.post(
            self.booking_url,
            self.booking_payload(
                health_mode="quick",
                health_share_consent=True,
                relevant_skin_condition=True,
                health_other_relevant_information="Sensitive placement",
            ),
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        appointment = Appointment.objects.get(pk=created.data["id"])
        declaration = AppointmentHealthDeclaration.objects.get(appointment=appointment)
        self.assertTrue(declaration.relevant_skin_condition)
        self.assertEqual(
            declaration.other_relevant_information,
            "Sensitive placement",
        )

    def test_native_none_choice_cannot_consume_a_stale_web_share_intent(self):
        HealthSafetyShareIntent.objects.create(
            client=self.client_user,
            artist=self.artist,
            appointment_date=self.booking_date,
            start_time=time(9),
            source=HealthSafetyShareIntent.SOURCE_QUICK,
            relevant_skin_condition=True,
        )

        created = self.client.post(
            self.booking_url,
            self.booking_payload(health_mode="none"),
            format="json",
        )

        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        appointment = Appointment.objects.get(pk=created.data["id"])
        self.assertFalse(
            AppointmentHealthDeclaration.objects.filter(
                appointment=appointment
            ).exists()
        )
        self.assertFalse(
            HealthSafetyShare.objects.filter(appointment=appointment).exists()
        )
        self.assertFalse(HealthSafetyShareIntent.objects.exists())
