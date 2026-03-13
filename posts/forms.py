from django import forms
from django.forms.widgets import ClearableFileInput

from .models import Post


class MultiFileInput(ClearableFileInput):
    allow_multiple_selected = True

# -------- Пост (текст) --------
class PostForm(forms.ModelForm):
    class Meta:
        model = Post
        fields = [
            "content",
            "location",
            "disable_comments",
            "is_ad",
            "visibility",
            "layout",
        ]


# -------- Медиа к посту (несколько файлов) --------
class PostMediaUploadForm(forms.Form):
    media = forms.FileField(
        required=False, widget=MultiFileInput(attrs={"multiple": True})
    )

    # простая валидация
    ALLOWED = {"image/jpeg", "image/png", "video/mp4", "video/webm"}
    MAX_MB = 50

    def clean(self):
        cleaned = super().clean()
        files = self.files.getlist("media") if hasattr(self, "files") else []

        for f in files:
            if f.content_type not in self.ALLOWED:
                raise forms.ValidationError(
                    f"Тип файла не поддерживается: {f.content_type}"
                )
            if f.size > self.MAX_MB * 1024 * 1024:
                raise forms.ValidationError(f"Файл {f.name} больше {self.MAX_MB}MB.")
        return cleaned
