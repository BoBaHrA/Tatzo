from django.contrib import admin, messages
from django.core.exceptions import PermissionDenied
from django.shortcuts import redirect
from django.template.response import TemplateResponse
from django.urls import path, reverse
from django.utils.html import format_html
from django.utils.translation import gettext_lazy as _

from posts.models import Post

from .imported_artists import (
    ImportedArtistAdminForm,
    create_imported_artist,
    get_imported_artist_location,
    is_claimable_imported_artist,
    make_imported_artist_claim_token,
)
from .models import (
    Location,
    LocationClaim,
    LocationRequest,
    PortfolioAlbum,
    PortfolioWork,
    Profile,
    UserReport,
    VerificationDocument,
)


@admin.action(description="Approve selected profiles")
def approve_profiles(modeladmin, request, queryset):
    queryset.update(verification_status="approved")
    for profile in queryset:
        profile.last_notification = "approved"
        profile.save()


@admin.action(description="Reject selected profiles")
def reject_profiles(modeladmin, request, queryset):
    queryset.update(verification_status="rejected")
    for profile in queryset:
        profile.last_notification = "rejected"
        profile.save()


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    change_list_template = "admin/users/profile/change_list.html"
    list_display = (
        "user",
        "account_type",
        "verification_status",
        "imported_state",
    )
    list_filter = ("account_type", "verification_status")
    search_fields = ("user__username", "user__email", "user__first_name")
    actions = [approve_profiles, reject_profiles]
    readonly_fields = (
        "public_profile_link",
        "claim_link",
        "portfolio_admin_link",
    )

    def get_urls(self):
        custom_urls = [
            path(
                "imported/add/",
                self.admin_site.admin_view(self.add_imported_artist_view),
                name="users_profile_add_imported",
            ),
        ]
        return custom_urls + super().get_urls()

    def add_imported_artist_view(self, request):
        if not self.has_add_permission(request):
            raise PermissionDenied

        if request.method == "POST":
            form = ImportedArtistAdminForm(request.POST, request.FILES)
            if form.is_valid():
                try:
                    user, _location = create_imported_artist(form)
                except Exception as exc:
                    form.add_error(
                        None,
                        _("Could not create the imported artist: %(error)s")
                        % {"error": exc},
                    )
                else:
                    claim_path = reverse(
                        "claim_imported_artist",
                        kwargs={"token": make_imported_artist_claim_token(user)},
                    )
                    profile_path = reverse("profile", kwargs={"username": user.username})
                    self.message_user(
                        request,
                        _(
                            "Imported artist created. Public profile: %(profile)s — private claim link: %(claim)s"
                        )
                        % {
                            "profile": request.build_absolute_uri(profile_path),
                            "claim": request.build_absolute_uri(claim_path),
                        },
                        level=messages.SUCCESS,
                    )
                    return redirect(
                        reverse("admin:users_profile_change", args=[user.profile.pk])
                    )
        else:
            form = ImportedArtistAdminForm()

        context = {
            **self.admin_site.each_context(request),
            "opts": self.model._meta,
            "title": _("Add imported tattoo artist"),
            "form": form,
            "media": form.media,
        }
        return TemplateResponse(
            request,
            "admin/users/profile/add_imported_artist.html",
            context,
        )

    @admin.display(description=_("Imported profile"))
    def imported_state(self, obj):
        location = get_imported_artist_location(obj.user)
        if not location:
            return "—"
        if is_claimable_imported_artist(obj.user):
            return _("Unclaimed")
        if location.status == "pending_claim":
            return _("Claim pending")
        if location.status == "claimed":
            return _("Claimed")
        return location.get_status_display()

    @admin.display(description=_("Public profile"))
    def public_profile_link(self, obj):
        if not obj or not obj.pk:
            return "—"
        url = reverse("profile", kwargs={"username": obj.user.username})
        return format_html(
            '<a href="{}" target="_blank" rel="noopener">{}</a>',
            url,
            _("Open public profile"),
        )

    @admin.display(description=_("Private claim link"))
    def claim_link(self, obj):
        if not obj or not obj.pk:
            return "—"
        location = get_imported_artist_location(obj.user)
        if not location:
            return "—"
        if not is_claimable_imported_artist(obj.user):
            if location.status == "pending_claim":
                return _("Claim submitted — waiting for email confirmation")
            return _("Profile already claimed")

        url = reverse(
            "claim_imported_artist",
            kwargs={"token": make_imported_artist_claim_token(obj.user)},
        )
        return format_html(
            '<a href="{}" target="_blank" rel="noopener">{}</a><br><code>{}</code>',
            url,
            _("Open claim page"),
            url,
        )

    @admin.display(description=_("Portfolio"))
    def portfolio_admin_link(self, obj):
        if not obj or not obj.pk:
            return "—"
        changelist = reverse("admin:users_portfoliowork_changelist")
        add_url = reverse("admin:users_portfoliowork_add")
        return format_html(
            '<a href="{}?user__id__exact={}">{}</a> · <a href="{}?user={}">{}</a>',
            changelist,
            obj.user_id,
            _("View works"),
            add_url,
            obj.user_id,
            _("Add work"),
        )


@admin.register(VerificationDocument)
class VerificationDocumentAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "business_document_type",
        "id_document_type",
        "is_verified",
    )
    list_filter = (
        "business_document_type",
        "id_document_type",
        "is_verified",
    )
    search_fields = ("user__username",)

    @admin.action(description="Approve selected documents")
    def approve_documents(self, request, queryset):
        queryset.update(is_verified=True)

    @admin.action(description="Reject selected documents")
    def reject_documents(self, request, queryset):
        queryset.update(is_verified=False)


@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ("user", "content", "created_at")
    search_fields = ("user__username", "content")


@admin.register(PortfolioAlbum)
class PortfolioAlbumAdmin(admin.ModelAdmin):
    list_display = ("title", "user", "style", "created_at")
    search_fields = ("title", "style", "user__username")
    list_filter = ("created_at",)
    autocomplete_fields = ("user",)


@admin.register(PortfolioWork)
class PortfolioWorkAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "title", "style", "body_placement", "created_at")
    search_fields = ("title", "style", "body_placement", "user__username")
    list_filter = ("style", "created_at")
    autocomplete_fields = ("user", "album")


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
