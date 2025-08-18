document.addEventListener('DOMContentLoaded', function () {
  const createPost = document.getElementById('create-post');
  const textarea = document.getElementById('post-textarea');
  const postBtn = document.getElementById('post-btn');
  const fileUpload = document.getElementById('file-upload');
  const previewContainer = document.getElementById('file-preview');
  const customFileTrigger = document.getElementById('custom-file-trigger');

  let selectedFiles = [];

  // Раскрытие пост-блока
  document.addEventListener('click', function (e) {
    const isInside = createPost.contains(e.target);
    const isPreviewItem = e.target.closest('#file-preview');
    const isDeleteBtn = e.target.closest('span');

    if (isInside || isPreviewItem || isDeleteBtn) {
      createPost.classList.add('expanded');
    } else {
      createPost.classList.remove('expanded');
    }
  });

  // 🔹 Обработка текста и авторасширение textarea
function autosizeTextarea() {
  // пусто?
  const isEmpty = textarea.value.trim().length === 0;
  const hasFiles = selectedFiles.length > 0;

  if (isEmpty && !hasFiles) {
    // снимаем inline-height, чтобы сработало CSS-центрирование
    textarea.style.removeProperty('height');
    createPost.classList.remove('expanded');   // можно сворачивать «пилюлю»
  } else {
    // автосайз
    textarea.style.height = 'auto';
    const h = Math.min(textarea.scrollHeight, 400); // не больше max-height из CSS
    textarea.style.height = h + 'px';
    createPost.classList.add('expanded');
  }

  updatePostButtonVisibility();
}

textarea.addEventListener('input', autosizeTextarea);
// чтобы вернуться в «пилюлю», когда фокус ушёл и поле пустое
textarea.addEventListener('blur', autosizeTextarea);

// сразу после получения элементов
createPost.classList.remove('expanded');
textarea.style.removeProperty('height');

// полезно один раз вызвать при загрузке
autosizeTextarea();
updatePostButtonVisibility();


  // Клик по кастомной иконке
  customFileTrigger.addEventListener('click', function () {
    fileUpload.click();
  });

  // Добавление файлов
  fileUpload.addEventListener('change', function () {
    const newFiles = Array.from(this.files);

    newFiles.forEach(newFile => {
      const exists = selectedFiles.some(
        file => file.name === newFile.name && file.size === newFile.size
      );
      if (!exists) selectedFiles.push(newFile);
    });

    updateFileInput();
    updatePreview();
    updatePostButtonVisibility();
  });

  function updateFileInput() {
    const dt = new DataTransfer();
    selectedFiles.forEach(file => dt.items.add(file));
    fileUpload.files = dt.files;
  }

  function updatePreview() {
    previewContainer.innerHTML = '';

    selectedFiles.forEach((file, index) => {
      const type = file.type;
      const wrapper = document.createElement('div');
      wrapper.style.position = 'relative';
      wrapper.style.display = 'inline-block';
      wrapper.style.marginRight = '10px';

      if (type.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.style.maxWidth = '380px';
        img.style.maxHeight = '450px';
        img.style.borderRadius = '10px';
        img.style.cursor = 'pointer';
        img.style.objectFit = 'cover';

        wrapper.appendChild(img);

        img.addEventListener('click', () => {
          const modal = document.createElement('div');
          modal.style.position = 'fixed';
          modal.style.top = 0;
          modal.style.left = 0;
          modal.style.width = '100vw';
          modal.style.height = '100vh';
          modal.style.background = 'rgba(0, 0, 0, 0.8)';
          modal.style.display = 'flex';
          modal.style.justifyContent = 'center';
          modal.style.alignItems = 'center';
          modal.style.zIndex = 9999;

          const fullImg = document.createElement('img');
          fullImg.src = img.src;
          fullImg.style.maxWidth = '90vw';
          fullImg.style.maxHeight = '90vh';
          fullImg.style.borderRadius = '10px';

          modal.appendChild(fullImg);
          modal.addEventListener('click', () => modal.remove());
          document.body.appendChild(modal);
        });
      }

      if (type.startsWith('video/')) {
        const video = document.createElement('video');
        video.src = URL.createObjectURL(file);
        video.controls = true;
        video.style.maxWidth = '380px';
        video.style.maxHeight = '550px';
        video.style.borderRadius = '10px';
        video.style.objectFit = 'cover';
        wrapper.appendChild(video);
      }

      const deleteBtn = document.createElement('span');
      deleteBtn.textContent = '✖';
      deleteBtn.style.position = 'absolute';
      deleteBtn.style.top = '2px';
      deleteBtn.style.right = '6px';
      deleteBtn.style.cursor = 'pointer';
      deleteBtn.style.background = '#000c';
      deleteBtn.style.color = '#fff';
      deleteBtn.style.borderRadius = '50%';
      deleteBtn.style.padding = '2px 6px';
      deleteBtn.style.fontSize = '14px';
      deleteBtn.title = 'Удалить файл';

      deleteBtn.addEventListener('click', () => {
        selectedFiles.splice(index, 1);
        updateFileInput();
        updatePreview();
        updatePostButtonVisibility();
      });

      wrapper.appendChild(deleteBtn);
      previewContainer.appendChild(wrapper);
    });

    updateFileInput();
    updatePostButtonVisibility();
  }

  function updatePostButtonVisibility() {
    const hasText = textarea.value.trim().length > 0;
    const hasFiles = selectedFiles.length > 0;
    if (hasText || hasFiles) {
      postBtn.classList.add('visible');
    } else {
      postBtn.classList.remove('visible');
    }
  }  
});