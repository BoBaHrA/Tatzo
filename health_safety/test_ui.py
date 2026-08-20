from django.contrib.auth.models import User
from django.templatetags.static import static
from django.test import TestCase
from django.urls import reverse


class HealthSafetyUiRegressionTests(TestCase):
    def test_card_loads_shared_sidebar_styles(self):
        user = User.objects.create_user(username="health-ui-user", password="password123")
        self.client.force_login(user)

        response = self.client.get(reverse("health_safety:card"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, static("css/home.css"))
        self.assertContains(response, 'class="sidebar"')
