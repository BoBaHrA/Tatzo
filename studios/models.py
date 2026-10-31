from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


class Studio(models.Model):
    """A workspace for a reviewed map location. Ownership stays in Location."""
    location = models.OneToOneField('users.Location', on_delete=models.CASCADE, related_name='workspace')
    description = models.TextField(max_length=2000, blank=True, verbose_name=_("About the studio"))
    logo = models.ImageField(upload_to='studios/logos/', blank=True, verbose_name=_("Studio logo"))
    cover = models.ImageField(upload_to='studios/covers/', blank=True, verbose_name=_("Cover image"))
    timezone = models.CharField(max_length=64, default='Europe/Paris', verbose_name=_("Time zone"))
    accepting_enquiries = models.BooleanField(default=True, verbose_name=_("Accept studio enquiries"))
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.location.name


class Membership(models.Model):
    ROLES = [('manager', _('Manager')), ('resident', _('Resident artist')), ('guest', _('Guest artist'))]
    STATUSES = [('invited', _('Invited')), ('active', _('Active')), ('declined', _('Declined')), ('removed', _('Removed'))]
    studio = models.ForeignKey(Studio, on_delete=models.CASCADE, related_name='memberships')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='studio_memberships')
    role = models.CharField(max_length=16, choices=ROLES, default='resident')
    status = models.CharField(max_length=16, choices=STATUSES, default='invited')
    starts_on = models.DateField(null=True, blank=True, verbose_name=_("From"))
    ends_on = models.DateField(null=True, blank=True, verbose_name=_("Until"))
    invited_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='+')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['studio', 'user'], name='studio_unique_member')]
        ordering = ['role', 'user__username']

    @classmethod
    def current(cls, day=None):
        day = day or timezone.localdate()
        return cls.objects.filter(status='active', user__is_active=True).filter(
            Q(starts_on__isnull=True) | Q(starts_on__lte=day)
        ).filter(Q(ends_on__isnull=True) | Q(ends_on__gte=day))


class Enquiry(models.Model):
    STAGES = [('new', _('New enquiry')), ('discussion', _('In discussion')), ('consultation', _('Consultation')),
              ('design', _('Sketching')), ('ready', _('Ready for session')), ('healing', _('Healing')),
              ('touch_up', _('Touch-up')), ('closed', _('Closed'))]
    studio = models.ForeignKey(Studio, on_delete=models.CASCADE, related_name='enquiries')
    client = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='studio_enquiries')
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_studio_enquiries')
    title = models.CharField(max_length=120, verbose_name=_("Project title"))
    brief = models.TextField(max_length=4000, verbose_name=_("Tell us about your tattoo"))
    placement = models.CharField(max_length=120, blank=True, verbose_name=_("Placement"))
    stage = models.CharField(max_length=16, choices=STAGES, default='new')
    internal_note = models.TextField(max_length=2000, blank=True, verbose_name=_("Studio note"))
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']


class StudioAudit(models.Model):
    studio = models.ForeignKey(Studio, on_delete=models.CASCADE, related_name='audit')
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='+')
    action = models.CharField(max_length=80)
    target_id = models.PositiveBigIntegerField(null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
