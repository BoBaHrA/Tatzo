from django.urls import path
from . import views
from django.contrib import admin
from django.contrib.auth import views as auth_views



urlpatterns = [
    path('signup/', views.signup, name='signup'),
    path('profiles/', views.profile_list, name='profile_list'),
    path('admin/verification/<int:profile_id>/', views.admin_verification, name='admin_verification'),
    path('edit-profile/', views.edit_profile, name='edit_profile'),
    path('profile/', views.user_profile, name='user_profile'),
    path('verification/', views.verification_page, name='verification_page'),
    path('review-verifications/', views.review_verifications, name='review_verifications'),
    path('verify-document/<int:document_id>/', views.verify_document, name='verify_document'),
    path('pending-verifications/', views.pending_verifications, name='pending_verifications'),
    path('', views.home, name='home'),
    path('create_post/', views.create_post, name='create_post'),  # Добавляем этот маршрут
    path('review-profile/<int:profile_id>/', views.review_profile, name='review_profile'),  # Добавлен маршрут для просмотра профиля
    path('logout/', auth_views.LogoutView.as_view(), name='logout'),
    # Новые маршруты для подтверждения и отклонения профиля
    path('approve-profile/<int:profile_id>/', views.approve_profile, name='approve_profile'),
    path('reject-profile/<int:profile_id>/', views.reject_profile, name='reject_profile'),
    path('login/', auth_views.LoginView.as_view(template_name='registration/login.html'), name='login'),

    # ... другие маршруты
]
