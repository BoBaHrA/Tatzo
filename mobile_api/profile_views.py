from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import FeedPostSerializer
from .views import _visible_posts_for, _visible_profile_user


class ProfileContentView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, username):
        target = _visible_profile_user(request, username)
        tab = str(request.query_params.get("tab", "posts")).strip().lower()
        if tab not in {"posts", "liked"}:
            tab = "posts"

        can_view_liked = bool(
            target.pk == request.user.pk or target.profile.show_liked_posts
        )

        posts = _visible_posts_for(request.user)
        if tab == "liked":
            if not can_view_liked:
                return Response(
                    {
                        "tab": "liked",
                        "can_view_liked": False,
                        "count": 0,
                        "results": [],
                    }
                )
            posts = posts.filter(likes__user=target).distinct()
        else:
            posts = posts.filter(user=target)

        posts = list(posts.order_by("-created_at")[:30])
        serializer = FeedPostSerializer(
            posts,
            many=True,
            context={"request": request},
        )
        return Response(
            {
                "tab": tab,
                "can_view_liked": can_view_liked,
                "count": len(posts),
                "results": serializer.data,
            }
        )
