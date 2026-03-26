document.addEventListener('DOMContentLoaded', function () { 
  const createPost = document.getElementById('create-post'); 
  const textarea = document.getElementById('post-textarea'); 
  const postBtn = document.getElementById('post-btn'); 
  const fileUpload = document.getElementById('file-upload'); 
  const previewContainer = document.getElementById('file-preview'); 
  const customFileTrigger = document.getElementById('custom-file-trigger'); 
  const lightbox = document.getElementById('media-lightbox');
  const lbBody = document.getElementById('lb-body');
  const lbClose = document.getElementById('lb-close');
  const lbPrev = document.getElementById('lb-prev');
  const lbNext = document.getElementById('lb-next');
  const postModal = document.getElementById('post-modal');
  const postModalLeft = document.getElementById('post-modal-left');
  const modalCommentsList = document.getElementById('modal-comments-list');
  const modalCommentForm = document.getElementById('modal-comment-form');
  const modalCommentInput = document.getElementById('modal-comment-input');
  const postModalClose = document.getElementById('post-modal-close');
  const commentEditModal = document.getElementById('comment-edit-modal');
  const commentEditTextarea = document.getElementById('comment-edit-textarea');
  const commentEditSave = document.getElementById('comment-edit-save');
  const commentEditCancel = document.getElementById('comment-edit-cancel');
  const commentEditModalClose = document.getElementById('comment-edit-modal-close');
  const commentDeleteModal = document.getElementById('comment-delete-modal');
  const commentDeleteConfirm = document.getElementById('comment-delete-confirm');
  const commentDeleteCancel = document.getElementById('comment-delete-cancel');
  const commentDeleteModalClose = document.getElementById('comment-delete-modal-close');

  const commentReportModal = document.getElementById('comment-report-modal');
  const commentReportConfirm = document.getElementById('comment-report-confirm');
  const commentReportCancel = document.getElementById('comment-report-cancel');
  const commentReportModalClose = document.getElementById('comment-report-modal-close');
  const commentReportText = document.getElementById('comment-report-text');

  let editingCommentId = null;
  let editingCommentContentEl = null;
  let pendingDeleteCommentId = null;
  let pendingReportCommentId = null;

  let lbIndex = 0;
  let selectedFiles = []; 
  let previewMode = 'grid'; // 'grid' | 'carousel'
  let carouselIndex = 0;
  let carMain = null;
  let carThumbs = null;
  let carMainMedia = null;
  let lbItems = [];
  let lbMode = 'preview';
  let currentPostId = null;

  // ===== ObjectURL cache (чтобы не плодить URL.createObjectURL) =====
  const urlCache = new WeakMap();

  function getCookie(name) {
    const v = document.cookie.split('; ').find(row => row.startsWith(name + '='));
    return v ? decodeURIComponent(v.split('=')[1]) : '';
  }

  function openCommentEditModal(commentId, oldContent, contentEl) {
    if (!commentEditModal || !commentEditTextarea) return;

    editingCommentId = commentId;
    editingCommentContentEl = contentEl;

    commentEditTextarea.value = oldContent;
    commentEditModal.classList.add("open");
    document.body.style.overflow = "hidden";

    setTimeout(() => {
      commentEditTextarea.focus();
      commentEditTextarea.setSelectionRange(
        commentEditTextarea.value.length,
        commentEditTextarea.value.length
      );
    }, 10);
  }

  function closeCommentEditModal() {
    if (!commentEditModal) return;

    commentEditModal.classList.remove("open");
    document.body.style.overflow = "";

    editingCommentId = null;
    editingCommentContentEl = null;

    if (commentEditTextarea) {
      commentEditTextarea.value = "";
    }
  }

  if (commentEditCancel) {
    commentEditCancel.addEventListener("click", closeCommentEditModal);
  }

  if (commentEditModalClose) {
    commentEditModalClose.addEventListener("click", closeCommentEditModal);
  }

  if (commentEditModal) {
    commentEditModal.addEventListener("click", function (e) {
      if (e.target === commentEditModal) {
        closeCommentEditModal();
      }
    });
  }

  postBtn.addEventListener('click', async (e) => {
    e.preventDefault();

    const content = textarea.value.trim();
    if (!content && selectedFiles.length === 0) return;

    postBtn.disabled = true;
    postBtn.textContent = 'Posting...';

    const fd = new FormData();
    fd.append('content', content);
    fd.append('layout', previewMode);

    fd.append('disable_comments', document.getElementById('opt-disable-comments')?.checked ? '1' : '0');
    fd.append('is_ad', document.getElementById('opt-is-ad')?.checked ? '1' : '0');
    fd.append('visibility', document.getElementById('opt-visibility')?.value || 'public');
    fd.append('location', document.getElementById('opt-location')?.value || '');

    selectedFiles.forEach(f => fd.append('media', f));

    try {
      const res = await fetch('/posts/create/', {
        method: 'POST',
        headers: { 'X-CSRFToken': getCookie('csrftoken') },
        body: fd
      });

      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Ошибка создания поста');

      const feed = document.getElementById('feed');
      if (feed && data.html) {
        feed.insertAdjacentHTML('afterbegin', data.html);

        const firstPostRenderer = feed.querySelector('.post-media-renderer');
        if (firstPostRenderer) {
          renderSavedPostMedia(firstPostRenderer);
        }
      }

      // ✅ успех: очистка формы
      textarea.value = '';
      autosizeTextarea();

      // освобождаем objectURL если ты их кэшируешь
      selectedFiles.forEach(revokeObjectUrl);
      selectedFiles = [];
      syncFileInput();
      renderPreview();
      updatePostButtonVisibility();

      // сюда потом вставим “добавить пост в ленту”
      console.log('Created post id:', data.post_id);

    } catch (err) {
      alert(err.message);
    } finally {
      postBtn.disabled = false;
      postBtn.textContent = 'Post';
    }
  });

  function stopAndResetVideo(root){
    if (!root) return;
    const v = root.querySelector('video');
    if (!v) return;
    try{
      v.pause();
      v.currentTime = 0; // если хочешь сохранять позицию — убери эту строку
    }catch(_){}
  }

  function getObjectUrl(file){
    if (!file) return '';
    let u = urlCache.get(file);
    if (!u){
      u = URL.createObjectURL(file);
      urlCache.set(file, u);
    }
    return u;
  }

  function revokeObjectUrl(file){
    const u = urlCache.get(file);
    if (u){
      URL.revokeObjectURL(u);
      urlCache.delete(file);
    }
  }

  function attachInlineVideoControls(videoEl, mainEl){
    // убрать старые оверлеи, если были (иначе будет много кнопок)
    mainEl.querySelectorAll('.car-play').forEach(x => x.remove());

    const overlay = document.createElement('div');
    overlay.className = 'car-play';
    overlay.innerHTML = `<div class="btn">▶</div>`;
    const btn = overlay.querySelector('.btn');

    const setBtn = () => { btn.textContent = videoEl.paused ? '▶' : '⏸'; };

    // play/pause по кнопке
    overlay.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    videoEl.addEventListener('play', () => { mainEl.classList.add('playing'); setBtn(); });
    videoEl.addEventListener('pause', () => { mainEl.classList.remove('playing'); setBtn(); });
    videoEl.addEventListener('ended', () => { mainEl.classList.remove('playing'); setBtn(); });

    setBtn();
    mainEl.appendChild(overlay);
  }

  function setCarouselIndex(nextIndex){
    if (!selectedFiles.length) return;

    const prev = carouselIndex;
    carouselIndex = Math.max(0, Math.min(nextIndex, selectedFiles.length - 1));

    // если карусель ещё не отрисована — просто перерисуем
    if (!carMain || !carThumbs) { renderPreview(); return; }

    // обновляем active на миниатюрах
    const prevEl = carThumbs.querySelector(`.thumb[data-i="${prev}"]`);
    const nextEl = carThumbs.querySelector(`.thumb[data-i="${carouselIndex}"]`);
    if (prevEl) prevEl.classList.remove('active');
    if (nextEl) nextEl.classList.add('active');

    // стопаем текущее видео до смены
    stopAndResetVideo(carMain); 

    // плавная смена main (без пересборки всей карусели)
    updateCarouselMain(true);
  }

  function updateCarouselMain(withFade = false){
    if (!carMain) return;

    const file = selectedFiles[carouselIndex];
    if (!file) return;

    const url = getObjectUrl(file);

    // фон-blur: только если это картинка, иначе можно оставить тёмный
    if (file.type.startsWith('image/')){
      carMain.style.setProperty('--bg', `url("${url}")`);
    } else {
      carMain.style.setProperty('--bg', 'none');
    }

    const swap = () => {
      // убираем старый media
      if (carMainMedia) carMainMedia.remove();

      // создаём новый
      let node;
      if (file.type.startsWith('image/')) {
        node = document.createElement('img');
        node.src = url;
        node.alt = file.name || 'preview';
        node.style.objectFit = 'contain';
      } else if (file.type.startsWith('video/')) {
        node = document.createElement('video');
        node.src = url;

        node.controls = true;        // ✅ нативные убираем
        node.playsInline = true;
        node.preload = 'metadata';
        node.style.objectFit = 'contain';

        // важное: без autoplay
        node.autoplay = false;

        // после вставки в DOM повесим overlay
        // (ниже, после insertBefore)
      } else {
        node = document.createElement('div');
        node.style.padding = '18px';
        node.style.color = '#cde';
        node.textContent = file.name;
      }

      carMainMedia = node;
      carMain.classList.remove('playing');
      carMain.querySelectorAll('.car-play').forEach(x => x.remove());
      carMain.insertBefore(node, carMain.firstChild); // чтобы крестик/стрелки оставались
      if (file.type.startsWith('video/')) {
      }
      if (withFade) {
        carMain.classList.remove('fade-out');
        carMain.classList.add('fade-in');
        setTimeout(() => carMain.classList.remove('fade-in'), 160);
      }
    };

    if (!withFade) return swap();

    carMain.classList.remove('fade-in');
    carMain.classList.add('fade-out');
    setTimeout(swap, 120);
  }

  function openLightbox(index, items = null, mode = 'preview'){
    if (mode === 'saved') {
      if (!items || !items.length) return;
      lbItems = items;
      lbMode = 'saved';
      lbIndex = Math.max(0, Math.min(index, lbItems.length - 1));
    } else {
      if (!selectedFiles.length) return;
      lbItems = selectedFiles.map(file => ({
        type: file.type.startsWith('image/') ? 'image' :
              file.type.startsWith('video/') ? 'video' : 'file',
        file
      }));
      lbMode = 'preview';
      lbIndex = Math.max(0, Math.min(index, lbItems.length - 1));
    }

    stopAndResetVideo(carMain);
    renderLightboxItem();
    lightbox.classList.add('open');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox(){
    lightbox.classList.remove('open');
    lightbox.setAttribute('aria-hidden', 'true');
    lbBody.innerHTML = '';
    lbBody.style.removeProperty('--lb-bg');
    document.body.style.overflow = '';
  }

  function renderLightboxItem(){
  lbBody.innerHTML = '';

  const item = lbItems[lbIndex];
  if (!item) return;

  if (lbMode === 'saved') {
    lbBody.style.setProperty('--lb-bg', `url("${item.url}")`);

    if (item.type === 'image') {
      const img = document.createElement('img');
      img.src = item.url;
      img.alt = 'preview';
      lbBody.appendChild(img);
    } else if (item.type === 'video') {
      const video = document.createElement('video');
      video.src = item.url;
      video.controls = true;
      video.autoplay = false;
      video.playsInline = true;
      video.preload = 'metadata';
      lbBody.appendChild(video);
    }
  } else {
    const file = item.file;
    const url = getObjectUrl(file);

    lbBody.style.setProperty('--lb-bg', `url("${url}")`);

    if (item.type === 'image') {
      const img = document.createElement('img');
      img.src = url;
      img.alt = file.name || 'preview';
      lbBody.appendChild(img);
    } else if (item.type === 'video') {
      const video = document.createElement('video');
      video.src = url;
      video.controls = true;
      video.autoplay = false;
      video.playsInline = true;
      video.preload = 'metadata';
      lbBody.appendChild(video);
    } else {
      const box = document.createElement('div');
      box.style.padding = '18px';
      box.style.color = '#cde';
      box.textContent = file.name;
      lbBody.appendChild(box);
    }
  }

  const multi = lbItems.length > 1;
  lbPrev.style.display = multi ? 'flex' : 'none';
  lbNext.style.display = multi ? 'flex' : 'none';
}

function lbGo(delta){
  if (!lbItems.length) return;
  lbIndex = (lbIndex + delta + lbItems.length) % lbItems.length;
  renderLightboxItem();
}

// клики по стрелкам / кресту
lbClose.addEventListener('click', closeLightbox);
lbPrev.addEventListener('click', () => lbGo(-1));
lbNext.addEventListener('click', () => lbGo(1));

// клик по фону закрывает (но не по окну)
lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) closeLightbox();
});

