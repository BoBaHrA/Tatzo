from django.contrib.auth import get_user_model
from django.contrib.sitemaps import Sitemap
from django.urls import reverse


User = get_user_model()


class StaticSitemap(Sitemap):
    protocol = "https"
    priority = 0.7
    changefreq = "weekly"

    def items(self):
        return ["home", "search_page", "maps_page", "style_match:index"]

    def location(self, item):
        return reverse(item)


class ArtistSitemap(Sitemap):
    protocol = "https"
    priority = 0.8
    changefreq = "weekly"

    def items(self):
        return (
            User.objects.filter(
                is_active=True,
                profile__account_type="tattoo_artist",
                profile__status="active",
                profile__verification_status="approved",
            )
            .select_related("profile")
            .order_by("pk")
        )

    def location(self, user):
        return reverse("profile", kwargs={"username": user.username})
