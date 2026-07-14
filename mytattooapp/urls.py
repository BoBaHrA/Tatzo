from django.contrib import admin
from django.http import HttpResponse
from django.urls import include, path
from appointments import views as appointment_views


def healthz(request):
    return HttpResponse("ok", content_type="text/plain")


urlpatterns = [
    path("healthz/", healthz, name="healthz"),
    path("admin/", admin.site.urls),
    path("calendar/", appointment_views.calendar_page, name="calendar"),
    path("artist/dashboard/calendar/", appointment_views.artist_dashboard_calendar, name="artist_dashboard_calendar"),
    path("", include("users.urls")),
    path("posts/", include("posts.urls")),
    path("appointments/", include("appointments.urls")),
    path("i18n/", include("django.conf.urls.i18n")),
]