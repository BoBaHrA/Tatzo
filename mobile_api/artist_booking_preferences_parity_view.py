from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from appointments.models import ArtistBookingSettings

from .artist_dashboard_payloads import booking_preferences_payload
from .artist_dashboard_views import (
    BOOKING_PREFERENCE_FIELDS as BASE_BOOKING_PREFERENCE_FIELDS,
    ArtistBookingPreferencesSerializer,
    PrivateArtistResponseMixin,
    _artist_forbidden,
)


User = get_user_model()

BOOKING_PREFERENCE_FIELDS = (
    *BASE_BOOKING_PREFERENCE_FIELDS,
    "bookings_enabled",
    "phone_consultation_enabled",
    "deposit_required",
    "deposit_amount",
)


class ArtistBookingPreferencesParitySerializer(ArtistBookingPreferencesSerializer):
    bookings_enabled = serializers.BooleanField()
    phone_consultation_enabled = serializers.BooleanField()
    deposit_required = serializers.BooleanField()
    deposit_amount = serializers.DecimalField(
        max_digits=8,
        decimal_places=2,
        min_value=Decimal("0"),
        max_value=Decimal("999999.99"),
    )


def _decimal_string(value):
    return f"{value:.2f}".rstrip("0").rstrip(".")


def booking_preferences_parity_payload(settings):
    payload = booking_preferences_payload(settings)
    payload.update(
        {
            "bookings_enabled": settings.bookings_enabled,
            "phone_consultation_enabled": settings.phone_consultation_enabled,
            "deposit_required": settings.deposit_required,
            "deposit_amount": _decimal_string(settings.deposit_amount),
        }
    )
    return payload


class ArtistBookingPreferencesView(PrivateArtistResponseMixin, APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        forbidden = _artist_forbidden(request)
        if forbidden:
            return forbidden
        settings = ArtistBookingSettings.objects.filter(artist=request.user).first()
        if settings is None:
            settings = ArtistBookingSettings.objects.create(artist=request.user)
        return Response(booking_preferences_parity_payload(settings))

    def put(self, request):
        forbidden = _artist_forbidden(request)
        if forbidden:
            return forbidden
        serializer = ArtistBookingPreferencesParitySerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {
                    "code": "invalid_booking_preferences",
                    "detail": "Check the booking settings and try again.",
                    "errors": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            User.objects.select_for_update().get(pk=request.user.pk)
            settings = (
                ArtistBookingSettings.objects.select_for_update()
                .filter(artist=request.user)
                .first()
            )
            if settings is None:
                settings = ArtistBookingSettings.objects.create(artist=request.user)
            for field in BOOKING_PREFERENCE_FIELDS:
                setattr(settings, field, serializer.validated_data[field])
            settings.save(update_fields=(*BOOKING_PREFERENCE_FIELDS, "updated_at"))

        return Response(booking_preferences_parity_payload(settings))
