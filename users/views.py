from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.contrib.auth import logout as auth_logout
from django.contrib.auth.models import User
from .models import Post
from .forms import PostForm, ProfileForm, VerificationForm # Если у вас есть форма для создания постов
from django.contrib import messages
from django.contrib.auth.decorators import user_passes_test
from django.contrib.auth import login
from .models import Profile, VerificationDocument
from .forms_custom import CustomUserCreationForm  # Импортируем из нового файла
import logging
from django.utils.http import urlsafe_base64_decode
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_str
from .utils import send_verification_email
from django.contrib.auth import authenticate, login


def login_view(request):
    if request.method == 'POST':
        username = request.POST.get('username')
        password = request.POST.get('password')

        user = authenticate(request, username=username, password=password)
        if user is not None:
            profile = Profile.objects.get(user=user)
            if not profile.is_email_verified:
                messages.error(request, 'Пожалуйста, подтвердите свою почту перед входом.')
                return redirect('login')  # Или просто вернём ту же страницу
            login(request, user)
            return redirect('home')
        else:
            messages.error(request, 'Неверные имя пользователя или пароль.')

    return render(request, 'users/login.html')

# Главная страница
def home(request):
    posts = Post.objects.all().order_by('-created_at')
    return render(request, 'home.html', {'posts': posts})

from django.contrib.auth import login

def verify_email(request, uidb64, token):
    try:
        uid = force_str(urlsafe_base64_decode(uidb64))
        user = User.objects.get(pk=uid)
    except (User.DoesNotExist, ValueError, TypeError):
        user = None

    if user and default_token_generator.check_token(user, token):
        profile = user.profile
        profile.is_email_verified = True
        profile.save()

        user.is_active = True
        user.save()

        login(request, user)

        if profile.account_type == "tattoo_artist":
            return redirect("verification_page")
        else:
            return redirect("home")
    else:
        messages.error(request, "Ссылка недействительна или устарела.")
        return redirect("login")


# Лента новостей
@login_required
def news_feed(request):
    """
    Отображение ленты новостей.
    """
    # Получаем все посты из базы данных
    posts = Post.objects.all().order_by('-id')  # Сортируем по убыванию (новые посты первыми)

    context = {
        'posts': posts,
        'current_user': request.user  # Передаем текущего пользователя
    }
    return render(request, 'feed.html', context)

# Создание нового поста
@login_required
def create_post(request):
    """
    Обработчик для создания нового поста.
    """
    if not request.user.is_authenticated:
        return redirect('login')  # или любой твой URL

    if request.method == 'POST':
        form = PostForm(request.POST)
        if form.is_valid():
            post = form.save(commit=False)
            post.user = request.user  # Указываем текущего пользователя как автора поста
            post.save()
            messages.success(request, 'Ваш пост был успешно создан!')
            return redirect('news_feed')  # Перенаправляем на ленту новостей
    else:
        form = PostForm()

    context = {
        'form': form
    }
    return render(request, 'create_post.html', context)

# Выход из системы
@login_required
def logout(request):
    """
    Обработчик для выхода из системы.
    """
    auth_logout(request)
    return redirect('home')

# Страница профиля
@login_required
def profile(request):
    """
    Отображение профиля пользователя.
    """
    context = {
        'user': request.user
    }
    return render(request, 'profile.html', context)

def profile_list(request):
    profiles = Profile.objects.all()  # Получаем все профили
    return render(request, 'users/profile_list.html', {'profiles': profiles})

@login_required
def edit_profile(request):
    profile = Profile.objects.get(user=request.user)

    if request.method == 'POST':
        form = ProfileForm(request.POST, request.FILES, instance=profile)
        if form.is_valid():
            form.save()
            messages.success(request, 'Your profile has been updated!')
            return redirect('profile')  # Замените на название маршрута для профиля, если требуется
    else:
        form = ProfileForm(instance=profile)

    return render(request, 'users/edit_profile.html', {'form': form})

@login_required
def user_profile(request):
    profile = get_object_or_404(Profile, user=request.user)
    return render(request, 'users/profile.html', {'profile': profile})

# Обработка удаления поста
@login_required
def delete_post(request, post_id):
    """
    Удаление поста.
    """
    post = get_object_or_404(Post, id=post_id)
    if post.user == request.user:  # Только автор поста может удалить его
        post.delete()
        messages.success(request, 'Ваш пост был удалён.')
    else:
        messages.error(request, 'Вы не можете удалить этот пост.')
    return redirect('news_feed')

logger = logging.getLogger(__name__)



def signup(request):
    show_verification_modal = False

    if request.method == "POST":
        user_form = CustomUserCreationForm(request.POST)
        if user_form.is_valid():
            user = user_form.save()
            send_verification_email(request, user)
            show_verification_modal = True  # Показываем сообщение "подтвердите почту"

            # 🔴 Не логиним! Ждём подтверждения

    else:
        user_form = CustomUserCreationForm()

    return render(request, "signup.html", {
        "form": user_form,
        "show_verification_modal": show_verification_modal
    })
    
def contests_page(request):
    return render(request, 'users/contests.html')

