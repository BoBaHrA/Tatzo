from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, render
from django.template.loader import render_to_string
from django.utils.translation import gettext as _
from django.views.decorators.http import require_POST
from users.security import check_rate_limit, is_new_account, rate_limited_json

from .forms import PostForm, PostMediaUploadForm
from .models import (
    CommentLike,
    CommentReport,
    Post,
    PostBookmark,
    PostComment,
    PostLike,
    PostMedia,
    PostReport,
)


def feed(request):
    posts = (
        Post.objects
        .select_related("user", "user__profile")
        .prefetch_related("medias", "likes", "comments", "bookmarks")
        .all()
    )

    liked_post_ids = set()
    bookmarked_post_ids = set()

    if request.user.is_authenticated:
        liked_post_ids = set(
            PostLike.objects.filter(user=request.user).values_list("post_id", flat=True)
        )

        bookmarked_post_ids = set(
            PostBookmark.objects.filter(user=request.user).values_list(
                "post_id",
                flat=True,
            )
        )

    context = {
        "posts": posts,
        "post_form": PostForm(),
        "media_form": PostMediaUploadForm(),
        "liked_post_ids": liked_post_ids,
        "bookmarked_post_ids": bookmarked_post_ids,
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

    return JsonResponse(
        {
            "ok": True,
            "liked": liked,
            "likes_count": post.likes.count(),
        }
    )


@login_required
@require_POST
def create_post(request):
    post_form = PostForm(request.POST)
    media_form = PostMediaUploadForm(request.POST, request.FILES)

    files = request.FILES.getlist("media")
    content = request.POST.get("content", "").strip()

    if not content and not files:
        return JsonResponse(
            {
                "ok": False,
                "error": _("Post cannot be empty."),
            },
            status=400,
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

        html = render_to_string(
            "partials/post_card.html",
            {
                "post": post,
                "request": request,
                "liked_post_ids": set(),
                "bookmarked_post_ids": set(),
            },
            request=request,
        )

        return JsonResponse(
            {
                "ok": True,
                "post_id": post.id,
                "html": html,
            }
        )

    return JsonResponse(
        {
            "ok": False,
            "error": _("Form validation failed."),
        },
        status=400,
    )


@login_required
@require_POST
def create_comment(request, post_id):
    post = get_object_or_404(Post, id=post_id)
    
    comment_limit = 20 if is_new_account(request.user) else 60

    allowed, retry_after = check_rate_limit(
        request,
        scope="comments:create",
        limit=comment_limit,
        window_seconds=60 * 60,
        identity="user",
    )

    if not allowed:
        return rate_limited_json(
            retry_after,
            _("You are commenting too quickly. Please wait a bit."),
        )

    if post.disable_comments:
        return JsonResponse(
            {
                "ok": False,
                "error": _("Comments are disabled for this post."),
            },
            status=403,
        )

    content = (request.POST.get("content") or "").strip()
    parent_id = request.POST.get("parent_id")

    if not content:
        return JsonResponse(
            {
                "ok": False,
                "error": _("Comment cannot be empty."),
            },
            status=400,
        )

    parent = None
    if parent_id:
        parent = get_object_or_404(PostComment, id=parent_id, post=post)

    comment = PostComment.objects.create(
        post=post,
        user=request.user,
        content=content,
        parent=parent,
    )

    html = render_to_string(
        "partials/comment_item.html",
        {
            "comment": comment,
            "request": request,
            "liked_comment_ids": set(),
        },
        request=request,
    )

    return JsonResponse(
        {
            "ok": True,
            "html": html,
            "comments_count": post.comments.count(),
        }
    )


def get_comments(request, post_id):
    post = get_object_or_404(Post, id=post_id)

    liked_comment_ids = set()

    if request.user.is_authenticated:
        liked_comment_ids = set(
            CommentLike.objects.filter(user=request.user, comment__post=post)
            .values_list("comment_id", flat=True)
        )

    comments = post.comments.filter(parent__isnull=True)

    html = render_to_string(
        "partials/comments_list.html",
        {
            "comments": comments,
            "request": request,
            "liked_comment_ids": liked_comment_ids,
        },
        request=request,
    )

    return JsonResponse({"html": html})


@login_required
@require_POST
def toggle_comment_like(request, comment_id):
    comment = get_object_or_404(PostComment, id=comment_id)

    like, created = CommentLike.objects.get_or_create(
        user=request.user,
        comment=comment,
    )

    if not created:
        like.delete()
        liked = False
    else:
        liked = True

    return JsonResponse(
        {
            "ok": True,
            "liked": liked,
            "count": comment.likes.count(),
        }
    )


@login_required
@require_POST
def delete_comment(request, comment_id):
    comment = get_object_or_404(PostComment, id=comment_id, user=request.user)
    post = comment.post
    comment.delete()

    return JsonResponse(
        {
            "ok": True,
            "comments_count": post.comments.count(),
        }
    )


@login_required
@require_POST
def edit_comment(request, comment_id):
    comment = get_object_or_404(PostComment, id=comment_id, user=request.user)

    content = (request.POST.get("content") or "").strip()

    if not content:
        return JsonResponse(
            {
                "ok": False,
                "error": _("Comment cannot be empty."),
            },
            status=400,
        )

    comment.content = content
    comment.save(update_fields=["content"])

    return JsonResponse(
        {
            "ok": True,
            "content": comment.content,
        }
    )


@login_required
@require_POST
def report_comment(request, comment_id):
    comment = get_object_or_404(PostComment, id=comment_id)
    
    allowed, retry_after = check_rate_limit(
        request,
        scope="reports:comment",
        limit=10,
        window_seconds=60 * 60,
        identity="user",
    )

    if not allowed:
        return rate_limited_json(
            retry_after,
            _("You are sending reports too quickly. Please wait a bit."),
        )

    if comment.user == request.user:
        return JsonResponse(
            {
                "ok": False,
                "error": _("You cannot report your own comment."),
            },
            status=400,
        )

    report, created = CommentReport.objects.get_or_create(
        comment=comment,
        user=request.user,
    )

    return JsonResponse(
        {
            "ok": True,
            "created": created,
            "message": (
                _("Report sent.")
                if created
                else _("You have already reported this comment.")
            ),
        }
    )


@login_required
@require_POST
def delete_post(request, post_id):
    post = get_object_or_404(Post, id=post_id, user=request.user)
    post.delete()

    return JsonResponse(
        {
            "ok": True,
            "post_id": post_id,
        }
    )


@login_required
@require_POST
def report_post(request, post_id):
    post = get_object_or_404(Post, id=post_id)
    
    allowed, retry_after = check_rate_limit(
        request,
        scope="reports:post",
        limit=10,
        window_seconds=60 * 60,
        identity="user",
    )

    if not allowed:
        return rate_limited_json(
            retry_after,
            _("You are sending reports too quickly. Please wait a bit."),
        )

    if post.user == request.user:
        return JsonResponse(
            {
                "ok": False,
                "error": _("You cannot report your own post."),
            },
            status=400,
        )

    reason = (request.POST.get("reason") or "").strip()

    report, created = PostReport.objects.get_or_create(
        post=post,
        user=request.user,
        defaults={"reason": reason},
    )

    if not created and reason and not report.reason:
        report.reason = reason
        report.save(update_fields=["reason"])

    return JsonResponse(
        {
            "ok": True,
            "created": created,
            "message": (
                _("Post report sent.")
                if created
                else _("You have already reported this post.")
            ),
        }
    )


def post_detail_fragment(request, post_id):
    post = get_object_or_404(
        Post.objects
        .select_related("user", "user__profile")
        .prefetch_related("medias", "likes", "comments"),
        id=post_id,
    )

    liked_post_ids = set()
    bookmarked_post_ids = set()

    if request.user.is_authenticated:
        liked_post_ids = set(
            PostLike.objects.filter(user=request.user).values_list("post_id", flat=True)
        )

        bookmarked_post_ids = set(
            PostBookmark.objects.filter(user=request.user).values_list(
                "post_id",
                flat=True,
            )
        )

    html = render_to_string(
        "partials/post_card.html",
        {
            "post": post,
            "request": request,
            "liked_post_ids": liked_post_ids,
            "bookmarked_post_ids": bookmarked_post_ids,
        },
        request=request,
    )

    return JsonResponse(
        {
            "ok": True,
            "html": html,
        }
    )


@login_required
def toggle_bookmark(request, post_id):
    if request.method != "POST":
        return JsonResponse(
            {
                "ok": False,
                "error": _("Invalid method."),
            },
            status=405,
        )

    post = get_object_or_404(Post, id=post_id)

    bookmark, created = PostBookmark.objects.get_or_create(
        user=request.user,
        post=post,
    )

    if not created:
        bookmark.delete()
        bookmarked = False
    else:
        bookmarked = True

    return JsonResponse(
        {
            "ok": True,
            "bookmarked": bookmarked,
        }
    )


@login_required
def bookmarks_page(request):
    bookmarks = (
        PostBookmark.objects
        .filter(user=request.user)
        .select_related("post", "post__user", "post__user__profile")
        .prefetch_related("post__medias", "post__likes", "post__comments")
    )

    posts = [bookmark.post for bookmark in bookmarks]

    liked_post_ids = set(
        PostLike.objects.filter(user=request.user).values_list("post_id", flat=True)
    )

    bookmarked_post_ids = set(post.id for post in posts)

    return render(
        request,
        "posts/bookmarks.html",
        {
            "posts": posts,
            "liked_post_ids": liked_post_ids,
            "bookmarked_post_ids": bookmarked_post_ids,
        },
    )