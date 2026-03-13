from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.shortcuts import redirect, render
from django.views.decorators.http import require_POST

from .forms import PostForm, PostMediaUploadForm
from .models import Post, PostMedia


def feed(request):
    posts = (
        Post.objects.select_related("user")
        .prefetch_related("medias")
        .order_by("-created_at")
    )

    context = {
        "posts": posts,
        "post_form": PostForm(),
        "media_form": PostMediaUploadForm(),
    }

    return render(request, "posts/feed.html", context)


@login_required
@require_POST
def create_post(request):
    post_form = PostForm(request.POST)
    media_form = PostMediaUploadForm(request.POST, request.FILES)

    files = request.FILES.getlist("media")
    content = request.POST.get("content", "").strip()

    if not content and not files:
        posts = (
            Post.objects.select_related("user")
            .prefetch_related("medias")
            .order_by("-created_at")
        )
        return render(
            request,
            "posts/feed.html",
            {
                "posts": posts,
                "post_form": post_form,
                "media_form": media_form,
                "post_error": "Пост не может быть пустым.",
            },
        )

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

        return redirect("posts:feed")

    posts = (
        Post.objects.select_related("user")
        .prefetch_related("medias")
        .order_by("-created_at")
    )

    return render(
        request,
        "posts/feed.html",
        {
            "posts": posts,
            "post_form": post_form,
            "media_form": media_form,
        },
    )