# users/forms_custom.py
from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.models import User
from users.models import Profile
from django.core.exceptions import ValidationError
import re
from django.contrib.auth.forms import SetPasswordForm

USER_TYPE_CHOICES = [
    ('regular_user', 'Обычный пользователь'),
    ('tattoo_artist', 'Тату-мастер'),
]

class CustomUserCreationForm(UserCreationForm):
    email = forms.EmailField(required=True)
    account_type = forms.ChoiceField(choices=USER_TYPE_CHOICES, required=True)

    class Meta:
        model = User
        fields = ("username", "email", "password1", "password2", "account_type")

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
                errors.append("Пароли не совпадают.")
        
            if len(password1) < 8:
                errors.append("Пароль должен содержать минимум 8 символов.")
            if not re.search(r'[A-Z]', password1):
                errors.append("Пароль должен содержать хотя бы одну заглавную букву.")
            if not re.search(r'\d', password1):
                errors.append("Пароль должен содержать хотя бы одну цифру.")

            if errors:
                raise ValidationError(errors)

            return password2

class CustomSetPasswordForm(SetPasswordForm):
    def clean_new_password1(self):
        password1 = self.cleaned_data.get("new_password1")
        errors = []

        if len(password1) < 8:
            errors.append("Пароль должен содержать минимум 8 символов.")
        if not re.search(r'[A-Z]', password1):
            errors.append("Пароль должен содержать хотя бы одну заглавную букву.")
        if not re.search(r'\d', password1):
            errors.append("Пароль должен содержать хотя бы одну цифру.")

        if errors:
            raise ValidationError(errors)

        return password1

    def clean_new_password2(self):
        password1 = self.cleaned_data.get("new_password1")
        password2 = self.cleaned_data.get("new_password2")

        if password1 and password2 and password1 != password2:
            raise ValidationError("Пароли не совпадают.")

        return password2

    def save(self, commit=True):
        print("[DEBUG] save() вызван, пароль меняется!")
        user = super().save(commit=False)
        password = self.cleaned_data["new_password1"]
        user.set_password(password)  # Устанавливаем новый пароль
        if commit:
            user.save()
        return user
    
