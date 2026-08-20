from pathlib import Path

from django.test import SimpleTestCase


class PaymentsDashboardUiTests(SimpleTestCase):
    def test_unconfigured_artist_still_gets_connect_stripe_cta(self):
        source = Path("payments/static/payments/dashboard.js").read_text(encoding="utf-8")

        self.assertIn('if (!data.ready) {', source)
        self.assertIn('actions.appendChild(connectButton(data.copy, data.state));', source)
        self.assertNotIn('if (data.configured && !data.ready) {', source)