// клавиши
document.addEventListener('keydown', (e) => {
  const isLbOpen = lightbox.classList.contains('open');

  // 1) Если открыт lightbox — клавиши относятся к нему в приоритете
  if (isLbOpen) {
    if (e.key === 'Escape') { closeLightbox(); return; }
    if (e.key === 'ArrowLeft') { lbGo(-1); return; }
    if (e.key === 'ArrowRight') { lbGo(1); return; }
    return;
  }

  // 2) Если lightbox закрыт — стрелки листают карусель только в carousel режиме
  if (previewMode !== 'carousel') return;
  if (!selectedFiles.length) return;

  if (e.key === 'ArrowLeft') setCarouselIndex((carouselIndex - 1 + selectedFiles.length) % selectedFiles.length);
  if (e.key === 'ArrowRight') setCarouselIndex((carouselIndex + 1) % selectedFiles.length);
});

  const previewToolbar = document.getElementById('preview-toolbar'); 
  // Переключение режима предпросмотра  
  if (previewToolbar) { 
    previewToolbar.addEventListener('click', (e) => { 
      const btn = e.target.closest('.mode-btn'); 
      if (!btn) return; 
      previewMode = btn.dataset.mode; // 'grid' | 'carousel'
      // переключаем активную кнопку 
      previewToolbar.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b === btn)); 
      // перерисовываем 
      renderPreview(); 
    }); 
  } 

  // Раскрытие пост-блока 
  document.addEventListener('click', function (e) {
    const isInside = createPost ? createPost.contains(e.target) : false;
    const isPreviewItem = e.target.closest('#file-preview');
    const isDeleteBtn = e.target.closest('.preview-remove');

    if (createPost && (isInside || isPreviewItem || isDeleteBtn)) {
      createPost.classList.add('expanded');
    } else if (createPost) {
      createPost.classList.remove('expanded');
    }
  });

  // Обработка текста и авторасширение textarea 
  function autosizeTextarea() { 
    const isEmpty = textarea.value.trim().length === 0; 
    const hasFiles = selectedFiles.length > 0; 
    if (isEmpty && !hasFiles) { 
      textarea.style.removeProperty('height'); 
      createPost.classList.remove('expanded'); 
    } else { 
      textarea.style.height = 'auto'; 
      const h = Math.min(textarea.scrollHeight, 400); 
      textarea.style.height = h + 'px'; 
      createPost.classList.add('expanded'); 
    } 
    updatePostButtonVisibility(); 
  }

  textarea.addEventListener('input', autosizeTextarea); 
  textarea.addEventListener('blur', autosizeTextarea); 

  createPost.classList.remove('expanded'); 
  textarea.style.removeProperty('height'); 
  autosizeTextarea(); 
  updatePostButtonVisibility(); 

  // Клик по кастомной иконке 
  customFileTrigger.addEventListener('click', function () { 
    fileUpload.click(); 
  }); 

  // Добавление файлов 
  fileUpload.addEventListener('change', function () { 
    const MAX_FILES = 12;
    const newFiles = Array.from(this.files);

    newFiles.forEach(newFile => {
      if (selectedFiles.length >= MAX_FILES) return;

      const exists = selectedFiles.some(
        file => file.name === newFile.name && file.size === newFile.size
      );
      if (!exists) selectedFiles.push(newFile);
    });
 
    syncFileInput(); 
    renderPreview(); 
    updatePostButtonVisibility(); 
  }); 

  function updateFileInput() { // не используется, оставил на случай
    const dt = new DataTransfer(); 
    selectedFiles.forEach(file => dt.items.add(file)); 
    fileUpload.files = dt.files; 
  } 

  function renderPreview() { 
    if (selectedFiles.length > 0) {
      previewToolbar.style.display = 'flex'; 
    } else {
      previewToolbar.style.display = 'none'; 
    }
    previewContainer.setAttribute('data-mode', previewMode); 

    carouselIndex = Math.max(0, Math.min(carouselIndex, selectedFiles.length - 1));


    if (previewMode === 'carousel') { 
      renderCarousel(); 
    } else { 
      renderGrid(); 
    } 
  } 

  function renderGrid() {
  previewContainer.innerHTML = '';

  const total = selectedFiles.length;

  const countForCss = Math.min(total, 10);
  previewContainer.setAttribute('data-count', String(countForCss));

  // очистим ВСЕ лэйаут-классы, включая lstrip
  previewContainer.classList.remove(
    'l1','l2','l3','l4','l5','l6','l7','l8','l9','l10','lstrip'
  );

  if (total === 0) return;

  // ---- 7 и 10..12: 2 сверху + лента снизу ----
  if (total === 7 || total >= 10) {
    previewContainer.classList.add('lstrip');

    const top = document.createElement('div');
    top.className = 'preview-top';

    const bottom = document.createElement('div');
    bottom.className = 'preview-bottom';

    selectedFiles.forEach((file, i) => {
      const item = createPreviewItem(file, i, i < 2 ? 'top' : 'bottom');
      if (i < 2) top.appendChild(item);
      else bottom.appendChild(item);
    });

    previewContainer.appendChild(top);
    previewContainer.appendChild(bottom);
    const bottomCount = Math.max(1, total - 2);
    previewContainer.style.setProperty('--bottom-count', bottomCount);
    return;
  }

  // ---- 1..9 (кроме 7) ----
  previewContainer.classList.add('l' + total);

  selectedFiles.forEach((file, i) => {
    previewContainer.appendChild(createPreviewItem(file, i));
  });
}

