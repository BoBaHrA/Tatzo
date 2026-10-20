from django.test import TestCase

from users.management.commands.import_tattoo_locations import Command
from users.models import Location


class OSMImportSafetyTests(TestCase):
    def setUp(self):
        self.command = Command()
        self.payload = {
            "name": "Original studio",
            "city": "Croydon",
            "country": "UK",
            "address": "56 Shirley Road",
            "formatted_address": "56 Shirley Road, Croydon",
            "latitude": 51.37,
            "longitude": -0.08,
            "source": "osm",
            "source_place_id": "node/123456",
            "status": "imported",
        }

    def test_new_location_is_imported(self):
        location, created = self.command.save_location(self.payload)
        self.assertTrue(created)
        self.assertEqual(location.status, "imported")

    def test_unclaimed_location_is_refreshed_without_status_reset(self):
        location = Location.objects.create(**{**self.payload, "status": "unclaimed"})
        self.command.save_location({**self.payload, "name": "Updated studio"})
        location.refresh_from_db()
        self.assertEqual(location.name, "Updated studio")
        self.assertEqual(location.status, "unclaimed")

    def test_pending_claim_is_not_overwritten_by_import(self):
        location = Location.objects.create(**{**self.payload, "status": "pending_claim"})
        self.command.save_location({**self.payload, "name": "Old external name"})
        location.refresh_from_db()
        self.assertEqual(location.status, "pending_claim")
        self.assertEqual(location.name, "Original studio")

    def test_verified_location_is_not_downgraded(self):
        location = Location.objects.create(**{**self.payload, "status": "verified"})
        self.command.save_location(self.payload)
        location.refresh_from_db()
        self.assertEqual(location.status, "verified")

    def test_suppressed_location_is_not_reimported(self):
        # A future migration can add this workflow state. The importer must
        # already treat all non-importable statuses as authoritative.
        location = Location.objects.create(**{**self.payload, "status": "removed"})
        self.command.save_location({**self.payload, "name": "Reappeared"})
        location.refresh_from_db()
        self.assertEqual(location.name, "Original studio")
        self.assertEqual(location.status, "removed")
        self.assertEqual(Location.objects.filter(source_place_id="node/123456").count(), 1)

    def test_suppressed_location_survives_external_id_change(self):
        location = Location.objects.create(**{**self.payload, "status": "removed"})
        result, created = self.command.save_location({
            **self.payload, "source_place_id": "way/998877",
        })
        self.assertFalse(created)
        self.assertEqual(result.pk, location.pk)
        self.assertEqual(Location.objects.count(), 1)
        location.refresh_from_db()
        self.assertEqual(location.status, "removed")
        self.assertEqual(location.source_place_id, "node/123456")

    def test_different_address_is_not_suppressed_when_external_id_changes(self):
        Location.objects.create(**{**self.payload, "status": "removed"})
        result, created = self.command.save_location({
            **self.payload,
            "source_place_id": "node/654321",
            "address": "58 Shirley Road",
            "formatted_address": "58 Shirley Road, Croydon",
        })
        self.assertTrue(created)
        self.assertEqual(result.status, "imported")
        self.assertEqual(Location.objects.count(), 2)
