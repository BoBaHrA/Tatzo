from django.contrib import admin, messages
from django import forms
from django.core.exceptions import PermissionDenied, ValidationError
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
from .location_services import (
    approve_studio_claim, set_claim_review_state, suppress_location,
    restore_location, verify_claim_evidence,
)
from django.core.mail import send_mail
from django.conf import settings
from django.utils import timezone

from .models import (
    Location,
    LocationClaim,
    LocationRequest,
    LocationCorrectionRequest,
    LocationSuppression,
    PortfolioAlbum,
    PortfolioWork,
    Profile,
    UserReport,
    VerificationDocument,
)


class PortfolioWorkAdminForm(forms.ModelForm):
    class Meta:
        model = PortfolioWork
        fields = "__all__"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        user_id = self.data.get("user") if self.is_bound else self.instance.user_id
        albums = PortfolioAlbum.objects.none()
        if user_id:
            try:
                albums = PortfolioAlbum.objects.filter(user_id=int(user_id))
            except (TypeError, ValueError):
                pass
        self.fields["album"].queryset = albums

    def clean(self):
        cleaned = super().clean()
        user = cleaned.get("user")
        album = cleaned.get("album")
        if user and album and album.user_id != user.pk:
            self.add_error("album", _("Choose an album owned by the selected artist."))
        return cleaned


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
        required_permissions = (
            "users.add_profile",
            "auth.add_user",
            "users.add_location",
            "users.add_portfoliowork",
        )
        if not all(request.user.has_perm(permission) for permission in required_permissions):
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
    form = PortfolioWorkAdminForm

    def save_model(self, request, obj, form, change):
        if obj.album_id and obj.album.user_id != obj.user_id:
            raise ValidationError(_("A portfolio work and its album must belong to the same artist."))
        super().save_model(request, obj, form, change)


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
        "name", "city", "country", "source", "status",
        "studio_owner", "linked_user", "is_suppressed", "updated_at",
    )
    list_filter = ("source", "status", "is_suppressed", "city", "country")
    search_fields = ("name", "address", "formatted_address", "city",
                     "country", "source_place_id", "studio_owner__email")
    readonly_fields = (
        "created_at", "updated_at", "studio_owner", "status", "is_suppressed",
        "suppressed_at", "suppression_reason", "suppressed_by",
    )
    autocomplete_fields = ("linked_user",)
    ordering = ("name",)
    actions = ("hide_locations", "restore_locations")

    @admin.action(description=_("Hide obsolete locations (confirmation required)"))
    def hide_locations(self, request, queryset):
        if request.POST.get("confirm_hide") != "yes":
            return TemplateResponse(request, "admin/users/confirm_location_hide.html", {
                **self.admin_site.each_context(request),
                "title": _("Confirm hide selected locations"),
                "locations": queryset,
                "action_name": "hide_locations",
                "selected_ids": list(queryset.values_list("pk", flat=True)),
            })
        count = 0
        for location in queryset:
            try:
                suppress_location(location.pk, request.user, "Manually confirmed obsolete by administrator")
                self.log_change(request, location, "Suppressed from public maps")
                count += 1
            except (ValidationError, PermissionDenied) as exc:
                self.message_user(request, str(exc), level=messages.ERROR)
        self.message_user(request, _("%(count)s locations hidden") % {"count": count})

    @admin.action(description=_("Restore hidden locations"))
    def restore_locations(self, request, queryset):
        for location in queryset:
            try:
                restore_location(location.pk, request.user)
                self.log_change(request, location, "Restored to public maps")
            except (ValidationError, PermissionDenied) as exc:
                self.message_user(request, str(exc), level=messages.ERROR)


