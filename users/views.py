import logging
from decimal import Decimal, InvalidOperation

from .legal_content import get_legal_page, get_legal_pages

from django.contrib import messages
from django.contrib.auth import authenticate, login
from django.contrib.auth import logout as auth_logout
from django.contrib.auth import get_user_model
from django.contrib.auth.models import User
from django.contrib.auth.tokens import default_token_generator
from django.contrib.auth.decorators import login_required, user_passes_test
from django.contrib.auth.views import redirect_to_login
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.db.models import Case, Count, Exists, IntegerField, OuterRef, Q, Value, When
from django.http import Http404, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.template.loader import render_to_string
from django.utils import timezone
from django.utils.encoding import force_str
from django.utils.translation import gettext as _, ngettext
from django.utils.http import urlsafe_base64_decode
from django.views.decorators.http import require_POST
from .security import check_rate_limit, is_new_account, rate_limited_json
from .models import (
    Profile,
    VerificationDocument,
    ManualVerificationRequest,
    Location,
    LocationClaim,
    LocationRequest,
    UserFollow,
    UserBlock,
    PortfolioAlbum,
    PortfolioWork,
    ChatThread,
    ChatMessage,
    ChatAttachment,
)

from datetime import timedelta

from posts.forms import PostForm, PostMediaUploadForm
from .forms import ProfileForm, VerificationForm, UserEditForm, ManualVerificationForm, PortfolioWorkForm, PortfolioAlbumForm, UserReportForm

from .forms_custom import CustomUserCreationForm
from posts.models import Post, PostMedia,  PostLike, PostBookmark, PostReport, PostComment, CommentReport
from .utils import send_verification_email

User = get_user_model()

def login_view(request):
    if request.method == "POST":
        username = request.POST.get("username")
        password = request.POST.get("password")

        user = authenticate(request, username=username, password=password)
        if user is not None:
            profile = Profile.objects.get(user=user)
            if not profile.is_email_verified:
                messages.error(
                    request, _("Please verify your email before logging in.")
                )
                return redirect("login")  # Или просто вернём ту же страницу
            login(request, user)
            return redirect("home")
        else:
            messages.error(request, _("Invalid username or password."))

    return render(request, "users/login.html")


