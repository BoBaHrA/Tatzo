from datetime import timedelta
from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from users.models import Profile
from .models import Appointment, CalendarEvent, CalendarRescheduleRequest

class CalendarAccessTests(TestCase):
    def setUp(self):
        self.artist=User.objects.create_user('artist',password='pw')
        self.artist2=User.objects.create_user('artist2',password='pw')
        self.client_user=User.objects.create_user('client',password='pw')
        self.client2=User.objects.create_user('client2',password='pw')
        for u,t in [(self.artist,'tattoo_artist'),(self.artist2,'tattoo_artist'),(self.client_user,'regular'),(self.client2,'regular')]:
            Profile.objects.update_or_create(user=u, defaults={'account_type': t, 'status': 'active', 'is_email_verified': True, 'verification_status': 'approved' if t == 'tattoo_artist' else 'not_submitted'}); u.is_active=True; u.save(update_fields=['is_active'])
        self.start=timezone.now()+timedelta(days=2)
        self.end=self.start+timedelta(hours=2)
        self.event=CalendarEvent.objects.create(artist=self.artist,client=self.client_user,event_type=CalendarEvent.TYPE_TATTOO_SESSION,status=CalendarEvent.STATUS_CONFIRMED,title='Session',starts_at=self.start,ends_at=self.end)
        self.other=CalendarEvent.objects.create(artist=self.artist2,client=self.client2,event_type=CalendarEvent.TYPE_TATTOO_SESSION,title='Other',starts_at=self.start,ends_at=self.end)
    def events(self):
        return reverse('calendar_events')+f'?start={self.start.date().isoformat()}&end={(self.end+timedelta(days=1)).date().isoformat()}'
    def test_artist_sees_own_events(self):
        self.client.force_login(self.artist); r=self.client.get(self.events()); self.assertContains(r,'Session')
    def test_artist_does_not_see_other_artist_events(self):
        self.client.force_login(self.artist); r=self.client.get(self.events()); self.assertNotContains(r,'Other')
    def test_client_sees_only_own_events(self):
        self.client.force_login(self.client_user); r=self.client.get(self.events()); self.assertContains(r,'Session'); self.assertNotContains(r,'Other')
    def test_client_does_not_see_other_clients_for_same_artist(self):
        CalendarEvent.objects.create(artist=self.artist,client=self.client2,event_type=CalendarEvent.TYPE_CONSULTATION,title='Hidden client',starts_at=self.start+timedelta(hours=3),ends_at=self.end+timedelta(hours=3))
        self.client.force_login(self.client_user); self.assertNotContains(self.client.get(self.events()),'Hidden client')
    def test_anonymous_redirected(self):
        self.assertEqual(self.client.get(reverse('calendar')).status_code,302)
    def test_cannot_complete_other_event(self):
        self.client.force_login(self.artist2); r=self.client.post(reverse('calendar_event_complete',args=[self.event.id])); self.assertEqual(r.status_code,403)
    def test_cannot_create_end_before_start(self):
        self.client.force_login(self.artist); r=self.client.post(reverse('calendar_event_create'),{'event_type':'blocked','date':self.start.date().isoformat(),'start_time':'12:00','end_time':'11:00'}); self.assertEqual(r.status_code,400)
    def test_overlap_rejected(self):
        self.client.force_login(self.artist); r=self.client.post(reverse('calendar_event_create'),{'event_type':'blocked','date':self.start.date().isoformat(),'start_time':self.start.strftime('%H:%M'),'end_time':self.end.strftime('%H:%M')}); self.assertEqual(r.status_code,409)
    def test_client_can_reschedule_only_own_event(self):
        self.client.force_login(self.client_user); r=self.client.post(reverse('calendar_reschedule_request',args=[self.event.id]),{'reason':'Need another day'}); self.assertEqual(r.status_code,201); self.assertTrue(CalendarRescheduleRequest.objects.filter(event=self.event,requested_by=self.client_user).exists()); r=self.client.post(reverse('calendar_reschedule_request',args=[self.other.id])); self.assertEqual(r.status_code,403)
    def test_events_date_range(self):
        self.client.force_login(self.artist); data=self.client.get(self.events()).json(); self.assertEqual(len(data['events']),1)

    def test_calendar_url_names_are_separate(self):
        self.assertEqual(reverse('calendar'), '/calendar/')
        self.assertEqual(reverse('artist_dashboard_calendar'), '/artist/dashboard/calendar/')
        self.assertNotEqual(reverse('calendar'), reverse('artist_dashboard_calendar'))

    def test_regular_user_cannot_open_dashboard_calendar(self):
        self.client.force_login(self.client_user)
        response = self.client.get(reverse('artist_dashboard_calendar'))
        self.assertEqual(response.status_code, 403)

