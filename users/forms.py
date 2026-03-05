# users/forms.py
from django import forms
from django.forms.widgets import ClearableFileInput

from posts.models import Post  # ✅ вот это новое
from .models import (
    BUSINESS_DOCUMENT_CHOICES,
    ID_DOCUMENT_CHOICES,
    USER_TYPE_CHOICES,
    Profile,
    VerificationDocument,
)


# ✅ Виджет, который умеет multiple
class MultiFileInput(ClearableFileInput):
    allow_multiple_selected = True


# -------- Профиль --------
class ProfileForm(forms.ModelForm):
    # поле объявляем на уровне класса (не в Meta!)
    account_type = forms.ChoiceField(choices=USER_TYPE_CHOICES, required=True)

    class Meta:
        model = Profile
        fields = ["account_type", "bio", "profile_image"]


# -------- Пост (текст) --------
class PostForm(forms.ModelForm):
    class Meta:
        model = Post
        fields = ["content"]


# -------- Медиа к посту (несколько файлов) --------
class PostMediaUploadForm(forms.Form):
    media = forms.FileField(
        required=False, widget=MultiFileInput(attrs={"multiple": True})
    )

    # простая валидация
    ALLOWED = {"image/jpeg", "image/png", "video/mp4", "video/webm"}
    MAX_MB = 50

    def clean(self):
        cleaned = super().clean()
        files = self.files.getlist("media") if hasattr(self, "files") else []

        for f in files:
            if f.content_type not in self.ALLOWED:
                raise forms.ValidationError(
                    f"Тип файла не поддерживается: {f.content_type}"
                )
            if f.size > self.MAX_MB * 1024 * 1024:
                raise forms.ValidationError(f"Файл {f.name} больше {self.MAX_MB}MB.")
        return cleaned


# -------- Верификация документов --------
class VerificationForm(forms.ModelForm):
    business_document_type = forms.ChoiceField(
        choices=BUSINESS_DOCUMENT_CHOICES, label="Тип бизнес-документа", required=True
    )
    business_document_file = forms.FileField(
        label="Файл бизнес-документа", required=True
    )
    id_document_type = forms.ChoiceField(
        choices=ID_DOCUMENT_CHOICES, label="Тип документа личности", required=True
    )
    id_document_file = forms.FileField(label="Файл документа личности", required=True)

    class Meta:
        model = VerificationDocument
        fields = [
            "business_document_type",
            "business_document_file",
            "id_document_type",
            "id_document_file",
        ]
