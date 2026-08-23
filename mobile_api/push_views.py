import re

from django.db import IntegrityError, transaction
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from users.models import PushDevice

EXPO_PUSH_TOKEN_RE = re.compile(r"^(?:Expo|Exponent)PushToken\[[^\]\s]{1,220}\]$")


class PushDeviceRegistrationSerializer(serializers.Serializer):
    installation_id = serializers.UUIDField()
    expo_push_token = serializers.CharField(max_length=255)
    platform = serializers.ChoiceField(choices=("ios", "android"))
    locale = serializers.ChoiceField(choices=("en", "fr", "ru"), default="en")
    app_version = serializers.CharField(
        max_length=32,
        required=False,
        allow_blank=True,
        default="",
    )

    def validate_expo_push_token(self, value):
        value = value.strip()
        if not EXPO_PUSH_TOKEN_RE.fullmatch(value):
            raise serializers.ValidationError("Invalid Expo push token.")
        return value


class PushDeviceRemovalSerializer(serializers.Serializer):
    installation_id = serializers.UUIDField()


class PushDeviceView(APIView):
    permission_classes = (IsAuthenticated,)

    def put(self, request):
        serializer = PushDeviceRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            with transaction.atomic():
                token_conflict = (
                    PushDevice.objects.select_for_update()
                    .filter(expo_push_token=data["expo_push_token"])
                    .exclude(installation_id=data["installation_id"])
                    .exists()
                )
                if token_conflict:
                    return Response(
                        {"code": "push_token_conflict"},
                        status=status.HTTP_409_CONFLICT,
                    )
                device, created = PushDevice.objects.update_or_create(
                    installation_id=data["installation_id"],
                    defaults={
                        "user": request.user,
                        "expo_push_token": data["expo_push_token"],
                        "platform": data["platform"],
                        "locale": data["locale"],
                        "app_version": data["app_version"],
                        "is_active": True,
                    },
                )
        except IntegrityError:
            return Response(
                {"code": "push_token_conflict"},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(
            {
                "registered": True,
                "created": created,
                "platform": device.platform,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    def delete(self, request):
        serializer = PushDeviceRemovalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        PushDevice.objects.filter(
            user=request.user,
            installation_id=serializer.validated_data["installation_id"],
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
