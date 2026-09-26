import logging

from django import forms
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core import signing
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.http import Http404
from django.shortcuts import get_object_or_404, render
from django.utils.translation import gettext as _
from django.views.decorators.http import require_http_methods

from posts.models import Post, PostBookmark, PostLike
from .models import Location, PortfolioWork, Profile, UserBlock, UserFollow
from .utils import send_verification_email

logger = logging.getLogger(__name__)
User = get_user_model()

IMPORTED_ARTIST_SOURCE_MARKER = "tatzo:imported-artist"
CLAIM_TOKEN_SALT = "tatzo.imported-artist-claim"
CLAIM_TOKEN_MAX_AGE = 30 * 24 * 60 * 60
MAX_IMPORTED_WORKS = 12
MAX_IMPORTED_IMAGE_SIZE = 10 * 1024 * 1024


class MultipleImageInput(forms.ClearableFileInput):
    allow_multiple_selected = True


class MultipleImageField(forms.ImageField):
    widget = MultipleImageInput

    def clean(self, data, initial=None):
        single_clean = super().clean
        if not data:
            return []
        if isinstance(data, (list, tuple)):
            return [single_clean(item, initial) for item in data]
        return [single_clean(data, initial)]


class ImportedArtistAdminForm(forms.Form):
    username = forms.CharField(
        max_length=150,
        help_text=_("Tatzo username. Using the public artist handle is usually best."),
    )
    display_name = forms.CharField(max_length=150, required=False)
    city = forms.CharField(max_length=120, required=False)
    country = forms.CharField(max_length=120, required=False)
    instagram_url = forms.URLField(
        max_length=500,
        required=False,
        help_text=_("Public portfolio/source link, for example Instagram."),
    )
    bio = forms.CharField(
        required=False,
        widget=forms.Textarea(attrs={"rows": 5}),
    )
    avatar = forms.ImageField(required=False)
    works = MultipleImageField(
        required=False,
        help_text=_("You can select several images at once. Maximum 12."),
    )
    default_style = forms.CharField(
        max_length=80,
        required=False,
        help_text=_("Optional style applied to uploaded works. You can edit each work later."),
    )

    def clean_username(self):
        username = (self.cleaned_data.get("username") or "").strip().lstrip("@")
        if not username:
            raise forms.ValidationError(_("Enter a username."))

        username_field = User._meta.get_field("username")
        try:
            username_field.run_validators(username)
        except ValidationError as exc:
            raise forms.ValidationError(exc.messages)

        if User.objects.filter(username__iexact=username).exists():
            raise forms.ValidationError(_("A user with that username already exists."))
        return username

    def clean_avatar(self):
        image = self.cleaned_data.get("avatar")
        if image and image.size > MAX_IMPORTED_IMAGE_SIZE:
            raise forms.ValidationError(_("Avatar must be smaller than 10 MB."))
        return image

    def clean_works(self):
        works = self.cleaned_data.get("works") or []
        if len(works) > MAX_IMPORTED_WORKS:
            raise forms.ValidationError(
                _("Upload at most %(count)s works at once.") % {"count": MAX_IMPORTED_WORKS}
            )
        for image in works:
            if image.size > MAX_IMPORTED_IMAGE_SIZE:
                raise forms.ValidationError(
                    _("Each portfolio image must be smaller than 10 MB.")
                )
        return works


