from django.contrib import admin

from posts.models import Post
from .models import Profile, VerificationDocument


# Действие для массового подтверждения профилей
@admin.action(description="Approve selected profiles")
def approve_profiles(modeladmin, request, queryset):
    queryset.update(verification_status="approved")
    for profile in queryset:
        profile.last_notification = "approved"
        profile.save()


# Действие для массового отклонения профилей
@admin.action(description="Reject selected profiles")
def reject_profiles(modeladmin, request, queryset):
    queryset.update(verification_status="rejected")
    for profile in queryset:
        profile.last_notification = "rejected"
        profile.save()


# Регистрация модели Profile с действиями
@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "account_type",
        "verification_status",
    )  # Поля для отображения
    list_filter = ("account_type", "verification_status")  # Фильтры
    search_fields = ("user__username", "user__email")  # Поля для поиска
    actions = [approve_profiles, reject_profiles]  # Массовые действия


# Регистрация модели VerificationDocument с действиями
@admin.register(VerificationDocument)
class VerificationDocumentAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "business_document_type",
        "id_document_type",
        "is_verified",
    )  # Обновленные поля
    list_filter = (
        "business_document_type",
        "id_document_type",
        "is_verified",
    )  # Обновленные поля
    search_fields = ("user__username",)

    # Действие для подтверждения документов
    @admin.action(description="Approve selected documents")
    def approve_documents(self, request, queryset):
        queryset.update(is_verified=True)

    # Действие для отклонения документов
    @admin.action(description="Reject selected documents")
    def reject_documents(self, request, queryset):
        queryset.update(is_verified=False)


# Регистрация модели Post
@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ("user", "content", "created_at")  # Поля для отображения
    search_fields = ("user__username", "content")  # Поля для поиска
