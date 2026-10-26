from datetime import date, timedelta
from zoneinfo import ZoneInfo
from django.contrib import messages
from django.contrib.auth import get_user_model
from django.contrib.auth.decorators import login_required
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.db.models import Q
from django.http import Http404
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils import timezone
from django.utils.translation import gettext as _
from django.views.decorators.http import require_POST, require_http_methods
from appointments.models import CalendarEvent
from users.models import Location, PortfolioWork, UserBlock
from .forms import StudioForm, InviteForm, EnquiryForm, EnquiryUpdateForm, SessionForm
from .models import Studio, Membership, Enquiry
from .services import role_for, require_role, artists, audit, blocked, check_slot


def _posted_id(request, key):
    try:
        return int(request.POST.get(key, ''))
    except (TypeError, ValueError):
        raise Http404


def _studio(pk):
    return get_object_or_404(Studio.objects.select_related('location', 'location__studio_owner'), location_id=pk,
        location__status__in=['claimed', 'verified'], location__studio_owner__is_active=True)


@login_required
@require_http_methods(['GET', 'POST'])
def hub(request):
    if request.method == 'POST':
        with transaction.atomic():
            location = get_object_or_404(Location.objects.select_for_update(), pk=_posted_id(request, 'location_id'),
                studio_owner=request.user, status__in=['claimed', 'verified'])
            studio, created = Studio.objects.get_or_create(location=location)
            if created:
                audit(studio, request.user, 'workspace_enabled')
        return redirect('studio_workspace', location_id=location.pk)
    owned = Location.objects.filter(studio_owner=request.user, status__in=['claimed', 'verified']).select_related('workspace')
    memberships = Membership.current().filter(user=request.user, studio__location__status__in=['claimed', 'verified'], studio__location__studio_owner__isnull=False).select_related('studio__location')
    invitations = Membership.objects.filter(user=request.user, status='invited', studio__location__status__in=['claimed', 'verified'], studio__location__studio_owner__isnull=False).filter(Q(ends_on__isnull=True) | Q(ends_on__gte=timezone.localdate())).select_related('studio__location')
    return render(request, 'studios/hub.html', {'owned': owned, 'memberships': memberships, 'invitations': invitations})


@login_required
@require_POST
@transaction.atomic
def respond_invitation(request, member_id):
    pending = get_object_or_404(Membership, pk=member_id, user=request.user)
    Location.objects.select_for_update().get(pk=pending.studio.location_id)
    member = get_object_or_404(Membership.objects.select_for_update(of=('self',)).select_related('studio__location'), pk=member_id, user=request.user, status='invited')
    studio = _studio(member.studio.location_id)
    if member.ends_on and member.ends_on < timezone.localdate():
        raise PermissionDenied
    if request.POST.get('decision') not in ['accept', 'decline']:
        raise PermissionDenied
    if request.POST['decision'] == 'accept' and member.role != 'manager' and not request.user.profile.is_verified_artist:
        messages.error(request, _('Artist verification is required to join the studio team.'))
        return redirect('studio_hub')
    member.status = 'active' if request.POST['decision'] == 'accept' else 'declined'
    member.save(update_fields=['status', 'updated_at'])
    audit(studio, request.user, 'invitation_' + member.status, member.pk)
    return redirect('studio_hub')


