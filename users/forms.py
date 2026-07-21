import os

from django import forms
from django.contrib.auth import get_user_model
from django.utils.translation import gettext_lazy as _
from .models import UserReport

from .models import (
    BUSINESS_DOCUMENT_CHOICES,
    ID_DOCUMENT_CHOICES,
    USER_TYPE_CHOICES,
    Profile,
    VerificationDocument,
    ManualVerificationRequest,
    PortfolioAlbum,
    PortfolioWork,
)

User = get_user_model()

MAX_VERIFICATION_FILE_SIZE = int(9.5 * 1024 * 1024)

ALLOWED_VERIFICATION_EXTENSIONS = {
    ".pdf",
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".heic",
    ".heif",
}

ALLOWED_VERIFICATION_CONTENT_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
}


def validate_verification_file(uploaded_file):
    if not uploaded_file:
        return uploaded_file

    extension = os.path.splitext(uploaded_file.name or "")[1].lower()
    content_type = getattr(uploaded_file, "content_type", "") or ""

    if extension not in ALLOWED_VERIFICATION_EXTENSIONS:
        raise forms.ValidationError(
            _("Only PDF or image files are allowed. Please upload PDF, JPG, PNG, WEBP or HEIC.")
        )

    if content_type and content_type not in ALLOWED_VERIFICATION_CONTENT_TYPES:
        raise forms.ValidationError(
            _("Only PDF or image files are allowed. Please upload PDF, JPG, PNG, WEBP or HEIC.")
        )

    if uploaded_file.size > MAX_VERIFICATION_FILE_SIZE:
        raise forms.ValidationError(
            _("This file is too large. Please upload a file under 10 MB.")
        )

    return uploaded_file

class UserEditForm(forms.ModelForm):
    class Meta:
        model = User
        fields = ["username"]
        widgets = {
            "username": forms.TextInput(attrs={
                "class": "edit-profile-input",
                "placeholder": _("Username"),
            }),
        }


class ProfileForm(forms.ModelForm):
    class Meta:
        model = Profile
        fields = ["tag", "bio", "profile_image", "show_liked_posts"]
        widgets = {
            "bio": forms.Textarea(attrs={
                "class": "edit-profile-textarea",
                "placeholder": _("Tell something about yourself..."),
                "rows": 4,
            }),
            "tag": forms.TextInput(attrs={
                "class": "edit-profile-input",
                "placeholder": _("Your unique tag"),
                "maxlength": "32",
            }),
            "profile_image": forms.ClearableFileInput(attrs={
                "class": "edit-profile-file",
            }),
            "show_liked_posts": forms.CheckboxInput(attrs={
                "class": "edit-profile-checkbox",
            }),
        }
        
    def clean_tag(self):
        tag = self.cleaned_data.get("tag")
        tag = Profile.normalize_tag(tag)

        if not tag:
            return tag

        existing_tag = Profile.objects.filter(tag=tag)

        if self.instance and self.instance.pk:
            existing_tag = existing_tag.exclude(pk=self.instance.pk)

        if existing_tag.exists():
            raise forms.ValidationError(_("This tag is already taken."))

        if len(tag) < 3:
            raise forms.ValidationError(_("Tag must contain at least 3 characters."))

        return tag    
    
    def save(self, commit=True):
        profile = super().save(commit=False)

        if not profile.tag:
            profile.tag = Profile.generate_unique_tag(profile.user.username)

        if commit:
            profile.save()
            self.save_m2m()

        return profile


class VerificationForm(forms.ModelForm):
    business_document_type = forms.ChoiceField(
        choices=BUSINESS_DOCUMENT_CHOICES,
        label=_("Business document type"),
        required=True,
    )
    business_document_file = forms.FileField(
        label=_("Business document file"),
        required=True,
        widget=forms.ClearableFileInput(attrs={
            "accept": ".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,image/*,application/pdf",
        }),
    )
    id_document_type = forms.ChoiceField(
        choices=ID_DOCUMENT_CHOICES,
        label=_("Identity document type"),
        required=True,
    )
    id_document_file = forms.FileField(
        label=_("Identity document file"),
        required=True,
        widget=forms.ClearableFileInput(attrs={
            "accept": ".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,image/*,application/pdf",
        }),
    )

    class Meta:
        model = VerificationDocument
        fields = [
            "business_document_type",
            "business_document_file",
            "id_document_type",
            "id_document_file",
        ]
        
    def clean_business_document_file(self):
        return validate_verification_file(
            self.cleaned_data.get("business_document_file")
        )

    def clean_id_document_file(self):
        return validate_verification_file(
            self.cleaned_data.get("id_document_file")
        )
        
