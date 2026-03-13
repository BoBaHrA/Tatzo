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

  let lbIndex = 0;
  let selectedFiles = []; 
  let previewMode = 'grid'; // 'grid' | 'carousel'
  let carouselIndex = 0;
  let carMain = null;
  let carThumbs = null;
  let carMainMedia = null;

  // ===== ObjectURL cache (чтобы не плодить URL.createObjectURL) =====
  const urlCache = new WeakMap();

  function getCookie(name) {
    const v = document.cookie.split('; ').find(row => row.startsWith(name + '='));
    return v ? decodeURIComponent(v.split('=')[1]) : '';
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

  function openLightbox(index){
    if (!selectedFiles.length) return;
  
    lbIndex = Math.max(0, Math.min(index, selectedFiles.length - 1));
    stopAndResetVideo(carMain);
    renderLightboxItem();
    lightbox.classList.add('open');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden'; // чтобы фон не скроллился
  }

  function closeLightbox(){
    lightbox.classList.remove('open');
    lightbox.setAttribute('aria-hidden', 'true');
    lbBody.innerHTML = '';
    document.body.style.overflow = '';
  }

  function renderLightboxItem(){
    lbBody.innerHTML = '';

    const file = selectedFiles[lbIndex];
    if (!file) return;

    const url = getObjectUrl(file);

    if (file.type.startsWith('image/')){
      const img = document.createElement('img');
      img.src = url;
      img.alt = file.name || 'preview';
      lbBody.appendChild(img);
    } else if (file.type.startsWith('video/')){
      const video = document.createElement('video');
      video.src = url;
      video.controls = true;
      video.autoplay = false; // или просто удали эту строку
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

    // скрываем стрелки, если 1 файл
    const multi = selectedFiles.length > 1;
    lbPrev.style.display = multi ? 'flex' : 'none';
    lbNext.style.display = multi ? 'flex' : 'none';
}

function lbGo(delta){
  if (!selectedFiles.length) return;
  lbIndex = (lbIndex + delta + selectedFiles.length) % selectedFiles.length;
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
    const isInside = createPost.contains(e.target); 
    const isPreviewItem = e.target.closest('#file-preview'); 
    const isDeleteBtn = e.target.closest('.preview-remove'); 
    if (isInside || isPreviewItem || isDeleteBtn) { 
      createPost.classList.add('expanded'); 
    } else { 
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

// helper: создаёт одну плитку + крестик удаления
function createPreviewItem(file, index, placement = 'grid') {
  const wrapper = document.createElement('div');
  wrapper.className = 'preview-item';

  wrapper.dataset.index = String(index);

  // Открыть просмотр по клику на плитку (но НЕ по крестику удаления)
  wrapper.addEventListener('click', (ev) => {
    if (ev.target.closest('.preview-remove')) return;
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

document.addEventListener("click", function (e) {
  const likeBtn = e.target.closest(".like-btn");
  if (likeBtn) {
    e.preventDefault();
    likeBtn.classList.toggle("liked");
    return;
  }

  const bookmarkBtn = e.target.closest(".bookmark-btn");
  if (bookmarkBtn) {
    e.preventDefault();
    bookmarkBtn.classList.toggle("bookmarked");
  }
});