# users/forms_custom.py
import re

from django import forms
from django.contrib.auth.forms import SetPasswordForm, UserCreationForm
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _

from users.models import Profile

USER_TYPE_CHOICES = [
    ("regular", _("Regular user")),
    ("tattoo_artist", _("Tattoo artist")),
]


class CustomUserCreationForm(UserCreationForm):
    email = forms.EmailField(required=True)
    account_type = forms.ChoiceField(choices=USER_TYPE_CHOICES, required=True)

    class Meta:
        model = User
        fields = ("username", "email", "password1", "password2", "account_type")

    def clean_email(self):
        email = (self.cleaned_data.get("email") or "").strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise ValidationError(_("An account with this email already exists."))
        return email

    def save(self, commit=True):
        user = super().save(commit=False)
        user.email = self.cleaned_data["email"]
        # 👇 не создаём Profile вручную — это делает сигнал!
        if commit:
            user.save()
            user.profile.account_type = self.cleaned_data["account_type"]
            user.profile.save()
        return user

    def clean_password2(self):
        password1 = self.cleaned_data.get("password1")
        password2 = self.cleaned_data.get("password2")

        errors = []

        if password1 and password2 and password1 != password2:
            errors.append(_("Passwords do not match."))

        if not password1:
            return password2

        if len(password1) < 8:
            errors.append(_("Password must contain at least 8 characters."))
        if not re.search(r"[A-Z]", password1):
            errors.append(_("Password must contain at least one uppercase letter."))
        if not re.search(r"\d", password1):
            errors.append(_("Password must contain at least one number."))

        if errors:
            raise ValidationError(errors)

        return password2


class CustomSetPasswordForm(SetPasswordForm):
    def clean_new_password1(self):
        password1 = self.cleaned_data.get("new_password1")
        errors = []

        if not password1:
            return password1

        if len(password1) < 8:
            errors.append(_("Password must contain at least 8 characters."))
        if not re.search(r"[A-Z]", password1):
            errors.append(_("Password must contain at least one uppercase letter."))
        if not re.search(r"\d", password1):
            errors.append(_("Password must contain at least one number."))

        if errors:
            raise ValidationError(errors)

        return password1

    def clean_new_password2(self):
        password1 = self.cleaned_data.get("new_password1")
        password2 = self.cleaned_data.get("new_password2")

        if password1 and password2 and password1 != password2:
            raise ValidationError(_("Passwords do not match."))

        return password2

    def save(self, commit=True):
        print("[DEBUG] save() вызван, пароль меняется!")
        user = super().save(commit=False)
        password = self.cleaned_data["new_password1"]
        user.set_password(password)  # Устанавливаем новый пароль
        if commit:
            user.save()
        return user