# Главная страница
def home(request):
    posts = (
        Post.objects
        .select_related("user", "user__profile")
        .prefetch_related("medias", "likes", "comments", "bookmarks")
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

    recommended_artists = (
        User.objects
        .select_related("profile", "booking_settings")
        .filter(profile__account_type="tattoo_artist")
        .annotate(
            is_verified_recommendation=Case(
                When(profile__verification_status="approved", then=Value(1)),
                default=Value(0),
                output_field=IntegerField(),
            ),
            portfolio_works_count=Count("portfolio_works", distinct=True),
            followers_count=Count("follower_relations", distinct=True),
        )
    )

    if request.user.is_authenticated:
        followed_artists = UserFollow.objects.filter(
            follower=request.user,
            following=OuterRef("pk"),
        )

        recommended_artists = (
            recommended_artists
            .exclude(id=request.user.id)
            .annotate(is_already_followed=Exists(followed_artists))
            .filter(is_already_followed=False)
        )

    recommended_artists = (
        recommended_artists
        .order_by(
            "-is_verified_recommendation",
            "-portfolio_works_count",
            "-followers_count",
            "-date_joined",
        )[:5]
    )

    context = {
        "posts": posts,
        "liked_post_ids": liked_post_ids,
        "bookmarked_post_ids": bookmarked_post_ids,
        "recommended_artists": recommended_artists,
    }

    return render(request, "home.html", context)

def verify_email(request, uidb64, token):
    try:
        uid = force_str(urlsafe_base64_decode(uidb64))
        user = User.objects.get(pk=uid)
    except (User.DoesNotExist, ValueError, TypeError):
        user = None

    if user and default_token_generator.check_token(user, token):
        profile = user.profile
        profile.is_email_verified = True
        profile.save()

        user.is_active = True
        user.save()

        login(request, user)

        if profile.account_type == "tattoo_artist":
            return redirect("verification_page")
        else:
            return redirect("home")
    else:
        messages.error(request, _("This link is invalid or has expired."))
        return redirect("login")


# Лента новостей
@login_required
def news_feed(request):
    """
    Отображение ленты новостей.
    """
    # Получаем все посты из базы данных
    posts = Post.objects.all().order_by(
        "-id"
    )  # Сортируем по убыванию (новые посты первыми)

    context = {
        "posts": posts,
        "current_user": request.user,  # Передаем текущего пользователя
    }
    return render(request, "feed.html", context)


# Создание нового поста
@require_POST
@login_required
def create_post(request):
    content = (request.POST.get("content") or "").strip()
    files = request.FILES.getlist("media")
        
    post_limit = 5 if is_new_account(request.user) else 20

    allowed, retry_after = check_rate_limit(
        request,
        scope="posts:create",
        limit=post_limit,
        window_seconds=60 * 60,
        identity="user",
    )

    if not allowed:
        return rate_limited_json(
            retry_after,
            _("You are posting too quickly. Please wait a bit."),
        )

    if not content and not files:
        return JsonResponse(
            {"ok": False, "error": _("Post cannot be empty.")},
            status=400,
        )

    allowed_image_types = {
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
    }

    allowed_video_types = {
        "video/mp4",
        "video/webm",
        "video/quicktime",
        "video/x-msvideo",
        "video/x-matroska",
    }

    allowed_types = allowed_image_types | allowed_video_types
    max_image_upload_size = int(9.5 * 1024 * 1024)
    max_video_upload_size = int(95 * 1024 * 1024)

    for f in files:
        if f.content_type not in allowed_types:
            return JsonResponse(
                {
                    "ok": False,
                    "error": _(
                        "Only image and video files are supported. Please upload JPG, PNG, WEBP, GIF, MP4, MOV or WEBM."
                    ),
                },
                status=400,
            )
            
        if f.content_type in allowed_image_types and f.size > max_image_upload_size:
                return JsonResponse(
                    {
                        "ok": False,
                        "error": _(
                            "This image is too large. Please upload an image under 10 MB."
                        ),
                    },
                    status=400,
                )

        if f.content_type in allowed_video_types and f.size > max_video_upload_size:
                return JsonResponse(
                    {
                        "ok": False,
                        "error": _(
                            "This video is too large. Please upload a video under 100 MB."
                        ),
                    },
                    status=400,
                )

    disable_comments = request.POST.get("disable_comments") == "1"
    is_ad = request.POST.get("is_ad") == "1"
    visibility = request.POST.get("visibility") or "public"
    location = (request.POST.get("location") or "").strip()

    layout = request.POST.get("layout") or "grid"
    if layout not in ("grid", "carousel"):
        layout = "grid"

    try:
        with transaction.atomic():
            post = Post.objects.create(
                user=request.user,
                content=content,
                disable_comments=disable_comments,
                is_ad=is_ad,
                visibility=visibility,
                location=location,
                layout=layout,
            )

            for i, f in enumerate(files):
                media_type = "video" if f.content_type in allowed_video_types else "image"

                PostMedia.objects.create(
                    post=post,
                    file=f,
                    media_type=media_type,
                    order=i,
                )

        html = render_to_string(
            "partials/post_card.html",
            {
                "post": post,
                "request": request,
                "liked_post_ids": set(),
                "bookmarked_post_ids": set(),
            },
        )

        return JsonResponse(
            {
                "ok": True,
                "post_id": post.id,
                "html": html,
            }
        )

    except Exception:
        logger.exception("Post creation failed for user=%s", request.user.username)

        return JsonResponse(
            {
                "ok": False,
                "error": _("We could not create your post. Please try another file."),
            },
            status=500,
        )

# Выход из системы
@login_required
def logout(request):
    """
    Обработчик для выхода из системы.
    """
    auth_logout(request)
    return redirect("home")


def profile_list(request):
    profiles = Profile.objects.all()  # Получаем все профили
    return render(request, "users/profile_list.html", {"profiles": profiles})


@login_required
def edit_profile(request):
    profile = request.user.profile
    user_obj = request.user

    if request.method == "POST":
        user_form = UserEditForm(request.POST, instance=user_obj)
        profile_form = ProfileForm(request.POST, request.FILES, instance=profile)

        if user_form.is_valid() and profile_form.is_valid():
            user_form.save()
            profile_form.save()
            messages.success(request, _("Profile updated successfully."))
            return redirect("profile", username=request.user.username)
    else:
        user_form = UserEditForm(instance=user_obj)
        profile_form = ProfileForm(instance=profile)

    context = {
        "user_form": user_form,
        "profile_form": profile_form,
        "profile_user": request.user,
    }
    return render(request, "users/edit_profile.html", context)


@login_required
def user_profile(request):
    return redirect("profile", username=request.user.username)


# Обработка удаления поста
@login_required
def delete_post(request, post_id):
    """
    Удаление поста.
    """
    post = get_object_or_404(Post, id=post_id)
    if post.user == request.user:  # Только автор поста может удалить его
        post.delete()
        messages.success(request, _("Your post has been deleted."))
    else:
        messages.error(request, _("You cannot delete this post."))
    return redirect("home")


logger = logging.getLogger(__name__)

def delete_expired_unverified_duplicate_users(username="", email=""):
    username = (username or "").strip()
    email = (email or "").strip().lower()

    duplicate_filter = Q()

    if username:
        duplicate_filter |= Q(username__iexact=username)

    if email:
        duplicate_filter |= Q(email__iexact=email)

    if not duplicate_filter:
        return 0

    expiration_delay = timedelta(hours=1)
    cutoff = timezone.now() - expiration_delay

    users_to_delete = (
        User.objects
        .filter(
            duplicate_filter,
            is_active=False,
            is_staff=False,
            is_superuser=False,
            date_joined__lt=cutoff,
        )
        .filter(
            Q(profile__is_email_verified=False) |
            Q(profile__isnull=True)
        )
    )

    deleted_count, _ = users_to_delete.delete()

    if deleted_count:
        logger.warning(
            "Deleted %s expired unverified duplicate user(s) for username=%s email=%s",
            deleted_count,
            username,
            email,
        )

    return deleted_count


def signup(request):
    show_verification_modal = False

    if request.method == "POST":
        user_form = CustomUserCreationForm(request.POST)

        if request.POST.get("accept_terms") != "1":
            messages.error(
                request,
                _("You must accept the Terms and Privacy Policy to create an account."),
            )

            return render(
                request,
                "signup.html",
                {
                    "form": user_form,
                    "show_verification_modal": False,
                },
                status=400,
            )

        email = (request.POST.get("email") or "").strip().lower()

        signup_checks = [
            check_rate_limit(
                request,
                scope="auth:signup:ip:hour",
                limit=3,
                window_seconds=60 * 60,
                identity="ip",
            ),
            check_rate_limit(
                request,
                scope="auth:signup:ip:day",
                limit=8,
                window_seconds=24 * 60 * 60,
                identity="ip",
            ),
            check_rate_limit(
                request,
                scope="auth:signup:email",
                limit=3,
                window_seconds=60 * 60,
                value=email,
            ),
        ]

        if not all(ok for ok, _ in signup_checks):
            messages.error(
                request,
                _("Too many signup attempts. Please wait a bit and try again."),
            )

            return render(
                request,
                "signup.html",
                {
                    "form": user_form,
                    "show_verification_modal": show_verification_modal,
                },
                status=429,
            )

        delete_expired_unverified_duplicate_users(
            username=request.POST.get("username"),
            email=request.POST.get("email"),
        )

        if user_form.is_valid():
            user = None

            try:
                user = user_form.save()

                user.is_active = False
                user.save(update_fields=["is_active"])

                send_verification_email(request, user)

                show_verification_modal = True
                messages.success(
                    request,
                    _("Account created. Please check your email to confirm your account."),
                )

            except Exception:
                logger.exception(
                    "Signup failed: verification email was not sent. Rolling back user creation."
                )

                if user and user.pk:
                    username = user.username
                    email = user.email
                    user.delete()

                    logger.error(
                        "Signup rollback: deleted unverified user username=%s email=%s",
                        username,
                        email,
                    )

                messages.error(
                    request,
                    _("We could not send the confirmation email. Please try again later."),
                )

    else:
        user_form = CustomUserCreationForm()

    return render(
        request,
        "signup.html",
        {
            "form": user_form,
            "show_verification_modal": show_verification_modal,
        },
    )


def contests_page(request):
    return render(request, "users/contests.html")


# Обработка редактирования поста
@login_required
def edit_post(request, post_id):
    """
    Редактирование поста.
    """
    post = get_object_or_404(Post, id=post_id)
    if post.user != request.user:
        messages.error(request, _("You cannot edit this post."))
        return redirect("home")

    if request.method == "POST":
        form = PostForm(request.POST, instance=post)
        if form.is_valid():
            form.save()
            messages.success(request, _("Your post has been updated successfully."))
            return redirect("home")
    else:
        form = PostForm(instance=post)

    context = {"form": form, "post": post}
    return render(request, "edit_post.html", context)


def admin_verification(request, profile_id):
    profile = get_object_or_404(Profile, id=profile_id)

    if request.method == "POST":
        action = request.POST.get("action")
        if action == "approve":
            profile.verification_status = "approved"
            profile.save()
            messages.success(
                request,
                _("Profile %(username)s has been approved.")
                % {"username": profile.user.username},
            )
        elif action == "reject":
            profile.verification_status = "rejected"
            profile.save()
            messages.success(
                request,
                _("Profile %(username)s has been rejected.")
                % {"username": profile.user.username},
            )
        return redirect("profile_list")

    return render(request, "users/admin_verification.html", {"profile": profile})


@login_required
def verification_page(request):
    profile = request.user.profile

    if profile.account_type != "tattoo_artist":
        return redirect("home")

    existing_document_request = VerificationDocument.objects.filter(
        user=request.user
    ).first()

    existing_manual_request = ManualVerificationRequest.objects.filter(
        user=request.user
    ).first()

    document_form = VerificationForm(instance=existing_document_request)
    manual_form = ManualVerificationForm(instance=existing_manual_request)

    if request.method == "POST":
        verification_action = request.POST.get("verification_action")

        if verification_action == "documents":
            document_form = VerificationForm(
                request.POST,
                request.FILES,
                instance=existing_document_request,
            )

            if document_form.is_valid():
                try:
                    verification_document = document_form.save(commit=False)
                    verification_document.user = request.user
                    verification_document.is_verified = False
                    verification_document.save()

                    profile.verification_status = "pending_documents"
                    profile.save(update_fields=["verification_status"])

                    messages.success(
                        request,
                        _("Your documents have been submitted for review."),
                    )
                    return redirect("home")

                except Exception:
                    logger.exception(
                        "Verification document submission failed for user=%s",
                        request.user.username,
                    )
                    messages.error(
                        request,
                        _("We could not submit your documents. Please try another file or a smaller file."),
                    )

        elif verification_action == "manual":
            manual_form = ManualVerificationForm(
                request.POST,
                request.FILES,
                instance=existing_manual_request,
            )

            if manual_form.is_valid():
                try:
                    manual_request = manual_form.save(commit=False)
                    manual_request.user = request.user
                    manual_request.is_reviewed = False
                    manual_request.save()

                    profile.verification_status = "pending_manual_review"
                    profile.save(update_fields=["verification_status"])

                    messages.success(
                        request,
                        _("Your manual review request has been submitted."),
                    )
                    return redirect("home")

                except Exception:
                    logger.exception(
                        "Manual verification submission failed for user=%s",
                        request.user.username,
                    )
                    messages.error(
                        request,
                        _("We could not submit your request. Please try another file or a smaller file."),
                    )

        else:
            messages.error(request, _("Invalid verification request."))

    status_labels = {
        "not_submitted": _("Not submitted"),
        "pending_documents": _("Pending documents review"),
        "pending_manual_review": _("Pending manual review"),
        "pending": _("Pending"),
        "approved": _("Approved"),
        "rejected": _("Rejected"),
    }

    context = {
        "verification_status_label": status_labels.get(profile.verification_status, profile.verification_status),
        "document_form": document_form,
        "manual_form": manual_form,
        "verification_status": profile.verification_status,
    }

    return render(request, "users/verification_page.html", context)


# Проверка, является ли пользователь администратором
def is_admin(user):
    return user.is_staff


@user_passes_test(is_admin)
def review_verifications(request):
    documents = VerificationDocument.objects.filter(
        is_verified=False
    )  # Отображаем документы, которые еще не проверены
    return render(request, "users/review_verifications.html", {"documents": documents})


@user_passes_test(is_admin)
def verify_document(request, document_id):
    document = get_object_or_404(VerificationDocument, id=document_id)
    if request.method == "POST":
        action = request.POST.get("action")
        if action == "approve":
            document.is_verified = True
        elif action == "reject":
            document.is_verified = False
        document.save()
        return JsonResponse({"success": True, "status": document.is_verified})
    return JsonResponse({"success": False, "error": _("Invalid request.")})


@user_passes_test(is_admin)
def pending_verifications(request):
    # Получаем список неподтвержденных документов
    pending_docs = VerificationDocument.objects.filter(is_verified=False)
    return render(
        request, "users/pending_verifications.html", {"pending_docs": pending_docs}
    )


@user_passes_test(is_admin)
def review_profile(request, profile_id):
    # Получаем профиль по ID или возвращаем 404
    profile = get_object_or_404(Profile, id=profile_id)

    if request.method == "POST":
        action = request.POST.get("action")
        if action == "approve":
            profile.verification_status = "approved"
            profile.save()
            message = _("Profile approved successfully.")
        elif action == "reject":
            profile.verification_status = "rejected"
            profile.save()
            message = _("Profile rejected successfully.")
        else:
            message = _("Invalid action.")

        return render(
            request,
            "users/review_profile.html",
            {"profile": profile, "message": message},
        )

    return render(request, "users/review_profile.html", {"profile": profile})


@login_required
def upload_verification_documents(request):
    if request.method == "POST":
        document_type = request.POST.get("document_type")
        document_file = request.FILES.get("document_file")
        identity_document = request.FILES.get("identity_document")

        # Сохраняем документ
        verification_document = VerificationDocument(
            user=request.user,
            document_type=document_type,
            document_file=document_file,
            identity_document=identity_document,
        )
        verification_document.save()

        messages.success(
            request, _("Your documents have been submitted for verification.")
        )
        return redirect(
            "home"
        )  # Перенаправляем на главную страницу или другую, если нужно
    return render(request, "users/upload_verification_documents.html")


@user_passes_test(is_admin)
def approve_profile(request, profile_id):
    # Получаем профиль по ID или возвращаем 404
    profile = get_object_or_404(Profile, id=profile_id)

    # Обновляем статус верификации профиля
    profile.verification_status = "approved"
    profile.save()

    # Сообщение об успешном одобрении
    messages.success(
        request,
        _("Profile '%(username)s' has been approved.")
        % {"username": profile.user.username},
    )

    # Перенаправление обратно на список профилей или другую страницу
    return redirect("profile_list")  # Замените на ваш URL для списка профилей


@user_passes_test(is_admin)
def reject_profile(request, profile_id):
    # Получаем профиль по ID или возвращаем 404
    profile = get_object_or_404(Profile, id=profile_id)

    # Обновляем статус верификации профиля
    profile.verification_status = "rejected"
    profile.save()

    # Сообщение об успешном отклонении
    messages.success(
        request,
        _("Profile '%(username)s' has been rejected.")
        % {"username": profile.user.username},
    )

    # Перенаправление обратно на список профилей или другую страницу
    return redirect("profile_list")  # Замените на ваш URL для списка профилей

def profile_view(request, username):
    user_obj = get_object_or_404(
        User.objects.select_related("profile", "booking_settings"),
        username=username
    )
    
    if not user_obj.is_active or not user_obj.profile.is_email_verified:
        if not (request.user.is_authenticated and request.user.is_staff):
            raise Http404

    posts = (
        Post.objects
        .filter(user=user_obj)
        .select_related("user", "user__profile")
        .prefetch_related("medias", "likes", "comments", "bookmarks")
        .order_by("-created_at")
    )

    can_view_liked = (
        request.user == user_obj
        or user_obj.profile.show_liked_posts
    )

    liked_posts = Post.objects.none()

    if can_view_liked:
        liked_posts = (
            Post.objects
            .filter(likes__user=user_obj)
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

    followers_count = UserFollow.objects.filter(following=user_obj).count()
    following_count = UserFollow.objects.filter(follower=user_obj).count()

    is_following = False

    if request.user.is_authenticated and request.user != user_obj:
        is_following = UserFollow.objects.filter(
            follower=request.user,
            following=user_obj,
        ).exists()

    portfolio_works_count = 0

    if user_obj.profile.account_type == "tattoo_artist":
        portfolio_works_count = PortfolioWork.objects.filter(user=user_obj).count()

    context = {
        "profile_user": user_obj,
        "posts": posts,
        "liked_posts": liked_posts,
        "posts_count": posts.count(),
        "can_view_liked": can_view_liked,
        "liked_post_ids": liked_post_ids,
        "bookmarked_post_ids": bookmarked_post_ids,
        "followers_count": followers_count,
        "following_count": following_count,
        "is_following": is_following,
        "portfolio_works_count": portfolio_works_count,
    }

    return render(request, "users/profile.html", context)

@login_required
@require_POST
def toggle_follow(request, username):
    target_user = get_object_or_404(User, username=username)

    if target_user == request.user:
        return JsonResponse(
            {
                "ok": False,
                "error": _("You cannot follow yourself."),
            },
            status=400,
        )

    follow_relation, created = UserFollow.objects.get_or_create(
        follower=request.user,
        following=target_user,
    )

    if created:
        is_following = True
    else:
        follow_relation.delete()
        is_following = False

    followers_count = UserFollow.objects.filter(following=target_user).count()
    following_count = UserFollow.objects.filter(follower=target_user).count()

    return JsonResponse(
        {
            "ok": True,
            "is_following": is_following,
            "followers_count": followers_count,
            "following_count": following_count,
            "button_text": _("Following") if is_following else _("Follow"),
        }
    )

@login_required
@require_POST
def toggle_user_block(request, username):
    target_user = get_object_or_404(User, username=username)

    if target_user == request.user:
        return JsonResponse(
            {
                "ok": False,
                "error": _("You cannot block yourself."),
            },
            status=400,
        )

    block_relation, created = UserBlock.objects.get_or_create(
        blocker=request.user,
        blocked=target_user,
    )

    if created:
        is_blocked = True
    else:
        block_relation.delete()
        is_blocked = False

    if request.headers.get("x-requested-with") == "XMLHttpRequest":
        return JsonResponse(
            {
                "ok": True,
                "is_blocked": is_blocked,
                "button_text": _("Unblock") if is_blocked else _("Block"),
            }
        )

    thread = ChatThread.objects.filter(
        Q(participant_one=request.user, participant_two=target_user)
        | Q(participant_one=target_user, participant_two=request.user)
    ).first()

    if thread:
        return redirect("chat_thread", thread_id=thread.id)

    return redirect("profile", username=target_user.username)

def followers_list(request, username):
    profile_user = get_object_or_404(
        User.objects.select_related("profile", "booking_settings"),
        username=username,
    )

    followers = (
        UserFollow.objects
        .filter(following=profile_user)
        .select_related("follower", "follower__profile")
        .order_by("-created_at")
    )

    followers_count = followers.count()

    return render(
        request,
        "users/followers_list.html",
        {
            "profile_user": profile_user,
            "followers": followers,
            "followers_count": followers_count,
        },
    )


def following_list(request, username):
    profile_user = get_object_or_404(
        User.objects.select_related("profile", "booking_settings"),
        username=username,
    )

    following = (
        UserFollow.objects
        .filter(follower=profile_user)
        .select_related("following", "following__profile")
        .order_by("-created_at")
    )

    following_count = following.count()

    return render(
        request,
        "users/following_list.html",
        {
            "profile_user": profile_user,
            "following": following,
            "following_count": following_count,
        },
    )

@login_required
def add_portfolio_work(request, username):
    profile_user = get_object_or_404(
        User.objects.select_related("profile", "booking_settings"),
        username=username,
    )

    if request.user != profile_user:
        return redirect("artist_portfolio", username=profile_user.username)

    if profile_user.profile.account_type != "tattoo_artist":
        return redirect("profile", username=profile_user.username)

    if not profile_user.profile.is_verified_artist:
        messages.warning(
            request,
            _("Portfolio tools unlock after your artist verification is approved.")
        )
        return redirect("artist_portfolio", username=profile_user.username)

    if request.method == "POST":
        form = PortfolioWorkForm(request.POST, request.FILES, user=request.user)

        if form.is_valid():
            album = form.cleaned_data.get("album")
            new_album_title = (form.cleaned_data.get("new_album_title") or "").strip()
            images = form.cleaned_data.get("images") or []

            title = (form.cleaned_data.get("title") or "").strip()
            description = (form.cleaned_data.get("description") or "").strip()
            style = (form.cleaned_data.get("style") or "").strip()
            body_placement = (form.cleaned_data.get("body_placement") or "").strip()

            if new_album_title:
                album, _ = PortfolioAlbum.objects.get_or_create(
                    user=request.user,
                    title=new_album_title,
                    defaults={
                        "style": style,
                    },
                )

            created_count = 0

            for index, image in enumerate(images, start=1):
                work_title = title

                if title and len(images) > 1:
                    work_title = f"{title} #{index}"

                PortfolioWork.objects.create(
                    user=request.user,
                    album=album,
                    image=image,
                    title=work_title,
                    description=description,
                    style=style,
                    body_placement=body_placement,
                )

                created_count += 1

            messages.success(
                request,
                ngettext(
                    "Portfolio work added successfully.",
                    "%(count)s portfolio works added successfully.",
                    created_count,
                ) % {"count": created_count},
            )

            return redirect("artist_portfolio", username=request.user.username)
    else:
        form = PortfolioWorkForm(user=request.user)

    return render(request, "users/add_portfolio_work.html", {"form": form})

@login_required
@require_POST
def create_portfolio_album(request, username):
    profile_user = get_object_or_404(User, username=username)

    if request.user != profile_user:
        return redirect("artist_portfolio", username=profile_user.username)

    form = PortfolioAlbumForm(request.POST, request.FILES)
    
    if not profile_user.profile.is_verified_artist:
        messages.warning(
            request,
            _("Portfolio tools unlock after your artist verification is approved.")
        )
        return redirect("artist_portfolio", username=profile_user.username)

    if form.is_valid():
        album = form.save(commit=False)
        album.user = request.user
        album.save()
        messages.success(request, _("Portfolio album created."))

    return redirect("artist_portfolio", username=request.user.username)

def artist_portfolio(request, username):
    profile_user = get_object_or_404(
        User.objects.select_related("profile", "booking_settings"),
        username=username,
    )

    if profile_user.profile.account_type != "tattoo_artist":
        return redirect("profile", username=profile_user.username)

    portfolio_unlocked = profile_user.profile.is_verified_artist

    has_uploaded_documents = VerificationDocument.objects.filter(
        user=profile_user
    ).exists()

    has_manual_request = ManualVerificationRequest.objects.filter(
        user=profile_user
    ).exists()

    albums = (
        PortfolioAlbum.objects
        .filter(user=profile_user)
        .prefetch_related("works")
        .order_by("-id")
    )

    works = (
        PortfolioWork.objects
        .filter(user=profile_user)
        .select_related("album")
        .order_by("-id")
    )

    context = {
        "profile_user": profile_user,
        "albums": albums,
        "works": works,
        "works_count": works.count(),
        "is_owner": request.user.is_authenticated and request.user == profile_user,
        "portfolio_unlocked": portfolio_unlocked,
        "has_uploaded_documents": has_uploaded_documents,
        "has_manual_request": has_manual_request,
    }

    return render(request, "users/artist_portfolio.html", context)

def artist_portfolio_album(request, username, album_id):
    profile_user = get_object_or_404(
        User.objects.select_related("profile", "booking_settings"),
        username=username,
    )

    if profile_user.profile.account_type != "tattoo_artist":
        return redirect("profile", username=profile_user.username)
    
    if not profile_user.profile.is_verified_artist:
        return redirect("artist_portfolio", username=profile_user.username)

    album = get_object_or_404(
        PortfolioAlbum.objects.filter(user=profile_user),
        id=album_id,
    )

    works = (
        PortfolioWork.objects
        .filter(user=profile_user, album=album)
        .select_related("album")
    )

    context = {
        "profile_user": profile_user,
        "album": album,
        "works": works,
        "works_count": works.count(),
        "is_owner": request.user.is_authenticated and request.user == profile_user,
    }

    return render(request, "users/artist_portfolio_album.html", context)

@login_required
def edit_portfolio_album(request, username, album_id):
    profile_user = get_object_or_404(User, username=username)
    
    if not profile_user.profile.is_verified_artist:
        messages.warning(
            request,
            _("Portfolio tools unlock after your artist verification is approved.")
        )
        return redirect("artist_portfolio", username=profile_user.username)

    if request.user != profile_user:
        return redirect("artist_portfolio", username=profile_user.username)

    album = get_object_or_404(
        PortfolioAlbum.objects.filter(user=request.user),
        id=album_id,
    )

    if request.method == "POST":
        form = PortfolioAlbumForm(request.POST, request.FILES, instance=album)

        if form.is_valid():
            form.save()
            messages.success(request, _("Album updated successfully."))
            return redirect("artist_portfolio", username=request.user.username)
    else:
        form = PortfolioAlbumForm(instance=album)

    return render(
        request,
        "users/edit_portfolio_album.html",
        {
            "form": form,
            "album": album,
        },
    )


@login_required
@require_POST
def delete_portfolio_album(request, username, album_id):
    profile_user = get_object_or_404(User, username=username)
    
    if not profile_user.profile.is_verified_artist:
        messages.warning(
            request,
            _("Portfolio tools unlock after your artist verification is approved.")
        )
        return redirect("artist_portfolio", username=profile_user.username)

    if request.user != profile_user:
        return redirect("artist_portfolio", username=profile_user.username)

    album = get_object_or_404(
        PortfolioAlbum.objects.filter(user=request.user),
        id=album_id,
    )

    album.delete()
    messages.success(request, _("Album deleted. Works were kept in All works."))

    return redirect("artist_portfolio", username=request.user.username)


@login_required
@require_POST
def delete_portfolio_work(request, username, work_id):
    profile_user = get_object_or_404(User, username=username)
    
    if not profile_user.profile.is_verified_artist:
        messages.warning(
            request,
            _("Portfolio tools unlock after your artist verification is approved.")
        )
        return redirect("artist_portfolio", username=profile_user.username)

    if request.user != profile_user:
        return redirect("artist_portfolio", username=profile_user.username)

    work = get_object_or_404(
        PortfolioWork.objects.filter(user=request.user),
        id=work_id,
    )

    album = work.album
    work.delete()

    messages.success(request, _("Portfolio work deleted."))

    if album:
        return redirect(
            "artist_portfolio_album",
            username=request.user.username,
            album_id=album.id,
        )

    return redirect("artist_portfolio", username=request.user.username)

@user_passes_test(is_admin)
def moderation_dashboard(request):
    pending_document_requests = VerificationDocument.objects.filter(
        is_verified=False,
        user__profile__verification_status="pending_documents",
    ).select_related("user", "user__profile")

    pending_manual_requests = ManualVerificationRequest.objects.filter(
        is_reviewed=False,
        user__profile__verification_status="pending_manual_review",
    ).select_related("user", "user__profile")

    post_reports = (
        PostReport.objects
        .filter(is_resolved=False)
        .select_related("post", "post__user", "user")
        .prefetch_related("post__medias")
        .order_by("-created_at")
    )

    comment_reports = (
        CommentReport.objects
        .filter(is_resolved=False)
        .select_related("comment", "comment__user", "comment__post", "user")
        .order_by("-created_at")
    )

    context = {
        "pending_document_requests": pending_document_requests,
        "pending_manual_requests": pending_manual_requests,
        "post_reports": post_reports,
        "comment_reports": comment_reports,
        "document_count": pending_document_requests.count(),
        "manual_count": pending_manual_requests.count(),
        "post_reports_count": post_reports.count(),
        "comment_reports_count": comment_reports.count(),
    }

    return render(request, "users/moderation_dashboard.html", context)


@user_passes_test(is_admin)
@require_POST
def moderation_approve_artist(request, username):
    user_obj = get_object_or_404(User.objects.select_related("profile", "booking_settings"), username=username)

    user_obj.profile.verification_status = "approved"
    user_obj.profile.save(update_fields=["verification_status"])

    VerificationDocument.objects.filter(user=user_obj).update(is_verified=True)
    ManualVerificationRequest.objects.filter(user=user_obj).update(is_reviewed=True)

    messages.success(
        request,
        _("%(username)s has been approved as a tattoo artist.")
        % {"username": user_obj.username},
    )
    return redirect("moderation_dashboard")


@user_passes_test(is_admin)
@require_POST
def moderation_reject_artist(request, username):
    user_obj = get_object_or_404(User.objects.select_related("profile", "booking_settings"), username=username)

    user_obj.profile.verification_status = "rejected"
    user_obj.profile.save(update_fields=["verification_status"])

    VerificationDocument.objects.filter(user=user_obj).update(is_verified=False)
    ManualVerificationRequest.objects.filter(user=user_obj).update(is_reviewed=True)

    messages.success(
        request,
        _("%(username)s's verification has been rejected.")
        % {"username": user_obj.username},
    )
    return redirect("moderation_dashboard")


@user_passes_test(is_admin)
@require_POST
def moderation_resolve_post_report(request, report_id):
    report = get_object_or_404(PostReport, id=report_id)

    report.is_resolved = True
    report.resolved_at = timezone.now()
    report.save(update_fields=["is_resolved", "resolved_at"])

    messages.success(request, _("Post report resolved."))
    return redirect("moderation_dashboard")


@user_passes_test(is_admin)
@require_POST
def moderation_delete_reported_post(request, report_id):
    report = get_object_or_404(
        PostReport.objects.select_related("post"),
        id=report_id,
    )

    post = report.post
    post.delete()

    PostReport.objects.filter(post=post).update(
        is_resolved=True,
        resolved_at=timezone.now(),
    )

    messages.success(request, _("Reported post deleted."))
    return redirect("moderation_dashboard")


@user_passes_test(is_admin)
@require_POST
def moderation_resolve_comment_report(request, report_id):
    report = get_object_or_404(CommentReport, id=report_id)

    report.is_resolved = True
    report.resolved_at = timezone.now()
    report.save(update_fields=["is_resolved", "resolved_at"])

    messages.success(request, _("Comment report resolved."))
    return redirect("moderation_dashboard")


@user_passes_test(is_admin)
@require_POST
def moderation_delete_reported_comment(request, report_id):
    report = get_object_or_404(
        CommentReport.objects.select_related("comment"),
        id=report_id,
    )

    comment = report.comment
    comment.delete()

    CommentReport.objects.filter(comment=comment).update(
        is_resolved=True,
        resolved_at=timezone.now(),
    )

    messages.success(request, _("Reported comment deleted."))
    return redirect("moderation_dashboard")

@login_required
def chats_list(request):
    threads = (
        ChatThread.objects
        .filter(
            Q(participant_one=request.user) |
            Q(participant_two=request.user)
        )
        .filter(messages__is_deleted=False)
        .distinct()
        .select_related(
            "participant_one",
            "participant_one__profile",
            "participant_two",
            "participant_two__profile",
        )
        .prefetch_related("messages")
        .order_by("-updated_at")
    )

    chat_rows = []

    for thread in threads:
        other_user = thread.get_other_user(request.user)
        last_message = (
            thread.messages
            .filter(is_deleted=False)
            .order_by("-created_at")
            .first()
        )

        unread_count = (
            thread.messages
            .filter(is_read=False, is_deleted=False)
            .exclude(sender=request.user)
            .count()
        )
        chat_rows.append({
            "thread": thread,
            "other_user": other_user,
            "last_message": last_message,
            "unread_count": unread_count,
        })

    return render(
        request,
        "users/chats_list.html",
        {
            "chat_rows": chat_rows,
        },
    )


@login_required
def start_chat(request, username):
    target_user = get_object_or_404(
        User.objects
        .select_related("profile", "booking_settings")
        .filter(
            is_active=True,
            profile__is_email_verified=True,
        ),
        username=username,
    )

    if target_user == request.user:
        messages.error(request, _("You cannot start a chat with yourself."))
        return redirect("profile", username=username)

    thread = ChatThread.get_or_create_for_users(request.user, target_user)

    return redirect("chat_thread", thread_id=thread.id)


@login_required
def chat_thread(request, thread_id):
    thread = get_object_or_404(
        ChatThread.objects.select_related(
            "participant_one",
            "participant_one__profile",
            "participant_two",
            "participant_two__profile",
        ),
        id=thread_id,
    )

    if not thread.has_user(request.user):
        messages.error(request, _("You cannot access this chat."))
        return redirect("chats_list")

    other_user = thread.get_other_user(request.user)
    is_blocked_by_me = UserBlock.objects.filter(
        blocker=request.user,
        blocked=other_user,
    ).exists()

    has_blocked_me = UserBlock.objects.filter(
        blocker=other_user,
        blocked=request.user,
    ).exists()

    chat_blocked = is_blocked_by_me or has_blocked_me

    thread.messages.filter(
        is_read=False
    ).exclude(
        sender=request.user
    ).update(is_read=True)

    chat_messages = (
        thread.messages
        .filter(is_deleted=False)
        .select_related("sender", "sender__profile")
        .prefetch_related("attachments")
        .order_by("created_at")
    )

    return render(
        request,
        "users/chat_thread.html",
        {
            "thread": thread,
            "other_user": other_user,
            "chat_messages": chat_messages,
            "is_blocked_by_me": is_blocked_by_me,
            "has_blocked_me": has_blocked_me,
            "chat_blocked": chat_blocked,
        },
    )


@login_required
@require_POST
def send_chat_message(request, thread_id):
    thread = get_object_or_404(ChatThread, id=thread_id)

    if not thread.has_user(request.user):
        return JsonResponse(
            {
                "ok": False,
                "error": _("You cannot send messages in this chat."),
            },
            status=403,
        )
        
    other_user = thread.get_other_user(request.user)

    is_chat_blocked = UserBlock.objects.filter(
        Q(blocker=request.user, blocked=other_user)
        | Q(blocker=other_user, blocked=request.user)
    ).exists()

    if is_chat_blocked:
        return JsonResponse(
            {
                "ok": False,
                "error": _("You cannot send messages to this user."),
            },
            status=403,
        )
        
    chat_limit = 10 if is_new_account(request.user) else 40

    allowed, retry_after = check_rate_limit(
        request,
        scope="chat:send",
        limit=chat_limit,
        window_seconds=10 * 60,
        identity="user",
    )

    if not allowed:
        return rate_limited_json(
            retry_after,
            _("You are sending messages too quickly. Please wait a bit."),
        )

    content = (request.POST.get("content") or "").strip()
    files = request.FILES.getlist("attachments")

    if not content and not files:
        return JsonResponse(
            {
                "ok": False,
                "error": _("Message cannot be empty."),
            },
            status=400,
        )

    try:
        with transaction.atomic():
            message = ChatMessage.objects.create(
                thread=thread,
                sender=request.user,
                content=content,
            )

            for file in files:
                ChatAttachment.objects.create(
                    message=message,
                    file=file,
                    original_name=file.name,
                    content_type=file.content_type or "",
                    media_type=ChatAttachment.detect_media_type(file),
                )

            thread.updated_at = timezone.now()
            thread.save(update_fields=["updated_at"])

    except Exception:
        logger.exception("Chat message creation failed for user=%s", request.user.username)

        return JsonResponse(
            {
                "ok": False,
                "error": _("Message was not sent."),
            },
            status=500,
        )

    if request.headers.get("x-requested-with") == "XMLHttpRequest":
        message = (
            ChatMessage.objects
            .select_related("sender", "sender__profile")
            .prefetch_related("attachments")
            .get(id=message.id)
        )

        html = render_to_string(
            "partials/chat_message.html",
            {
                "message": message,
                "request": request,
            },
        )

        return JsonResponse(
            {
                "ok": True,
                "message_id": message.id,
                "html": html,
            }
        )

    return redirect("chat_thread", thread_id=thread.id)

@login_required
@require_POST
def delete_chat_message(request, message_id):
    message = get_object_or_404(
        ChatMessage.objects.select_related("thread", "sender"),
        id=message_id,
        sender=request.user,
        is_deleted=False,
    )

    thread = message.thread

    with transaction.atomic():
        message.is_deleted = True
        message.deleted_at = timezone.now()
        message.content = ""
        message.is_read = True
        message.save(update_fields=["is_deleted", "deleted_at", "content", "is_read"])

        message.attachments.all().delete()

        last_visible_message = (
            thread.messages
            .filter(is_deleted=False)
            .order_by("-created_at")
            .first()
        )

        if last_visible_message:
            thread.updated_at = last_visible_message.created_at
        else:
            thread.updated_at = timezone.now()

        thread.save(update_fields=["updated_at"])

    if request.headers.get("x-requested-with") == "XMLHttpRequest":
        return JsonResponse(
            {
                "ok": True,
                "message_id": message.id,
            }
        )

    return redirect("chat_thread", thread_id=thread.id)

@login_required
@require_POST
def edit_chat_message(request, message_id):
    message = get_object_or_404(
        ChatMessage.objects.select_related("thread", "sender"),
        id=message_id,
        sender=request.user,
        is_deleted=False,
    )

    content = (request.POST.get("content") or "").strip()
    files = request.FILES.getlist("attachments")

    delete_attachment_ids = request.POST.getlist("delete_attachment_ids")
    attachments_to_delete = message.attachments.filter(id__in=delete_attachment_ids)

    remaining_attachments_count = (
        message.attachments.exclude(id__in=delete_attachment_ids).count()
    )

    if not content and not files and remaining_attachments_count == 0:
        return JsonResponse(
            {
                "ok": False,
                "error": _("Message cannot be empty."),
            },
            status=400,
        )

    try:
        with transaction.atomic():
            attachments_to_delete.delete()

            message.content = content
            message.is_edited = True
            message.edited_at = timezone.now()
            message.save(update_fields=["content", "is_edited", "edited_at"])

            for file in files:
                ChatAttachment.objects.create(
                    message=message,
                    file=file,
                    original_name=file.name,
                    content_type=file.content_type or "",
                    media_type=ChatAttachment.detect_media_type(file),
                )

            message = (
                ChatMessage.objects
                .select_related("sender", "sender__profile")
                .prefetch_related("attachments")
                .get(id=message.id)
            )

            html = render_to_string(
                "partials/chat_message.html",
                {
                    "message": message,
                    "request": request,
                },
            )

            return JsonResponse(
                {
                    "ok": True,
                    "message_id": message.id,
                    "html": html,
                }
            )

    except Exception:
        logger.exception("Chat message edit failed for user=%s", request.user.username)

        return JsonResponse(
            {
                "ok": False,
                "error": _("Message was not edited."),
            },
            status=500,
        )

@login_required
def chat_new_messages(request, thread_id):
    thread = get_object_or_404(ChatThread, id=thread_id)

    if not thread.has_user(request.user):
        return JsonResponse(
            {
                "ok": False,
                "error": _("You cannot access this chat."),
            },
            status=403,
        )

    last_id = request.GET.get("after")

    try:
        last_id = int(last_id or 0)
    except ValueError:
        last_id = 0

    new_messages = (
        thread.messages
        .filter(id__gt=last_id, is_deleted=False)
        .select_related("sender", "sender__profile")
        .prefetch_related("attachments")
        .order_by("created_at")
    )

    incoming_ids = [
        message.id
        for message in new_messages
        if message.sender_id != request.user.id and not message.is_read
    ]

    if incoming_ids:
        ChatMessage.objects.filter(id__in=incoming_ids).update(is_read=True)

    html = "".join(
        render_to_string(
            "partials/chat_message.html",
            {
                "message": message,
                "request": request,
            },
        )
        for message in new_messages
    )

    last_message_id = last_id

    for message in new_messages:
        last_message_id = max(last_message_id, message.id)

    return JsonResponse(
        {
            "ok": True,
            "html": html,
            "last_id": last_message_id,
        }
    )
    
def search_page(request):
    query = (request.GET.get("q") or "").strip()
    account_filter = request.GET.get("type") or "all"

    clean_query = query.lstrip("@").strip()

    users = (
        User.objects
        .select_related("profile", "booking_settings")
        .filter(
            is_active=True,
            profile__is_email_verified=True,
        )
        .exclude(id=request.user.id)
        .order_by("username")
    )

    if clean_query:
        users = users.filter(
            Q(username__icontains=clean_query) |
            Q(profile__tag__icontains=clean_query)
        )

    if account_filter == "artists":
        users = users.filter(profile__account_type="tattoo_artist")
    elif account_filter == "users":
        users = users.filter(profile__account_type="regular_user")

    users = users[:40]

    return render(
        request,
        "users/search.html",
        {
            "query": query,
            "account_filter": account_filter,
            "results": users,
            "results_count": len(users),
        },
    )


@require_POST
def submit_location_claim(request, location_id):
    location = get_object_or_404(
        Location,
        id=location_id,
        linked_user__isnull=True,
        status__in=["imported", "unclaimed", "pending_claim"],
    )

    claimant_name = (request.POST.get("claimant_name") or "").strip()
    contact_email = (request.POST.get("contact_email") or "").strip()
    relation = (request.POST.get("relation_to_location") or "").strip()
    proof = (request.POST.get("proof") or "").strip()
    message = (request.POST.get("message") or "").strip()

    if not claimant_name or not contact_email or not relation:
        messages.error(
            request,
            _("Please provide your name, contact email and relation to this location."),
        )
        return redirect("maps_page")

    try:
        validate_email(contact_email)
    except ValidationError:
        messages.error(request, _("Please enter a valid contact email."))
        return redirect("maps_page")

    active_statuses = ["submitted", "under_review"]
    duplicate_claims = LocationClaim.objects.filter(
        location=location,
        status__in=active_statuses,
    )

    if request.user.is_authenticated:
        duplicate_claims = duplicate_claims.filter(
            Q(claimant_user=request.user) | Q(contact_email__iexact=contact_email)
        )
    else:
        duplicate_claims = duplicate_claims.filter(contact_email__iexact=contact_email)

    if duplicate_claims.exists():
        messages.warning(
            request,
            _("A claim request for this location is already under review."),
        )
        return redirect("maps_page")

    LocationClaim.objects.create(
        location=location,
        claimant_user=request.user if request.user.is_authenticated else None,
        claimant_name=claimant_name,
        contact_email=contact_email,
        relation_to_location=relation,
        proof=proof,
        message=message,
        status="submitted",
    )

    messages.success(
        request,
        _(
            "Your claim request was submitted. Tatzo will review it before anything changes."
        ),
    )
    return redirect("maps_page")


@require_POST
def submit_location_request(request):
    name = (request.POST.get("name") or "").strip()
    city = (request.POST.get("city") or "").strip()
    country = (request.POST.get("country") or "").strip()
    full_address = (request.POST.get("full_address") or "").strip()
    website_or_map_link = (request.POST.get("website_or_map_link") or "").strip()
    phone = (request.POST.get("phone") or "").strip()
    contact_email = (request.POST.get("contact_email") or "").strip()
    latitude = (request.POST.get("latitude") or "").strip()
    longitude = (request.POST.get("longitude") or "").strip()
    message = (request.POST.get("message") or "").strip()

    if not name or not city or not country or not full_address or not contact_email:
        messages.error(
            request,
            _("Please provide the location name, city, country, full street address, and contact email."),
        )
        return redirect("maps_page")

    try:
        validate_email(contact_email)
    except ValidationError:
        messages.error(request, _("Please enter a valid contact email."))
        return redirect("maps_page")

    latitude_value = None
    longitude_value = None
    if latitude or longitude:
        try:
            latitude_value = Decimal(latitude)
            longitude_value = Decimal(longitude)
        except (InvalidOperation, TypeError):
            messages.error(request, _("Please enter valid latitude and longitude values."))
            return redirect("maps_page")

        if not (Decimal("-90") <= latitude_value <= Decimal("90")) or not (
            Decimal("-180") <= longitude_value <= Decimal("180")
        ):
            messages.error(request, _("Latitude or longitude is outside the valid range."))
            return redirect("maps_page")

    active_statuses = ["submitted", "under_review"]
    duplicate_request = LocationRequest.objects.filter(
        name__iexact=name,
        city__iexact=city,
        full_address__iexact=full_address,
        contact_email__iexact=contact_email,
        status__in=active_statuses,
    ).exists()

    if duplicate_request:
        messages.warning(
            request,
            _("A location request for this studio is already under review."),
        )
        return redirect("maps_page")

    LocationRequest.objects.create(
        name=name,
        city=city,
        country=country,
        full_address=full_address,
        website_or_map_link=website_or_map_link,
        phone=phone,
        contact_email=contact_email,
        latitude=latitude_value,
        longitude=longitude_value,
        message=message,
        status="submitted",
    )

    messages.success(
        request,
        _("Your location request was submitted. Tatzo will review it before it appears on the map."),
    )
    return redirect("maps_page")


def _map_location_parts(location):
    parts = [part.strip() for part in (location or "").split(",") if part.strip()]
    return {
        "city": parts[0] if parts else "",
        "country": parts[-1] if len(parts) > 1 else "",
    }


def _artist_map_confidence_score(artist, location):
    """Score data completeness for the map without implying user compatibility."""
    if location == "Location pending":
        return 35

    location_parts = _map_location_parts(location)
    score = 45

    if location_parts["city"]:
        score += 20
    if location_parts["country"]:
        score += 10
    if artist.portfolio_count:
        score += min(15, artist.portfolio_count * 3)
    if artist.public_post_count:
        score += min(10, artist.public_post_count * 2)

    return min(100, score)


def _optional_location_coordinate(*objects, field_name):
    for obj in objects:
        if obj is None:
            continue
        value = getattr(obj, field_name, None)
        if value not in (None, ""):
            return value
    return None


def maps_page(request):
    """Interactive public map built from verified artist profiles."""
    verified_artists = (
        User.objects
        .filter(
            is_active=True,
            profile__account_type="tattoo_artist",
            profile__verification_status="approved",
            profile__is_email_verified=True,
        )
        .select_related("profile", "booking_settings")
        .prefetch_related("portfolio_works", "manualverificationrequest")
        .annotate(
            portfolio_count=Count("portfolio_works", distinct=True),
            public_post_count=Count(
                "post",
                filter=Q(post__visibility="public"),
                distinct=True,
            ),
        )
        .order_by("username")
    )

    artist_cards = []
    for index, artist in enumerate(verified_artists[:36]):
        manual_request = getattr(artist, "manualverificationrequest", None)
        location_obj = (
            Location.objects
            .filter(linked_user=artist, status__in=["verified", "claimed"])
            .exclude(latitude__isnull=True)
            .exclude(longitude__isnull=True)
            .order_by("-verified_at", "-updated_at")
            .first()
        )
        location = location_obj.display_address if location_obj else ""
        if not location and manual_request:
            location = (manual_request.city_country or "").strip()

        if not location:
            location = (
                Post.objects
                .filter(user=artist, visibility="public")
                .exclude(location="")
                .values_list("location", flat=True)
                .first()
                or "Location pending"
            )

        has_confirmed_location = bool(location_obj)
        source = "verified" if has_confirmed_location else "unclaimed"
        location_parts = {
            "city": location_obj.city,
            "country": location_obj.country,
        } if location_obj else _map_location_parts(location)
        confidence_score = _artist_map_confidence_score(artist, location)
        booking_settings = getattr(artist, "booking_settings", None)
        style_tags = []

        if booking_settings and booking_settings.active_styles:
            style_tags.extend(booking_settings.active_styles[:4])

        if len(style_tags) < 4:
            portfolio_styles = (
                artist.portfolio_works
                .exclude(style="")
                .values_list("style", flat=True)
                .distinct()[:4 - len(style_tags)]
            )
            style_tags.extend(portfolio_styles)

        booking_modes = []
        if booking_settings and booking_settings.bookings_enabled:
            booking_modes.append("Accepting new clients")
            if booking_settings.online_consultation_enabled:
                booking_modes.append("Online consult")
            if booking_settings.studio_consultation_enabled:
                booking_modes.append("In-person")

        can_book = bool(booking_settings and booking_settings.bookings_enabled)
        location_kind = (
            "Registered Tatzo artist with verified/imported location"
            if source == "verified"
            else "Registered artist without confirmed address"
        )

        latitude = _optional_location_coordinate(
            location_obj,
            manual_request,
            artist.profile,
            field_name="latitude",
        )
        longitude = _optional_location_coordinate(
            location_obj,
            manual_request,
            artist.profile,
            field_name="longitude",
        )
        has_map_marker = bool(has_confirmed_location and latitude and longitude)

        artist_cards.append({
            "user": artist,
            "is_registered": True,
            "display_name": artist.username,
            "tag": artist.profile.tag or artist.username,
            "profile_image": artist.profile.profile_image,
            "profile_url": f"/profile/{artist.username}/",
            "book_url": f"/appointments/artist/{artist.username}/book/",
            "location_id": location_obj.id if location_obj else "",
            "phone": location_obj.phone if location_obj else "",
            "website": location_obj.website if location_obj else "",
            "location": location,
            "location_city": location_parts["city"],
            "location_country": location_parts["country"],
            "location_kind": location_kind,
            "location_kind_code": "registered_verified" if has_confirmed_location else "registered_pending",
            "location_status": "verified" if has_confirmed_location else "pending",
            "has_map_pin": has_map_marker,
            "latitude": latitude,
            "longitude": longitude,
            "source": source,
            "confidence_score": confidence_score,
            "portfolio_count": artist.portfolio_count,
            "post_count": artist.public_post_count,
            "style_tags": style_tags,
            "booking_modes": booking_modes,
            "can_book": can_book,
        })


    external_locations = (
        Location.objects
        .filter(
            linked_user__isnull=True,
            status__in=["imported", "unclaimed", "pending_claim"],
            latitude__isnull=False,
            longitude__isnull=False,
        )
        .order_by("name")
    )

    for location_obj in external_locations:
        location = location_obj.display_address or "Location pending"
        location_parts = {
            "city": location_obj.city,
            "country": location_obj.country,
        }
        artist_cards.append({
            "user": None,
            "is_registered": False,
            "display_name": location_obj.name,
            "tag": "Imported location",
            "profile_image": None,
            "profile_url": "",
            "book_url": "",
            "location_id": location_obj.id,
            "location": location,
            "location_city": location_parts["city"],
            "location_country": location_parts["country"],
            "location_kind": "Not yet on Tatzo / Unclaimed",
            "location_kind_code": "imported",
            "location_status": location_obj.status,
            "phone": location_obj.phone,
            "website": location_obj.website,
            "has_map_pin": True,
            "latitude": location_obj.latitude,
            "longitude": location_obj.longitude,
            "source": "unclaimed",
            "confidence_score": 80,
            "portfolio_count": 0,
            "post_count": 0,
            "style_tags": [],
            "booking_modes": [],
            "can_book": False,
        })

    verified_location_count = sum(
        1 for artist in artist_cards
        if artist["is_registered"] and artist["has_map_pin"]
    )
    imported_location_count = sum(
        1 for artist in artist_cards
        if not artist["is_registered"] and artist["has_map_pin"]
    )
    pending_location_count = sum(
        1 for artist in artist_cards
        if artist["is_registered"] and not artist["has_map_pin"]
    )
    imported_count = verified_location_count
    unclaimed_count = imported_location_count

    return render(
        request,
        "users/maps.html",
        {
            "artist_cards": artist_cards,
            "imported_count": imported_count,
            "unclaimed_count": unclaimed_count,
            "verified_location_count": verified_location_count,
            "imported_location_count": imported_location_count,
            "pending_location_count": pending_location_count,
        },
    )

def coming_soon(request, feature):
    public_features = {"maps", "clean-slate", "contests"}

    if feature not in public_features and not request.user.is_authenticated:
        return redirect_to_login(request.get_full_path())

    features = {
        "maps": {
            "icon": "🗺️",
            "title": _("Maps"),
            "subtitle": _("Find tattoo artists near you and explore studios by location."),
        },
        "calendar": {
            "icon": "📅",
            "title": _("Calendar"),
            "subtitle": _("Manage bookings, sessions and upcoming appointments."),
        },
        "clean-slate": {
            "icon": "🌱",
            "title": _("Clean slate"),
            "subtitle": _("Discover tattoo removal resources, specialists and useful guides."),
        },
        "notifications": {
            "icon": "🔔",
            "title": _("Notifications"),
            "subtitle": _("Stay updated about likes, comments, replies and messages."),
        },
        "contests": {
            "icon": "🏆",
            "title": _("Contests"),
            "subtitle": _("Vote for the best tattoo works, follow competitions and discover winners."),
        },
    }

    feature_data = features.get(feature)

    if not feature_data:
        raise Http404

    return render(
        request,
        "users/coming_soon.html",
        {
            "feature": feature,
            "feature_data": feature_data,
        },
    )
    
@login_required
def report_problem(request):
    if request.method == "POST":
        form = UserReportForm(request.POST, request.FILES)

        allowed, retry_after = check_rate_limit(
            request,
            scope="reports:problem",
            limit=5,
            window_seconds=60 * 60,
            identity="user",
        )

        if not allowed:
            messages.error(
                request,
                _("You are sending reports too quickly. Please wait a bit."),
            )

            return render(
                request,
                "users/report_problem.html",
                {
                    "form": form,
                    "page_url": request.POST.get("page_url", ""),
                },
                status=429,
            )

        if form.is_valid():
            report = form.save(commit=False)
            report.user = request.user
            report.page_url = request.POST.get("page_url", "")[:500]
            report.save()

            messages.success(request, _("Thank you! Your report has been sent."))
            return redirect("home")
    else:
        form = UserReportForm()

    return render(request, "users/report_problem.html", {
        "form": form,
        "page_url": request.GET.get("next", ""),
    })
    
    
def legal_index(request):
    return render(
        request,
        "users/legal_index.html",
        {
            "legal_pages": get_legal_pages(),
        },
    )


def legal_page(request, page):
    legal_data = get_legal_page(page)

    if not legal_data:
        raise Http404

    return render(
        request,
        "users/legal_page.html",
        {
            "legal_page": legal_data,
            "page_key": page,
        },
    )