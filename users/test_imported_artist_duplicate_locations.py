from django.core import mail
from django.test import TestCase, override_settings
from django.urls import reverse

from .imported_artists import (
    IMPORTED_ARTIST_SOURCE_MARKER,
    ImportedArtistAdminForm,
    create_imported_artist,
    make_imported_artist_claim_token,
)
from .models import Location


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    DEFAULT_FROM_EMAIL="Tatzo <noreply@example.com>",
)
class ImportedArtistDuplicateLocationClaimTests(TestCase):
    def test_claim_locks_deterministic_location_when_duplicate_markers_exist(self):
        form = ImportedArtistAdminForm(
            data={
                "username": "duplicate-marker-artist",
                "display_name": "Duplicate Marker Artist",
                "city": "Paris",
                "country": "France",
                "instagram_url": "https://www.instagram.com/duplicate-marker-artist/",
                "bio": "Tattoo artist",
                "default_style": "Blackwork",
            }
        )
        self.assertTrue(form.is_valid(), form.errors)
        user, selected_location = create_imported_artist(form)

        duplicate_location = Location.objects.create(
            name="Duplicate Marker Artist copy",
            city="Paris",
            country="France",
            source="admin",
            source_place_id=IMPORTED_ARTIST_SOURCE_MARKER,
            status="unclaimed",
            linked_user=user,
        )
        self.assertLess(selected_location.pk, duplicate_location.pk)

        token = make_imported_artist_claim_token(user)
        response = self.client.post(
            reverse("claim_imported_artist", kwargs={"token": token}),
            {
                "email": "duplicate-marker@example.com",
                "password1": "StrongPass!23456",
                "password2": "StrongPass!23456",
                "accept_terms": "on",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "users/claim_imported_artist_done.html")

        user.refresh_from_db()
        selected_location.refresh_from_db()
        duplicate_location.refresh_from_db()
        self.assertEqual(user.email, "duplicate-marker@example.com")
        self.assertEqual(selected_location.status, "pending_claim")
        self.assertEqual(duplicate_location.status, "unclaimed")
        self.assertEqual(len(mail.outbox), 1)
