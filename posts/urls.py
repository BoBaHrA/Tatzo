from django.urls import path
from . import views

app_name = "posts"

urlpatterns = [
    path("", views.feed, name="feed"),
    path("create/", views.create_post, name="create_post"),
    path("<int:post_id>/like/", views.toggle_like, name="toggle_like"),
    path("<int:post_id>/comments/", views.get_comments, name="get_comments"),
    path("<int:post_id>/comment/", views.create_comment, name="create_comment"),
    path("comment/<int:comment_id>/edit/", views.edit_comment, name="edit_comment"),
    path("comment/<int:comment_id>/delete/", views.delete_comment, name="delete_comment"),
    path("comment/<int:comment_id>/report/", views.report_comment, name="report_comment"),
    path("comment/<int:comment_id>/like/", views.toggle_comment_like, name="toggle_comment_like"),
]