# users/forms_custom.py
from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.models import User
from users.models import Profile

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
        if commit:
            user.save()
            Profile.objects.create(user=user, account_type=self.cleaned_data["account_type"])
        return user