@login_required
@require_http_methods(['GET', 'POST'])
@transaction.atomic
def workspace(request, location_id):
    studio = _studio(location_id)
    if request.method == 'POST':
        # Serialize team edits, invitation decisions and assignment in one workspace.
        Location.objects.select_for_update().get(pk=location_id)
        studio = _studio(location_id)
    role = require_role(studio, request.user)
    manager = role in ['owner', 'manager']
    tab = request.GET.get('tab', 'overview')
    if tab not in ['overview', 'team', 'calendar', 'enquiries', 'settings']:
        raise Http404
    if tab == 'settings' and not manager:
        raise PermissionDenied
    invite_form = InviteForm()
    if role != 'owner':
        invite_form.fields['role'].choices = Membership.ROLES[1:]
    settings_form = StudioForm(instance=studio)
    session_form = SessionForm(studio=studio, user=request.user, manager=manager)
    if request.method == 'POST':
        action = request.POST.get('action')
        if action == 'invite':
            require_role(studio, request.user, ['owner', 'manager'])
            invite_form = InviteForm(request.POST)
            if role != 'owner':
                invite_form.fields['role'].choices = Membership.ROLES[1:]
            if invite_form.is_valid():
                data = invite_form.cleaned_data
                user = get_user_model().objects.filter(username__iexact=data['username'].lstrip('@'), is_active=True, profile__is_email_verified=True).first()
                if not user or user.pk == studio.location.studio_owner_id or blocked(request.user, user):
                    invite_form.add_error('username', _('Choose another active Tatzo account.'))
                elif data['role'] != 'manager' and not user.profile.is_verified_artist:
                    invite_form.add_error('username', _('Choose a verified tattoo artist.'))
                elif Membership.objects.filter(studio=studio, user=user, status__in=['active', 'invited']).exists():
                    invite_form.add_error('username', _('This account is already a member or has an invitation.'))
                else:
                    member, _created = Membership.objects.update_or_create(studio=studio, user=user, defaults={
                        'role': data['role'], 'starts_on': data['starts_on'], 'ends_on': data['ends_on'], 'status': 'invited', 'invited_by': request.user})
                    audit(studio, request.user, 'member_invited', member.pk)
                    messages.success(request, _('Invitation ready in their Studio workspace. They must accept before joining.'))
                    return redirect(reverse('studio_workspace', args=[location_id]) + '?tab=team')
        elif action == 'remove':
            member = get_object_or_404(Membership.objects.select_for_update(), pk=_posted_id(request, 'member_id'), studio=studio)
            if member.user_id != request.user.pk:
                require_role(studio, request.user, ['owner', 'manager'])
                if member.role == 'manager' and role != 'owner':
                    raise PermissionDenied
            member.status = 'removed'
            member.save(update_fields=['status', 'updated_at'])
            studio.enquiries.filter(assigned_to=member.user).exclude(stage='closed').update(assigned_to=None)
            audit(studio, request.user, 'member_removed', member.pk)
            messages.success(request, _('Membership ended. Existing sessions stay in the calendar; review future sessions.'))
            if member.user_id == request.user.pk:
                return redirect('studio_hub')
            return redirect(reverse('studio_workspace', args=[location_id]) + '?tab=team')
        elif action == 'settings':
            require_role(studio, request.user, ['owner', 'manager'])
            settings_form = StudioForm(request.POST, request.FILES, instance=studio)
            if settings_form.is_valid():
                settings_form.save()
                audit(studio, request.user, 'settings_updated')
                messages.success(request, _('Studio settings saved.'))
                return redirect(reverse('studio_workspace', args=[location_id]) + '?tab=settings')
        elif action == 'session':
            session_form = SessionForm(request.POST, studio=studio, user=request.user, manager=manager)
            if session_form.is_valid():
                d = session_form.cleaned_data
                get_user_model().objects.select_for_update().get(pk=d['artist'].pk)
                try:
                    check_slot(d['artist'], d['start_time_at'], d['end_time_at'])
                except ValidationError as exc:
                    session_form.add_error(None, exc)
                else:
                    enquiry = d.get('enquiry')
                    event = CalendarEvent.objects.create(artist=d['artist'], client=enquiry.client if enquiry else None,
                        studio=studio, studio_enquiry=enquiry, external_client_name=d['client_name'], title=d['title'],
                        starts_at=d['start_time_at'], ends_at=d['end_time_at'], event_type=d['event_type'],
                        status='planned', location=studio.location.display_address)
                    audit(studio, request.user, 'session_created', event.pk)
                    messages.success(request, _('Session added to the studio and artist calendars.'))
                    return redirect(reverse('studio_workspace', args=[location_id]) + '?tab=calendar&week=' + d['date'].isoformat())
        elif action in ['complete_session', 'cancel_session']:
            event = get_object_or_404(CalendarEvent.objects.select_for_update(), pk=_posted_id(request, 'event_id'), studio=studio)
            if not manager and event.artist_id != request.user.pk:
                raise PermissionDenied
            if event.status not in ['cancelled', 'completed']:
                event.status = 'completed' if action == 'complete_session' else 'cancelled'
                event.save(update_fields=['status', 'updated_at'])
                audit(studio, request.user, action, event.pk)
            return redirect(reverse('studio_workspace', args=[location_id]) + '?tab=calendar')
        else:
            raise PermissionDenied
    members = studio.memberships.select_related('user__profile').filter(status__in=['active', 'invited'])
    enquiries = studio.enquiries.select_related('client', 'assigned_to')
    if not manager:
        enquiries = enquiries.filter(assigned_to=request.user)
    try:
        week = date.fromisoformat(request.GET.get('week', ''))
    except ValueError:
        week = timezone.localdate(timezone=ZoneInfo(studio.timezone))
    week -= timedelta(days=week.weekday())
    from datetime import datetime, time
    starts = timezone.make_aware(datetime.combine(week, time.min), ZoneInfo(studio.timezone))
    ends = starts + timedelta(days=7)
    events = list(studio.sessions.filter(starts_at__lt=ends, ends_at__gt=starts).select_related('artist', 'client'))
    artist_filter = request.GET.get('artist', '')
    if artist_filter.isdigit():
        events = [e for e in events if e.artist_id == int(artist_filter)]
    # Colleagues see scheduling occupancy, never another artist's client details.
    days = []
    for i in range(7):
        day = week + timedelta(days=i)
        entries = []
        for e in events:
            local_start = timezone.localtime(e.starts_at, ZoneInfo(studio.timezone))
            local_end = timezone.localtime(e.ends_at, ZoneInfo(studio.timezone))
            if local_start.date() <= day <= local_end.date():
                entries.append({'event': e if manager or e.artist_id == request.user.pk else None,
                    'artist': e.artist, 'start': local_start, 'end': local_end, 'status': e.get_status_display()})
        days.append({'date': day, 'entries': entries})
    upcoming = studio.sessions.filter(ends_at__gte=timezone.now()).exclude(status__in=['cancelled', 'completed']).select_related('artist', 'client')
    if not manager:
        upcoming = upcoming.filter(artist=request.user)
    return render(request, 'studios/workspace.html', {
        'studio': studio, 'role': role, 'manager': manager, 'tab': tab,
        'members': members, 'team_count': Membership.current().filter(studio=studio).count(),
        'enquiries': enquiries[:60], 'enquiry_count': enquiries.exclude(stage='closed').count(),
        'upcoming': upcoming[:8], 'session_count': upcoming.count(),
        'invite_form': invite_form, 'settings_form': settings_form, 'session_form': session_form,
        'days': days, 'week': week, 'prev_week': week - timedelta(days=7), 'next_week': week + timedelta(days=7),
        'artists': artists(studio), 'artist_filter': artist_filter,
    })