function formatCount(num) {
  num = Number(num);

  if (num < 1000) return num;

  if (num < 1000000) {
    const value = num / 1000;
    return Number.isInteger(value)
      ? `${value}K`
      : `${value.toFixed(1)}K`;
  }

  const value = num / 1000000;
  return Number.isInteger(value)
    ? `${value}M`
    : `${value.toFixed(1)}M`;
}

function animateCountChange(countEl, newValue) {
  if (!countEl) return;

  const formatted = formatCount(newValue);
  const currentNode = countEl.querySelector(".count-value");
  const oldText = currentNode ? currentNode.textContent : null;

  // если анимация уже шла или это первый рендер
  if (!oldText) {
    countEl.innerHTML = `<span class="count-value">${formatted}</span>`;
    countEl.title = String(newValue);
    return;
  }

  if (oldText === formatted) {
    countEl.innerHTML = `<span class="count-value">${formatted}</span>`;
    countEl.title = String(newValue);
    return;
  }

  // сбрасываем контейнер и строим анимацию заново
  countEl.innerHTML = "";

  const oldNode = document.createElement("span");
  oldNode.className = "count-value count-out-up";
  oldNode.textContent = oldText;

  const newNode = document.createElement("span");
  newNode.className = "count-value count-in-up";
  newNode.textContent = formatted;

  countEl.appendChild(oldNode);
  countEl.appendChild(newNode);
  countEl.title = String(newValue);

  clearTimeout(countEl._countTimer);
  countEl._countTimer = setTimeout(() => {
    countEl.innerHTML = `<span class="count-value">${formatted}</span>`;
  }, 220);
}

