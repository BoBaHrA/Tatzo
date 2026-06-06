from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from django.utils.translation import gettext as _

import logging

logger = logging.getLogger(__name__)


def send_verification_email(request, user):
    logger.error("Tatzo email: preparing verification email for user=%s email=%s", user.username, user.email)

    token = default_token_generator.make_token(user)
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    verification_link = request.build_absolute_uri(
        reverse("verify_email", kwargs={"uidb64": uid, "token": token})
    )

    logger.error("Tatzo email: verification link created: %s", verification_link)

    try:
        result = send_mail(
            _("Confirm your Tatzo account"),
            f"Hi {user.username},\n\nPlease confirm your email:\n{verification_link}",
            settings.DEFAULT_FROM_EMAIL,
            [user.email],
            fail_silently=False,
        )

        logger.error("Tatzo email: send_mail result=%s for user=%s", result, user.username)

    except Exception:
        logger.exception("Tatzo email: FAILED to send verification email for user=%s email=%s", user.username, user.email)
        raise