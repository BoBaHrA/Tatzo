from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase

from .forms import VerificationForm
from .forms_custom import CustomUserCreationForm


User = get_user_model()


class SignupValidationTests(TestCase):
    def test_missing_password_is_a_form_error_not_an_exception(self):
        form = CustomUserCreationForm(
            data={
                "username": "new-user",
                "email": "new@example.com",
                "account_type": "regular",
            }
        )
        self.assertFalse(form.is_valid())
        self.assertIn("password1", form.errors)

    def test_email_is_unique_case_insensitively(self):
        User.objects.create_user("existing", email="Person@Example.com")
        form = CustomUserCreationForm(
            data={
                "username": "new-user",
                "email": "person@example.com",
                "password1": "Password1",
                "password2": "Password1",
                "account_type": "regular",
            }
        )
        self.assertFalse(form.is_valid())
        self.assertIn("email", form.errors)


class VerificationUploadTests(TestCase):
    def test_executable_files_are_rejected(self):
        executable = SimpleUploadedFile(
            "malware.exe", b"MZ", content_type="application/octet-stream"
        )
        form = VerificationForm(
            data={
                "business_document_type": "license",
                "id_document_type": "passport",
            },
            files={
                "business_document_file": executable,
                "id_document_file": SimpleUploadedFile(
                    "id.pdf", b"%PDF-1.4", content_type="application/pdf"
                ),
            },
        )
        self.assertFalse(form.is_valid())
        self.assertIn("business_document_file", form.errors)