class AppointmentCalendarSourceTests(TestCase):
    def setUp(self):
        self.artist = User.objects.create_user('appt_artist', password='pw')
        self.client_user = User.objects.create_user('appt_client', password='pw')
        self.other_client = User.objects.create_user('appt_other', password='pw')
        for user, account_type in [
            (self.artist, 'tattoo_artist'),
            (self.client_user, 'regular'),
            (self.other_client, 'regular'),
        ]:
            Profile.objects.update_or_create(
                user=user,
                defaults={
                    'account_type': account_type,
                    'status': 'active',
                    'is_email_verified': True,
                    'verification_status': 'approved' if account_type == 'tattoo_artist' else 'not_submitted',
                },
            )
            user.is_active = True
            user.save(update_fields=['is_active'])
        self.date = (timezone.now() + timedelta(days=3)).date()

    def events_url(self):
        return reverse('calendar_events') + f'?start={self.date.isoformat()}&end={self.date.isoformat()}'

    def create_appointment(self, **overrides):
        data = {
            'artist': self.artist,
            'client': self.client_user,
            'booking_type': Appointment.TYPE_TATTOO,
            'status': Appointment.STATUS_ACCEPTED,
            'date': self.date,
            'start_time': timezone.datetime.strptime('10:00', '%H:%M').time(),
            'end_time': timezone.datetime.strptime('12:00', '%H:%M').time(),
            'session_length_minutes': 120,
            'styles': ['Blackwork'],
            'placement': 'Arm',
            'description': 'Calendar appointment',
        }
        data.update(overrides)
        return Appointment.objects.create(**data)

    def get_payloads(self, user):
        self.client.force_login(user)
        return self.client.get(self.events_url()).json()

    def test_accepted_appointment_visible_to_artist_and_client_only(self):
        appointment = self.create_appointment()
        artist_events = self.get_payloads(self.artist)['events']
        self.assertIn(f'appointment-{appointment.id}', [event['id'] for event in artist_events])
        client_events = self.get_payloads(self.client_user)['events']
        self.assertIn(f'appointment-{appointment.id}', [event['id'] for event in client_events])
        other_events = self.get_payloads(self.other_client)['events']
        self.assertNotIn(f'appointment-{appointment.id}', [event['id'] for event in other_events])

    def test_pending_declined_and_cancelled_appointments_are_hidden(self):
        hidden = [
            self.create_appointment(status=Appointment.STATUS_PENDING),
            self.create_appointment(status=Appointment.STATUS_DECLINED),
            self.create_appointment(status=Appointment.STATUS_CANCELLED),
        ]
        payload_ids = [event['id'] for event in self.get_payloads(self.artist)['events']]
        for appointment in hidden:
            self.assertNotIn(f'appointment-{appointment.id}', payload_ids)

    def test_completed_appointment_is_returned_as_completed(self):
        appointment = self.create_appointment(status=Appointment.STATUS_COMPLETED)
        event = self.get_payloads(self.artist)['events'][0]
        self.assertEqual(event['id'], f'appointment-{appointment.id}')
        self.assertEqual(event['status'], CalendarEvent.STATUS_COMPLETED)

    def test_manual_accepted_appointment_appears_immediately(self):
        appointment = self.create_appointment(description='Manual accepted appointment')
        payload_ids = [event['id'] for event in self.get_payloads(self.artist)['events']]
        self.assertIn(f'appointment-{appointment.id}', payload_ids)

    def test_appointment_datetimes_and_fallback_duration_are_serialized(self):
        appointment = self.create_appointment(end_time=None, session_length_minutes=90)
        event = self.get_payloads(self.artist)['events'][0]
        self.assertEqual(event['id'], f'appointment-{appointment.id}')
        self.assertTrue(event['starts_at'].endswith('+00:00'))
        self.assertTrue(event['ends_at'].endswith('+00:00'))
        self.assertEqual(event['duration_hours'], 1.5)

    def test_calendar_event_blocked_and_vacation_still_display(self):
        start = timezone.make_aware(timezone.datetime.combine(self.date, timezone.datetime.strptime('13:00', '%H:%M').time()))
        CalendarEvent.objects.create(artist=self.artist, event_type=CalendarEvent.TYPE_BLOCKED, title='Blocked', starts_at=start, ends_at=start + timedelta(hours=1))
        CalendarEvent.objects.create(artist=self.artist, event_type=CalendarEvent.TYPE_VACATION, title='Vacation', starts_at=start + timedelta(hours=2), ends_at=start + timedelta(hours=3))
        event_types = [event['event_type'] for event in self.get_payloads(self.artist)['events']]
        self.assertIn(CalendarEvent.TYPE_BLOCKED, event_types)
        self.assertIn(CalendarEvent.TYPE_VACATION, event_types)

    def test_appointment_linked_calendar_event_is_not_duplicated(self):
        appointment = self.create_appointment()
        start = timezone.make_aware(timezone.datetime.combine(self.date, appointment.start_time))
        CalendarEvent.objects.create(artist=self.artist, client=self.client_user, project=appointment, event_type=CalendarEvent.TYPE_TATTOO_SESSION, title='Duplicate', starts_at=start, ends_at=start + timedelta(hours=2))
        payloads = self.get_payloads(self.artist)['events']
        self.assertEqual([event['id'] for event in payloads], [f'appointment-{appointment.id}'])

    def test_summary_counts_appointment_sessions(self):
        self.create_appointment()
        data = self.get_payloads(self.artist)
        summary = data['days'][self.date.isoformat()]
        self.assertEqual(summary['sessions'], 1)
        self.assertEqual(summary['booked_hours'], 2.0)

    def test_consultation_required_with_time_is_returned_as_consultation(self):
        appointment = self.create_appointment(status=Appointment.STATUS_CONSULTATION_REQUIRED)
        event = self.get_payloads(self.artist)['events'][0]
        self.assertEqual(event['id'], f'appointment-{appointment.id}')
        self.assertEqual(event['event_type'], CalendarEvent.TYPE_CONSULTATION)

    def test_artist_can_complete_booking_appointment_from_calendar(self):
        appointment = self.create_appointment()
        self.client.force_login(self.artist)
        response = self.client.post(
            reverse('calendar_appointment_complete', args=[appointment.id])
        )
        self.assertEqual(response.status_code, 200)
        appointment.refresh_from_db()
        self.assertEqual(appointment.status, Appointment.STATUS_COMPLETED)

    def test_client_cannot_complete_booking_appointment(self):
        appointment = self.create_appointment()
        self.client.force_login(self.client_user)
        response = self.client.post(
            reverse('calendar_appointment_complete', args=[appointment.id])
        )
        self.assertEqual(response.status_code, 403)

    def test_booking_appointment_reschedule_is_visible_in_calendar(self):
        appointment = self.create_appointment()
        self.client.force_login(self.client_user)
        response = self.client.post(
            reverse('calendar_appointment_reschedule', args=[appointment.id]),
            {'reason': 'Please move this session'},
        )
        self.assertEqual(response.status_code, 201)
        event = CalendarEvent.objects.get(project=appointment)
        self.assertEqual(event.status, CalendarEvent.STATUS_RESCHEDULE_REQUESTED)
        payload = self.get_payloads(self.artist)['events'][0]
        self.assertEqual(payload['id'], f'appointment-{appointment.id}')
        self.assertEqual(payload['status'], CalendarEvent.STATUS_RESCHEDULE_REQUESTED)
