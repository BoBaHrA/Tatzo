from django.contrib import admin

from .models import HealingCheckIn, HealingJourney, HealingRoutineCompletion


class HealingCheckInInline(admin.TabularInline):
    model = HealingCheckIn
    extra = 0
    readonly_fields = ("created_at", "updated_at")


@admin.register(HealingJourney)
class HealingJourneyAdmin(admin.ModelAdmin):
    list_display = ("title", "client", "artist", "started_on", "status", "updated_at")
    list_filter = ("status", "started_on")
    search_fields = ("title", "client__username", "artist__username")
    list_select_related = ("client", "artist", "appointment")
    inlines = (HealingCheckInInline,)


@admin.register(HealingRoutineCompletion)
class HealingRoutineCompletionAdmin(admin.ModelAdmin):
    list_display = ("journey", "date", "task_slug", "completed_at")
    list_filter = ("task_slug", "date")
    list_select_related = ("journey",)
