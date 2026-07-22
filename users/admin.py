from django.contrib import admin

from posts.models import Post
from django.utils.html import format_html
from django.utils.translation import gettext_lazy as _
from django.urls import reverse
from .models import Location, LocationClaim, LocationRequest, Profile, VerificationDocument, UserReport


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

@admin.register(UserReport)
class UserReportAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "report_type",
        "title",
        "user",
        "is_resolved",
        "created_at",
    )
    list_filter = (
        "report_type",
        "is_resolved",
        "created_at",
    )
    search_fields = (
        "title",
        "message",
        "user__username",
        "user__email",
        "page_url",
    )
    readonly_fields = (
        "user",
        "report_type",
        "title",
        "message",
        "page_url",
        "attachment_link",
        "created_at",
    )
    list_editable = ("is_resolved",)
    ordering = ("-created_at",)

    fieldsets = (
        (_("Report information"), {
            "fields": (
                "user",
                "report_type",
                "title",
                "message",
                "page_url",
                "attachment_link",
            )
        }),
        (_("Moderation"), {
            "fields": (
                "is_resolved",
                "created_at",
            )
        }),
    )

    @admin.display(description=_("Attachment"))
    def attachment_link(self, obj):
        if not obj.attachment:
            return "—"
        url = reverse("protected_media", args=["report", obj.pk, "file"])
        return format_html(
            '<a href="{}" target="_blank" rel="noopener noreferrer">{}</a>',
            url,
            _("Open attachment"),
        )


@admin.register(Location)
class LocationAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "city",
        "country",
        "source",
        "status",
        "linked_user",
        "latitude",
        "longitude",
        "verified_at",
        "updated_at",
    )
    list_filter = ("source", "status", "city", "country", "created_at", "verified_at")
    search_fields = (
        "name",
        "address",
        "formatted_address",
        "city",
        "country",
        "source_place_id",
        "status",
        "linked_user__username",
        "linked_user__email",
    )
    readonly_fields = ("created_at", "updated_at")
    autocomplete_fields = ("linked_user",)
    list_editable = ("status",)
    ordering = ("name",)


@admin.register(LocationClaim)
class LocationClaimAdmin(admin.ModelAdmin):
    list_display = (
        "location",
        "claimant_name",
        "contact_email",
        "relation_to_location",
        "has_proof_document",
        "claimant_user",
        "status",
        "created_at",
    )
    list_filter = ("status", "created_at", "updated_at")
    search_fields = (
        "location__name",
        "claimant_name",
        "contact_email",
        "claimant_user__username",
        "relation_to_location",
    )
    readonly_fields = ("proof_document_link", "created_at", "updated_at")
    autocomplete_fields = ("location", "claimant_user")
    list_editable = ("status",)
    ordering = ("-created_at",)

    @admin.display(boolean=True, description="Proof document")
    def has_proof_document(self, obj):
        return bool(obj.proof_document)

    @admin.display(description="Proof document")
    def proof_document_link(self, obj):
        if not obj.proof_document:
            return "—"
        url = reverse("protected_media", args=["location-claim", obj.pk, "file"])
        return format_html('<a href="{}" target="_blank" rel="noopener noreferrer">Open proof document</a>', url)


@admin.register(LocationRequest)
class LocationRequestAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "city",
        "country",
        "contact_email",
        "latitude",
        "longitude",
        "has_supporting_file",
        "status",
        "created_at",
    )
    list_filter = ("status", "city", "country", "created_at")
    search_fields = ("name", "city", "country", "full_address", "website_or_map_link", "contact_email")
    readonly_fields = ("supporting_file_link", "created_at", "updated_at")
    list_editable = ("status",)
    ordering = ("-created_at",)

    @admin.display(boolean=True, description="Supporting file")
    def has_supporting_file(self, obj):
        return bool(obj.supporting_file)

    @admin.display(description="Supporting file")
    def supporting_file_link(self, obj):
        if not obj.supporting_file:
            return "—"
        url = reverse("protected_media", args=["location-request", obj.pk, "file"])
        return format_html('<a href="{}" target="_blank" rel="noopener noreferrer">Open supporting file</a>', url)
