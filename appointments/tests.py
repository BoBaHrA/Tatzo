from datetime import timedelta
from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from users.models import Profile
from .models import CalendarEvent, CalendarRescheduleRequest

class CalendarAccessTests(TestCase):
    def setUp(self):
        self.artist=User.objects.create_user('artist',password='pw')
        self.artist2=User.objects.create_user('artist2',password='pw')
        self.client_user=User.objects.create_user('client',password='pw')
        self.client2=User.objects.create_user('client2',password='pw')
        for u,t in [(self.artist,'tattoo_artist'),(self.artist2,'tattoo_artist'),(self.client_user,'regular'),(self.client2,'regular')]:
            Profile.objects.update_or_create(user=u, defaults={'account_type': t, 'status': 'active', 'is_email_verified': True}); u.is_active=True; u.save(update_fields=['is_active'])
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
        self.assertEqual(self.client.get(reverse('calendar_page')).status_code,302)
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
