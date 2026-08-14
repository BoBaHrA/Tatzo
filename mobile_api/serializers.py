import re
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import serializers

from users.models import Profile

User = get_user_model()


class RegistrationSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150, trim_whitespace=True)
    email = serializers.EmailField()
    password = serializers.CharField(
        min_length=8,
        max_length=128,
        trim_whitespace=False,
        write_only=True,
    )
    account_type = serializers.ChoiceField(choices=("regular", "tattoo_artist"))
    accept_terms = serializers.BooleanField(write_only=True)

    def validate_username(self, value):
        value = value.strip()
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError(
                "An account with this username already exists."
            )
        return value

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError(
                "An account with this email already exists."
            )
        return value

    def validate_accept_terms(self, value):
        if not value:
            raise serializers.ValidationError(
                "You must accept the Terms and Privacy Policy."
            )
        return value

    def validate(self, attrs):
        password = attrs["password"]
        password_errors = []

        if not re.search(r"[A-Z]", password):
            password_errors.append(
                "Password must contain at least one uppercase letter."
            )
        if not re.search(r"\d", password):
            password_errors.append("Password must contain at least one number.")

        candidate = User(username=attrs["username"], email=attrs["email"])
        try:
            validate_password(password, candidate)
        except DjangoValidationError as exc:
            password_errors.extend(exc.messages)

        if password_errors:
            raise serializers.ValidationError(
                {"password": list(dict.fromkeys(password_errors))}
            )

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        validated_data.pop("accept_terms")
        account_type = validated_data.pop("account_type")
        password = validated_data.pop("password")

        user = User.objects.create_user(
            password=password,
            is_active=False,
            **validated_data,
        )
        profile = Profile.objects.select_for_update().get(user=user)
        profile.account_type = account_type
        profile.save(update_fields=("account_type",))
        return User.objects.select_related("profile").get(pk=user.pk)


class MeSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    username = serializers.CharField(read_only=True)
    email = serializers.EmailField(read_only=True)
    account_type = serializers.CharField(source="profile.account_type", read_only=True)
    tag = serializers.CharField(source="profile.tag", read_only=True, allow_null=True)
    bio = serializers.CharField(source="profile.bio", read_only=True, allow_null=True)
    timezone = serializers.CharField(source="profile.timezone", read_only=True)
    show_liked_posts = serializers.BooleanField(
        source="profile.show_liked_posts", read_only=True
    )
    is_email_verified = serializers.BooleanField(
        source="profile.is_email_verified", read_only=True
    )
    verification_status = serializers.CharField(
        source="profile.verification_status", read_only=True
    )
    is_verified_artist = serializers.BooleanField(
        source="profile.is_verified_artist", read_only=True
    )
    is_staff = serializers.BooleanField(read_only=True)
    profile_image_url = serializers.SerializerMethodField()

    def get_profile_image_url(self, user):
        image = user.profile.profile_image
        if not image:
            return None

        try:
            url = image.url
        except (ValueError, AttributeError):
            return None

        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url


class MeUpdateSerializer(serializers.Serializer):
    username = serializers.CharField(
        max_length=150, required=False, trim_whitespace=True
    )
    tag = serializers.CharField(
        max_length=32,
        required=False,
        allow_blank=True,
        trim_whitespace=True,
    )
    bio = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        max_length=2000,
    )
    timezone = serializers.CharField(max_length=64, required=False)
    show_liked_posts = serializers.BooleanField(required=False)

    def validate_username(self, value):
        value = value.strip()
        user = self.context["request"].user
        duplicate = User.objects.filter(username__iexact=value).exclude(pk=user.pk)
        if duplicate.exists():
            raise serializers.ValidationError(
                "An account with this username already exists."
            )
        return value

    def validate_tag(self, value):
        value = Profile.normalize_tag(value)
        if not value:
            return value
        if len(value) < 3:
            raise serializers.ValidationError("Tag must contain at least 3 characters.")

        profile = self.context["request"].user.profile
        if Profile.objects.filter(tag=value).exclude(pk=profile.pk).exists():
            raise serializers.ValidationError("This tag is already taken.")
        return value

    def validate_timezone(self, value):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise serializers.ValidationError("Unknown time zone.")
        return value

    @transaction.atomic
    def update(self, user, validated_data):
        profile = Profile.objects.select_for_update().get(user=user)

        if "username" in validated_data:
            user.username = validated_data.pop("username")
            user.save(update_fields=("username",))

        profile_fields = []
        for field in ("tag", "bio", "timezone", "show_liked_posts"):
            if field in validated_data:
                setattr(profile, field, validated_data[field])
                profile_fields.append(field)

        if not profile.tag:
            profile.tag = Profile.generate_unique_tag(user.username)
            if "tag" not in profile_fields:
                profile_fields.append("tag")

        if profile_fields:
            profile.save(update_fields=profile_fields)

        return User.objects.select_related("profile").get(pk=user.pk)


class FeedAuthorSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    username = serializers.CharField(read_only=True)
    tag = serializers.CharField(source="profile.tag", read_only=True, allow_null=True)
    is_verified_artist = serializers.BooleanField(
        source="profile.is_verified_artist",
        read_only=True,
    )
    profile_image_url = serializers.SerializerMethodField()

    def get_profile_image_url(self, user):
        image = user.profile.profile_image
        if not image:
            return None

        try:
            url = image.url
        except (ValueError, AttributeError):
            return None

        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url


class FeedMediaSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    type = serializers.CharField(source="media_type", read_only=True)
    url = serializers.SerializerMethodField()
    order = serializers.IntegerField(read_only=True)

    def get_url(self, media):
        url = media.media_url
        if not url:
            return ""

        request = self.context.get("request")
        if request and url.startswith("/"):
            return request.build_absolute_uri(url)
        return url


class FeedPostSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    author = FeedAuthorSerializer(source="user", read_only=True)
    content = serializers.CharField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)
    disable_comments = serializers.BooleanField(read_only=True)
    is_ad = serializers.BooleanField(read_only=True)
    visibility = serializers.CharField(read_only=True)
    location = serializers.CharField(read_only=True)
    layout = serializers.CharField(read_only=True)
    media = FeedMediaSerializer(source="medias", many=True, read_only=True)
    likes_count = serializers.SerializerMethodField()
    comments_count = serializers.SerializerMethodField()
    is_liked = serializers.SerializerMethodField()
    is_bookmarked = serializers.SerializerMethodField()
    is_owned = serializers.SerializerMethodField()

    def get_likes_count(self, post):
        count = getattr(post, "feed_likes_count", None)
        return count if count is not None else post.likes.count()

    def get_comments_count(self, post):
        count = getattr(post, "feed_comments_count", None)
        return count if count is not None else post.comments.count()

    def get_is_liked(self, post):
        return bool(getattr(post, "viewer_liked", False))

    def get_is_bookmarked(self, post):
        return bool(getattr(post, "viewer_bookmarked", False))

    def get_is_owned(self, post):
        request = self.context.get("request")
        return bool(request and request.user.pk == post.user_id)
