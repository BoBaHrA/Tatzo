from datetime import timedelta
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from appointments.models import CalendarEvent, Appointment
from users.models import Location
from .models import Studio, Membership, Enquiry

User = get_user_model()


class StudioTests(TestCase):
    def setUp(self):
        self.owner = self.user('owner')
        self.artist = self.user('resident')
        self.other = self.user('other')
        self.client_user = self.user('client', artist=False)
        self.location = Location.objects.create(name='Medusa studio', status='claimed', studio_owner=self.owner, address='5 rue Test')
        self.studio = Studio.objects.create(location=self.location)
        self.member = Membership.objects.create(studio=self.studio, user=self.artist, status='active')
        self.url = reverse('studio_workspace', args=[self.location.pk])
        self.client.force_login(self.owner)

    def user(self, name, artist=True):
        u = User.objects.create_user(name, name+'@example.com', 'testpass')
        u.profile.account_type = 'tattoo_artist' if artist else 'client'
        u.profile.verification_status = 'approved' if artist else 'not_submitted'
        u.profile.is_email_verified = True
        u.profile.save()
        return u

    def session_data(self, **kwargs):
        d = {'action': 'session', 'artist': self.artist.pk, 'client_name': 'Walk-in Camille', 'title': 'Botanical sleeve', 'date': (timezone.localdate()+timedelta(days=4)).isoformat(), 'start_time': '11:00', 'end_time': '13:00', 'event_type': 'tattoo_session'}
        d.update(kwargs)
        return d

    def test_pages_render_and_dashboard_entry(self):
        for tab in ['overview', 'team', 'calendar', 'enquiries', 'settings']:
            self.assertEqual(self.client.get(self.url, {'tab': tab}).status_code, 200)
        self.assertContains(self.client.get(reverse('artist_booking_settings')), reverse('studio_hub'))
        self.assertEqual(self.client.get(reverse('studio_hub')).status_code, 200)
        self.client.logout()
        self.assertEqual(self.client.get(reverse('studio_public', args=[self.location.pk])).status_code, 200)
        self.assertEqual(self.client.get(self.url).status_code, 302)

    def test_only_reviewed_owner_can_enable_workspace(self):
        other_loc = Location.objects.create(name='Other studio', studio_owner=self.other, status='claimed')
        response = self.client.post(reverse('studio_hub'), {'location_id': other_loc.pk})
        self.assertEqual(response.status_code, 404)
        self.assertFalse(Studio.objects.filter(location=other_loc).exists())
        other_loc.studio_owner = self.owner
        other_loc.save()
        self.assertEqual(self.client.post(reverse('studio_hub'), {'location_id': other_loc.pk}).status_code, 302)
        self.assertTrue(Studio.objects.filter(location=other_loc).exists())
        other_loc.status = 'removed'
        other_loc.save()
        self.assertEqual(self.client.get(reverse('studio_workspace', args=[other_loc.pk])).status_code, 404)

    def test_invitation_is_consent_based_and_not_cross_account(self):
        response = self.client.post(self.url+'?tab=team', {'action': 'invite', 'username': self.other.username, 'role': 'resident'})
        self.assertEqual(response.status_code, 302)
        member = Membership.objects.get(studio=self.studio, user=self.other)
        self.assertEqual(member.status, 'invited')
        self.client.force_login(self.other)
        self.assertEqual(self.client.get(self.url).status_code, 403)
        invite_url = reverse('studio_invitation', args=[member.pk])
        self.client.force_login(self.artist)
        self.assertEqual(self.client.post(invite_url, {'decision': 'accept'}).status_code, 404)
        self.client.force_login(self.other)
        self.assertEqual(self.client.post(invite_url, {'decision': 'accept'}).status_code, 302)
        self.assertEqual(self.client.get(self.url).status_code, 200)

    def test_members_cannot_escalate_or_assign_others(self):
        self.client.force_login(self.artist)
        self.assertEqual(self.client.post(self.url, {'action': 'invite', 'username': self.other.username, 'role': 'manager'}).status_code, 403)
        self.assertEqual(self.client.get(self.url+'?tab=settings').status_code, 403)
        self.client.post(self.url+'?tab=calendar', self.session_data(artist=self.other.pk))
        self.assertFalse(CalendarEvent.objects.exists())

    def test_manager_cannot_invite_manager(self):
        self.member.role = 'manager'
        self.member.save()
        self.client.force_login(self.artist)
        self.assertContains(self.client.post(self.url+'?tab=team', {'action': 'invite', 'username': 'other', 'role': 'manager'}), 'Select a valid choice')
        self.assertFalse(Membership.objects.filter(user=self.other).exists())

    def test_manual_session_is_real_calendar_event_and_conflict_checked(self):
        self.assertEqual(self.client.post(self.url+'?tab=calendar', self.session_data()).status_code, 302)
        event = CalendarEvent.objects.get()
        self.assertEqual(event.studio, self.studio)
        self.assertEqual(event.artist, self.artist)
        self.assertEqual(event.external_client_name, 'Walk-in Camille')
        event.full_clean()
        response = self.client.post(self.url+'?tab=calendar', self.session_data())
        self.assertContains(response, 'overlaps another event')
        self.assertEqual(CalendarEvent.objects.count(), 1)
        self.client.force_login(self.artist)
        self.assertContains(self.client.get(reverse('calendar')), 'calendar')

    def test_appointment_and_private_event_conflicts_do_not_leak_details(self):
        d = self.session_data()
        Appointment.objects.create(artist=self.artist, client=self.client_user, date=d['date'], start_time='12:00', end_time='14:00', status='accepted', description='Private secret')
        response = self.client.post(self.url+'?tab=calendar', d)
        self.assertContains(response, 'overlaps another event')
        self.assertNotContains(response, 'Private secret')
        self.assertFalse(CalendarEvent.objects.exists())

    def test_calendar_redacts_colleague_clients_and_private_events(self):
        self.client.post(self.url, self.session_data())
        event = CalendarEvent.objects.get()
        CalendarEvent.objects.create(artist=self.artist, event_type='blocked', title='Private therapy', starts_at=event.starts_at+timedelta(days=1), ends_at=event.ends_at+timedelta(days=1))
        Membership.objects.create(studio=self.studio, user=self.other, status='active')
        self.client.force_login(self.other)
        page = self.client.get(self.url, {'tab': 'calendar', 'week': event.starts_at.date().isoformat()})
        self.assertContains(page, 'Busy')
        self.assertNotContains(page, 'Walk-in Camille')
        self.assertNotContains(page, 'Botanical sleeve')
        self.assertNotContains(page, 'Private therapy')
        self.assertEqual(self.client.post(self.url, {'action': 'cancel_session', 'event_id': event.pk}).status_code, 403)

    def test_enquiry_visibility_assignment_and_client_status(self):
        self.client.force_login(self.client_user)
        public = reverse('studio_public', args=[self.location.pk])
        self.assertEqual(self.client.post(public, {'title': 'Dragon', 'brief': 'Dragon on back', 'placement': 'Back'}).status_code, 302)
        enquiry = Enquiry.objects.get()
        detail = reverse('studio_enquiry', args=[self.location.pk, enquiry.pk])
        self.client.force_login(self.artist)
        self.assertEqual(self.client.get(detail).status_code, 404)
        self.client.force_login(self.owner)
        self.assertEqual(self.client.post(detail, {'assigned_to': self.artist.pk, 'stage': 'design', 'internal_note': 'Internal sketch note'}).status_code, 302)
        self.client.force_login(self.artist)
        self.assertContains(self.client.get(detail), 'Dragon on back')
        self.client.post(detail, {'assigned_to': self.other.pk, 'stage': 'ready', 'internal_note': 'Ready'})
        enquiry.refresh_from_db()
        self.assertEqual(enquiry.assigned_to, self.artist)
        self.client.force_login(self.client_user)
        self.assertContains(self.client.get(public), 'Ready for session')
        self.assertNotContains(self.client.get(public), 'Internal sketch note')
        self.assertEqual(self.client.get(detail).status_code, 403)

    def test_foreign_enquiry_and_artist_cannot_be_used_in_session(self):
        foreign = Studio.objects.create(location=Location.objects.create(name='Foreign', status='claimed', studio_owner=self.other))
        enquiry = Enquiry.objects.create(studio=foreign, client=self.client_user, title='Foreign secret', brief='Secret', assigned_to=self.artist)
        self.client.post(self.url+'?tab=calendar', self.session_data(enquiry=enquiry.pk))
        self.assertFalse(CalendarEvent.objects.exists())
        self.client.post(self.url+'?tab=calendar', self.session_data(artist=self.other.pk))
        self.assertFalse(CalendarEvent.objects.exists())

    def test_guest_expiry_removal_and_ownership_revoke(self):
        self.member.role = 'guest'
        self.member.ends_on = timezone.localdate()-timedelta(days=1)
        self.member.save()
        self.client.force_login(self.artist)
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.member.ends_on = timezone.localdate()+timedelta(days=1)
        self.member.save()
        self.client.force_login(self.owner)
        response = self.client.post(self.url+'?tab=calendar', self.session_data())
        self.assertContains(response, 'not available as a studio member')
        self.assertEqual(self.client.post(self.url, {'action': 'remove', 'member_id': self.member.pk}).status_code, 302)
        self.client.force_login(self.artist)
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.location.studio_owner = None
        self.location.save()
        self.client.force_login(self.owner)
        self.assertEqual(self.client.get(self.url).status_code, 404)

    def test_settings_cannot_change_ownership_or_enable_unreviewed_address(self):
        self.client.post(self.url+'?tab=settings', {'action': 'settings', 'description': 'Our craft', 'timezone': 'Europe/Paris', 'accepting_enquiries': 'on', 'studio_owner': self.other.pk, 'location': 9999})
        self.location.refresh_from_db()
        self.assertEqual(self.location.studio_owner, self.owner)
        self.studio.refresh_from_db()
        self.assertEqual(self.studio.description, 'Our craft')

    def test_csrf_enforced_for_studio_mutations(self):
        from django.test import Client
        c = Client(enforce_csrf_checks=True)
        c.force_login(self.owner)
        self.assertEqual(c.post(self.url, self.session_data()).status_code, 403)
