from django.urls import path
from . import views

app_name = "posts"

urlpatterns = [
    path("", views.feed, name="feed"),
    path("create/", views.create_post, name="create_post"),
    path("<int:post_id>/like/", views.toggle_like, name="toggle_like"),
]