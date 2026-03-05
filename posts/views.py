from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from .models import Post, PostMedia
from users.forms import PostForm, PostMediaUploadForm


def feed(request):
    posts = Post.objects.select_related("user").prefetch_related("medias").all()

    context = {
        "posts": posts,
        "post_form": PostForm(),
        "media_form": PostMediaUploadForm(),
    }

    return render(request, "posts/feed.html", context)


@login_required
def create_post(request):
    if request.method == "POST":
        post_form = PostForm(request.POST)
        media_form = PostMediaUploadForm(request.POST, request.FILES)

        if post_form.is_valid() and media_form.is_valid():
            post = post_form.save(commit=False)
            post.user = request.user
            post.save()

            files = request.FILES.getlist("media")

            for i, file in enumerate(files):
                media_type = "video" if file.content_type.startswith("video") else "image"

                PostMedia.objects.create(
                    post=post,
                    file=file,
                    media_type=media_type,
                    order=i
                )

    return redirect("posts:feed")