from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.urls import reverse

from .forms import VerificationForm
from .forms_custom import CustomUserCreationForm
from .models import ChatAttachment, ChatMessage, ChatThread


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


class ProtectedMediaTests(TestCase):
    def setUp(self):
        self.first = User.objects.create_user("first", password="test")
        self.second = User.objects.create_user("second", password="test")
        self.outsider = User.objects.create_user("outsider", password="test")
        User.objects.filter(
            pk__in=[self.first.pk, self.second.pk, self.outsider.pk]
        ).update(is_active=True)
        self.first.refresh_from_db()
        self.second.refresh_from_db()
        self.outsider.refresh_from_db()
        thread = ChatThread.objects.create(
            participant_one=self.first,
            participant_two=self.second,
        )
        message = ChatMessage.objects.create(
            thread=thread,
            sender=self.first,
            content="private",
        )
        self.attachment = ChatAttachment.objects.create(
            message=message,
            file=SimpleUploadedFile("private.txt", b"secret"),
            original_name="private.txt",
            content_type="text/plain",
        )
        self.url = reverse(
            "protected_media", args=["chat", self.attachment.pk, "file"]
        )

    def test_chat_participant_can_download_attachment(self):
        self.client.force_login(self.second)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(b"".join(response.streaming_content), b"secret")

    def test_outsider_cannot_download_attachment(self):
        self.client.force_login(self.outsider)
        self.assertEqual(self.client.get(self.url).status_code, 404)

    def test_private_storage_does_not_expose_direct_url(self):
        with self.assertRaises(ValueError):
            self.attachment.file.url
