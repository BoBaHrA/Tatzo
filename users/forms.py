# users/forms.py
from django import forms

from .models import (
    BUSINESS_DOCUMENT_CHOICES,
    ID_DOCUMENT_CHOICES,
    USER_TYPE_CHOICES,
    Profile,
    VerificationDocument,
)

# -------- Профиль --------
class ProfileForm(forms.ModelForm):
    # поле объявляем на уровне класса (не в Meta!)
    account_type = forms.ChoiceField(choices=USER_TYPE_CHOICES, required=True)

    class Meta:
        model = Profile
        fields = ["account_type", "bio", "profile_image"]

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
