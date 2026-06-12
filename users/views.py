import logging

from django.contrib import messages
from django.contrib.auth import authenticate, login
from django.contrib.auth import logout as auth_logout
from django.contrib.auth import get_user_model
from django.contrib.auth.models import User
from django.contrib.auth.tokens import default_token_generator
from django.contrib.auth.decorators import login_required, user_passes_test
from django.contrib.auth.views import redirect_to_login
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
from .models import Profile, VerificationDocument, ManualVerificationRequest, UserFollow, PortfolioAlbum, PortfolioWork, ChatThread, ChatMessage, ChatAttachment

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
        .select_related("profile")
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


def signup(request):
    show_verification_modal = False

    if request.method == "POST":
        user_form = CustomUserCreationForm(request.POST)

        if user_form.is_valid():
            user = None

            try:
                user = user_form.save()

                # Аккаунт создан, но вход запрещён до подтверждения почты
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
        {"form": user_form, "show_verification_modal": show_verification_modal},
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

        elif verification_action == "manual":
            manual_form = ManualVerificationForm(
                request.POST,
                request.FILES,
                instance=existing_manual_request,
            )

            if manual_form.is_valid():
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
        User.objects.select_related("profile"),
        username=username
    )

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


def followers_list(request, username):
    profile_user = get_object_or_404(
        User.objects.select_related("profile"),
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
        User.objects.select_related("profile"),
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
        User.objects.select_related("profile"),
        username=username,
    )

    if request.user != profile_user:
        return redirect("artist_portfolio", username=profile_user.username)

    if profile_user.profile.account_type != "tattoo_artist":
        return redirect("profile", username=profile_user.username)

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

    if form.is_valid():
        album = form.save(commit=False)
        album.user = request.user
        album.save()
        messages.success(request, _("Portfolio album created."))

    return redirect("artist_portfolio", username=request.user.username)

def artist_portfolio(request, username):
    profile_user = get_object_or_404(
        User.objects.select_related("profile"),
        username=username,
    )

    if profile_user.profile.account_type != "tattoo_artist":
        return redirect("profile", username=profile_user.username)

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
    }

    return render(request, "users/artist_portfolio.html", context)

def artist_portfolio_album(request, username, album_id):
    profile_user = get_object_or_404(
        User.objects.select_related("profile"),
        username=username,
    )

    if profile_user.profile.account_type != "tattoo_artist":
        return redirect("profile", username=profile_user.username)

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
    user_obj = get_object_or_404(User.objects.select_related("profile"), username=username)

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
    user_obj = get_object_or_404(User.objects.select_related("profile"), username=username)

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
        last_message = thread.messages.order_by("-created_at").first()

        unread_count = thread.messages.filter(
            is_read=False
        ).exclude(
            sender=request.user
        ).count()

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
        User.objects.select_related("profile"),
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

    thread.messages.filter(
        is_read=False
    ).exclude(
        sender=request.user
    ).update(is_read=True)

    chat_messages = (
        thread.messages
        .select_related("sender", "sender__profile")
        .order_by("created_at")
    )

    return render(
        request,
        "users/chat_thread.html",
        {
            "thread": thread,
            "other_user": other_user,
            "chat_messages": chat_messages,
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

    message = ChatMessage.objects.create(
        thread=thread,
        sender=request.user,
        content=content,
    )

    for file in files:
        ChatAttachment.objects.create(
            message=message,
            file=file,
        )

    thread.updated_at = timezone.now()
    thread.save(update_fields=["updated_at"])

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
        .filter(id__gt=last_id)
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
        .select_related("profile")
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