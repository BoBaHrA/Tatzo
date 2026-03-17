from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.shortcuts import redirect, render
from django.views.decorators.http import require_POST
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.template.loader import render_to_string

from .forms import PostForm, PostMediaUploadForm
from .models import Post, PostMedia, PostLike, PostComment


def feed(request):
    posts = (
        Post.objects
        .select_related("user", "user__profile")
        .prefetch_related("medias", "likes", "comments")
        .all()
    )

    liked_post_ids = set()
    if request.user.is_authenticated:
        liked_post_ids = set(
            PostLike.objects.filter(user=request.user).values_list("post_id", flat=True)
        )

    context = {
        "posts": posts,
        "post_form": PostForm(),
        "media_form": PostMediaUploadForm(),
        "liked_post_ids": liked_post_ids,
    }

    return render(request, "posts/feed.html", context)

@login_required
@require_POST
def toggle_like(request, post_id):
    post = get_object_or_404(Post, id=post_id)

    like = PostLike.objects.filter(post=post, user=request.user).first()

    if like:
        like.delete()
        liked = False
    else:
        PostLike.objects.create(post=post, user=request.user)
        liked = True

    return JsonResponse({
        "ok": True,
        "liked": liked,
        "likes_count": post.likes.count(),
    })

@login_required
@require_POST
def create_post(request):
    post_form = PostForm(request.POST)
    media_form = PostMediaUploadForm(request.POST, request.FILES)

    files = request.FILES.getlist("media")
    content = request.POST.get("content", "").strip()

    if not content and not files:
        return JsonResponse({
            "ok": False,
            "error": "Пост не может быть пустым."
        }, status=400)

    if post_form.is_valid() and media_form.is_valid():
        with transaction.atomic():
            post = post_form.save(commit=False)
            post.user = request.user
            post.save()

            for i, file in enumerate(files):
                media_type = "video" if file.content_type.startswith("video") else "image"

                PostMedia.objects.create(
                    post=post,
                    file=file,
                    media_type=media_type,
                    order=i,
                )

        html = render_to_string(
            "posts/includes/post_card.html",
            {
                "post": post,
                "request": request,
                "liked_post_ids": set(),
            },
            request=request,
        )

        return JsonResponse({
            "ok": True,
            "post_id": post.id,
            "html": html,
        })

    return JsonResponse({
        "ok": False,
        "error": "Ошибка валидации формы."
    }, status=400)