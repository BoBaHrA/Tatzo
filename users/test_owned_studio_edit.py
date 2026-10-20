"""Owner-only editing of public studio details without changing map/ownership data."""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.urls import reverse

from users.models import Location

User = get_user_model()


class OwnedStudioEditTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            "studioowner", "owner@example.org", "testpass123"
        )
        self.other = User.objects.create_user(
            "anotherowner", "other@example.org", "testpass123"
        )
        self.studio = Location.objects.create(
            name="Old studio name",
            address="5 rue Victor Duruy",
            formatted_address="5 rue Victor Duruy",
            city="Clermont-Ferrand",
            country="France",
            latitude=Decimal("45.784700"),
            longitude=Decimal("3.075381"),
            phone="0767454704",
            website="https://old.example.com",
            source="osm",
            source_place_id="node/2211",
            studio_owner=self.owner,
            status="claimed",
        )
        self.url = reverse("edit_owned_studio", args=[self.studio.pk])
        self.client.force_login(self.owner)

    def test_owner_sees_edit_button_and_prefilled_page(self):
        dashboard = self.client.get(reverse("my_studios"))
        self.assertContains(dashboard, self.url)
        self.assertContains(dashboard, "Edit studio details")
        page = self.client.get(self.url)
        self.assertEqual(page.status_code, 200)
        self.assertContains(page, "Old studio name")
        self.assertContains(page, "0767454704")
        self.assertContains(page, "https://old.example.com")
        self.assertContains(page, "5 rue Victor Duruy")
        self.assertContains(page, "name=\"csrfmiddlewaretoken\"")

    def test_owner_can_rename_and_update_contact_details(self):
        result = self.client.post(self.url, {
            "name": "  Medusa Tattoo Studio  ",
            "phone": "  +33 7 67 45 47 04  ",
            "website": "https://tatzo.eu",
        })
        self.assertRedirects(result, reverse("my_studios"))
        self.studio.refresh_from_db()
        self.assertEqual(self.studio.name, "Medusa Tattoo Studio")
        self.assertEqual(self.studio.phone, "+33 7 67 45 47 04")
        self.assertEqual(self.studio.website, "https://tatzo.eu")
        self.assertContains(self.client.get(reverse("my_studios")), "Medusa Tattoo Studio")

    def test_post_cannot_modify_location_coordinates_or_owner(self):
        self.client.post(self.url, {
            "name": "New studio name",
            "phone": "",
            "website": "",
            "address": "Changed location",
            "formatted_address": "Fake address",
            "latitude": "1.111111",
            "longitude": "2.222222",
            "city": "Paris",
            "country": "United Kingdom",
            "studio_owner": self.other.pk,
            "status": "verified",
            "linked_user": self.other.pk,
            "source_place_id": "node/tampered",
        })
        self.studio.refresh_from_db()
        self.assertEqual(self.studio.name, "New studio name")
        self.assertEqual(self.studio.phone, "")
        self.assertEqual(self.studio.website, "")
        self.assertEqual(self.studio.address, "5 rue Victor Duruy")
        self.assertEqual(self.studio.latitude, Decimal("45.784700"))
        self.assertEqual(self.studio.longitude, Decimal("3.075381"))
        self.assertEqual(self.studio.city, "Clermont-Ferrand")
        self.assertEqual(self.studio.country, "France")
        self.assertEqual(self.studio.status, "claimed")
        self.assertEqual(self.studio.source_place_id, "node/2211")
        self.assertEqual(self.studio.studio_owner_id, self.owner.pk)
        self.assertIsNone(self.studio.linked_user_id)

    def test_other_user_cannot_view_or_post_edit(self):
        self.client.force_login(self.other)
        self.assertEqual(self.client.get(self.url).status_code, 404)
        self.assertEqual(
            self.client.post(self.url, {
                "name": "Hacked",
                "phone": "123",
                "website": "https://other.example.org",
            }).status_code, 404,
        )
        self.studio.refresh_from_db()
        self.assertEqual(self.studio.name, "Old studio name")

    def test_anonymous_is_redirected(self):
        self.client.logout()
        result = self.client.get(self.url)
        self.assertEqual(result.status_code, 302)
        self.assertIn("login", result.url)
        result = self.client.post(self.url, {"name": "Hacked"})
        self.assertEqual(result.status_code, 302)

    def test_unclaimed_and_removed_studios_are_not_editable(self):
        for status in ("unclaimed", "removed", "rejected"):
            with self.subTest(status=status):
                self.studio.status = status
                self.studio.save(update_fields=["status"])
                self.assertEqual(self.client.get(self.url).status_code, 404)
                self.assertEqual(self.client.post(self.url, {
                    "name": "Not allowed",
                }).status_code, 404)

    def test_verified_artist_linked_to_another_account_is_protected(self):
        self.studio.status = "verified"
        self.studio.linked_user = self.other
        self.studio.save(update_fields=["status", "linked_user"])
        self.assertNotContains(self.client.get(reverse("my_studios")), self.url)
        self.assertEqual(self.client.get(self.url).status_code, 404)
        self.assertEqual(self.client.post(self.url, {
            "name": "Hacked",
        }).status_code, 404)

    def test_own_verified_artist_location_is_editable(self):
        self.studio.status = "verified"
        self.studio.linked_user = self.owner
        self.studio.save(update_fields=["status", "linked_user"])
        result = self.client.post(self.url, {
            "name": "Tatzo studio",
            "phone": "0767454704",
            "website": "https://tatzo.eu",
        })
        self.assertRedirects(result, reverse("my_studios"))
        self.studio.refresh_from_db()
        self.assertEqual(self.studio.name, "Tatzo studio")

    def test_empty_or_too_long_name_is_rejected(self):
        for name in ("   ", "x" * 161):
            with self.subTest(name_length=len(name)):
                result = self.client.post(self.url, {
                    "name": name,
                    "phone": "",
                    "website": "",
                })
                self.assertEqual(result.status_code, 200)
                self.assertContains(result, 'role="alert"')
                self.studio.refresh_from_db()
                self.assertEqual(self.studio.name, "Old studio name")

    def test_unsafe_website_is_rejected(self):
        for website in ("javascript:alert(1)", "ftp://somewhere.example.com", "https://user:secret@example.com"):
            with self.subTest(website=website):
                result = self.client.post(self.url, {
                    "name": "Some studio",
                    "phone": "",
                    "website": website,
                })
                self.assertEqual(result.status_code, 200)
                self.studio.refresh_from_db()
                self.assertEqual(self.studio.name, "Old studio name")

    def test_csrf_protection(self):
        client = Client(enforce_csrf_checks=True)
        client.force_login(self.owner)
        response = client.post(self.url, {
            "name": "Unprotected change",
            "phone": "",
            "website": "",
        })
        self.assertEqual(response.status_code, 403)
        self.studio.refresh_from_db()
        self.assertEqual(self.studio.name, "Old studio name")
