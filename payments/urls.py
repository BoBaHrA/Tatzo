from django.urls import path

from . import views

app_name = "payments"

urlpatterns = [
    path("connect/status/", views.connect_status, name="connect_status"),
    path("connect/start/", views.connect_start, name="connect_start"),
    path("connect/refresh/", views.connect_refresh, name="connect_refresh"),
    path("connect/return/", views.connect_return, name="connect_return"),
    path(
        "appointments/<int:appointment_id>/deposit/status/",
        views.deposit_status,
        name="deposit_status",
    ),
    path(
        "appointments/<int:appointment_id>/deposit/checkout/",
        views.deposit_checkout,
        name="deposit_checkout",
    ),
    path(
        "appointments/<int:appointment_id>/deposit/return/",
        views.deposit_return,
        name="deposit_return",
    ),
    path("stripe/webhook/", views.stripe_webhook, name="stripe_webhook"),
]