class ImportedArtistClaimForm(forms.Form):
    email = forms.EmailField(max_length=254)
    password1 = forms.CharField(
        label=_("Password"),
        strip=False,
        widget=forms.PasswordInput(attrs={"autocomplete": "new-password"}),
    )
    password2 = forms.CharField(
        label=_("Confirm password"),
        strip=False,
        widget=forms.PasswordInput(attrs={"autocomplete": "new-password"}),
    )
    accept_terms = forms.BooleanField(
        label=_("I accept the Terms and Privacy Policy."),
    )

    def __init__(self, *args, user=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.user = user

    def clean_email(self):
        email = (self.cleaned_data.get("email") or "").strip().lower()
        duplicate = User.objects.filter(email__iexact=email)
        if self.user and self.user.pk:
            duplicate = duplicate.exclude(pk=self.user.pk)
        if duplicate.exists():
            raise forms.ValidationError(_("An account with this email already exists."))
        return email

    def clean(self):
        cleaned = super().clean()
        password1 = cleaned.get("password1")
        password2 = cleaned.get("password2")
        if password1 and password2 and password1 != password2:
            self.add_error("password2", _("The two password fields did not match."))
            return cleaned
        if password2:
            try:
                validate_password(password2, user=self.user)
            except ValidationError as exc:
                self.add_error("password2", exc)
        return cleaned


def get_imported_artist_location(user):
    if not user or not getattr(user, "pk", None):
        return None
    return (
        Location.objects.filter(
            linked_user=user,
            source="admin",
            source_place_id=IMPORTED_ARTIST_SOURCE_MARKER,
        )
        .order_by("id")
        .first()
    )


def is_imported_artist(user):
    if not user or not getattr(user, "pk", None):
        return False
    if getattr(user, "profile", None) is None:
        return False
    if user.profile.account_type != "tattoo_artist":
        return False
    return get_imported_artist_location(user) is not None


def is_claimable_imported_artist(user):
    location = get_imported_artist_location(user)
    return bool(
        location
        and location.status == "unclaimed"
        and user.profile.account_type == "tattoo_artist"
        and not user.email
        and not user.has_usable_password()
        and not user.profile.is_email_verified
    )


def make_imported_artist_claim_token(user):
    return signing.dumps(
        {"uid": user.pk, "username": user.get_username()},
        salt=CLAIM_TOKEN_SALT,
        compress=True,
    )


def _load_claim_user(token):
    try:
        payload = signing.loads(
            token,
            salt=CLAIM_TOKEN_SALT,
            max_age=CLAIM_TOKEN_MAX_AGE,
        )
    except (signing.BadSignature, signing.SignatureExpired):
        raise Http404

    user = get_object_or_404(
        User.objects.select_related("profile"),
        pk=payload.get("uid"),
    )
    if user.get_username() != payload.get("username"):
        raise Http404
    if not is_claimable_imported_artist(user):
        raise Http404
    return user


@transaction.atomic
def create_imported_artist(form):
    username = form.cleaned_data["username"]
    display_name = (form.cleaned_data.get("display_name") or "").strip()

    user = User(
        username=username,
        first_name=display_name,
        email="",
        is_active=True,
    )
    user.set_unusable_password()
    user.save()

    profile = user.profile
    profile.account_type = "tattoo_artist"
    profile.status = "active"
    profile.bio = form.cleaned_data.get("bio") or ""
    profile.verification_status = "not_submitted"
    profile.is_email_verified = False
    avatar = form.cleaned_data.get("avatar")
    if avatar:
        profile.profile_image = avatar
    profile.save()

    location = Location.objects.create(
        name=display_name or username,
        city=(form.cleaned_data.get("city") or "").strip(),
        country=(form.cleaned_data.get("country") or "").strip(),
        website=(form.cleaned_data.get("instagram_url") or "").strip(),
        source="admin",
        source_place_id=IMPORTED_ARTIST_SOURCE_MARKER,
        status="unclaimed",
        linked_user=user,
    )

    default_style = (form.cleaned_data.get("default_style") or "").strip()
    for image in form.cleaned_data.get("works") or []:
        PortfolioWork.objects.create(
            user=user,
            image=image,
            style=default_style,
        )

    return user, location


def profile_or_imported_view(request, username):
    profile_user = get_object_or_404(
        User.objects.select_related("profile", "booking_settings"),
        username=username,
    )
    imported_location = get_imported_artist_location(profile_user)

    if not imported_location:
        from . import views as legacy_views

        return legacy_views.profile_view(request, username)

    if request.user.is_authenticated and request.user != profile_user:
        if UserBlock.objects.filter(
            Q(blocker=request.user, blocked=profile_user)
            | Q(blocker=profile_user, blocked=request.user)
        ).exists():
            raise Http404

    posts = (
        Post.objects.visible_to(request.user)
        .filter(user=profile_user)
        .select_related("user", "user__profile")
        .prefetch_related("medias", "likes", "comments", "bookmarks")
        .order_by("-created_at")
    )

    can_view_liked = request.user == profile_user or profile_user.profile.show_liked_posts
    liked_posts = Post.objects.none()

    if can_view_liked:
        liked_posts = (
            Post.objects.visible_to(request.user)
            .filter(likes__user=profile_user)
            .select_related("user", "user__profile")
            .prefetch_related("medias", "likes", "comments", "bookmarks")
            .distinct()
            .order_by("-created_at")
        )

    liked_post_ids = set()
    bookmarked_post_ids = set()
    if request.user.is_authenticated:
        liked_post_ids = set(
            PostLike.objects.filter(user=request.user).values_list("post_id", flat=True)
        )
        bookmarked_post_ids = set(
            PostBookmark.objects.filter(user=request.user).values_list("post_id", flat=True)
        )

    followers_count = UserFollow.objects.filter(following=profile_user).count()
    following_count = UserFollow.objects.filter(follower=profile_user).count()
    is_following = False
    if request.user.is_authenticated and request.user != profile_user:
        is_following = UserFollow.objects.filter(
            follower=request.user,
            following=profile_user,
        ).exists()

    prepared_works = (
        PortfolioWork.objects.filter(user=profile_user)
        .select_related("album")
        .order_by("-created_at", "-id")
    )
    portfolio_works_count = prepared_works.count()
    posts_count = posts.count()
    show_prepared_work_grid = posts_count == 0 and portfolio_works_count > 0

    is_unclaimed = is_claimable_imported_artist(profile_user)
    claim_pending = bool(
        not profile_user.profile.is_email_verified
        and profile_user.email
        and imported_location.status == "pending_claim"
    )
    is_claimed = bool(
        profile_user.profile.is_email_verified
        and profile_user.has_usable_password()
    )

    return render(
        request,
        "users/profile.html",
        {
            "profile_user": profile_user,
            "posts": posts,
            "liked_posts": liked_posts,
            "posts_count": posts_count,
            "can_view_liked": can_view_liked,
            "liked_post_ids": liked_post_ids,
            "bookmarked_post_ids": bookmarked_post_ids,
            "followers_count": followers_count,
            "following_count": following_count,
            "is_following": is_following,
            "portfolio_works_count": portfolio_works_count,
            "prepared_works": prepared_works,
            "show_prepared_work_grid": show_prepared_work_grid,
            "is_imported_artist": True,
            "imported_location": imported_location,
            "is_unclaimed": is_unclaimed,
            "claim_pending": claim_pending,
            "is_claimed": is_claimed,
        },
    )


@require_http_methods(["GET", "POST"])
def claim_imported_artist(request, token):
    user = _load_claim_user(token)
    imported_location = get_imported_artist_location(user)

    if request.method == "POST":
        form = ImportedArtistClaimForm(request.POST, user=user)
        if form.is_valid():
            try:
                with transaction.atomic():
                    user.email = form.cleaned_data["email"]
                    user.set_password(form.cleaned_data["password1"])
                    user.is_active = False
                    user.save(update_fields=["email", "password", "is_active"])

                    profile = user.profile
                    profile.is_email_verified = False
                    profile.save(update_fields=["is_email_verified"])

                    imported_location.status = "pending_claim"
                    imported_location.save(update_fields=["status", "updated_at"])

                    send_verification_email(request, user)
            except Exception:
                logger.exception("Imported artist claim email failed for user=%s", user.username)
                form.add_error(
                    None,
                    _("We could not send the confirmation email. Please try again later."),
                )
            else:
                return render(
                    request,
                    "users/claim_imported_artist_done.html",
                    {"profile_user": user, "email": user.email},
                )
    else:
        form = ImportedArtistClaimForm(user=user)

    return render(
        request,
        "users/claim_imported_artist.html",
        {
            "form": form,
            "profile_user": user,
            "imported_location": imported_location,
        },
    )


@receiver(
    post_save,
    sender=Profile,
    dispatch_uid="tatzo_finalize_imported_artist_claim",
)
def finalize_imported_artist_claim(sender, instance, **kwargs):
    if not instance.is_email_verified:
        return
    user = instance.user
    if not user.has_usable_password() or not user.email:
        return
    Location.objects.filter(
        linked_user=user,
        source="admin",
        source_place_id=IMPORTED_ARTIST_SOURCE_MARKER,
        status="pending_claim",
    ).update(status="claimed")
