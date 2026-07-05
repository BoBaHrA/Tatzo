from django.contrib import admin

from .models import (
    Appointment,
    AppointmentReferenceImage,
    ArtistAvailability,
    ArtistBookingSettings,
    ArtistTimeOff,
)


class AppointmentReferenceImageInline(admin.TabularInline):
    model = AppointmentReferenceImage
    extra = 0


@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "client",
        "artist",
        "booking_type",
        "date",
        "start_time",
        "status",
        "created_at",
    )
    list_filter = ("status", "booking_type", "date")
    search_fields = ("client__username", "artist__username", "description")
    inlines = [AppointmentReferenceImageInline]


@admin.register(ArtistBookingSettings)
class ArtistBookingSettingsAdmin(admin.ModelAdmin):
    list_display = (
        "artist",
        "bookings_enabled",
        "minimum_notice_hours",
        "consultation_enabled",
        "reference_images_required",
    )


@admin.register(ArtistAvailability)
class ArtistAvailabilityAdmin(admin.ModelAdmin):
    list_display = (
        "artist",
        "weekday",
        "is_closed",
        "open_time",
        "close_time",
        "break_start",
        "break_end",
    )
    list_filter = ("weekday", "is_closed")
    search_fields = ("artist__username",)


@admin.register(ArtistTimeOff)
class ArtistTimeOffAdmin(admin.ModelAdmin):
    list_display = ("artist", "date", "reason")
    list_filter = ("date",)
    search_fields = ("artist__username", "reason")