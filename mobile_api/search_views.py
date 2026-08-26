from django.contrib.auth import get_user_model
from django.db.models import Case, IntegerField, Q, Value, When
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView


User = get_user_model()


def _profile_image_url(user, request):
    image = user.profile.profile_image
    if not image:
        return None
    try:
        url = image.url
    except (AttributeError, ValueError):
        return None
    return request.build_absolute_uri(url) if url.startswith("/") else url


class ProfileSearchView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        query = str(request.query_params.get("q", "")).strip()
        normalized_query = query.lstrip("@").strip()
        account_filter = str(request.query_params.get("type", "all")).strip()

        users = (
            User.objects.select_related("profile")
            .filter(is_active=True, profile__is_email_verified=True)
            .exclude(blocked_by_relations__blocker=request.user)
            .exclude(blocking_relations__blocked=request.user)
        )

        if normalized_query:
            users = users.filter(
                Q(username__icontains=normalized_query)
                | Q(profile__tag__icontains=normalized_query)
            ).annotate(
                exact_match=Case(
                    When(username__iexact=normalized_query, then=Value(2)),
                    When(profile__tag__iexact=normalized_query, then=Value(1)),
                    default=Value(0),
                    output_field=IntegerField(),
                )
            )
        else:
            users = users.annotate(
                exact_match=Value(0, output_field=IntegerField())
            )

        if account_filter == "artists":
            users = users.filter(profile__account_type="tattoo_artist")
        elif account_filter == "users":
            users = users.exclude(profile__account_type="tattoo_artist")
        else:
            account_filter = "all"

        users = users.order_by(
            "-exact_match",
            "-profile__verification_status",
            "username",
        )[:30]

        results = [
            {
                "id": user.id,
                "username": user.username,
                "tag": user.profile.tag,
                "bio": user.profile.bio or "",
                "account_type": user.profile.account_type,
                "is_verified_artist": user.profile.is_verified_artist,
                "profile_image_url": _profile_image_url(user, request),
            }
            for user in users
        ]

        return Response(
            {
                "query": query,
                "type": account_filter,
                "count": len(results),
                "results": results,
            }
        )
