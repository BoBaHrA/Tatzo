from unittest.mock import Mock, patch

from django.test import SimpleTestCase, override_settings

from .stripe_api import create_connected_account, create_direct_checkout_session


@override_settings(
    STRIPE_SECRET_KEY="sk_test_tatzo",
    STRIPE_API_BASE="https://api.stripe.com",
)
class StripeAPIContractTests(SimpleTestCase):
    @patch("payments.stripe_api.requests.request")
    def test_connected_account_uses_stripe_fee_and_loss_responsibility(self, request):
        response = Mock()
        response.ok = True
        response.json.return_value = {"id": "acct_test"}
        request.return_value = response

        create_connected_account(email="artist@example.com")

        data = request.call_args.kwargs["data"]
        self.assertEqual(data["controller[fees][payer]"], "account")
        self.assertEqual(data["controller[losses][payments]"], "stripe")
        self.assertEqual(data["controller[requirement_collection]"], "stripe")
        self.assertEqual(data["controller[stripe_dashboard][type]"], "full")

    @patch("payments.stripe_api.requests.request")
    def test_checkout_is_direct_charge_with_zero_tatzo_application_fee(self, request):
        response = Mock()
        response.ok = True
        response.json.return_value = {"id": "cs_test", "url": "https://checkout.stripe.com/test"}
        request.return_value = response

        create_direct_checkout_session(
            connected_account_id="acct_artist",
            deposit_id=12,
            appointment_id=34,
            amount_cents=5000,
            currency="eur",
            success_url="https://tatzo.eu/success",
            cancel_url="https://tatzo.eu/cancel",
        )

        headers = request.call_args.kwargs["headers"]
        data = request.call_args.kwargs["data"]
        self.assertEqual(headers["Stripe-Account"], "acct_artist")
        self.assertEqual(data["line_items[0][price_data][unit_amount]"], "5000")
        self.assertNotIn("application_fee_amount", " ".join(data.keys()))