// helper: создаёт одну плитку + крестик удаления
function createPreviewItem(file, index, placement = 'grid') {
  const wrapper = document.createElement('div');
  wrapper.className = 'preview-item';

  wrapper.dataset.index = String(index);

  // Открыть просмотр по клику на плитку (но НЕ по крестику удаления)
  wrapper.addEventListener('click', (ev) => {
    if (ev.target.closest('.preview-remove')) return;
    if (ev.target.closest('video')) return;
    openLightbox(index);
  });
  
  if (file.type.startsWith('image/')) {
    const img = document.createElement('img');
    img.src = getObjectUrl(file);
    wrapper.appendChild(img);

  } else if (file.type.startsWith('video/')) {
    const video = document.createElement('video');
    video.src = getObjectUrl(file);

    // controls только для "верхних" или обычной сетки
    video.controls = (placement !== 'bottom');

    // чтобы превью быстрее грузилось
    video.preload = 'metadata';
    video.playsInline = true;

    wrapper.appendChild(video);

  } else {
    const p = document.createElement('div');
    p.style.padding = '12px';
    p.style.color = '#cde';
    p.textContent = file.name;
    wrapper.appendChild(p);
  }

  const del = document.createElement('div');
  del.className = 'preview-remove';
  del.textContent = '✖';
  del.title = 'Удалить файл';
  del.addEventListener('click', (ev) => {
    ev.stopPropagation();
    selectedFiles.splice(index, 1);
    syncFileInput();
    renderPreview();
    updatePostButtonVisibility();
  });

  wrapper.appendChild(del);
  return wrapper;
}

