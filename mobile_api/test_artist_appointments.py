from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from appointments.models import (
    Appointment,
    ArtistAvailability,
    ArtistBookingSettings,
    ArtistTimeOff,
    CalendarEvent,
    CalendarRescheduleRequest,
)
from users.models import Notification, UserBlock

User = get_user_model()


class MobileArtistAppointmentTests(APITestCase):
    def setUp(self):
        self.artist = self.create_user("manual-artist", artist=True)
        self.client_user = self.create_user("manual-client")
        self.other_artist = self.create_user("manual-other-artist", artist=True)
        self.settings = ArtistBookingSettings.objects.update_or_create(
            artist=self.artist,
            defaults={
                "minimum_notice_hours": 24,
                "maximum_booking_window_days": 30,
                "slot_step_minutes": 30,
                "default_session_minutes": 120,
                "maximum_session_hours": 6,
                "active_styles": ["Blackwork", "Fine Line"],
            },
        )[0]
        self.artist_tz = ZoneInfo("Europe/Paris")
        self.today = timezone.localdate(timezone=self.artist_tz)
        self.client.force_authenticate(self.artist)

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
            user.profile.timezone = "Europe/Paris"
        user.profile.save(
            update_fields=(
                "is_email_verified",
                "account_type",
                "verification_status",
                "timezone",
            )
        )
        return user

    def open_date(self, date_value, start=time(9), end=time(18)):
        weekday = (date_value.weekday() + 1) % 7
        return ArtistAvailability.objects.update_or_create(
            artist=self.artist,
            weekday=weekday,
            defaults={
                "is_closed": False,
                "open_time": start,
                "close_time": end,
                "break_start": None,
                "break_end": None,
            },
        )[0]

    def appointment(
        self,
        *,
        date_value,
        start=time(10),
        end=time(12),
        artist=None,
        client=None,
        status_value=Appointment.STATUS_ACCEPTED,
    ):
        return Appointment.objects.create(
            artist=artist or self.artist,
            client=client or self.client_user,
            booking_type=Appointment.TYPE_TATTOO,
            status=status_value,
            date=date_value,
            start_time=start,
            end_time=end,
            session_length_minutes=int(
                (
                    datetime.combine(date_value, end)
                    - datetime.combine(date_value, start)
                ).total_seconds()
                // 60
            ),
        )

    def manual_payload(self, date_value, **overrides):
        payload = {
            "client_username": self.client_user.username,
            "booking_type": Appointment.TYPE_TATTOO,
            "date": date_value.isoformat(),
            "start_time": "10:00",
            "session_length_minutes": 120,
            "styles": ["Blackwork"],
            "placements": ["Left arm"],
            "size": "A5",
            "budget": "€300–600",
            "description": "Sleeve planning session",
        }
        payload.update(overrides)
        return payload

    def test_config_requires_verified_artist_and_is_private(self):
        url = reverse("mobile_api:artist_appointment_list")
        self.client.force_authenticate(user=None)
        anonymous = self.client.get(url)
        self.assertEqual(anonymous.status_code, status.HTTP_401_UNAUTHORIZED)

        self.client.force_authenticate(self.client_user)
        regular = self.client.get(url)
        self.assertEqual(regular.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.artist)
        date_value = self.today + timedelta(days=4)
        self.open_date(date_value)
        response = self.client.get(url, HTTP_ACCEPT_LANGUAGE="ru")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Cache-Control"], "private, no-store")
        self.assertEqual(response.data["artist_timezone"], "Europe/Paris")
        self.assertEqual(
            response.data["settings"]["maximum_booking_window_days"],
            365,
        )
        self.assertEqual(response.data["duration_step_minutes"], 15)
        self.assertIn(Appointment.TYPE_TATTOO, response.data["booking_types"])
        self.assertEqual(
            response.data["schedule"][str((date_value.weekday() + 1) % 7)]["open"],
            "09:00",
        )

    def test_artist_creates_accepted_appointment_and_notifies_client(self):
        date_value = self.today + timedelta(days=6)
        self.open_date(date_value)
        response = self.client.post(
            reverse("mobile_api:artist_appointment_list"),
            self.manual_payload(date_value),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response["Cache-Control"], "private, no-store")
        appointment = Appointment.objects.get(pk=response.data["id"])
        self.assertEqual(appointment.artist, self.artist)
        self.assertEqual(appointment.client, self.client_user)
        self.assertEqual(appointment.status, Appointment.STATUS_ACCEPTED)
        self.assertEqual(appointment.end_time, time(12))
        self.assertEqual(appointment.styles, ["Blackwork"])
        self.assertEqual(appointment.placement, "Left arm")
        self.assertEqual(appointment.responded_at is not None, True)
        notification = Notification.objects.get(appointment=appointment)
        self.assertEqual(notification.recipient, self.client_user)
        self.assertEqual(notification.actor, self.artist)
        self.assertEqual(notification.kind, Notification.KIND_BOOKING_UPDATE)
        self.assertEqual(
            notification.dedupe_key, f"appointment:{appointment.pk}:artist-created"
        )

        self.client.force_authenticate(self.client_user)
        listed = self.client.get(reverse("mobile_api:appointment_list"))
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertEqual(listed.data["results"][0]["id"], appointment.pk)
        self.assertEqual(listed.data["results"][0]["role"], "client")

    def test_manual_creation_rejects_hidden_client_and_conflicting_slot(self):
        date_value = self.today + timedelta(days=8)
        self.open_date(date_value)
        UserBlock.objects.create(blocker=self.client_user, blocked=self.artist)
        hidden = self.client.post(
            reverse("mobile_api:artist_appointment_list"),
            self.manual_payload(date_value),
            format="json",
        )
        self.assertEqual(hidden.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(Appointment.objects.exists())

        UserBlock.objects.all().delete()
        self.appointment(date_value=date_value, start=time(10), end=time(12))
        conflict = self.client.post(
            reverse("mobile_api:artist_appointment_list"),
            self.manual_payload(
                date_value,
                start_time="11:00",
                session_length_minutes=60,
            ),
            format="json",
        )
        self.assertEqual(conflict.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(conflict.data["code"], "slot_unavailable")
        self.assertEqual(Appointment.objects.count(), 1)

    def test_manual_creation_rejects_bad_duration_and_time_off(self):
        date_value = self.today + timedelta(days=10)
        self.open_date(date_value)
        bad_duration = self.client.post(
            reverse("mobile_api:artist_appointment_list"),
            self.manual_payload(date_value, session_length_minutes=20),
            format="json",
        )
        self.assertEqual(bad_duration.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(bad_duration.data["code"], "invalid_duration")

        ArtistTimeOff.objects.create(
            artist=self.artist,
            date=date_value,
            reason="Convention",
        )
        blocked = self.client.post(
            reverse("mobile_api:artist_appointment_list"),
            self.manual_payload(date_value),
            format="json",
        )
        self.assertEqual(blocked.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(blocked.data["code"], "date_blocked")
        self.assertFalse(Appointment.objects.exists())

    def test_artist_reschedules_and_syncs_linked_calendar_event(self):
        old_date = self.today + timedelta(days=12)
        new_date = self.today + timedelta(days=13)
        self.open_date(old_date)
        self.open_date(new_date)
        appointment = self.appointment(date_value=old_date)
        starts_at = timezone.make_aware(
            datetime.combine(old_date, time(10)),
            self.artist_tz,
        )
        event = CalendarEvent.objects.create(
            artist=self.artist,
            client=self.client_user,
            project=appointment,
            event_type=CalendarEvent.TYPE_TATTOO_SESSION,
            status=CalendarEvent.STATUS_RESCHEDULE_REQUESTED,
            title="Tattoo session",
            starts_at=starts_at,
            ends_at=starts_at + timedelta(hours=2),
        )
        reschedule_request = CalendarRescheduleRequest.objects.create(
            event=event,
            requested_by=self.client_user,
            proposed_start=timezone.make_aware(
                datetime.combine(new_date, time(13)),
                self.artist_tz,
            ),
            proposed_end=timezone.make_aware(
                datetime.combine(new_date, time(15)),
                self.artist_tz,
            ),
        )
        Notification.objects.all().delete()

        config = self.client.get(
            reverse("mobile_api:artist_appointment_list"),
            {"exclude_appointment_id": appointment.pk},
        )
        self.assertEqual(config.status_code, status.HTTP_200_OK)
        self.assertEqual(
            config.data["booked_minutes_by_date"].get(old_date.isoformat(), 0),
            0,
        )
        self.assertFalse(
            any(
                item["date"] == old_date.isoformat()
                for item in config.data["occupied_slots"]
            )
        )

        response = self.client.put(
            reverse(
                "mobile_api:artist_appointment_schedule",
                args=[appointment.pk],
            ),
            {
                "date": new_date.isoformat(),
                "start_time": "13:00",
                "session_length_minutes": 120,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Cache-Control"], "private, no-store")
        appointment.refresh_from_db()
        self.assertEqual(appointment.date, new_date)
        self.assertEqual(appointment.start_time, time(13))
        self.assertEqual(appointment.end_time, time(15))
        event.refresh_from_db()
        self.assertEqual(event.status, CalendarEvent.STATUS_CONFIRMED)
        self.assertEqual(
            timezone.localtime(event.starts_at, self.artist_tz).time(),
            time(13),
        )
        reschedule_request.refresh_from_db()
        self.assertEqual(
            reschedule_request.status,
            CalendarRescheduleRequest.STATUS_ACCEPTED,
        )
        self.assertIsNotNone(reschedule_request.resolved_at)
        notification = Notification.objects.get(appointment=appointment)
        self.assertEqual(notification.recipient, self.client_user)
        self.assertEqual(notification.actor, self.artist)
        self.assertEqual(notification.kind, Notification.KIND_BOOKING_UPDATE)

    def test_reschedule_rejects_conflicts_without_partial_update(self):
        date_value = self.today + timedelta(days=15)
        self.open_date(date_value)
        appointment = self.appointment(
            date_value=date_value,
            start=time(10),
            end=time(12),
        )
        self.appointment(
            date_value=date_value,
            start=time(14),
            end=time(16),
            client=self.create_user("another-client"),
        )
        response = self.client.put(
            reverse(
                "mobile_api:artist_appointment_schedule",
                args=[appointment.pk],
            ),
            {
                "date": date_value.isoformat(),
                "start_time": "15:00",
                "session_length_minutes": 60,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        appointment.refresh_from_db()
        self.assertEqual(appointment.start_time, time(10))
        self.assertEqual(appointment.end_time, time(12))

    def test_reschedule_hides_other_artist_and_rejects_pending_status(self):
        date_value = self.today + timedelta(days=18)
        self.open_date(date_value)
        other = self.appointment(
            date_value=date_value,
            artist=self.other_artist,
        )
        hidden = self.client.put(
            reverse(
                "mobile_api:artist_appointment_schedule",
                args=[other.pk],
            ),
            {
                "date": date_value.isoformat(),
                "start_time": "13:00",
                "session_length_minutes": 60,
            },
            format="json",
        )
        self.assertEqual(hidden.status_code, status.HTTP_404_NOT_FOUND)

        pending = self.appointment(
            date_value=date_value,
            start=time(13),
            end=time(14),
            status_value=Appointment.STATUS_PENDING,
        )
        rejected = self.client.put(
            reverse(
                "mobile_api:artist_appointment_schedule",
                args=[pending.pk],
            ),
            {
                "date": date_value.isoformat(),
                "start_time": "14:00",
                "session_length_minutes": 60,
            },
            format="json",
        )
        self.assertEqual(rejected.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(rejected.data["code"], "appointment_not_reschedulable")