@admin.register(LocationClaim)
class LocationClaimAdmin(admin.ModelAdmin):
    list_display = (
        "location", "claimant_name", "contact_email",
        "email_verified_at", "evidence_verified_at",
        "claimant_user", "status", "reviewed_by", "created_at",
    )
    list_filter = ("status", "created_at", "email_verified_at", "evidence_verified_at")
    search_fields = ("location__name", "claimant_name", "contact_email",
                     "claimant_user__username", "relation_to_location")
    readonly_fields = (
        "proof_document_link", "status", "location", "claimant_name",
        "contact_email", "relation_to_location", "proof", "proof_document",
        "message", "claimant_user",
        "email_verified_at", "evidence_verified_at", "reviewed_by",
        "reviewed_at", "decision", "created_at", "updated_at",
    )
    autocomplete_fields = ("location",)
    ordering = ("-created_at",)
    actions = ("verify_evidence", "approve_and_link", "reject_claims", "request_more_information")

    def has_add_permission(self, request):
        return False

    @admin.display(boolean=True, description=_("Proof document"))
    def has_proof_document(self, obj):
        return bool(obj.proof_document)

    @admin.display(description=_("Proof document"))
    def proof_document_link(self, obj):
        if not obj.proof_document:
            return "—"
        url = reverse("protected_media", args=["location-claim", obj.pk, "file"])
        return format_html('<a href="{}" target="_blank" rel="noopener noreferrer">Open proof</a>', url)

    def _process(self, request, queryset, fn):
        completed = 0
        for claim in queryset:
            try:
                updated = fn(claim.pk, request.user)
                self.log_change(request, updated, updated.decision)
                completed += 1
                if updated.status in {"approved", "rejected", "needs_information"}:
                    notice = {
                        "approved": "Your Tatzo studio ownership claim was approved.",
                        "rejected": "Your Tatzo studio claim was rejected. Contact support for details.",
                        "needs_information": "Tatzo needs more evidence for your studio claim. Contact support.",
                    }[updated.status]
                    send_mail("Tatzo studio claim review", notice, settings.DEFAULT_FROM_EMAIL,
                              [updated.contact_email], fail_silently=False)
            except (ValidationError, PermissionDenied) as exc:
                self.message_user(request, str(exc), level=messages.ERROR)
            except Exception as exc:
                self.message_user(request, _("Email delivery failed: %(error)s") % {"error": str(exc)}, level=messages.ERROR)
        self.message_user(request, _("%(count)s claims processed") % {"count": completed})

    @admin.action(description=_("Verify email/evidence (email confirmation required)"))
    def verify_evidence(self, request, queryset):
        self._process(request, queryset, verify_claim_evidence)

    @admin.action(description=_("Approve ownership and link verified Tatzo account"))
    def approve_and_link(self, request, queryset):
        self._process(request, queryset, approve_studio_claim)

    @admin.action(description=_("Reject claims"))
    def reject_claims(self, request, queryset):
        self._process(request, queryset, lambda pk, staff: set_claim_review_state(pk, staff, "rejected"))

    @admin.action(description=_("Request more evidence"))
    def request_more_information(self, request, queryset):
        self._process(request, queryset, lambda pk, staff: set_claim_review_state(pk, staff, "needs_information"))


@admin.register(LocationCorrectionRequest)
class LocationCorrectionRequestAdmin(admin.ModelAdmin):
    list_display = ("location", "reason", "reporter_name", "contact_email",
                    "status", "reviewed_by", "created_at")
    list_filter = ("status", "reason", "created_at")
    search_fields = ("location__name", "reporter_name", "contact_email", "explanation")
    readonly_fields = ("location", "reporter_name", "contact_email", "reason",
                       "explanation", "new_address", "supporting_file",
                       "status", "reviewed_by", "reviewed_at", "created_at", "supporting_file_link")
    autocomplete_fields = ("location",)
    actions = ("approve_and_hide", "reject_reports", "request_more_information")

    def has_add_permission(self, request):
        return False

    @admin.display(description=_("Evidence file"))
    def supporting_file_link(self, obj):
        if not obj.supporting_file:
            return "—"
        url = reverse("protected_media", args=["location-correction", obj.pk, "file"])
        return format_html('<a href="{}" target="_blank" rel="noopener noreferrer">Open evidence</a>', url)

    @admin.action(description=_("Confirm obsolete listing and hide (requires confirmation)"))
    def approve_and_hide(self, request, queryset):
        if request.POST.get("confirm_hide") != "yes":
            return TemplateResponse(request, "admin/users/confirm_location_hide.html", {
                **self.admin_site.each_context(request),
                "title": _("Confirm hide listings for reviewed reports"),
                "locations": queryset, "action_name": "approve_and_hide",
                "selected_ids": list(queryset.values_list("pk", flat=True)),
            })
        for report in queryset.select_related("location"):
            if report.status == "approved":
                continue
            try:
                loc = suppress_location(
                    report.location_id, request.user,
                    f"Reviewed {report.get_reason_display()}: {report.pk}", correction=report,
                )
                self.log_change(request, report, "Approved: listing suppressed")
                send_mail("Tatzo location report processed",
                          "Thank you. Tatzo reviewed your report and removed the outdated listing.",
                          settings.DEFAULT_FROM_EMAIL, [report.contact_email],
                          fail_silently=False)
            except (ValidationError, PermissionDenied) as exc:
                self.message_user(request, str(exc), level=messages.ERROR)

    def _review(self, request, queryset, state):
        for report in queryset:
            if report.status == "approved":
                continue
            report.status = state
            report.reviewed_by = request.user
            report.reviewed_at = timezone.now()
            report.save(update_fields=["status", "reviewed_by", "reviewed_at"])
            self.log_change(request, report, f"Reviewed: {state}")
            send_mail("Tatzo location report review",
                      "Your report was reviewed. Status: " + state.replace("_", " "),
                      settings.DEFAULT_FROM_EMAIL, [report.contact_email], fail_silently=True)

    @admin.action(description=_("Reject correction reports"))
    def reject_reports(self, request, queryset):
        self._review(request, queryset, "rejected")

    @admin.action(description=_("Request more information on reports"))
    def request_more_information(self, request, queryset):
        self._review(request, queryset, "needs_information")


@admin.register(LocationSuppression)
class LocationSuppressionAdmin(admin.ModelAdmin):
    list_display = ("location", "source", "source_place_id", "created_at")
    search_fields = ("location__name", "source_place_id", "fingerprint")
    readonly_fields = ("location", "source", "source_place_id", "fingerprint", "created_at")

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


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
