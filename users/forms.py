from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.models import User
from users.models import Profile, VerificationDocument, Post, USER_TYPE_CHOICES  # Исправленный импорт


# Форма для профиля
class ProfileForm(forms.ModelForm):
    class Meta:
        model = Profile
        fields = ('account_type', 'bio', 'profile_image')  # Поля для редактирования профиля


# Кастомная форма для создания пользователя
class CustomUserCreationForm(UserCreationForm):
    email = forms.EmailField(required=True)
    account_type = forms.ChoiceField(choices=USER_TYPE_CHOICES, required=True, label="Account Type")

    class Meta:
        model = User
        fields = ('username', 'email', 'password1', 'password2')  # Удаляем account_type из Meta

    def save(self, commit=True):
        user = super().save(commit=False)
        user.email = self.cleaned_data['email']
        if commit:
            user.save()
            # Создаем профиль с указанием типа аккаунта
            Profile.objects.create(user=user, account_type=self.cleaned_data['account_type'])
        return user


# Форма для создания постов
class PostForm(forms.ModelForm):
    class Meta:
        model = Post
        fields = ['content']  # Поля, которые должны быть в форме


# Форма для верификации документов
class VerificationForm(forms.ModelForm):
    class Meta:
        model = VerificationDocument  # Модель для хранения верификационных данных
        fields = ['document_type', 'document_file']  # Поля формы