# Обработка редактирования поста
@login_required
def edit_post(request, post_id):
    """
    Редактирование поста.
    """
    post = get_object_or_404(Post, id=post_id)
    if post.user != request.user:
        messages.error(request, 'Вы не можете редактировать этот пост.')
        return redirect('news_feed')

    if request.method == 'POST':
        form = PostForm(request.POST, instance=post)
        if form.is_valid():
            form.save()
            messages.success(request, 'Ваш пост был успешно обновлен!')
            return redirect('news_feed')
    else:
        form = PostForm(instance=post)

    context = {
        'form': form,
        'post': post
    }
    return render(request, 'edit_post.html', context)

def admin_verification(request, profile_id):
    profile = get_object_or_404(Profile, id=profile_id)

    if request.method == 'POST':
        action = request.POST.get('action')
        if action == 'approve':
            profile.verification_status = 'approved'
            profile.save()
            messages.success(request, f"Profile {profile.user.username} has been approved.")
        elif action == 'reject':
            profile.verification_status = 'rejected'
            profile.save()
            messages.success(request, f"Profile {profile.user.username} has been rejected.")
        return redirect('profile_list')

    return render(request, 'users/admin_verification.html', {'profile': profile})

@login_required
def verification_page(request):
    if request.method == 'POST':
        form = VerificationForm(request.POST, request.FILES)
        if form.is_valid():
            verification_document = form.save(commit=False)
            verification_document.user = request.user
            verification_document.save()
            messages.success(request, "Ваши документы отправлены на проверку!")
            return redirect('home')  # После загрузки → на главную
        else:
            messages.error(request, "Ошибка при загрузке документов. Проверьте файлы.")

    else:
        form = VerificationForm()

    return render(request, 'users/verification_page.html', {'form': form})

# Проверка, является ли пользователь администратором
def is_admin(user):
    return user.is_staff

@user_passes_test(is_admin)
def review_verifications(request):
    documents = VerificationDocument.objects.filter(is_verified=False)  # Отображаем документы, которые еще не проверены
    return render(request, 'users/review_verifications.html', {'documents': documents})

@user_passes_test(is_admin)
def verify_document(request, document_id):
    document = get_object_or_404(VerificationDocument, id=document_id)
    if request.method == "POST":
        action = request.POST.get("action")
        if action == "approve":
            document.is_verified = True
        elif action == "reject":
            document.is_verified = False
        document.save()
        return JsonResponse({"success": True, "status": document.is_verified})
    return JsonResponse({"success": False, "error": "Invalid request"})

@user_passes_test(is_admin)
def pending_verifications(request):
    # Получаем список неподтвержденных документов
    pending_docs = VerificationDocument.objects.filter(is_verified=False)
    return render(request, 'users/pending_verifications.html', {'pending_docs': pending_docs})

@user_passes_test(is_admin)
def review_profile(request, profile_id):
    # Получаем профиль по ID или возвращаем 404
    profile = get_object_or_404(Profile, id=profile_id)

    if request.method == 'POST':
        action = request.POST.get('action')
        if action == 'approve':
            profile.verification_status = 'approved'
            profile.save()
            message = 'Profile approved successfully.'
        elif action == 'reject':
            profile.verification_status = 'rejected'
            profile.save()
            message = 'Profile rejected successfully.'
        else:
            message = 'Invalid action.'

        return render(request, 'users/review_profile.html', {'profile': profile, 'message': message})

    return render(request, 'users/review_profile.html', {'profile': profile})

@login_required
def upload_verification_documents(request):
    if request.method == 'POST':
        document_type = request.POST.get('document_type')
        document_file = request.FILES.get('document_file')
        identity_document = request.FILES.get('identity_document')

        # Сохраняем документ
        verification_document = VerificationDocument(
            user=request.user,
            document_type=document_type,
            document_file=document_file,
            identity_document=identity_document
        )
        verification_document.save()

        messages.success(request, "Your documents have been submitted for verification.")
        return redirect('home')  # Перенаправляем на главную страницу или другую, если нужно
    return render(request, 'users/upload_verification_documents.html')

@user_passes_test(is_admin)
def approve_profile(request, profile_id):
    # Получаем профиль по ID или возвращаем 404
    profile = get_object_or_404(Profile, id=profile_id)

    # Обновляем статус верификации профиля
    profile.verification_status = 'approved'
    profile.save()

    # Сообщение об успешном одобрении
    messages.success(request, f"Profile '{profile.user.username}' has been approved.")

    # Перенаправление обратно на список профилей или другую страницу
    return redirect('profile_list')  # Замените на ваш URL для списка профилей

@user_passes_test(is_admin)
def reject_profile(request, profile_id):
    # Получаем профиль по ID или возвращаем 404
    profile = get_object_or_404(Profile, id=profile_id)

    # Обновляем статус верификации профиля
    profile.verification_status = 'rejected'
    profile.save()

    # Сообщение об успешном отклонении
    messages.success(request, f"Profile '{profile.user.username}' has been rejected.")

    # Перенаправление обратно на список профилей или другую страницу
    return redirect('profile_list')  # Замените на ваш URL для списка профилей

@user_passes_test(is_admin)
def approve_profile(request, profile_id):
    profile = get_object_or_404(Profile, id=profile_id)
    profile.verification_status = 'approved'
    profile.save()
    messages.success(request, f"Profile '{profile.user.username}' has been approved.")
    return redirect('profile_list')

@user_passes_test(is_admin)
def reject_profile(request, profile_id):
    profile = get_object_or_404(Profile, id=profile_id)
    profile.verification_status = 'rejected'
    profile.save()
    messages.success(request, f"Profile '{profile.user.username}' has been rejected.")
    return redirect('profile_list')

