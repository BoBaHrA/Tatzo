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
)
from users.models import ChatMessage, ChatThread


User = get_user_model()


class MobileArtistDashboardTests(APITestCase):
    def setUp(self):
        self.artist = self.create_user("dashboard-artist", artist=True)
        self.client_user = self.create_user("dashboard-client")
        self.other_artist = self.create_user("dashboard-other-artist", artist=True)
        self.settings = ArtistBookingSettings.objects.update_or_create(
            artist=self.artist,
            defaults={
                "minimum_notice_hours": 0,
                "maximum_booking_window_days": 90,
                "maximum_session_hours": 6,
                "booking_workflow": "manual",
            },
        )[0]
        self.today = timezone.localdate(timezone=ZoneInfo("Europe/Paris"))
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

    def make_appointment(
        self,
        *,
        artist=None,
        client=None,
        date=None,
        start=time(10),
        end=time(12),
        status_value=Appointment.STATUS_ACCEPTED,
        booking_type=Appointment.TYPE_TATTOO,
    ):
        return Appointment.objects.create(
            artist=artist or self.artist,
            client=client or self.client_user,
            booking_type=booking_type,
            date=date or self.today + timedelta(days=1),
            start_time=start,
            end_time=end,
            session_length_minutes=int(
                (
                    datetime.combine(self.today, end)
                    - datetime.combine(self.today, start)
                ).total_seconds()
                // 60
            ),
            status=status_value,
        )

    def test_dashboard_requires_authentication_and_verified_artist(self):
        url = reverse("mobile_api:artist_dashboard")
        self.client.force_authenticate(user=None)
        anonymous = self.client.get(url)
        self.assertEqual(anonymous.status_code, status.HTTP_401_UNAUTHORIZED)

        self.client.force_authenticate(self.client_user)
        regular = self.client.get(url)
        self.assertEqual(regular.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(regular.data["code"], "artist_dashboard_forbidden")

    def test_dashboard_combines_workload_stats_and_both_calendar_roles(self):
        pending = self.make_appointment(
            date=self.today + timedelta(days=1),
            status_value=Appointment.STATUS_PENDING,
        )
        accepted = self.make_appointment(date=self.today + timedelta(days=2))
        own_booking = self.make_appointment(
            artist=self.other_artist,
            client=self.artist,
            date=self.today + timedelta(days=3),
            start=time(14),
            end=time(15),
            booking_type=Appointment.TYPE_CONSULTATION,
        )
        event_date = self.today + timedelta(days=4)
        artist_tz = ZoneInfo("Europe/Paris")
        client_event = CalendarEvent.objects.create(
            artist=self.other_artist,
            client=self.artist,
            event_type=CalendarEvent.TYPE_CONSULTATION,
            status=CalendarEvent.STATUS_CONFIRMED,
            title="My consultation elsewhere",
            starts_at=timezone.make_aware(
                datetime.combine(event_date, time(16)), artist_tz
            ),
            ends_at=timezone.make_aware(
                datetime.combine(event_date, time(17)), artist_tz
            ),
        )
        day_off = ArtistTimeOff.objects.create(
            artist=self.artist,
            date=self.today + timedelta(days=5),
            reason="Convention",
        )
        thread = ChatThread.get_or_create_for_users(self.artist, self.client_user)
        ChatMessage.objects.create(
            thread=thread,
            sender=self.client_user,
            content="New project",
        )

        response = self.client.get(reverse("mobile_api:artist_dashboard"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["artist_timezone"], "Europe/Paris")
        self.assertEqual(len(response.data["schedule"]), 7)
        self.assertEqual(response.data["stats"]["pending_requests"], 1)
        self.assertEqual(response.data["stats"]["unread_messages"], 1)
        workload = {
            item["date"]: item for item in response.data["workload"]
        }
        self.assertEqual(
            workload[pending.date.isoformat()]["booked_minutes"],
            120,
        )
        self.assertEqual(
            workload[accepted.date.isoformat()]["booked_minutes"],
            120,
        )
        self.assertEqual(
            workload[day_off.date.isoformat()]["workload"],
            "time_off",
        )
        timeline = {item["id"]: item for item in response.data["timeline"]}
        self.assertEqual(timeline[f"appointment-{accepted.pk}"]["role"], "artist")
        self.assertEqual(timeline[f"appointment-{own_booking.pk}"]["role"], "client")
        self.assertEqual(timeline[f"event-{client_event.pk}"]["role"], "client")
        self.assertIn(f"time-off-{day_off.pk}", timeline)

    def test_artist_can_update_status_and_weekly_schedule(self):
        status_url = reverse("mobile_api:artist_dashboard")
        updated = self.client.patch(
            status_url,
            {"booking_status": ArtistBookingSettings.BOOKING_STATUS_VACATION},
            format="json",
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        self.assertFalse(updated.data["bookings_enabled"])
        self.settings.refresh_from_db()
        self.assertEqual(
            self.settings.booking_status,
            ArtistBookingSettings.BOOKING_STATUS_VACATION,
        )
        self.assertFalse(self.settings.bookings_enabled)

        invalid_status = self.client.patch(
            status_url,
            {"booking_status": "not-a-status"},
            format="json",
        )
        self.assertEqual(invalid_status.status_code, status.HTTP_400_BAD_REQUEST)

        days = [
            {
                "weekday": weekday,
                "is_closed": weekday != 2,
                "open_time": "09:00" if weekday == 2 else None,
                "close_time": "17:00" if weekday == 2 else None,
                "break_start": "12:00" if weekday == 2 else None,
                "break_end": "13:00" if weekday == 2 else None,
            }
            for weekday in range(7)
        ]
        schedule_url = reverse("mobile_api:artist_schedule")
        saved = self.client.put(schedule_url, {"days": days}, format="json")
        self.assertEqual(saved.status_code, status.HTTP_200_OK)
        self.assertEqual(len(saved.data["schedule"]), 7)
        tuesday = ArtistAvailability.objects.get(artist=self.artist, weekday=2)
        self.assertFalse(tuesday.is_closed)
        self.assertEqual(tuesday.open_time, time(9))
        self.assertEqual(tuesday.break_end, time(13))

        days[2]["break_end"] = "18:00"
        invalid = self.client.put(schedule_url, {"days": days}, format="json")
        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)
        tuesday.refresh_from_db()
        self.assertEqual(tuesday.break_end, time(13))

    def test_artist_can_manage_time_off_and_non_overlapping_blocks(self):
        day_off_date = self.today + timedelta(days=8)
        time_off_url = reverse("mobile_api:artist_time_off_list")
        created_time_off = self.client.post(
            time_off_url,
            {"date": day_off_date.isoformat(), "reason": "Convention"},
            format="json",
        )
        self.assertEqual(created_time_off.status_code, status.HTTP_201_CREATED)
        updated_time_off = self.client.post(
            time_off_url,
            {"date": day_off_date.isoformat(), "reason": "Guest spot"},
            format="json",
        )
        self.assertEqual(updated_time_off.status_code, status.HTTP_200_OK)
        self.assertEqual(ArtistTimeOff.objects.get().reason, "Guest spot")

        appointment_date = self.today + timedelta(days=9)
        self.make_appointment(date=appointment_date, start=time(10), end=time(12))
        block_url = reverse("mobile_api:artist_block_list")
        conflict = self.client.post(
            block_url,
            {
                "date": appointment_date.isoformat(),
                "start_time": "10:30",
                "end_time": "11:30",
            },
            format="json",
        )
        self.assertEqual(conflict.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(conflict.data["code"], "calendar_conflict")

        block_date = self.today + timedelta(days=10)
        created_block = self.client.post(
            block_url,
            {
                "date": block_date.isoformat(),
                "start_time": "15:00",
                "end_time": "17:00",
                "reason": "Drawing",
            },
            format="json",
        )
        self.assertEqual(created_block.status_code, status.HTTP_201_CREATED)
        event = CalendarEvent.objects.get(pk=created_block.data["id"])
        self.assertEqual(event.event_type, CalendarEvent.TYPE_BLOCKED)

        removed_block = self.client.delete(
            reverse("mobile_api:artist_block_detail", args=[event.pk])
        )
        self.assertEqual(removed_block.status_code, status.HTTP_204_NO_CONTENT)
        event.refresh_from_db()
        self.assertEqual(event.status, CalendarEvent.STATUS_CANCELLED)

        removed_time_off = self.client.delete(
            reverse(
                "mobile_api:artist_time_off_detail",
                args=[created_time_off.data["id"]],
            )
        )
        self.assertEqual(removed_time_off.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ArtistTimeOff.objects.exists())

    def test_artist_cannot_remove_another_artists_block(self):
        event_date = self.today + timedelta(days=12)
        artist_tz = ZoneInfo("Europe/Paris")
        event = CalendarEvent.objects.create(
            artist=self.other_artist,
            event_type=CalendarEvent.TYPE_BLOCKED,
            status=CalendarEvent.STATUS_PLANNED,
            title="Other artist block",
            starts_at=timezone.make_aware(
                datetime.combine(event_date, time(9)), artist_tz
            ),
            ends_at=timezone.make_aware(
                datetime.combine(event_date, time(10)), artist_tz
            ),
        )
        hidden = self.client.delete(
            reverse("mobile_api:artist_block_detail", args=[event.pk])
        )
        self.assertEqual(hidden.status_code, status.HTTP_404_NOT_FOUND)
        event.refresh_from_db()
        self.assertEqual(event.status, CalendarEvent.STATUS_PLANNED)
