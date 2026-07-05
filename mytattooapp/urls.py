from django.contrib import admin
from django.http import HttpResponse
from django.urls import include, path


def healthz(request):
    return HttpResponse("ok", content_type="text/plain")


urlpatterns = [
    path("healthz/", healthz, name="healthz"),
    path("admin/", admin.site.urls),
    path("", include("users.urls")),
    path("posts/", include("posts.urls")),
    path("appointments/", include("appointments.urls")),
    path("i18n/", include("django.conf.urls.i18n")),
]