from django.urls import path

from . import views

app_name = "style_match"

urlpatterns = [
    path("", views.index, name="index"),
    path("start/", views.start_session, name="start"),
    path("session/<uuid:session_id>/react/", views.react, name="react"),
    path("session/<uuid:session_id>/result/", views.result, name="result"),
]
