from django.contrib import admin
from django.urls import include, path  # Подключаем include для маршрутов приложений
from django.conf.urls.i18n import i18n_patterns

urlpatterns = [
    path("admin/", admin.site.urls),  # Стандартный маршрут для админки
    path("", include("users.urls")),  # Подключаем маршруты приложения "users"
    path("posts/", include("posts.urls")),
    path("i18n/", include("django.conf.urls.i18n")),
]
