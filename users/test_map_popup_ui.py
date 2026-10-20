"""Regression coverage for Leaflet popup styling and its existing actions.

Map popups are generated client-side; keep this contract test independent of
live OpenStreetMap data and external tiles.
"""
from pathlib import Path
import shutil
import subprocess

from django.conf import settings
from django.test import TestCase
from django.urls import reverse


ASSET_ROOT = Path(settings.BASE_DIR) / "static"


class MapPopupUiTests(TestCase):
    def setUp(self):
        self.script_file = ASSET_ROOT / "js" / "maps.js"
        self.css_file = ASSET_ROOT / "css" / "maps.css"
        self.script = self.script_file.read_text(encoding="utf-8")
        self.css = self.css_file.read_text(encoding="utf-8")

    def test_popup_contains_both_location_styles_and_status_chips(self):
        self.assertIn('tatzo-map-popup-${popupType}', self.script)
        self.assertIn('class="tatzo-map-popup-title"', self.script)
        self.assertIn('tatzo-map-popup-badge-data', self.script)
        self.assertIn('tatzo-map-popup-contact', self.script)
        self.assertIn('className: "tatzo-leaflet-popup"', self.script)
        self.assertIn(".tatzo-map-popup-icon", self.css)
        self.assertIn(".tatzo-map-popup-badge", self.css)
        self.assertIn(".tatzo-map-popup-unclaimed", self.css)
        self.assertIn(".tatzo-map-popup-claim", self.css)
        self.assertIn(".tatzo-map-popup-profile", self.css)
        self.assertIn(".tatzo-map-popup-pending", self.css)

    def test_book_profile_and_existing_claim_behaviour_is_preserved(self):
        self.assertIn('card.dataset.canBook === "true"', self.script)
        self.assertIn("card.dataset.bookUrl", self.script)
        self.assertIn("card.dataset.profileUrl", self.script)
        self.assertIn('card.dataset.claimPending === "true"', self.script)
        self.assertIn('card.dataset.claimable === "true"', self.script)
        self.assertIn('data-open-claim data-claim-url=', self.script)
        self.assertIn('event.target.closest("[data-open-claim]")', self.script)
        self.assertIn('claimDialog?.showModal()', self.script)
        self.assertIn('safeExternalUrl(card.dataset.website', self.script)
        self.assertIn('escapeHtml(card.dataset.artist', self.script)

    def test_map_includes_popup_assets_and_stays_localized(self):
        response = self.client.get(reverse("maps_page"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "css/maps.")
        self.assertContains(response, "js/maps.")
        self.assertContains(response, 'id="maps-i18n"')

    def test_javascript_parses_in_node_if_available(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("Node is unavailable in this environment")
        result = subprocess.run(
            [node, "--check", str(self.script_file)],
            capture_output=True, text=True, timeout=20, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
