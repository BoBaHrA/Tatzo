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
    logger.error(
        "Tatzo email: preparing verification email for user=%s email=%s",
        user.username,
        user.email,
    )

    token = default_token_generator.make_token(user)
    uid = urlsafe_base64_encode(force_bytes(user.pk))

    verification_link = request.build_absolute_uri(
        reverse("verify_email", kwargs={"uidb64": uid, "token": token})
    )

    logger.error("Tatzo email: verification link created: %s", verification_link)

    context = {
        "user": user,
        "username": user.username,
        "verification_link": verification_link,
        "language_code": getattr(request, "LANGUAGE_CODE", "en"),
    }

    subject = str(_("Confirm your Tatzo account"))

    text_body = render_to_string("emails/verify_email.txt", context)
    html_body = render_to_string("emails/verify_email.html", context)

    try:
        email = EmailMultiAlternatives(
            subject=subject,
            body=text_body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[user.email],
        )
        email.attach_alternative(html_body, "text/html")

        logger.error("Tatzo email: sending verification email now...")
        result = email.send(fail_silently=False)
        
        if result != 1:
            raise RuntimeError(f"Verification email was not sent. send() result={result}")

        logger.error(
            "Tatzo email: verification email sent result=%s for user=%s email=%s",
            result,
            user.username,
            user.email,
        )

    except Exception:
        logger.exception(
            "Tatzo email: FAILED to send verification email for user=%s email=%s",
            user.username,
            user.email,
        )
        raise