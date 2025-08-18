from django.core.mail import send_mail
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from django.contrib.auth.tokens import default_token_generator
from django.urls import reverse

def send_verification_email(request, user):
    token = default_token_generator.make_token(user)
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    verification_link = request.build_absolute_uri(
        reverse('verify_email', kwargs={'uidb64': uid, 'token': token})
    )

    send_mail(
        'Подтверждение почты для Tatzo',
        f'Привет, {user.username}!\n\nНажмите на ссылку для подтверждения почты:\n{verification_link}',
        'noreply@tatzo.com',  # позже укажешь почту
        [user.email],
        fail_silently=False,
    )
