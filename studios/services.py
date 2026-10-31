from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied, ValidationError
from django.db.models import Q
from django.utils import timezone
from django.utils.translation import gettext as _
from appointments.models import Appointment, CalendarEvent
from users.models import UserBlock
from .models import Membership, StudioAudit


def role_for(studio, user):
    if not user.is_authenticated or not user.is_active or studio.location.status not in ('claimed', 'verified') or not studio.location.studio_owner_id:
        return None
    if studio.location.studio_owner_id == user.pk:
        return 'owner'
    member = Membership.current().filter(studio=studio, user=user).first()
    return member.role if member else None


def require_role(studio, user, roles=None):
    role = role_for(studio, user)
    if not role or (roles and role not in roles):
        raise PermissionDenied
    return role


def artists(studio, day=None):
    ids = Membership.current(day).filter(studio=studio, role__in=['resident', 'guest']).values('user_id')
    return get_user_model().objects.filter(Q(pk__in=ids) | Q(pk=studio.location.studio_owner_id),
        is_active=True, profile__account_type='tattoo_artist', profile__verification_status='approved', profile__is_email_verified=True).select_related('profile')


def audit(studio, user, action, target_id=None):
    StudioAudit.objects.create(studio=studio, actor=user, action=action, target_id=target_id)


def blocked(a, b):
    return UserBlock.objects.filter(Q(blocker=a, blocked=b) | Q(blocker=b, blocked=a)).exists()


def check_slot(artist, starts, ends):
    if CalendarEvent.objects.filter(artist=artist, starts_at__lt=ends, ends_at__gt=starts).exclude(status='cancelled').exists():
        raise ValidationError(_('This time overlaps another event.'))
    tz = ZoneInfo(artist.profile.timezone)
    for appt in Appointment.objects.filter(artist=artist, date__range=(timezone.localtime(starts, tz).date() - timedelta(days=1), timezone.localtime(ends, tz).date()), status__in=['pending', 'accepted', 'consultation_required', 'needs_references']):
        a = timezone.make_aware(datetime.combine(appt.date, appt.start_time), tz)
        b = timezone.make_aware(datetime.combine(appt.date, appt.end_time), tz) if appt.end_time else a + timedelta(minutes=appt.session_length_minutes or 60)
        if b <= a:
            b += timedelta(days=1)
        if a < ends and b > starts:
            raise ValidationError(_('This time overlaps another event.'))
