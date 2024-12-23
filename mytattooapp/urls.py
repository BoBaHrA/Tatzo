from django.contrib import admin
from django.urls import path, include  # Подключаем include для маршрутов приложений

urlpatterns = [
    path('admin/', admin.site.urls),  # Стандартный маршрут для админки
    path('', include('users.urls')),  # Подключаем маршруты приложения "users"
]
