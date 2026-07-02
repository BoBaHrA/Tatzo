from django.contrib import messages
from django.contrib.auth import views as auth_views
from django.utils.translation import gettext as _

from .security import check_rate_limit


class TatzoLoginView(auth_views.LoginView):
    def post(self, request, *args, **kwargs):
        username = (request.POST.get("username") or "").strip().lower()

        checks = [
            check_rate_limit(
                request,
                scope="auth:login:ip",
                limit=10,
                window_seconds=10 * 60,
                identity="ip",
            ),
            check_rate_limit(
                request,
                scope="auth:login:username",
                limit=8,
                window_seconds=30 * 60,
                value=username,
            ),
        ]

        if not all(ok for ok, _ in checks):
            messages.error(
                request,
                _("Too many login attempts. Please wait a bit and try again."),
            )

            form = self.get_form()

            return self.render_to_response(
                self.get_context_data(form=form),
                status=429,
            )

        return super().post(request, *args, **kwargs)


class TatzoPasswordResetView(auth_views.PasswordResetView):
    def post(self, request, *args, **kwargs):
        email = (request.POST.get("email") or "").strip().lower()

        checks = [
            check_rate_limit(
                request,
                scope="auth:password_reset:ip",
                limit=3,
                window_seconds=15 * 60,
                identity="ip",
            ),
            check_rate_limit(
                request,
                scope="auth:password_reset:email",
                limit=3,
                window_seconds=30 * 60,
                value=email,
            ),
        ]

        if not all(ok for ok, _ in checks):
            messages.error(
                request,
                _("Too many password reset requests. Please wait a bit and try again."),
            )

            form = self.get_form()

            return self.render_to_response(
                self.get_context_data(form=form),
                status=429,
            )

        return super().post(request, *args, **kwargs)