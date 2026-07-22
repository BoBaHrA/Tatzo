from django.contrib import admin
from django.http import HttpResponse
from django.urls import include, path
from django.contrib.sitemaps.views import sitemap
from django.conf import settings
from .sitemaps import ArtistSitemap, StaticSitemap
from appointments import views as appointment_views


SITEMAPS = {"static": StaticSitemap, "artists": ArtistSitemap}


def healthz(request):
    return HttpResponse("ok", content_type="text/plain")


def robots_txt(request):
    body = "\n".join(
        [
            "User-agent: *",
            "Disallow: /admin/",
            "Disallow: /moderation/",
            "Disallow: /protected-media/",
            "Disallow: /appointments/",
            "Disallow: /calendar/",
            "Disallow: /artist/dashboard/",
            "Disallow: /chats/",
            "Disallow: /settings/",
            f"Sitemap: {settings.PUBLIC_SITE_URL}/sitemap.xml",
        ]
    )
    return HttpResponse(body + "\n", content_type="text/plain")


def sitemap_xml(request):
    response = sitemap(request, sitemaps=SITEMAPS)
    # Django marks sitemap responses as noindex by default. Although sitemap
    # files are not search results themselves, some crawlers reject that
    # header while discovering the URLs contained in the XML.
    if "X-Robots-Tag" in response:
        del response["X-Robots-Tag"]
    return response


urlpatterns = [
    path("healthz/", healthz, name="healthz"),
    path("robots.txt", robots_txt, name="robots_txt"),
    path(
        "sitemap.xml",
        sitemap_xml,
        name="django.contrib.sitemaps.views.sitemap",
    ),
    path("admin/", admin.site.urls),
    path("calendar/", appointment_views.calendar_page, name="calendar"),
    path(
        "artist/dashboard/calendar/",
        appointment_views.artist_dashboard_calendar,
        name="artist_dashboard_calendar",
    ),
    path("", include("users.urls")),
    path("posts/", include("posts.urls")),
    path("appointments/", include("appointments.urls")),
    path("i18n/", include("django.conf.urls.i18n")),
]
