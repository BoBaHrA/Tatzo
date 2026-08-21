from datetime import time, timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from appointments.models import Appointment, ArtistBookingSettings
from payments.models import AppointmentDeposit, ArtistStripeAccount

User = get_user_model()


@override_settings(
    STRIPE_SECRET_KEY="sk_test_mobile",
    TATZO_RATE_LIMIT_ENABLED=False,
)
class MobilePaymentsTests(APITestCase):
    def setUp(self):
        self.client_user = self.create_user("mobile-pay-client")
        self.artist = self.create_user("mobile-pay-artist", artist=True)
        self.outsider = self.create_user("mobile-pay-outsider")
        self.booking_settings = ArtistBookingSettings.objects.update_or_create(
            artist=self.artist,
            defaults={"deposit_required": False, "deposit_amount": "50.00"},
        )[0]
        self.client.force_authenticate(self.artist)

    @staticmethod
    def create_user(username, artist=False):
        user = User.objects.create_user(
            username,
            email=f"{username}@example.com",
            password="StrongPassword123",
            is_active=True,
        )
        user.profile.is_email_verified = True
        if artist:
            user.profile.account_type = "tattoo_artist"
            user.profile.verification_status = "approved"
        user.profile.save(
            update_fields=(
                "is_email_verified",
                "account_type",
                "verification_status",
            )
        )
        return user

    @property
    def settings_url(self):
        return reverse("mobile_api:artist_payments")

    @property
    def connect_url(self):
        return reverse("mobile_api:artist_payments_connect")

    def ready_account(self):
        return ArtistStripeAccount.objects.create(
            artist=self.artist,
            stripe_account_id="acct_mobile_artist",
            charges_enabled=True,
            payouts_enabled=True,
            details_submitted=True,
        )

    def accepted_appointment(self):
        return Appointment.objects.create(
            client=self.client_user,
            artist=self.artist,
            booking_type=Appointment.TYPE_TATTOO,
            status=Appointment.STATUS_ACCEPTED,
            date=timezone.localdate() + timedelta(days=7),
            start_time=time(14),
            end_time=time(16),
            session_length_minutes=120,
        )

    def test_settings_require_authenticated_verified_artist(self):
        self.client.force_authenticate(user=None)
        self.assertEqual(
            self.client.get(self.settings_url).status_code,
            status.HTTP_401_UNAUTHORIZED,
        )
        self.client.force_authenticate(self.client_user)
        forbidden = self.client.get(self.settings_url)
        self.assertEqual(forbidden.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(forbidden.data["code"], "artist_payments_forbidden")

    def test_artist_sees_not_connected_state_without_exposing_account_ids(self):
        response = self.client.get(self.settings_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["state"], "not_connected")
        self.assertFalse(response.data["ready"])
        self.assertNotIn("account_id", str(response.data))
        self.assertIn("deposit_settings_title", response.data["copy"])

    @patch("mobile_api.payment_views.create_account_link")
    @patch("mobile_api.payment_views.create_connected_account")
    def test_artist_starts_hosted_connect_onboarding_with_mobile_return(
        self,
        create_account,
        create_link,
    ):
        create_account.return_value = {
            "id": "acct_mobile_new",
            "charges_enabled": False,
            "payouts_enabled": False,
            "details_submitted": False,
        }
        create_link.return_value = {
            "url": "https://connect.stripe.com/setup/mobile-test"
        }

        response = self.client.post(self.connect_url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["url"],
            "https://connect.stripe.com/setup/mobile-test",
        )
        record = ArtistStripeAccount.objects.get(artist=self.artist)
        self.assertEqual(record.stripe_account_id, "acct_mobile_new")
        kwargs = create_link.call_args.kwargs
        self.assertIn("/api/v1/payments/mobile-return/", kwargs["return_url"])
        self.assertIn("result=return", kwargs["return_url"])
        self.assertIn("result=refresh", kwargs["refresh_url"])

    @patch("mobile_api.payment_views.retrieve_connected_account")
    def test_status_refreshes_stripe_readiness_without_return_cookie(self, retrieve):
        account = ArtistStripeAccount.objects.create(
            artist=self.artist,
            stripe_account_id="acct_mobile_sync",
        )
        retrieve.return_value = {
            "id": account.stripe_account_id,
            "charges_enabled": True,
            "payouts_enabled": True,
            "details_submitted": True,
        }

        response = self.client.get(self.settings_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["state"], "ready")
        self.assertTrue(response.data["ready"])
        account.refresh_from_db()
        self.assertTrue(account.is_ready)

    def test_deposit_setting_requires_ready_stripe_and_valid_amount(self):
        blocked = self.client.patch(
            self.settings_url,
            {"deposit_required": True, "deposit_amount": "75"},
            format="json",
        )
        self.assertEqual(blocked.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(blocked.data["code"], "stripe_not_ready")

        self.ready_account()
        invalid = self.client.patch(
            self.settings_url,
            {"deposit_required": True, "deposit_amount": "0"},
            format="json",
        )
        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)

        saved = self.client.patch(
            self.settings_url,
            {"deposit_required": True, "deposit_amount": "75.50"},
            format="json",
        )
        self.assertEqual(saved.status_code, status.HTTP_200_OK)
        self.assertTrue(saved.data["deposit_required"])
        self.assertEqual(saved.data["deposit_amount"], "75.5")
        self.booking_settings.refresh_from_db()
        self.assertTrue(self.booking_settings.deposit_required)
        self.assertEqual(str(self.booking_settings.deposit_amount), "75.50")

    def make_deposit(self):
        self.ready_account()
        self.booking_settings.deposit_required = True
        self.booking_settings.deposit_amount = "50.00"
        self.booking_settings.save(
            update_fields=("deposit_required", "deposit_amount", "updated_at")
        )
        appointment = self.accepted_appointment()
        return appointment, AppointmentDeposit.objects.get(appointment=appointment)

    def test_deposit_status_is_participant_only_and_role_aware(self):
        appointment, _ = self.make_deposit()
        url = reverse("mobile_api:appointment_deposit", args=[appointment.pk])

        self.client.force_authenticate(self.client_user)
        client_response = self.client.get(url)
        self.assertEqual(client_response.status_code, status.HTTP_200_OK)
        self.assertTrue(client_response.data["has_deposit"])
        self.assertEqual(client_response.data["role"], "client")
        self.assertTrue(client_response.data["can_pay"])
        self.assertEqual(client_response["Cache-Control"], "private, no-store")

        self.client.force_authenticate(self.artist)
        artist_response = self.client.get(url)
        self.assertEqual(artist_response.data["role"], "artist")
        self.assertFalse(artist_response.data["can_pay"])

        self.client.force_authenticate(self.outsider)
        self.assertEqual(self.client.get(url).status_code, status.HTTP_404_NOT_FOUND)

    @patch("mobile_api.payment_views.create_direct_checkout_session")
    def test_client_checkout_uses_hosted_stripe_and_mobile_return(
        self, create_checkout
    ):
        create_checkout.return_value = {
            "id": "cs_mobile_test",
            "url": "https://checkout.stripe.com/mobile-test",
        }
        appointment, deposit = self.make_deposit()
        url = reverse("mobile_api:appointment_deposit", args=[appointment.pk])
        self.client.force_authenticate(self.client_user)

        response = self.client.post(url, {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["url"], "https://checkout.stripe.com/mobile-test"
        )
        kwargs = create_checkout.call_args.kwargs
        self.assertEqual(kwargs["connected_account_id"], "acct_mobile_artist")
        self.assertEqual(kwargs["amount_cents"], 5000)
        self.assertIn(
            f"/api/v1/payments/appointments/{appointment.pk}/return/",
            kwargs["success_url"],
        )
        deposit.refresh_from_db()
        self.assertEqual(deposit.status, AppointmentDeposit.STATUS_CHECKOUT)
        self.assertEqual(deposit.checkout_session_id, "cs_mobile_test")

    def test_mobile_return_deep_links_without_marking_deposit_paid(self):
        appointment, deposit = self.make_deposit()
        return_url = reverse(
            "mobile_api:mobile_deposit_return",
            args=[appointment.pk],
        )

        response = self.client.get(return_url, {"result": "success"})

        self.assertEqual(response.status_code, status.HTTP_302_FOUND)
        self.assertEqual(
            response["Location"],
            f"tatzo://appointment/{appointment.pk}?payment_return=success",
        )
        deposit.refresh_from_db()
        self.assertNotEqual(deposit.status, AppointmentDeposit.STATUS_PAID)

        connect_return = self.client.get(
            reverse("mobile_api:mobile_payment_return"),
            {"result": "return"},
        )
        self.assertEqual(
            connect_return["Location"],
            "tatzo://artist-dashboard/payments?stripe_return=return",
        )
