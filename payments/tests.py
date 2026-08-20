import hashlib
import hmac
import json
import time
from datetime import time as dt_time, timedelta
from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from appointments.models import Appointment, ArtistBookingSettings

from .models import AppointmentDeposit, ArtistStripeAccount


class PaymentsFlowTests(TestCase):
    def setUp(self):
        self.client_user = User.objects.create_user(
            username="pay-client",
            password="password123",
        )
        self.artist = User.objects.create_user(
            username="pay-artist",
            password="password123",
            email="artist@example.com",
        )
        self.artist.profile.account_type = "tattoo_artist"
        self.artist.profile.verification_status = "approved"
        self.artist.profile.is_email_verified = True
        self.artist.profile.save()
        self.outsider = User.objects.create_user(
            username="pay-outsider",
            password="password123",
        )
        self.stripe_account = ArtistStripeAccount.objects.create(
            artist=self.artist,
            stripe_account_id="acct_artist",
            charges_enabled=True,
            payouts_enabled=True,
            details_submitted=True,
        )
        self.booking_settings = ArtistBookingSettings.objects.create(
            artist=self.artist,
            deposit_required=True,
            deposit_amount="50.00",
        )

    def appointment(self, *, status=Appointment.STATUS_PENDING, start_hour=14):
        return Appointment.objects.create(
            client=self.client_user,
            artist=self.artist,
            booking_type=Appointment.TYPE_TATTOO,
            status=status,
            date=timezone.localdate() + timedelta(days=7),
            start_time=dt_time(start_hour, 0),
            end_time=dt_time(start_hour + 2, 0),
            session_length_minutes=120,
        )

    def test_pending_request_gets_deposit_only_after_artist_accepts(self):
        appointment = self.appointment()
        self.assertFalse(AppointmentDeposit.objects.filter(appointment=appointment).exists())

        appointment.accept()
        deposit = AppointmentDeposit.objects.get(appointment=appointment)
        self.assertEqual(str(deposit.amount), "50.00")
        self.assertEqual(deposit.connected_account_id, "acct_artist")
        self.assertEqual(deposit.status, AppointmentDeposit.STATUS_PENDING)
        self.assertGreater(deposit.expires_at, timezone.now())

    def test_auto_accepted_booking_gets_deposit_immediately(self):
        appointment = self.appointment(status=Appointment.STATUS_ACCEPTED)
        self.assertTrue(AppointmentDeposit.objects.filter(appointment=appointment).exists())

    def test_deposit_amount_is_snapshotted_at_acceptance(self):
        appointment = self.appointment()
        appointment.accept()
        deposit = AppointmentDeposit.objects.get(appointment=appointment)
        self.booking_settings.deposit_amount = "80.00"
        self.booking_settings.save(update_fields=["deposit_amount"])
        deposit.refresh_from_db()
        self.assertEqual(str(deposit.amount), "50.00")

    def test_cancelling_unpaid_booking_cancels_deposit(self):
        appointment = self.appointment(status=Appointment.STATUS_ACCEPTED)
        deposit = AppointmentDeposit.objects.get(appointment=appointment)
        appointment.status = Appointment.STATUS_CANCELLED
        appointment.save(update_fields=["status", "updated_at"])
        deposit.refresh_from_db()
        self.assertEqual(deposit.status, AppointmentDeposit.STATUS_CANCELLED)

    def test_unready_stripe_account_disables_deposit_setting(self):
        self.stripe_account.payouts_enabled = False
        self.stripe_account.save(update_fields=["payouts_enabled", "updated_at"])
        self.booking_settings.refresh_from_db()
        self.assertFalse(self.booking_settings.deposit_required)

    def test_server_rejects_deposit_required_without_ready_stripe_account(self):
        self.stripe_account.payouts_enabled = False
        self.stripe_account.save(update_fields=["payouts_enabled", "updated_at"])
        self.booking_settings.deposit_required = True
        self.booking_settings.save(update_fields=["deposit_required", "updated_at"])
        self.booking_settings.refresh_from_db()
        self.assertFalse(self.booking_settings.deposit_required)

    def test_outsider_cannot_probe_deposit_status(self):
        appointment = self.appointment(status=Appointment.STATUS_ACCEPTED)
        self.client.force_login(self.outsider)
        response = self.client.get(
            reverse("payments:deposit_status", args=[appointment.pk])
        )
        self.assertEqual(response.status_code, 404)

    @patch("payments.views.create_direct_checkout_session")
    def test_client_checkout_uses_artist_connected_account(self, create_checkout):
        create_checkout.return_value = {
            "id": "cs_test_123",
            "url": "https://checkout.stripe.com/test-session",
        }
        appointment = self.appointment(status=Appointment.STATUS_ACCEPTED)
        deposit = AppointmentDeposit.objects.get(appointment=appointment)
        self.client.force_login(self.client_user)
        response = self.client.post(
            reverse("payments:deposit_checkout", args=[appointment.pk])
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["url"], "https://checkout.stripe.com/test-session")
        kwargs = create_checkout.call_args.kwargs
        self.assertEqual(kwargs["connected_account_id"], "acct_artist")
        self.assertEqual(kwargs["amount_cents"], 5000)
        deposit.refresh_from_db()
        self.assertEqual(deposit.checkout_session_id, "cs_test_123")
        self.assertEqual(deposit.status, AppointmentDeposit.STATUS_CHECKOUT)

    def test_checkout_is_client_only(self):
        appointment = self.appointment(status=Appointment.STATUS_ACCEPTED)
        self.client.force_login(self.artist)
        response = self.client.post(
            reverse("payments:deposit_checkout", args=[appointment.pk])
        )
        self.assertEqual(response.status_code, 404)

    def _stripe_signature(self, body, secret, timestamp=None):
        timestamp = timestamp or int(time.time())
        signed = f"{timestamp}.".encode() + body
        digest = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
        return f"t={timestamp},v1={digest}"

    @override_settings(STRIPE_CONNECT_WEBHOOK_SECRET="whsec_test")
    def test_only_verified_connected_webhook_marks_deposit_paid(self):
        appointment = self.appointment(status=Appointment.STATUS_ACCEPTED)
        deposit = AppointmentDeposit.objects.get(appointment=appointment)
        event = {
            "id": "evt_paid",
            "type": "checkout.session.completed",
            "account": "acct_artist",
            "data": {
                "object": {
                    "id": "cs_paid",
                    "payment_status": "paid",
                    "payment_intent": "pi_paid",
                    "metadata": {
                        "deposit_id": str(deposit.pk),
                        "appointment_id": str(appointment.pk),
                    },
                }
            },
        }
        body = json.dumps(event, separators=(",", ":")).encode()

        bad = self.client.post(
            reverse("payments:stripe_webhook"),
            data=body,
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE="t=1,v1=bad",
        )
        self.assertEqual(bad.status_code, 400)
        deposit.refresh_from_db()
        self.assertNotEqual(deposit.status, AppointmentDeposit.STATUS_PAID)

        good = self.client.post(
            reverse("payments:stripe_webhook"),
            data=body,
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE=self._stripe_signature(body, "whsec_test"),
        )
        self.assertEqual(good.status_code, 200)
        deposit.refresh_from_db()
        self.assertEqual(deposit.status, AppointmentDeposit.STATUS_PAID)
        self.assertEqual(deposit.payment_intent_id, "pi_paid")
        self.assertIsNotNone(deposit.paid_at)

    @override_settings(STRIPE_CONNECT_WEBHOOK_SECRET="whsec_test")
    def test_event_from_another_connected_account_cannot_update_deposit(self):
        appointment = self.appointment(status=Appointment.STATUS_ACCEPTED)
        deposit = AppointmentDeposit.objects.get(appointment=appointment)
        event = {
            "id": "evt_wrong_account",
            "type": "payment_intent.succeeded",
            "account": "acct_someone_else",
            "data": {
                "object": {
                    "id": "pi_wrong",
                    "metadata": {"deposit_id": str(deposit.pk)},
                }
            },
        }
        body = json.dumps(event, separators=(",", ":")).encode()
        response = self.client.post(
            reverse("payments:stripe_webhook"),
            data=body,
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE=self._stripe_signature(body, "whsec_test"),
        )
        self.assertEqual(response.status_code, 200)
        deposit.refresh_from_db()
        self.assertNotEqual(deposit.status, AppointmentDeposit.STATUS_PAID)

    def test_return_from_checkout_does_not_mark_payment_paid(self):
        appointment = self.appointment(status=Appointment.STATUS_ACCEPTED)
        deposit = AppointmentDeposit.objects.get(appointment=appointment)
        self.client.force_login(self.client_user)
        response = self.client.get(
            reverse("payments:deposit_return", args=[appointment.pk]),
            {"session_id": "cs_fake"},
        )
        self.assertEqual(response.status_code, 302)
        deposit.refresh_from_db()
        self.assertNotEqual(deposit.status, AppointmentDeposit.STATUS_PAID)


@override_settings(STRIPE_SECRET_KEY="sk_test_tatzo")
class StripeConnectOnboardingTests(TestCase):
    def setUp(self):
        self.artist = User.objects.create_user(
            username="stripe-artist",
            password="password123",
            email="stripe@example.com",
        )
        self.artist.profile.account_type = "tattoo_artist"
        self.artist.profile.verification_status = "approved"
        self.artist.profile.is_email_verified = True
        self.artist.profile.save()
        self.client.force_login(self.artist)

    @patch("payments.views.create_account_link")
    @patch("payments.views.create_connected_account")
    def test_connect_start_creates_account_and_redirects_to_hosted_onboarding(
        self,
        create_account,
        create_link,
    ):
        create_account.return_value = {
            "id": "acct_new",
            "charges_enabled": False,
            "payouts_enabled": False,
            "details_submitted": False,
        }
        create_link.return_value = {
            "url": "https://connect.stripe.com/setup/test",
        }
        response = self.client.post(reverse("payments:connect_start"))
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, "https://connect.stripe.com/setup/test")
        record = ArtistStripeAccount.objects.get(artist=self.artist)
        self.assertEqual(record.stripe_account_id, "acct_new")
        self.assertFalse(record.is_ready)
