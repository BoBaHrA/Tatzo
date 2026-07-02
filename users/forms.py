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


class UserEditForm(forms.ModelForm):
    class Meta:
        model = User
        fields = ["username"]
        widgets = {
            "username": forms.TextInput(attrs={
                "class": "edit-profile-input",
                "placeholder": "Username",
            }),
        }


class ProfileForm(forms.ModelForm):
    class Meta:
        model = Profile
        fields = ["tag", "bio", "profile_image", "show_liked_posts"]
        widgets = {
            "bio": forms.Textarea(attrs={
                "class": "edit-profile-textarea",
                "placeholder": "Tell something about yourself...",
                "rows": 4,
            }),
            "tag": forms.TextInput(attrs={
                "class": "edit-profile-input",
                "placeholder": "Your unique tag",
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
            raise forms.ValidationError("This tag is already taken.")

        if len(tag) < 3:
            raise forms.ValidationError("Tag must contain at least 3 characters.")

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
        label="Тип бизнес-документа",
        required=True,
    )
    business_document_file = forms.FileField(
        label="Файл бизнес-документа",
        required=True,
    )
    id_document_type = forms.ChoiceField(
        choices=ID_DOCUMENT_CHOICES,
        label="Тип документа личности",
        required=True,
    )
    id_document_file = forms.FileField(
        label="Файл документа личности",
        required=True,
    )

    class Meta:
        model = VerificationDocument
        fields = [
            "business_document_type",
            "business_document_file",
            "id_document_type",
            "id_document_file",
        ]
        
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
                "placeholder": "Instagram, TikTok, website...",
            }),
            "city_country": forms.TextInput(attrs={
                "class": "verification-input",
                "placeholder": "Paris, France",
            }),
            "explanation": forms.Textarea(attrs={
                "class": "verification-textarea",
                "placeholder": "Tell us about your tattoo experience, studio, portfolio, or why you cannot provide official documents yet.",
                "rows": 5,
            }),
            "extra_file": forms.ClearableFileInput(attrs={
                "class": "verification-file",
            }),
        }
        
class PortfolioAlbumForm(forms.ModelForm):
    class Meta:
        model = PortfolioAlbum
        fields = ["title", "description", "style", "cover_image"]
        widgets = {
            "title": forms.TextInput(attrs={
                "class": "portfolio-input",
                "placeholder": "Album name, e.g. Realism",
            }),
            "description": forms.Textarea(attrs={
                "class": "portfolio-textarea",
                "placeholder": "Short description...",
                "rows": 3,
            }),
            "style": forms.TextInput(attrs={
                "class": "portfolio-input",
                "placeholder": "Style, e.g. Blackwork",
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
        empty_label="All works / no album",
        widget=forms.Select(attrs={
            "class": "portfolio-input",
        }),
    )

    new_album_title = forms.CharField(
        required=False,
        max_length=80,
        widget=forms.TextInput(attrs={
            "class": "portfolio-input",
            "placeholder": "Or create new album, e.g. Japanese style",
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
            "placeholder": "Work title, optional",
        }),
    )

    description = forms.CharField(
        required=False,
        widget=forms.Textarea(attrs={
            "class": "portfolio-textarea",
            "placeholder": "Describe these works...",
            "rows": 4,
        }),
    )

    style = forms.CharField(
        required=False,
        max_length=80,
        widget=forms.TextInput(attrs={
            "class": "portfolio-input",
            "placeholder": "Style, e.g. Realism",
        }),
    )

    body_placement = forms.CharField(
        required=False,
        max_length=80,
        widget=forms.TextInput(attrs={
            "class": "portfolio-input",
            "placeholder": "Placement, e.g. forearm, back, chest",
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