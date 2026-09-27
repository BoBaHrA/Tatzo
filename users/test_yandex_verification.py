from django.test import TestCase
from django.urls import reverse


class YandexVerificationTests(TestCase):
    def test_yandex_webmaster_verification_endpoint(self):
        response = self.client.get(reverse("yandex_verification"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/html; charset=utf-8")
        self.assertEqual(response["Cache-Control"], "public, max-age=86400")
        self.assertContains(response, "Verification: 16a0f5b5574ae8af")