@login_required
@require_http_methods(['GET', 'POST'])
@transaction.atomic
def enquiry_detail(request, location_id, enquiry_id):
    Location.objects.select_for_update().get(pk=location_id)
    studio = _studio(location_id)
    role = require_role(studio, request.user)
    manager = role in ['owner', 'manager']
    query = studio.enquiries.select_related('client', 'assigned_to')
    if not manager:
        query = query.filter(assigned_to=request.user)
    enquiry = get_object_or_404(query.select_for_update(of=('self',)), pk=enquiry_id)
    form = EnquiryUpdateForm(request.POST or None, instance=enquiry, studio=studio, manager=manager)
    if request.method == 'POST' and form.is_valid():
        if form.cleaned_data.get('assigned_to') and blocked(enquiry.client, form.cleaned_data['assigned_to']):
            form.add_error('assigned_to', _('This account cannot be assigned to this client.'))
        else:
            form.save()
            audit(studio, request.user, 'enquiry_updated', enquiry.pk)
            messages.success(request, _('Project updated.'))
            return redirect('studio_enquiry', location_id=location_id, enquiry_id=enquiry_id)
    return render(request, 'studios/enquiry.html', {'studio': studio, 'enquiry': enquiry, 'form': form, 'manager': manager})


@require_http_methods(['GET', 'POST'])
def public_profile(request, location_id):
    studio = _studio(location_id)
    form = EnquiryForm(request.POST or None)
    if request.method == 'POST':
        if not request.user.is_authenticated:
            return redirect(reverse('login') + '?next=' + request.path)
        if not studio.accepting_enquiries or blocked(request.user, studio.location.studio_owner):
            raise PermissionDenied
        if not request.user.profile.is_email_verified:
            raise PermissionDenied
        if studio.enquiries.filter(client=request.user, created_at__gte=timezone.now() - timedelta(hours=24)).count() >= 5:
            form.add_error(None, _('You have already contacted this studio today. Please wait for a reply.'))
        elif form.is_valid():
            enquiry = form.save(commit=False)
            enquiry.studio, enquiry.client = studio, request.user
            enquiry.save()
            messages.success(request, _('Your enquiry was sent. The studio can discuss your project with you on Tatzo.'))
            return redirect('studio_public', location_id=location_id)
    team = artists(studio)
    if request.user.is_authenticated:
        blocked_ids = UserBlock.objects.filter(Q(blocker=request.user) | Q(blocked=request.user)).values_list('blocker_id', 'blocked_id')
        excluded = {uid for pair in blocked_ids for uid in pair if uid != request.user.pk}
        team = team.exclude(pk__in=excluded)
    works = PortfolioWork.objects.filter(user__in=team).select_related('user')[:12]
    mine = studio.enquiries.filter(client=request.user)[:10] if request.user.is_authenticated else []
    return render(request, 'studios/public.html', {'studio': studio, 'team': team, 'works': works, 'form': form, 'mine': mine,
        'can_manage': bool(role_for(studio, request.user))})
