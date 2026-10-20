"""Validated public details that reviewed studio owners may edit directly.

Coordinates, address and ownership are deliberately outside the owner form.
"""
from urllib.parse import urlsplit

from django import forms
from django.utils.translation import gettext_lazy as _

from .models import Location


class OwnedStudioDetailsForm(forms.ModelForm):
    class Meta:
        model = Location
        fields = ("name", "phone", "website")
        labels = {
            "name": _("Studio name"),
            "phone": _("Phone"),
            "website": _("Website"),
        }
        widgets = {
            "name": forms.TextInput(attrs={
                "class": "my-studios-edit-input",
                "maxlength": 160,
                "autocomplete": "organization",
            }),
            "phone": forms.TextInput(attrs={
                "class": "my-studios-edit-input",
                "maxlength": 60,
                "autocomplete": "tel",
            }),
            "website": forms.URLInput(attrs={
                "class": "my-studios-edit-input",
                "maxlength": 500,
                "placeholder": "https://",
                "autocomplete": "url",
            }),
        }

    def clean_name(self):
        name = (self.cleaned_data.get("name") or "").strip()
        if not name:
            raise forms.ValidationError(_("Enter a studio name."))
        return name

    def clean_phone(self):
        return (self.cleaned_data.get("phone") or "").strip()

    def clean_website(self):
        website = (self.cleaned_data.get("website") or "").strip()
        if website:
            parts = urlsplit(website)
            if parts.scheme not in ("http", "https") or not parts.netloc or parts.username or parts.password:
                raise forms.ValidationError(_("Use a valid HTTP or HTTPS website URL."))
        return website
