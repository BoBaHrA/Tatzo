from django import forms
from django.contrib.auth.models import User
from users.models import Profile, VerificationDocument, Post, USER_TYPE_CHOICES  # Исправленный импорт
from .models import Profile, VerificationDocument, BUSINESS_DOCUMENT_CHOICES, ID_DOCUMENT_CHOICES
from django.db import models


# Форма для профиля
class ProfileForm(forms.ModelForm):
    class Meta:
        model = Profile  # Указываем модель
        fields = ['account_type', 'bio', 'profile_image']  # Указываем поля, которые будут в форме
        account_type = forms.ChoiceField(choices=[('user', 'User'), ('tattoo_artist', 'Tattoo Artist')])  # Убедитесь, что тут есть все возможные значения

# Предположим, что у тебя есть такие выборы для типа аккаунта
USER_TYPE_CHOICES = [
    ('regular_user', 'Обычный пользователь'),
    ('tattoo_artist', 'Тату-мастер'),
]

# Форма для создания постов
class PostForm(forms.ModelForm):
    class Meta:
        model = Post
        fields = ['content']  # Поля, которые должны быть в форме


# Форма для верификации документов
class VerificationForm(forms.ModelForm):
    business_document_type = forms.ChoiceField(
        choices=BUSINESS_DOCUMENT_CHOICES, 
        label="Тип бизнес-документа",
        required=True
    )
    business_document_file = forms.FileField(
        label="Файл бизнес-документа",
        required=True
    )

    id_document_type = forms.ChoiceField(
        choices=ID_DOCUMENT_CHOICES, 
        label="Тип документа личности",
        required=True
    )
    id_document_file = forms.FileField(
        label="Файл документа личности",
        required=True
    )

    class Meta:
        model = VerificationDocument
        fields = ['business_document_type', 'business_document_file', 'id_document_type', 'id_document_file']