class ManualVerificationForm(forms.ModelForm):
    class Meta:
        model = ManualVerificationRequest
        fields = [
            "portfolio_link",
            "social_link",
            "city_country",
            "explanation",
            "extra_file",
        ]
        widgets = {
            "portfolio_link": forms.URLInput(attrs={
                "class": "verification-input",
                "placeholder": "https://your-portfolio.com",
            }),
            "social_link": forms.URLInput(attrs={
                "class": "verification-input",
                "placeholder": _("Instagram, TikTok, website..."),
            }),
            "city_country": forms.TextInput(attrs={
                "class": "verification-input",
                "placeholder": _("Paris, France"),
            }),
            "explanation": forms.Textarea(attrs={
                "class": "verification-textarea",
                "placeholder": _(
                    "Tell us about your tattoo experience, studio, portfolio, or why you cannot provide official documents yet."
                ),
                "rows": 5,
            }),
            "extra_file": forms.ClearableFileInput(attrs={
                "class": "verification-file",
                "accept": ".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,image/*,application/pdf",
            }),
        }
    
    def clean_extra_file(self):
        return validate_verification_file(
            self.cleaned_data.get("extra_file")
        )
        
class PortfolioAlbumForm(forms.ModelForm):
    class Meta:
        model = PortfolioAlbum
        fields = ["title", "description", "style", "cover_image"]
        widgets = {
            "title": forms.TextInput(attrs={
                "class": "portfolio-input",
                "placeholder": _("Album name, e.g. Realism"),
            }),
            "description": forms.Textarea(attrs={
                "class": "portfolio-textarea",
                "placeholder": _("Short description..."),
                "rows": 3,
            }),
            "style": forms.TextInput(attrs={
                "class": "portfolio-input",
                "placeholder": _("Style, e.g. Blackwork"),
            }),
            "cover_image": forms.ClearableFileInput(attrs={
                "class": "portfolio-file",
            }),
        }


class MultipleFileInput(forms.ClearableFileInput):
    allow_multiple_selected = True


class MultipleImageField(forms.FileField):
    widget = MultipleFileInput

    def clean(self, data, initial=None):
        single_file_clean = super().clean

        if isinstance(data, (list, tuple)):
            return [single_file_clean(file, initial) for file in data]

        return [single_file_clean(data, initial)]


class PortfolioWorkForm(forms.Form):
    album = forms.ModelChoiceField(
        queryset=PortfolioAlbum.objects.none(),
        required=False,
        empty_label=_("All works / no album"),
        widget=forms.Select(attrs={
            "class": "portfolio-input",
        }),
    )

    new_album_title = forms.CharField(
        required=False,
        max_length=80,
        widget=forms.TextInput(attrs={
            "class": "portfolio-input",
            "placeholder": _("Or create new album, e.g. Japanese style"),
        }),
    )

    images = MultipleImageField(
        required=True,
        widget=MultipleFileInput(attrs={
            "class": "portfolio-file",
            "accept": "image/*",
            "multiple": True,
        }),
    )

    title = forms.CharField(
        required=False,
        max_length=120,
        widget=forms.TextInput(attrs={
            "class": "portfolio-input",
            "placeholder": _("Work title, optional"),
        }),
    )

    description = forms.CharField(
        required=False,
        widget=forms.Textarea(attrs={
            "class": "portfolio-textarea",
            "placeholder": _("Describe these works..."),
            "rows": 4,
        }),
    )

    style = forms.CharField(
        required=False,
        max_length=80,
        widget=forms.TextInput(attrs={
            "class": "portfolio-input",
            "placeholder": _("Style, e.g. Realism"),
        }),
    )

    body_placement = forms.CharField(
        required=False,
        max_length=80,
        widget=forms.TextInput(attrs={
            "class": "portfolio-input",
            "placeholder": _("Placement, e.g. forearm, back, chest"),
        }),
    )

    def __init__(self, *args, user=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.user = user

        if user:
            self.fields["album"].queryset = PortfolioAlbum.objects.filter(user=user)
            
            
    def clean_images(self):
        images = self.cleaned_data.get("images") or []
        max_image_upload_size = int(9.5 * 1024 * 1024)

        for image in images:
            content_type = getattr(image, "content_type", "") or ""

            if not content_type.startswith("image/"):
                raise forms.ValidationError(
                    _("Only image files are allowed.")
                )

            if image.size > max_image_upload_size:
                raise forms.ValidationError(
                    _("Each portfolio image must be under 10 MB.")
                )

        return images
            
class UserReportForm(forms.ModelForm):
    class Meta:
        model = UserReport
        fields = ["report_type", "title", "message", "attachment"]

        labels = {
            "report_type": _("Report type"),
            "title": _("Title"),
            "message": _("Message"),
            "attachment": _("Attachment"),
        }

        widgets = {
            "report_type": forms.Select(attrs={"class": "report-field"}),
            "title": forms.TextInput(attrs={
                "class": "report-field",
                "placeholder": _("Short title"),
            }),
            "message": forms.Textarea(attrs={
                "class": "report-field report-textarea",
                "placeholder": _("Describe the problem or suggestion..."),
                "rows": 6,
            }),
            "attachment": forms.ClearableFileInput(attrs={
                "class": "report-file",
            }),
        }

    def clean_attachment(self):
        return validate_verification_file(self.cleaned_data.get("attachment"))