function renderCarousel() {
  previewContainer.innerHTML = '';
  previewContainer.removeAttribute('data-count');

  const total = selectedFiles.length;
  if (total === 0) return;

  // ===== MAIN =====
  const main = document.createElement('div');
  main.className = 'carousel-main';

  // Сохраняем ссылку сразу (важно!)
  carMain = main;

  // Создаём initial media (чтобы что-то было до updateCarouselMain)
  const file = selectedFiles[carouselIndex];
  const url = getObjectUrl(file);

  let initialNode;
  if (file.type.startsWith('image/')) {
    initialNode = document.createElement('img');
    initialNode.src = url;
    initialNode.alt = file.name || 'preview';
  } else if (file.type.startsWith('video/')) {
    initialNode = document.createElement('video');
    initialNode.src = url;
    initialNode.controls = true;
    initialNode.autoplay = false;
    initialNode.playsInline = true;
    initialNode.preload = 'metadata';
  } else {
    initialNode = document.createElement('div');
    initialNode.style.padding = '18px';
    initialNode.style.color = '#cde';
    initialNode.textContent = file.name;
  }
  main.appendChild(initialNode);
  if (file.type.startsWith('video/')) {
  }
  carMainMedia = initialNode;

  // удалить активный
  const delMain = document.createElement('div');
  delMain.className = 'preview-remove';
  delMain.textContent = '✖';
  delMain.title = 'Удалить файл';
  delMain.addEventListener('click', (ev) => {
    ev.stopPropagation();

    const removed = selectedFiles[carouselIndex];
    revokeObjectUrl(removed);

    selectedFiles.splice(carouselIndex, 1);
    if (carouselIndex >= selectedFiles.length) carouselIndex = selectedFiles.length - 1;

    syncFileInput();
    renderPreview();
    updatePostButtonVisibility();
  });
  main.appendChild(delMain);

    // открыть lightbox отдельной кнопкой (без конфликтов с видео)
  const fullBtn = document.createElement('div');
  fullBtn.className = 'car-full';
  fullBtn.textContent = '⤢';
  fullBtn.title = 'Открыть предпросмотр';
  fullBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    openLightbox(carouselIndex);
  });
  main.appendChild(fullBtn);

  // стрелки
  if (total > 1) {
    const prev = document.createElement('div');
    prev.className = 'car-nav car-prev';
    prev.textContent = '‹';
    prev.addEventListener('click', (ev) => {
      ev.stopPropagation();
      setCarouselIndex((carouselIndex - 1 + total) % total);
    });

    const next = document.createElement('div'); // ✅ ВОТ ЭТОГО НЕ ХВАТАЛО
    next.className = 'car-nav car-next';
    next.textContent = '›';
    next.addEventListener('click', (ev) => {
      ev.stopPropagation();
      setCarouselIndex((carouselIndex + 1) % total);
    });

    main.appendChild(prev);
    main.appendChild(next);
  }

  // клик по главному — открыть lightbox
  //main.addEventListener('click', (ev) => {
    //ev.stopPropagation();

    // если кликнули по видео или play-кнопке — не открываем lightbox
    //if (ev.target.closest('.car-play') || ev.target.closest('video')) return;
    // если кликнули по видео в карусели — остановим его, чтобы не играло параллельно
    //const v = main.querySelector('video');
    //if (v) {
      //v.pause();
      //v.currentTime = v.currentTime; // просто фикс (можно и не ставить)
    //}

    //openLightbox(carouselIndex);
  //});

  // ===== THUMBS =====
  const thumbs = document.createElement('div');
  thumbs.className = 'carousel-thumbs';

  selectedFiles.forEach((f, i) => {
    const t = document.createElement('div');
    t.className = 'thumb' + (i === carouselIndex ? ' active' : '');
    t.dataset.i = String(i);

    const tUrl = getObjectUrl(f);

    if (f.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = tUrl;
      t.appendChild(img);
    } else if (f.type.startsWith('video/')) {
      const video = document.createElement('video');
      video.src = tUrl;
      video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';
      t.appendChild(video);
    } else {
      const box = document.createElement('div');
      box.style.padding = '8px';
      box.style.color = '#cde';
      box.style.fontSize = '12px';
      box.textContent = f.name;
      t.appendChild(box);
    }

    t.addEventListener('click', (ev) => {
      ev.stopPropagation();
      setCarouselIndex(i);
    });

    thumbs.appendChild(t);
  });

  previewContainer.appendChild(main);
  previewContainer.appendChild(thumbs);

  // сохраняем ссылки (важно)
  carThumbs = thumbs;

  // выставляем blur-фон по текущему файлу
  updateCarouselMain(false);
}

  // helper: синхронизация input.files 
  function syncFileInput() { 
    const dt = new DataTransfer(); 
    selectedFiles.forEach(file => dt.items.add(file)); 
    fileUpload.files = dt.files; 
  } 

  function renderSavedPostMedia(container) {
    const layout = container.dataset.layout;
    const items = Array.from(container.querySelectorAll('.media-source')).map(el => ({
      type: el.dataset.type,
      url: el.dataset.url
    }));

    // сохраняем для будущей реинициализации, например в модалке
    container.dataset.items = JSON.stringify(items);

    container.innerHTML = '';
    container.classList.add('media-layout');

    if (layout === 'carousel') {
      renderSavedCarousel(container, items);
    } else {
      renderSavedGrid(container, items);
    }
  }

  function rehydrateSavedPostMedia(container) {
    const layout = container.dataset.layout || 'grid';
    const raw = container.dataset.items;

    if (!raw) return;

    let items = [];
    try {
      items = JSON.parse(raw);
    } catch (err) {
      console.error("Failed to parse media items:", err);
      return;
    }

    container.innerHTML = '';
    container.classList.add('media-layout');

    if (layout === 'carousel') {
      renderSavedCarousel(container, items);
    } else {
      renderSavedGrid(container, items);
    }
  }

  function renderSavedGrid(container, items) {
    const total = items.length;
    if (!total) return;

    const countForCss = Math.min(total, 10);
    container.setAttribute('data-mode', 'grid');
    container.setAttribute('data-count', String(countForCss));

    container.classList.remove(
      'l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8', 'l9', 'l10', 'lstrip'
    );

    if (total === 7 || total >= 10) {
      container.classList.add('lstrip');

      const top = document.createElement('div');
      top.className = 'preview-top';

      const bottom = document.createElement('div');
      bottom.className = 'preview-bottom';

      items.forEach((item, i) => {
        const node = createSavedPreviewItem(item, i, i < 2 ? 'top' : 'bottom', items);
        if (i < 2) top.appendChild(node);
        else bottom.appendChild(node);
      });

      container.appendChild(top);
      container.appendChild(bottom);

      const bottomCount = Math.max(1, total - 2);
      container.style.setProperty('--bottom-count', bottomCount);
      return;
    }

    container.classList.add('l' + total);

    items.forEach((item, i) => {
      container.appendChild(createSavedPreviewItem(item, i, 'grid', items));
    });
  }

  function renderSavedCarousel(container, items) {
    const total = items.length;
    if (!total) return;

    container.setAttribute('data-mode', 'carousel');
    container.classList.add('saved-carousel');

    let currentIndex = 0;

    const main = document.createElement('div');
    main.className = 'carousel-main';

    main.addEventListener('click', (e) => {
      if (e.target.closest('.car-nav')) return;
      if (e.target.closest('video')) return;
      openLightbox(currentIndex, items, 'saved');
    });

    const thumbs = document.createElement('div');
    thumbs.className = 'carousel-thumbs';

    let currentMedia = null;

    function stopAndResetSavedVideo(root) {
      if (!root) return;
      const v = root.querySelector('video');
      if (!v) return;
      try {
        v.pause();
        v.currentTime = 0;
      } catch (_) {}
    }

    function renderMain(index, withFade = false) {
      const item = items[index];
      if (!item) return;

      const swap = () => {
        if (currentMedia) currentMedia.remove();

        let node;
        if (item.type === 'image') {
          node = document.createElement('img');
          node.src = item.url;
          node.alt = 'media';
        } else if (item.type === 'video') {
          node = document.createElement('video');
          node.src = item.url;
          node.controls = true;
          node.playsInline = true;
          node.preload = 'metadata';
        }

        currentMedia = node;
        main.insertBefore(node, main.firstChild);

        main.classList.remove('fade-out');
        if (withFade) {
          main.classList.add('fade-in');
          setTimeout(() => main.classList.remove('fade-in'), 160);
        }
      };

      stopAndResetSavedVideo(main);

      if (!withFade) {
        swap();
        return;
      }

      main.classList.remove('fade-in');
      main.classList.add('fade-out');
      setTimeout(swap, 120);
    }

    function setIndex(nextIndex) {
      const prev = currentIndex;
      currentIndex = Math.max(0, Math.min(nextIndex, items.length - 1));

      const prevEl = thumbs.querySelector(`.thumb[data-i="${prev}"]`);
      const nextEl = thumbs.querySelector(`.thumb[data-i="${currentIndex}"]`);

      if (prevEl) prevEl.classList.remove('active');
      if (nextEl) nextEl.classList.add('active');

      renderMain(currentIndex, true);
    }

    const prev = document.createElement('div');
    prev.className = 'car-nav car-prev';
    prev.textContent = '‹';
    prev.addEventListener('click', (e) => {
      e.stopPropagation();
      setIndex((currentIndex - 1 + items.length) % items.length);
    });

    const next = document.createElement('div');
    next.className = 'car-nav car-next';
    next.textContent = '›';
    next.addEventListener('click', (e) => {
      e.stopPropagation();
      setIndex((currentIndex + 1) % items.length);
    });

    if (items.length > 1) {
      main.appendChild(prev);
      main.appendChild(next);
    }

    items.forEach((item, i) => {
      const t = document.createElement('div');
      t.className = 'thumb' + (i === 0 ? ' active' : '');
      t.dataset.i = String(i);

      if (item.type === 'image') {
        const img = document.createElement('img');
        img.src = item.url;
        t.appendChild(img);
      } else if (item.type === 'video') {
        const video = document.createElement('video');
        video.src = item.url;
        video.muted = true;
        video.playsInline = true;
        video.preload = 'metadata';
        t.appendChild(video);
      }

      t.addEventListener('click', (e) => {
        e.stopPropagation();
        setIndex(i);
      });

      thumbs.appendChild(t);
    });

    container.appendChild(main);
    container.appendChild(thumbs);

    renderMain(0, false);
  }

  function createSavedPreviewItem(item, index, placement = 'grid', allItems = []) {
    const wrapper = document.createElement('div');
    wrapper.className = 'preview-item';
    wrapper.dataset.index = String(index);

    wrapper.addEventListener('click', (ev) => {
      if (ev.target.closest('video')) return;
      openLightbox(index, allItems, 'saved');
    });

    if (item.type === 'image') {
      const img = document.createElement('img');
      img.src = item.url;
      wrapper.appendChild(img);
    } else if (item.type === 'video') {
      const video = document.createElement('video');
      video.src = item.url;
      video.controls = (placement !== 'bottom');
      video.preload = 'metadata';
      video.playsInline = true;
      wrapper.appendChild(video);
    }

    return wrapper;
  }
  
  document.querySelectorAll('.post-media-renderer').forEach(container => {
    renderSavedPostMedia(container);
  });

  function updatePostButtonVisibility() { 
    const hasText = textarea.value.trim().length > 0; 
    const hasFiles = selectedFiles.length > 0; 
    if (hasText || hasFiles) { 
      postBtn.classList.add('visible'); 
    } else { 
      postBtn.classList.remove('visible'); 
    } 
  } 


  document.addEventListener("click", async function (e) {
    const likeBtn = e.target.closest(".like-btn");
    if (likeBtn) {
      e.preventDefault();

      if (likeBtn.dataset.busy === "1") return;
      likeBtn.dataset.busy = "1";

      const postId = likeBtn.dataset.post;

      try {
        const res = await fetch(`/posts/${postId}/like/`, {
          method: "POST",
          headers: {
            "X-CSRFToken": getCookie("csrftoken"),
            "X-Requested-With": "XMLHttpRequest",
          },
        });

        const data = await res.json();
        if (!data.ok) return;

        likeBtn.classList.toggle("liked", data.liked);

        const iconEl = likeBtn.querySelector(".like-icon");
        if (iconEl) {
          iconEl.src = data.liked
            ? "/static/icons/liked.svg"
            : "/static/icons/heart-circle-svgrepo-com.svg";
        }

        const postActionsLeft = likeBtn.closest(".post-actions-left");
        const countEl = postActionsLeft?.querySelector(".like-count");
        if (countEl) {
          animateCountChange(countEl, data.likes_count);
        }
      } catch (err) {
        console.error("Like toggle error:", err);
      } finally {
        delete likeBtn.dataset.busy;
      }

      return;
    }

    const bookmarkBtn = e.target.closest(".bookmark-btn");
    if (bookmarkBtn) {
      e.preventDefault();
      bookmarkBtn.classList.toggle("bookmarked");
    }
  });

  document.addEventListener("click", async function (e) {
    const commentBtn = e.target.closest(".comment-btn");
    if (!commentBtn) return;

    e.preventDefault();

    const postId = commentBtn.dataset.post;
    const postEl = commentBtn.closest(".post");

    if (!postId || !postEl || !postModal || !postModalLeft || !modalCommentsList) {
      console.warn("Comment modal: missing required element");
      return;
    }

    currentPostId = postId;

    const clonedPost = postEl.cloneNode(true);

    // Убираем действия из клона, чтобы слева был только сам пост
    const clonedActions = clonedPost.querySelector(".post-actions");
    if (clonedActions) {
      clonedActions.remove();
    }

    postModalLeft.innerHTML = "";
    postModalLeft.appendChild(clonedPost);

    postModalLeft.querySelectorAll(".post-media-renderer").forEach(container => {
      rehydrateSavedPostMedia(container);
    });

    // Перерисовываем медиа внутри клона

    try {
      const res = await fetch(`/posts/${postId}/comments/`, {
        headers: {
          "X-Requested-With": "XMLHttpRequest",
        },
      });

      const data = await res.json();
      modalCommentsList.innerHTML = data.html || "";
      modalCommentsList.querySelectorAll(".like-count").forEach(el => {
        const valueNode = el.querySelector(".count-value");
        if (!valueNode) return;

        const original = valueNode.textContent.trim();
        valueNode.textContent = formatCount(original);
        el.title = original;
      });

      console.log("Opening modal for post:", postId);

      postModal.classList.add("open");
      document.body.style.overflow = "hidden";
    } catch (err) {
      console.error("Open comments modal error:", err);
    }
  });

  if (postModalClose) {
    postModalClose.addEventListener("click", function () {
      postModal.classList.remove("open");
      document.body.style.overflow = "";
      postModalLeft.innerHTML = "";
      modalCommentsList.innerHTML = "";
    });
  }

  if (postModal) {
    postModal.addEventListener("click", function (e) {
      if (e.target === postModal) {
        postModal.classList.remove("open");
        document.body.style.overflow = "";
        postModalLeft.innerHTML = "";
        modalCommentsList.innerHTML = "";
      }
    });
  }

  if (modalCommentForm) {
    modalCommentForm.addEventListener("submit", async function (e) {
      e.preventDefault();

      if (!currentPostId || !modalCommentInput) return;

      const content = modalCommentInput.value.trim();
      if (!content) return;

      const parentId = modalCommentInput.dataset.replyTo || "";

      const fd = new FormData();
      fd.append("content", content);
      fd.append("parent_id", parentId);

      try {
        const res = await fetch(`/posts/${currentPostId}/comment/`, {
          method: "POST",
          headers: {
            "X-CSRFToken": getCookie("csrftoken"),
            "X-Requested-With": "XMLHttpRequest",
          },
          body: fd,
        });

        const data = await res.json();
        if (!data.ok) return;

        const commentsRes = await fetch(`/posts/${currentPostId}/comments/`, {
          headers: {
            "X-Requested-With": "XMLHttpRequest",
          },
        });

        const commentsData = await commentsRes.json();
        modalCommentsList.innerHTML = commentsData.html || "";

        modalCommentsList.querySelectorAll(".like-count").forEach(el => {
          const original = el.textContent.trim();
          el.innerHTML = `<span class="count-value">${formatCount(original)}</span>`;
          el.title = original;
        });

        const originalPost = document
          .querySelector(`.comment-btn[data-post="${currentPostId}"]`)
          ?.closest(".post");

        const countEl = originalPost?.querySelector(".comment-count");
        if (countEl) {
          animateCountChange(countEl, data.comments_count);
          countEl.title = data.comments_count;
        }

        modalCommentInput.value = "";
        delete modalCommentInput.dataset.replyTo;
        modalCommentInput.placeholder = "Write a comment...";
      } catch (err) {
        console.error("Create comment error:", err);
      }
    });
  }

  document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".comment-like-btn");
    if (btn) {
      e.preventDefault();

      if (btn.dataset.busy === "1") return;
      btn.dataset.busy = "1";

      const id = btn.dataset.id;

      try {
        const res = await fetch(`/posts/comment/${id}/like/`, {
          method: "POST",
          headers: {
            "X-CSRFToken": getCookie("csrftoken"),
            "X-Requested-With": "XMLHttpRequest",
          }
        });

        const data = await res.json();
        if (!data.ok) return;

        const countEl = btn.querySelector(".like-count");
        if (countEl) {
          animateCountChange(countEl, data.count);
        }

        const iconEl = btn.querySelector(".comment-like-icon");

        btn.classList.toggle("liked", data.liked);

        if (iconEl) {
          iconEl.src = data.liked
            ? "/static/icons/liked.svg"
            : "/static/icons/heart-circle-svgrepo-com.svg";

          if (data.liked) {
            iconEl.classList.remove("pop-animate");
            void iconEl.offsetWidth;
            iconEl.classList.add("pop-animate");
          } else {
            iconEl.classList.remove("pop-animate");
          }
        }
      } catch (err) {
        console.error("Comment like error:", err);
      } finally {
        delete btn.dataset.busy;
      }

      return;
    }

    const replyBtn = e.target.closest(".comment-reply-btn");
    if (replyBtn) {
      e.preventDefault();

      const username = replyBtn.dataset.user;
      const commentId = replyBtn.dataset.id;

      modalCommentInput.value = `@${username} `;
      modalCommentInput.focus();
      modalCommentInput.dataset.replyTo = commentId;
    }
  });

  document.querySelectorAll(".like-count, .comment-count").forEach(el => {
    const original = el.textContent.trim();
    el.innerHTML = `<span class="count-value">${formatCount(original)}</span>`;
    el.title = original;
  });

  document.addEventListener("click", function (e) {
    const toggleRepliesBtn = e.target.closest(".comment-toggle-replies");
    if (!toggleRepliesBtn) return;

    e.preventDefault();

    const commentId = toggleRepliesBtn.dataset.commentId;

    const repliesBlock = document.querySelector(`.comment-replies[data-comment-id="${commentId}"]`);
    if (!repliesBlock) return;

    const isHidden = repliesBlock.hasAttribute("hidden");

    if (isHidden) {
      repliesBlock.removeAttribute("hidden");
      toggleRepliesBtn.textContent = "Hide replies";
    } else {
      repliesBlock.setAttribute("hidden", "");
      const count = repliesBlock.querySelectorAll(".comment-reply").length;
      toggleRepliesBtn.textContent = `View replies (${count})`;
    }
  });

  if (commentEditSave) {
    commentEditSave.addEventListener("click", async function () {
      if (!editingCommentId || !editingCommentContentEl || !commentEditTextarea) return;

      const trimmed = commentEditTextarea.value.trim();
      const oldContent = editingCommentContentEl.textContent.trim();

      if (!trimmed || trimmed === oldContent) {
        closeCommentEditModal();
        return;
      }

      const fd = new FormData();
      fd.append("content", trimmed);

      try {
        const res = await fetch(`/posts/comment/${editingCommentId}/edit/`, {
          method: "POST",
          headers: {
            "X-CSRFToken": getCookie("csrftoken"),
            "X-Requested-With": "XMLHttpRequest",
          },
          body: fd,
        });

        const data = await res.json();
        if (!data.ok) return;

        editingCommentContentEl.textContent = data.content;
        closeCommentEditModal();
      } catch (err) {
        console.error("Edit comment error:", err);
      }
    });
  }

  function refreshCommentsModalHtml(html) {
    modalCommentsList.innerHTML = html || "";

    modalCommentsList.querySelectorAll(".like-count").forEach(el => {
      const original = el.textContent.trim();
      el.innerHTML = `<span class="count-value">${formatCount(original)}</span>`;
      el.title = original;
    });
  }

  function updatePostCommentCounter(newCount) {
    const originalPost = document
      .querySelector(`.comment-btn[data-post="${currentPostId}"]`)
      ?.closest(".post");

    const countEl = originalPost?.querySelector(".comment-count");
    if (countEl) {
      animateCountChange(countEl, newCount);
      countEl.title = newCount;
    }
  }

  function openDeleteModal(commentId) {
    if (!commentDeleteModal) return;
    pendingDeleteCommentId = commentId;
    commentDeleteModal.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeDeleteModal() {
    if (!commentDeleteModal) return;
    pendingDeleteCommentId = null;
    commentDeleteModal.classList.remove("open");
    document.body.style.overflow = "";
  }

  function openReportModal(commentId) {
    if (!commentReportModal) return;
    pendingReportCommentId = commentId;
    if (commentReportText) commentReportText.value = "";
    commentReportModal.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeReportModal() {
    if (!commentReportModal) return;
    pendingReportCommentId = null;
    if (commentReportText) commentReportText.value = "";
    commentReportModal.classList.remove("open");
    document.body.style.overflow = "";
  }

  document.addEventListener("click", function (e) {
    const editBtn = e.target.closest(".comment-edit-btn");
    if (editBtn) {
      e.preventDefault();

      const commentId = editBtn.dataset.id;
      const commentItem = editBtn.closest(".comment-item");
      const contentEl = commentItem?.querySelector(".comment-content");

      if (!contentEl) {
        console.warn("Edit: .comment-content not found");
        return;
      }

      const oldContent = contentEl.textContent.trim();
      openCommentEditModal(commentId, oldContent, contentEl);
      return;
    }

    const deleteBtn = e.target.closest(".comment-delete-btn");
    if (deleteBtn) {
      e.preventDefault();
      openDeleteModal(deleteBtn.dataset.id);
      return;
    }

    const reportBtn = e.target.closest(".comment-report-btn");
    if (reportBtn) {
      e.preventDefault();
      openReportModal(reportBtn.dataset.id);
      return;
    }
  });

  if (commentEditSave) {
    commentEditSave.addEventListener("click", async function () {
      if (!editingCommentId || !editingCommentContentEl || !commentEditTextarea) return;

      const trimmed = commentEditTextarea.value.trim();
      const oldContent = editingCommentContentEl.textContent.trim();

      if (!trimmed || trimmed === oldContent) {
        closeCommentEditModal();
        return;
      }

      const fd = new FormData();
      fd.append("content", trimmed);

      try {
        const res = await fetch(`/posts/comment/${editingCommentId}/edit/`, {
          method: "POST",
          headers: {
            "X-CSRFToken": getCookie("csrftoken"),
            "X-Requested-With": "XMLHttpRequest",
          },
          body: fd,
        });

        const data = await res.json();
        if (!data.ok) return;

        editingCommentContentEl.textContent = data.content;
        closeCommentEditModal();
      } catch (err) {
        console.error("Edit comment error:", err);
      }
    });
  }

  if (commentDeleteCancel) {
    commentDeleteCancel.addEventListener("click", closeDeleteModal);
  }
  if (commentDeleteModalClose) {
    commentDeleteModalClose.addEventListener("click", closeDeleteModal);
  }
  if (commentDeleteModal) {
    commentDeleteModal.addEventListener("click", function (e) {
      if (e.target === commentDeleteModal) closeDeleteModal();
    });
  }
  if (commentDeleteConfirm) {
    commentDeleteConfirm.addEventListener("click", async function () {
      if (!pendingDeleteCommentId) return;

      try {
        const res = await fetch(`/posts/comment/${pendingDeleteCommentId}/delete/`, {
          method: "POST",
          headers: {
            "X-CSRFToken": getCookie("csrftoken"),
            "X-Requested-With": "XMLHttpRequest",
          },
        });

        const data = await res.json();
        if (!data.ok) return;

        const commentsRes = await fetch(`/posts/${currentPostId}/comments/`, {
          headers: {
            "X-Requested-With": "XMLHttpRequest",
          },
        });

        const commentsData = await commentsRes.json();
        refreshCommentsModalHtml(commentsData.html);
        updatePostCommentCounter(data.comments_count);
        closeDeleteModal();
      } catch (err) {
        console.error("Delete comment error:", err);
      }
    });
  }

  if (commentReportCancel) {
    commentReportCancel.addEventListener("click", closeReportModal);
  }
  if (commentReportModalClose) {
    commentReportModalClose.addEventListener("click", closeReportModal);
  }
  if (commentReportModal) {
    commentReportModal.addEventListener("click", function (e) {
      if (e.target === commentReportModal) closeReportModal();
    });
  }
  if (commentReportConfirm) {
    commentReportConfirm.addEventListener("click", async function () {
      if (!pendingReportCommentId) return;

      const fd = new FormData();
      fd.append("reason", commentReportText?.value?.trim() || "");

      try {
        const res = await fetch(`/posts/comment/${pendingReportCommentId}/report/`, {
          method: "POST",
          headers: {
            "X-CSRFToken": getCookie("csrftoken"),
            "X-Requested-With": "XMLHttpRequest",
          },
          body: fd,
        });

        const data = await res.json();
        if (!data.ok) return;

        closeReportModal();
      } catch (err) {
        console.error("Report comment error:", err);
      }
    });
  }
});