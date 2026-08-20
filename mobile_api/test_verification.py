from io import BytesIO
import shutil
import tempfile

from PIL import Image
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from mytattooapp.storage_backends import private_media_storage
from users.models import ManualVerificationRequest, VerificationDocument


User = get_user_model()


@override_settings(TATZO_RATE_LIMIT_ENABLED=False)
class MobileArtistVerificationTests(APITestCase):
    def setUp(self):
        self.media_root = tempfile.mkdtemp(prefix="tatzo-mobile-verification-")
        self.media_override = override_settings(MEDIA_ROOT=self.media_root)
        self.media_override.enable()
        self.original_private_backend = private_media_storage._backend
        private_media_storage._backend = None

        self.artist = User.objects.create_user(
            "verification-artist",
            email="verification-artist@example.com",
            password="StrongPassword123",
            is_active=True,
        )
        self.artist.profile.account_type = "tattoo_artist"
        self.artist.profile.is_email_verified = True
        self.artist.profile.save(
            update_fields=("account_type", "is_email_verified")
        )
        self.regular = User.objects.create_user(
            "verification-client",
            email="verification-client@example.com",
            password="StrongPassword123",
            is_active=True,
        )
        self.client.force_authenticate(self.artist)

    def tearDown(self):
        VerificationDocument.objects.all().delete()
        ManualVerificationRequest.objects.all().delete()
        private_media_storage._backend = self.original_private_backend
        self.media_override.disable()
        shutil.rmtree(self.media_root, ignore_errors=True)

    @staticmethod
    def image_upload(name="identity.png"):
        output = BytesIO()
        Image.new("RGB", (4, 4), color="black").save(output, format="PNG")
        return SimpleUploadedFile(
            name,
            output.getvalue(),
            content_type="image/png",
        )

    @staticmethod
    def pdf_upload(name="business.pdf"):
        return SimpleUploadedFile(
            name,
            b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n",
            content_type="application/pdf",
        )

    def document_payload(self):
        return {
            "business_document_type": "sole_proprietor",
            "business_document_file": self.pdf_upload(),
            "id_document_type": "passport",
            "id_document_file": self.image_upload(),
        }

    def test_status_is_private_and_artist_only(self):
        response = self.client.get(reverse("mobile_api:artist_verification"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "not_submitted")
        self.assertTrue(response.data["can_submit"])
        self.assertIsNone(response.data["documents"])
        self.assertIsNone(response.data["manual"])
        self.assertEqual(
            {item["value"] for item in response.data["id_document_types"]},
            {"passport", "driver_license", "national_id"},
        )
        self.assertNotIn("url", str(response.data).lower())

        self.client.force_authenticate(self.regular)
        forbidden = self.client.get(reverse("mobile_api:artist_verification"))
        self.assertEqual(forbidden.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(forbidden.data["code"], "verification_forbidden")

        self.client.force_authenticate(user=None)
        unauthenticated = self.client.get(
            reverse("mobile_api:artist_verification")
        )
        self.assertEqual(
            unauthenticated.status_code,
            status.HTTP_401_UNAUTHORIZED,
        )

    def test_artist_can_submit_documents_once_while_review_is_pending(self):
        response = self.client.post(
            reverse("mobile_api:artist_verification_documents"),
            self.document_payload(),
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["status"], "pending_documents")
        self.assertEqual(response.data["selected_path"], "documents")
        self.assertFalse(response.data["can_submit"])
        self.assertTrue(response.data["documents"]["has_business_document"])
        self.assertTrue(response.data["documents"]["has_id_document"])
        self.assertNotIn("business.pdf", str(response.data))
        self.assertNotIn("identity.png", str(response.data))

        document = VerificationDocument.objects.get(user=self.artist)
        self.assertEqual(document.business_document_type, "sole_proprietor")
        self.assertEqual(document.id_document_type, "passport")
        self.artist.profile.refresh_from_db()
        self.assertEqual(
            self.artist.profile.verification_status,
            "pending_documents",
        )

        locked = self.client.post(
            reverse("mobile_api:artist_verification_documents"),
            self.document_payload(),
            format="multipart",
        )
        self.assertEqual(locked.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(locked.data["code"], "verification_locked")
        self.assertEqual(
            VerificationDocument.objects.filter(user=self.artist).count(),
            1,
        )

    def test_spoofed_document_is_rejected_before_storage(self):
        payload = self.document_payload()
        payload["id_document_file"] = SimpleUploadedFile(
            "identity.png",
            b"this-is-not-an-image",
            content_type="image/png",
        )
        response = self.client.post(
            reverse("mobile_api:artist_verification_documents"),
            payload,
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("id_document_file", response.data)
        self.assertFalse(
            VerificationDocument.objects.filter(user=self.artist).exists()
        )
        self.artist.profile.refresh_from_db()
        self.assertEqual(
            self.artist.profile.verification_status,
            "not_submitted",
        )

    def test_manual_review_accepts_evidence_without_exposing_private_file(self):
        missing_explanation = self.client.post(
            reverse("mobile_api:artist_verification_manual"),
            {"portfolio_link": "https://portfolio.example/artist"},
            format="multipart",
        )
        self.assertEqual(
            missing_explanation.status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertIn("explanation", missing_explanation.data)
        self.assertFalse(
            ManualVerificationRequest.objects.filter(user=self.artist).exists()
        )

        response = self.client.post(
            reverse("mobile_api:artist_verification_manual"),
            {
                "portfolio_link": "https://portfolio.example/artist",
                "social_link": "https://social.example/artist",
                "city_country": "Paris, France",
                "explanation": "I work as a resident artist and can provide more evidence on request.",
                "extra_file": self.image_upload("studio-proof.png"),
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["status"], "pending_manual_review")
        self.assertEqual(response.data["selected_path"], "manual")
        self.assertTrue(response.data["manual"]["has_extra_file"])
        self.assertNotIn("studio-proof.png", str(response.data))
        request = ManualVerificationRequest.objects.get(user=self.artist)
        self.assertFalse(request.is_reviewed)

        fetched = self.client.get(reverse("mobile_api:artist_verification"))
        self.assertEqual(
            fetched.data["manual"]["portfolio_link"],
            "https://portfolio.example/artist",
        )
        self.assertNotIn("url", str(fetched.data).lower())

    def test_rejected_artist_can_choose_a_new_verification_path(self):
        first = self.client.post(
            reverse("mobile_api:artist_verification_documents"),
            self.document_payload(),
            format="multipart",
        )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.artist.profile.verification_status = "rejected"
        self.artist.profile.save(update_fields=("verification_status",))

        resubmitted = self.client.post(
            reverse("mobile_api:artist_verification_manual"),
            {
                "portfolio_link": "https://portfolio.example/review",
                "city_country": "Lyon, France",
                "explanation": "Please review my current portfolio and studio residency manually.",
            },
            format="multipart",
        )
        self.assertEqual(resubmitted.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resubmitted.data["status"], "pending_manual_review")
        self.assertTrue(
            ManualVerificationRequest.objects.filter(user=self.artist).exists()
        )

    def test_approved_artist_can_read_status_but_cannot_resubmit(self):
        self.artist.profile.verification_status = "approved"
        self.artist.profile.save(update_fields=("verification_status",))

        response = self.client.get(reverse("mobile_api:artist_verification"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "approved")
        self.assertFalse(response.data["can_submit"])

        locked = self.client.post(
            reverse("mobile_api:artist_verification_manual"),
            {
                "explanation": "This should not create another request.",
            },
            format="multipart",
        )
        self.assertEqual(locked.status_code, status.HTTP_409_CONFLICT)
        self.assertFalse(
            ManualVerificationRequest.objects.filter(user=self.artist).exists()
        )
