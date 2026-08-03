from django.contrib import admin
from django.utils.html import format_html

from .models import StyleMatchResponse, StyleMatchSession, TattooCard


@admin.register(TattooCard)
class TattooCardAdmin(admin.ModelAdmin):
    list_display = (
        "card_id",
        "image_preview",
        "primary_style",
        "quality_score",
        "is_approved",
        "is_active",
        "updated_at",
    )
    list_filter = ("primary_style", "is_approved", "is_active", "skin_tone")
    search_fields = ("card_id", "cloudinary_public_id", "body_area")
    list_editable = ("quality_score", "is_approved", "is_active")
    readonly_fields = ("image_preview_large", "created_at", "updated_at")
    ordering = ("card_id",)

    @admin.display(description="Preview")
    def image_preview(self, obj):
        return format_html(
            '<img src="{}" alt="" style="width:48px;height:72px;object-fit:cover;border-radius:8px">',
            obj.delivery_url,
        )

    @admin.display(description="Preview")
    def image_preview_large(self, obj):
        if not obj.pk:
            return "—"
        return format_html(
            '<img src="{}" alt="" style="width:240px;max-height:360px;object-fit:cover;border-radius:14px">',
            obj.delivery_url,
        )


class StyleMatchResponseInline(admin.TabularInline):
    model = StyleMatchResponse
    extra = 0
    readonly_fields = ("card", "position", "reaction", "saved", "responded_at")
    can_delete = False


@admin.register(StyleMatchSession)
class StyleMatchSessionAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user",
        "status",
        "progress",
        "personality_slug",
        "started_at",
        "completed_at",
    )
    list_filter = ("status", "personality_slug", "started_at")
    search_fields = ("id", "user__username", "browser_session_key")
    readonly_fields = (
        "id",
        "user",
        "browser_session_key",
        "status",
        "target_count",
        "card_order",
        "current_index",
        "style_scores",
        "trait_scores",
        "personality_slug",
        "started_at",
        "completed_at",
        "updated_at",
    )
    inlines = (StyleMatchResponseInline,)

    @admin.display(description="Progress")
    def progress(self, obj):
        return f"{obj.current_index}/{obj.target_count}"


@admin.register(StyleMatchResponse)
class StyleMatchResponseAdmin(admin.ModelAdmin):
    list_display = ("session", "position", "card", "reaction", "saved", "responded_at")
    list_filter = ("reaction", "saved", "responded_at")
    search_fields = ("session__id", "card__card_id", "session__user__username")
    readonly_fields = (
        "session",
        "position",
        "card",
        "reaction",
        "saved",
        "responded_at",
    )
