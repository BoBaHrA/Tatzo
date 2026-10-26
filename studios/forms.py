from zoneinfo import available_timezones, ZoneInfo
from django import forms
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from .models import Studio, Membership, Enquiry
from .services import artists


class StudioForm(forms.ModelForm):
    timezone = forms.ChoiceField(label=_("Time zone"), choices=[(z, z) for z in sorted(available_timezones())])
    class Meta:
        model = Studio
        fields = ['description', 'logo', 'cover', 'timezone', 'accepting_enquiries']
        widgets = {'description': forms.Textarea(attrs={'rows': 4})}

    def clean(self):
        data = super().clean()
        for field in ['logo', 'cover']:
            image = data.get(field)
            if image and hasattr(image, 'size') and image.size > 5 * 1024 * 1024:
                self.add_error(field, _('Choose an image smaller than 5 MB.'))
        return data


class InviteForm(forms.Form):
    username = forms.CharField(max_length=150, label=_("Tatzo username"))
    role = forms.ChoiceField(choices=Membership.ROLES, label=_("Role"))
    starts_on = forms.DateField(required=False, label=_("From"), widget=forms.DateInput(attrs={'type': 'date'}))
    ends_on = forms.DateField(required=False, label=_("Until"), widget=forms.DateInput(attrs={'type': 'date'}))

    def clean(self):
        data = super().clean()
        if data.get('starts_on') and data.get('ends_on') and data['ends_on'] < data['starts_on']:
            self.add_error('ends_on', _('End date must be after start date.'))
        if data.get('role') == 'guest' and not data.get('ends_on'):
            self.add_error('ends_on', _('Choose the last day of the guest spot.'))
        if data.get('ends_on') and data['ends_on'] < timezone.localdate():
            self.add_error('ends_on', _('Choose a future date.'))
        return data


class EnquiryForm(forms.ModelForm):
    class Meta:
        model = Enquiry
        fields = ['title', 'brief', 'placement']
        widgets = {'brief': forms.Textarea(attrs={'rows': 5})}


class EnquiryUpdateForm(forms.ModelForm):
    class Meta:
        model = Enquiry
        fields = ['assigned_to', 'stage', 'internal_note']
        widgets = {'internal_note': forms.Textarea(attrs={'rows': 3})}
        labels = {'assigned_to': _('Assigned artist'), 'stage': _('Project stage')}

    def __init__(self, *args, studio, manager, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['assigned_to'].queryset = artists(studio)
        if not manager:
            self.fields.pop('assigned_to')


class SessionForm(forms.Form):
    artist = forms.ModelChoiceField(queryset=None, label=_("Artist"))
    client_name = forms.CharField(max_length=120, label=_("Client name"))
    title = forms.CharField(max_length=160, label=_("Session title"))
    date = forms.DateField(label=_("Date"), widget=forms.DateInput(attrs={'type': 'date'}))
    start_time = forms.TimeField(label=_("Start"), widget=forms.TimeInput(attrs={'type': 'time'}))
    end_time = forms.TimeField(label=_("End"), widget=forms.TimeInput(attrs={'type': 'time'}))
    event_type = forms.ChoiceField(label=_("Type"), choices=[('tattoo_session', _('Tattoo session')), ('consultation', _('Consultation')), ('blocked', _('Blocked time'))])
    enquiry = forms.ModelChoiceField(queryset=None, required=False, label=_("Related studio enquiry"))

    def __init__(self, *args, studio, user, manager, **kwargs):
        super().__init__(*args, **kwargs)
        self.studio = studio
        self.fields['artist'].queryset = artists(studio) if manager else artists(studio).filter(pk=user.pk)
        self.fields['enquiry'].queryset = studio.enquiries.exclude(stage='closed') if manager else studio.enquiries.filter(assigned_to=user).exclude(stage='closed')
        self.fields['enquiry'].label_from_instance = lambda e: e.title

    def clean(self):
        data = super().clean()
        if all(data.get(f) for f in ['date', 'start_time', 'end_time']):
            from datetime import datetime
            tz = ZoneInfo(self.studio.timezone)
            for key in ['start_time', 'end_time']:
                naive = datetime.combine(data['date'], data[key])
                aware = timezone.make_aware(naive, tz)
                # A wall time must map to exactly one instant at DST transitions.
                if aware.astimezone(ZoneInfo('UTC')).astimezone(tz).replace(tzinfo=None) != naive or naive.replace(tzinfo=tz, fold=0).utcoffset() != naive.replace(tzinfo=tz, fold=1).utcoffset():
                    raise forms.ValidationError(_('Choose a time outside the daylight-saving transition.'))
                data[key + '_at'] = aware
            if data['end_time_at'] <= data['start_time_at']:
                raise forms.ValidationError(_('End time must be after start time.'))
            if data['start_time_at'] < timezone.now():
                raise forms.ValidationError(_('Choose a future date.'))
            if data.get('artist') and not artists(self.studio, data['date']).filter(pk=data['artist'].pk).exists():
                raise forms.ValidationError(_('The artist is not available as a studio member on that date.'))
            if data.get('enquiry') and data.get('artist') and data['enquiry'].assigned_to_id != data['artist'].pk:
                raise forms.ValidationError(_('Assign the enquiry to this artist first.'))
        return data
