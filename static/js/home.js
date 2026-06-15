document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const els = {
    createPost: document.getElementById("create-post"),
    textarea: document.getElementById("post-textarea"),
    postBtn: document.getElementById("post-btn"),
    fileUpload: document.getElementById("file-upload"),
    previewContainer: document.getElementById("file-preview"),
    customFileTrigger: document.getElementById("custom-file-trigger"),
    previewToolbar: document.getElementById("preview-toolbar"),

    lightbox: document.getElementById("media-lightbox"),
    lbBody: document.getElementById("lb-body"),
    lbClose: document.getElementById("lb-close"),
    lbPrev: document.getElementById("lb-prev"),
    lbNext: document.getElementById("lb-next"),

    postModal: document.getElementById("post-modal"),
    postModalLeft: document.getElementById("post-modal-left"),
    modalCommentsList: document.getElementById("modal-comments-list"),
    modalCommentForm: document.getElementById("modal-comment-form"),
    modalCommentInput: document.getElementById("modal-comment-input"),
    postModalClose: document.getElementById("post-modal-close"),

    commentEditModal: document.getElementById("comment-edit-modal"),
    commentEditTextarea: document.getElementById("comment-edit-textarea"),
    commentEditSave: document.getElementById("comment-edit-save"),
    commentEditCancel: document.getElementById("comment-edit-cancel"),
    commentEditModalClose: document.getElementById("comment-edit-modal-close"),

    commentDeleteModal: document.getElementById("comment-delete-modal"),
    commentDeleteConfirm: document.getElementById("comment-delete-confirm"),
    commentDeleteCancel: document.getElementById("comment-delete-cancel"),
    commentDeleteModalClose: document.getElementById("comment-delete-modal-close"),

    commentReportModal: document.getElementById("comment-report-modal"),
    commentReportConfirm: document.getElementById("comment-report-confirm"),
    commentReportCancel: document.getElementById("comment-report-cancel"),
    commentReportModalClose: document.getElementById("comment-report-modal-close"),
    commentReportText: document.getElementById("comment-report-text"),

    postDeleteModal: document.getElementById("post-delete-modal"),
    postDeleteConfirm: document.getElementById("post-delete-confirm"),
    postDeleteCancel: document.getElementById("post-delete-cancel"),
    postDeleteModalClose: document.getElementById("post-delete-modal-close"),

    postReportModal: document.getElementById("post-report-modal"),
    postReportConfirm: document.getElementById("post-report-confirm"),
    postReportCancel: document.getElementById("post-report-cancel"),
    postReportModalClose: document.getElementById("post-report-modal-close"),
    postReportText: document.getElementById("post-report-text"),

    shareSoonModal: document.getElementById("share-soon-modal"),
    shareSoonClose: document.getElementById("share-soon-close"),
    shareSoonOk: document.getElementById("share-soon-ok"),
  };

  const state = {
    currentPostId: null,
    pendingDeletePostId: null,
    pendingReportPostId: null,
    editingCommentId: null,
    editingCommentContentEl: null,
    pendingDeleteCommentId: null,
    pendingReportCommentId: null,

    selectedFiles: [],
    previewMode: "grid",
    carouselIndex: 0,
    carMain: null,
    carThumbs: null,
    carMainMedia: null,

    lbIndex: 0,
    lbItems: [],
    lbMode: "preview",

    urlCache: new WeakMap(),
  };

  const i18n = window.TATZO_I18N || {};

  function t(key, fallback = "") {
    return i18n[key] || fallback || key;
  }

  const helpers = {
    getCookie(name) {
      const cookie = document.cookie
        .split("; ")
        .find((row) => row.startsWith(`${name}=`));
      return cookie ? decodeURIComponent(cookie.split("=")[1]) : "";
    },

    csrfHeaders(extra = {}) {
      return {
        "X-CSRFToken": helpers.getCookie("csrftoken"),
        "X-Requested-With": "XMLHttpRequest",
        ...extra,
      };
    },

    ajaxHeaders(extra = {}) {
      return {
        "X-Requested-With": "XMLHttpRequest",
        ...extra,
      };
    },

    formatCount(num) {
      num = Number(num) || 0;

      if (num < 1000) return String(num);

      if (num < 1000000) {
        const value = num / 1000;
        return Number.isInteger(value) ? `${value}K` : `${value.toFixed(1)}K`;
      }

      const value = num / 1000000;
      return Number.isInteger(value) ? `${value}M` : `${value.toFixed(1)}M`;
    },

    animateCountChange(countEl, newValue) {
      if (!countEl) return;

      const formatted = helpers.formatCount(newValue);
      const currentNode = countEl.querySelector(".count-value");
      const oldText = currentNode ? currentNode.textContent : null;

      if (!oldText || oldText === formatted) {
        countEl.innerHTML = `<span class="count-value">${formatted}</span>`;
        countEl.title = String(newValue);
        return;
      }

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
    },

    getObjectUrl(file) {
      if (!file) return "";

      let url = state.urlCache.get(file);
      if (!url) {
        url = URL.createObjectURL(file);
        state.urlCache.set(file, url);
      }

      return url;
    },

    revokeObjectUrl(file) {
      const url = state.urlCache.get(file);
      if (!url) return;

      URL.revokeObjectURL(url);
      state.urlCache.delete(file);
    },

    stopAndResetVideo(root) {
      if (!root) return;

      const video = root.querySelector("video");
      if (!video) return;

      try {
        video.pause();
        video.currentTime = 0;
      } catch (_) {}
    },

    setBodyLocked(isLocked) {
      document.body.style.overflow = isLocked ? "hidden" : "";
    },

    closeMenus(selector) {
      document.querySelectorAll(selector).forEach((menu) => {
        menu.classList.remove("open");
        menu.style.display = "";
      });
    },

    showToast(message, type = "info") {
      let stack = document.querySelector(".tatzo-toast-stack");

      if (!stack) {
        stack = document.createElement("div");
        stack.className = "tatzo-toast-stack";
        document.body.appendChild(stack);
      }

      const toast = document.createElement("div");
      toast.className = `tatzo-toast tatzo-toast-${type}`;

      const icon = document.createElement("div");
      icon.className = "tatzo-toast-icon";

      if (type === "success") {
        icon.textContent = "✓";
      } else if (type === "error") {
        icon.textContent = "!";
      } else {
        icon.textContent = "i";
      }

      const content = document.createElement("div");
      content.className = "tatzo-toast-content";

      const title = document.createElement("strong");
      title.textContent =
        type === "success"
          ? t("success", "Success")
          : type === "error"
            ? t("actionFailed", "Action failed")
            : t("info", "Info");

      const text = document.createElement("span");
      text.textContent = message || t("done", "Done.");

      content.appendChild(title);
      content.appendChild(text);

      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "tatzo-toast-close";
      closeBtn.textContent = "×";

      toast.appendChild(icon);
      toast.appendChild(content);
      toast.appendChild(closeBtn);
      stack.appendChild(toast);

      requestAnimationFrame(() => {
        toast.classList.add("show");
      });

      function removeToast() {
        toast.classList.remove("show");
        toast.classList.add("hide");

        setTimeout(() => {
          toast.remove();

          if (!stack.children.length) {
            stack.remove();
          }
        }, 220);
      }

      closeBtn.addEventListener("click", removeToast);

      setTimeout(removeToast, 3600);
    },
  };

  const lightbox = {
    open(index, items = null, mode = "preview") {
      if (!els.lightbox || !els.lbBody) return;

      if (mode === "saved") {
        if (!items?.length) return;
        state.lbItems = items;
        state.lbMode = "saved";
      } else {
        if (!state.selectedFiles.length) return;
        state.lbItems = state.selectedFiles.map((file) => ({
          type: file.type.startsWith("image/")
            ? "image"
            : file.type.startsWith("video/")
              ? "video"
              : "file",
          file,
        }));
        state.lbMode = "preview";
      }

      state.lbIndex = Math.max(0, Math.min(index, state.lbItems.length - 1));
      helpers.stopAndResetVideo(state.carMain);
      lightbox.render();
      els.lightbox.classList.add("open");
      els.lightbox.setAttribute("aria-hidden", "false");
      helpers.setBodyLocked(true);
    },

    close() {
      if (!els.lightbox || !els.lbBody) return;

      els.lightbox.classList.remove("open");
      els.lightbox.setAttribute("aria-hidden", "true");
      els.lbBody.innerHTML = "";
      els.lbBody.style.removeProperty("--lb-bg");
      helpers.setBodyLocked(false);
    },

    render() {
      if (!els.lbBody) return;

      els.lbBody.innerHTML = "";
      const item = state.lbItems[state.lbIndex];
      if (!item) return;

      const isSaved = state.lbMode === "saved";
      const url = isSaved ? item.url : helpers.getObjectUrl(item.file);
      const type = isSaved ? item.type : item.type;

      els.lbBody.style.setProperty("--lb-bg", `url("${url}")`);

      if (type === "image") {
        const img = document.createElement("img");
        img.src = url;
        img.alt = isSaved ? t("preview", "Preview") : item.file?.name || t("preview", "Preview");
        els.lbBody.appendChild(img);
      } else if (type === "video") {
        const video = document.createElement("video");
        video.src = url;
        video.controls = true;
        video.autoplay = false;
        video.playsInline = true;
        video.preload = "metadata";
        els.lbBody.appendChild(video);
      } else {
        const box = document.createElement("div");
        box.style.padding = "18px";
        box.style.color = "#cde";
        box.textContent = item.file?.name || t("unsupportedFile", "Unsupported file");
        els.lbBody.appendChild(box);
      }

      const hasMultipleItems = state.lbItems.length > 1;
      if (els.lbPrev) els.lbPrev.style.display = hasMultipleItems ? "flex" : "none";
      if (els.lbNext) els.lbNext.style.display = hasMultipleItems ? "flex" : "none";
    },

    go(delta) {
      if (!state.lbItems.length) return;
      state.lbIndex = (state.lbIndex + delta + state.lbItems.length) % state.lbItems.length;
      lightbox.render();
    },
  };

  const savedMedia = {
        setStableCarouselWidth(container, items) {
          if (!container || !items?.length) return;

          const maxWidth = 700;
          const minWidth = 360;

          const promises = items.map((item) => {
            return new Promise((resolve) => {
              if (item.type === "image") {
                const img = new Image();

                img.onload = () => {
                  const ratio = img.naturalWidth / img.naturalHeight;
                  const width = Math.round(Math.min(maxWidth, Math.max(minWidth, 430 * ratio)));
                  resolve(width);
                };

                img.onerror = () => resolve(minWidth);
                img.src = item.url;
                return;
              }

              if (item.type === "video") {
                const video = document.createElement("video");

                video.onloadedmetadata = () => {
                  const ratio = video.videoWidth / video.videoHeight;
                  const width = Math.round(Math.min(maxWidth, Math.max(minWidth, 430 * ratio)));
                  resolve(width);
                };

                video.onerror = () => resolve(minWidth);
                video.preload = "metadata";
                video.src = item.url;
                return;
              }

              resolve(minWidth);
            });
          });

          Promise.all(promises).then((widths) => {
            const stableWidth = Math.max(...widths);

            container.style.setProperty("--stable-carousel-width", `${stableWidth}px`);

            const bubble = container.closest(".message-bubble");
            if (bubble) {
              bubble.style.setProperty("--stable-carousel-width", `${stableWidth}px`);
              bubble.classList.add("carousel-width-ready");
            }

            container.classList.add("carousel-width-ready");
          });
        },
    initAll() {
      document.querySelectorAll(".post-media-renderer").forEach((container) => {
        try {
          savedMedia.renderFromSources(container);
        } catch (err) {
          console.error("Saved media init error:", err);
        }
      });
    },

    renderFromSources(container) {
      const items = Array.from(container.querySelectorAll(".media-source")).map((el) => ({
        type: el.dataset.type,
        url: el.dataset.url,
      }));

      container.classList.remove("single-media", "single-image", "single-video");

      if (items.length === 1) {
        container.classList.add("single-media");

        if (items[0].type === "video") {
          container.classList.add("single-video");
        }

        if (items[0].type === "image") {
          container.classList.add("single-image");
        }
      }

        container.dataset.items = JSON.stringify(items);
        savedMedia.render(container, items, container.dataset.layout || "grid");
      },

    rehydrate(container) {
      const raw = container.dataset.items;
      if (!raw) return;

      let items = [];
      try {
        items = JSON.parse(raw);
      } catch (err) {
        console.error("Failed to parse media items:", err);
        return;
      }

      savedMedia.render(container, items, container.dataset.layout || "grid");
    },

    render(container, items, layout = "grid") {
      container.innerHTML = "";
      container.classList.add("media-layout");

      if (layout === "carousel") {
        savedMedia.renderCarousel(container, items);
      } else {
        savedMedia.renderGrid(container, items);
      }
    },

    renderGrid(container, items) {
      const total = items.length;
      if (!total) return;

      container.setAttribute("data-mode", "grid");
      container.setAttribute("data-count", String(Math.min(total, 10)));
      container.classList.remove("l1", "l2", "l3", "l4", "l5", "l6", "l7", "l8", "l9", "l10", "lstrip");

      if (total === 7 || total >= 10) {
        container.classList.add("lstrip");

        const top = document.createElement("div");
        top.className = "preview-top";

        const bottom = document.createElement("div");
        bottom.className = "preview-bottom";

        items.forEach((item, i) => {
          const node = savedMedia.createItem(item, i, i < 2 ? "top" : "bottom", items);
          if (i < 2) top.appendChild(node);
          else bottom.appendChild(node);
        });

        container.appendChild(top);
        container.appendChild(bottom);
        container.style.setProperty("--bottom-count", Math.max(1, total - 2));
        return;
      }

      container.classList.add(`l${total}`);
      items.forEach((item, i) => {
        container.appendChild(savedMedia.createItem(item, i, "grid", items));
      });
    },

    renderCarousel(container, items) {
      if (!items.length) return;

      container.setAttribute("data-mode", "carousel");
      container.dataset.mediaCount = String(items.length);
      container.style.setProperty("--thumb-count", String(items.length));

      container.classList.remove("carousel-single", "carousel-small", "carousel-large");

      if (items.length === 1) {
        container.classList.add("carousel-single");
      } else if (items.length >= 2 && items.length <= 5) {
        container.classList.add("carousel-small");
      } else {
        container.classList.add("carousel-large");
      }

      container.classList.add("saved-carousel");

      let currentIndex = 0;
      let currentMedia = null;

      const main = document.createElement("div");
      main.className = "carousel-main";

      const thumbs = document.createElement("div");
      thumbs.className = "carousel-thumbs";

      main.addEventListener("click", (e) => {
        if (e.target.closest(".car-nav")) return;
        if (e.target.closest("video")) return;
        lightbox.open(currentIndex, items, "saved");
      });

      function renderMain(index, withFade = false) {
        const item = items[index];
        if (!item) return;

        const swap = () => {
          if (currentMedia) currentMedia.remove();

          let node;
          if (item.type === "image") {
            node = document.createElement("img");
            node.src = item.url;
            node.alt = t("media", "Media");
          } else if (item.type === "video") {
            node = document.createElement("video");
            node.src = item.url;
            node.controls = true;
            node.playsInline = true;
            node.preload = "metadata";
          } else {
            node = document.createElement("div");
            node.style.padding = "18px";
            node.style.color = "#cde";
            node.textContent = t("unsupportedFile", "Unsupported file");
          }

          currentMedia = node;
          main.insertBefore(node, main.firstChild);
          main.classList.remove("fade-out");

          if (withFade) {
            main.classList.add("fade-in");
            setTimeout(() => main.classList.remove("fade-in"), 160);
          }
        };

        helpers.stopAndResetVideo(main);

        if (!withFade) {
          swap();
          return;
        }

        main.classList.remove("fade-in");
        main.classList.add("fade-out");
        setTimeout(swap, 120);
      }

      function setIndex(nextIndex) {
        const previousIndex = currentIndex;
        currentIndex = (nextIndex + items.length) % items.length;

        thumbs.querySelector(`.thumb[data-i="${previousIndex}"]`)?.classList.remove("active");
        thumbs.querySelector(`.thumb[data-i="${currentIndex}"]`)?.classList.add("active");

        renderMain(currentIndex, true);

        thumbs.querySelector(`.thumb[data-i="${currentIndex}"]`)?.scrollIntoView({
          behavior: "smooth",
          inline: "center",
          block: "nearest",
        });
      }

      if (items.length > 1) {
        const prev = document.createElement("div");
        prev.className = "car-nav car-prev";
        prev.textContent = "‹";
        prev.addEventListener("click", (e) => {
          e.stopPropagation();
          setIndex(currentIndex - 1);
        });

        const next = document.createElement("div");
        next.className = "car-nav car-next";
        next.textContent = "›";
        next.addEventListener("click", (e) => {
          e.stopPropagation();
          setIndex(currentIndex + 1);
        });

        main.appendChild(prev);
        main.appendChild(next);
      }

      items.forEach((item, i) => {
        const thumb = document.createElement("div");
        thumb.className = `thumb${i === 0 ? " active" : ""}`;
        thumb.dataset.i = String(i);

        if (item.type === "image") {
          const img = document.createElement("img");
          img.src = item.url;
          thumb.appendChild(img);
        } else if (item.type === "video") {
          const video = document.createElement("video");
          video.src = item.url;
          video.muted = true;
          video.playsInline = true;
          video.preload = "metadata";
          thumb.appendChild(video);
        }

        thumb.addEventListener("click", (e) => {
          e.stopPropagation();
          setIndex(i);
        });

        thumbs.appendChild(thumb);
      });

      container.appendChild(main);

      if (items.length > 1) {
        container.appendChild(thumbs);
      }

      renderMain(0, false);
      savedMedia.setStableCarouselWidth(container, items);
    },

    createItem(item, index, placement = "grid", allItems = []) {
      const wrapper = document.createElement("div");
      wrapper.className = "preview-item";
      wrapper.dataset.index = String(index);

      const isSingleMedia = allItems.length === 1;

      if (isSingleMedia) {
        wrapper.classList.add("blur-media-frame");
      }

      wrapper.addEventListener("click", (e) => {
        if (e.target.closest("video")) return;
        lightbox.open(index, allItems, "saved");
      });

      if (item.type === "image") {
        if (isSingleMedia) {
          const bg = document.createElement("img");
          bg.src = item.url;
          bg.alt = "";
          bg.className = "media-blur-bg";
          bg.setAttribute("aria-hidden", "true");
          wrapper.appendChild(bg);
        }

        const img = document.createElement("img");
        img.src = item.url;
        img.alt = t("media", "Media");
        img.className = isSingleMedia ? "media-main" : "";
        wrapper.appendChild(img);
      } else if (item.type === "video") {
        if (isSingleMedia) {
          const bg = document.createElement("video");
          bg.src = item.url;
          bg.muted = true;
          bg.loop = true;
          bg.autoplay = true;
          bg.playsInline = true;
          bg.preload = "metadata";
          bg.controls = false;
          bg.className = "media-blur-bg";
          bg.setAttribute("aria-hidden", "true");
          bg.tabIndex = -1;
          wrapper.appendChild(bg);
        }

        const video = document.createElement("video");
        video.src = item.url;
        video.controls = placement !== "bottom";
        video.preload = "metadata";
        video.playsInline = true;
        video.className = isSingleMedia ? "media-main" : "";

        if (isSingleMedia) {
          video.addEventListener("loadedmetadata", () => {
            const w = video.videoWidth || 1;
            const h = video.videoHeight || 1;

            wrapper.classList.toggle("is-portrait", h > w);
            wrapper.classList.toggle("is-landscape", w >= h);
            wrapper.style.setProperty("--media-ratio", `${w} / ${h}`);
          });
        }

        wrapper.appendChild(video);
      }

      return wrapper;
    },
  };

  const preview = {
    init() {
      if (!els.createPost || !els.textarea || !els.postBtn || !els.fileUpload || !els.previewContainer || !els.customFileTrigger) {
        return;
      }

      els.previewToolbar?.addEventListener("click", (e) => {
        const btn = e.target.closest(".mode-btn");
        if (!btn) return;

        state.previewMode = btn.dataset.mode || "grid";
        els.previewToolbar.querySelectorAll(".mode-btn").forEach((b) => {
          b.classList.toggle("active", b === btn);
        });

        preview.render();
      });

      document.addEventListener("click", (e) => {
        const isInside = els.createPost.contains(e.target);
        const isPreviewItem = e.target.closest("#file-preview");
        const isDeleteBtn = e.target.closest(".preview-remove");

        if (isInside || isPreviewItem || isDeleteBtn) {
          els.createPost.classList.add("expanded");
        } else {
          els.createPost.classList.remove("expanded");
        }
      });

      els.textarea.addEventListener("input", preview.autosizeTextarea);
      els.textarea.addEventListener("blur", preview.autosizeTextarea);

      els.customFileTrigger.addEventListener("click", () => {
        els.fileUpload.click();
      });

      els.fileUpload.addEventListener("change", () => {
        const maxFiles = 12;
        const newFiles = Array.from(els.fileUpload.files);

        newFiles.forEach((newFile) => {
          if (state.selectedFiles.length >= maxFiles) return;

          const exists = state.selectedFiles.some((file) => {
            return file.name === newFile.name && file.size === newFile.size;
          });

          if (!exists) state.selectedFiles.push(newFile);
        });

        preview.syncFileInput();
        preview.render();
        preview.updatePostButtonVisibility();
      });

      els.postBtn.addEventListener("click", preview.createPost);

      els.createPost.classList.remove("expanded");
      els.textarea.style.removeProperty("height");
      preview.autosizeTextarea();
      preview.updatePostButtonVisibility();
    },

    updatePostButtonVisibility() {
      const hasText = els.textarea.value.trim().length > 0;
      const hasFiles = state.selectedFiles.length > 0;
      els.postBtn.classList.toggle("visible", hasText || hasFiles);
    },

    autosizeTextarea() {
      const isEmpty = els.textarea.value.trim().length === 0;
      const hasFiles = state.selectedFiles.length > 0;

      if (isEmpty && !hasFiles) {
        els.textarea.style.removeProperty("height");
        els.createPost.classList.remove("expanded");
      } else {
        els.textarea.style.height = "auto";
        els.textarea.style.height = `${Math.min(els.textarea.scrollHeight, 400)}px`;
        els.createPost.classList.add("expanded");
      }

      preview.updatePostButtonVisibility();
    },

    syncFileInput() {
      const dt = new DataTransfer();
      state.selectedFiles.forEach((file) => dt.items.add(file));
      els.fileUpload.files = dt.files;
    },

    createItem(file, index, placement = "grid") {
      const wrapper = document.createElement("div");
      wrapper.className = "preview-item";
      wrapper.dataset.index = String(index);

      wrapper.addEventListener("click", (e) => {
        if (e.target.closest(".preview-remove")) return;
        if (e.target.closest("video")) return;
        lightbox.open(index);
      });

      if (file.type.startsWith("image/")) {
        const img = document.createElement("img");
        img.src = helpers.getObjectUrl(file);
        wrapper.appendChild(img);
      } else if (file.type.startsWith("video/")) {
        const video = document.createElement("video");
        video.src = helpers.getObjectUrl(file);
        video.controls = placement !== "bottom";
        video.preload = "metadata";
        video.playsInline = true;
        wrapper.appendChild(video);
      } else {
        const box = document.createElement("div");
        box.style.padding = "12px";
        box.style.color = "#cde";
        box.textContent = file.name;
        wrapper.appendChild(box);
      }

      const del = document.createElement("div");
      del.className = "preview-remove";
      del.textContent = "✖";
      del.title = t("removeFile", "Remove file");
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        const removed = state.selectedFiles[index];
        helpers.revokeObjectUrl(removed);
        state.selectedFiles.splice(index, 1);
        preview.syncFileInput();
        preview.render();
        preview.updatePostButtonVisibility();
      });

      wrapper.appendChild(del);
      return wrapper;
    },

    render() {
      if (!els.previewContainer) return;

      if (els.previewToolbar) {
        els.previewToolbar.style.display = state.selectedFiles.length > 0 ? "flex" : "none";
      }

      els.previewContainer.setAttribute("data-mode", state.previewMode);
      state.carouselIndex = Math.max(0, Math.min(state.carouselIndex, state.selectedFiles.length - 1));

      if (state.previewMode === "carousel") {
        preview.renderCarousel();
      } else {
        preview.renderGrid();
      }
    },

    renderGrid() {
      els.previewContainer.innerHTML = "";

      const total = state.selectedFiles.length;
      els.previewContainer.setAttribute("data-count", String(Math.min(total, 10)));
      els.previewContainer.classList.remove("l1", "l2", "l3", "l4", "l5", "l6", "l7", "l8", "l9", "l10", "lstrip");

      if (!total) return;

      if (total === 7 || total >= 10) {
        els.previewContainer.classList.add("lstrip");

        const top = document.createElement("div");
        top.className = "preview-top";

        const bottom = document.createElement("div");
        bottom.className = "preview-bottom";

        state.selectedFiles.forEach((file, i) => {
          const item = preview.createItem(file, i, i < 2 ? "top" : "bottom");
          if (i < 2) top.appendChild(item);
          else bottom.appendChild(item);
        });

        els.previewContainer.appendChild(top);
        els.previewContainer.appendChild(bottom);
        els.previewContainer.style.setProperty("--bottom-count", Math.max(1, total - 2));
        return;
      }

      els.previewContainer.classList.add(`l${total}`);
      state.selectedFiles.forEach((file, i) => {
        els.previewContainer.appendChild(preview.createItem(file, i));
      });
    },

    updateCarouselMain(withFade = false) {
      if (!state.carMain) return;

      const file = state.selectedFiles[state.carouselIndex];
      if (!file) return;

      const url = helpers.getObjectUrl(file);

      if (file.type.startsWith("image/")) {
        state.carMain.style.setProperty("--bg", `url("${url}")`);
      } else {
        state.carMain.style.setProperty("--bg", "none");
      }

      const swap = () => {
        if (state.carMainMedia) state.carMainMedia.remove();

        let node;
        if (file.type.startsWith("image/")) {
          node = document.createElement("img");
          node.src = url;
          node.alt = file.name || "preview";
          node.style.objectFit = "contain";
        } else if (file.type.startsWith("video/")) {
          node = document.createElement("video");
          node.src = url;
          node.controls = true;
          node.playsInline = true;
          node.preload = "metadata";
          node.style.objectFit = "contain";
          node.autoplay = false;
        } else {
          node = document.createElement("div");
          node.style.padding = "18px";
          node.style.color = "#cde";
          node.textContent = file.name;
        }

        state.carMainMedia = node;
        state.carMain.classList.remove("playing");
        state.carMain.querySelectorAll(".car-play").forEach((x) => x.remove());
        state.carMain.insertBefore(node, state.carMain.firstChild);

        if (withFade) {
          state.carMain.classList.remove("fade-out");
          state.carMain.classList.add("fade-in");
          setTimeout(() => state.carMain.classList.remove("fade-in"), 160);
        }
      };

      if (!withFade) {
        swap();
        return;
      }

      state.carMain.classList.remove("fade-in");
      state.carMain.classList.add("fade-out");
      setTimeout(swap, 120);
    },

    setCarouselIndex(nextIndex) {
      if (!state.selectedFiles.length) return;

      const previousIndex = state.carouselIndex;
      state.carouselIndex = (nextIndex + state.selectedFiles.length) % state.selectedFiles.length;

      if (!state.carMain || !state.carThumbs) {
        preview.render();
        return;
      }

      state.carThumbs.querySelector(`.thumb[data-i="${previousIndex}"]`)?.classList.remove("active");
      state.carThumbs.querySelector(`.thumb[data-i="${state.carouselIndex}"]`)?.classList.add("active");

      helpers.stopAndResetVideo(state.carMain);
      preview.updateCarouselMain(true);
    },

    renderCarousel() {
      els.previewContainer.innerHTML = "";
      els.previewContainer.removeAttribute("data-count");

      const total = state.selectedFiles.length;
      if (!total) return;

      const main = document.createElement("div");
      main.className = "carousel-main";
      state.carMain = main;

      const file = state.selectedFiles[state.carouselIndex];
      const url = helpers.getObjectUrl(file);
      let initialNode;

      if (file.type.startsWith("image/")) {
        initialNode = document.createElement("img");
        initialNode.src = url;
        initialNode.alt = file.name || "preview";
      } else if (file.type.startsWith("video/")) {
        initialNode = document.createElement("video");
        initialNode.src = url;
        initialNode.controls = true;
        initialNode.autoplay = false;
        initialNode.playsInline = true;
        initialNode.preload = "metadata";
      } else {
        initialNode = document.createElement("div");
        initialNode.style.padding = "18px";
        initialNode.style.color = "#cde";
        initialNode.textContent = file.name;
      }

      main.appendChild(initialNode);
      state.carMainMedia = initialNode;

      const delMain = document.createElement("div");
      delMain.className = "preview-remove";
      delMain.textContent = "✖";
      delMain.title = t("removeFile", "Remove file");
      delMain.addEventListener("click", (e) => {
        e.stopPropagation();
        const removed = state.selectedFiles[state.carouselIndex];
        helpers.revokeObjectUrl(removed);
        state.selectedFiles.splice(state.carouselIndex, 1);

        if (state.carouselIndex >= state.selectedFiles.length) {
          state.carouselIndex = Math.max(0, state.selectedFiles.length - 1);
        }

        preview.syncFileInput();
        preview.render();
        preview.updatePostButtonVisibility();
      });
      main.appendChild(delMain);

      const fullBtn = document.createElement("div");
      fullBtn.className = "car-full";
      fullBtn.textContent = "⤢";
      fullBtn.title = t("openPreview", "Open preview");
      fullBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        lightbox.open(state.carouselIndex);
      });
      main.appendChild(fullBtn);

      if (total > 1) {
        const prev = document.createElement("div");
        prev.className = "car-nav car-prev";
        prev.textContent = "‹";
        prev.addEventListener("click", (e) => {
          e.stopPropagation();
          preview.setCarouselIndex(state.carouselIndex - 1);
        });

        const next = document.createElement("div");
        next.className = "car-nav car-next";
        next.textContent = "›";
        next.addEventListener("click", (e) => {
          e.stopPropagation();
          preview.setCarouselIndex(state.carouselIndex + 1);
        });

        main.appendChild(prev);
        main.appendChild(next);
      }

      const thumbs = document.createElement("div");
      thumbs.className = "carousel-thumbs";

      state.selectedFiles.forEach((f, i) => {
        const thumb = document.createElement("div");
        thumb.className = `thumb${i === state.carouselIndex ? " active" : ""}`;
        thumb.dataset.i = String(i);

        const thumbUrl = helpers.getObjectUrl(f);

        if (f.type.startsWith("image/")) {
          const img = document.createElement("img");
          img.src = thumbUrl;
          thumb.appendChild(img);
        } else if (f.type.startsWith("video/")) {
          const video = document.createElement("video");
          video.src = thumbUrl;
          video.muted = true;
          video.playsInline = true;
          video.preload = "metadata";
          thumb.appendChild(video);
        } else {
          const box = document.createElement("div");
          box.style.padding = "8px";
          box.style.color = "#cde";
          box.style.fontSize = "12px";
          box.textContent = f.name;
          thumb.appendChild(box);
        }

        thumb.addEventListener("click", (e) => {
          e.stopPropagation();
          preview.setCarouselIndex(i);
        });

        thumbs.appendChild(thumb);
      });

      els.previewContainer.appendChild(main);
      els.previewContainer.appendChild(thumbs);
      state.carThumbs = thumbs;
      preview.updateCarouselMain(false);
    },

    async createPost(e) {
      e.preventDefault();

      const content = els.textarea.value.trim();
      if (!content && state.selectedFiles.length === 0) return;

      els.postBtn.disabled = true;
      els.postBtn.textContent = t("posting", "Posting...");

      const fd = new FormData();
      fd.append("content", content);
      fd.append("layout", state.previewMode);
      fd.append("disable_comments", document.getElementById("opt-disable-comments")?.checked ? "1" : "0");
      fd.append("is_ad", document.getElementById("opt-is-ad")?.checked ? "1" : "0");
      fd.append("visibility", document.getElementById("opt-visibility")?.value || "public");
      fd.append("location", document.getElementById("opt-location")?.value || "");

      state.selectedFiles.forEach((file) => fd.append("media", file));

      try {
        const res = await fetch("/posts/create/", {
          method: "POST",
          headers: {
            "X-CSRFToken": helpers.getCookie("csrftoken"),
          },
          body: fd,
        });

        const data = await res.json();
        if (!data.ok) throw new Error(data.error || t("postCreateFailed", "Post could not be created."));

        const feed = document.getElementById("feed");
        if (feed && data.html) {
          feed.insertAdjacentHTML("afterbegin", data.html);
          const firstPostRenderer = feed.querySelector(".post-media-renderer");
          if (firstPostRenderer) savedMedia.renderFromSources(firstPostRenderer);
        }

        els.textarea.value = "";
        preview.autosizeTextarea();
        state.selectedFiles.forEach(helpers.revokeObjectUrl);
        state.selectedFiles = [];
        preview.syncFileInput();
        preview.render();
        preview.updatePostButtonVisibility();
      } catch (err) {
        alert(err.message);
      } finally {
        els.postBtn.disabled = false;
        els.postBtn.textContent = t("post", "Post");
      }
    },
  };

  const postActions = {
    async toggleLike(btn) {
      if (btn.dataset.busy === "1") return;
      btn.dataset.busy = "1";

      const postId = btn.dataset.post;

      try {
        const res = await fetch(`/posts/${postId}/like/`, {
          method: "POST",
          headers: helpers.csrfHeaders(),
        });

        const data = await res.json();
        if (!data.ok) return;

        btn.classList.toggle("liked", data.liked);

        const icon = btn.querySelector(".like-icon");
        if (icon) {
          icon.src = data.liked
            ? "/static/icons/liked.svg"
            : "/static/icons/heart-circle-svgrepo-com.svg";
        }

        const countEl = btn.closest(".post-actions-left")?.querySelector(".like-count");
        if (countEl) {
          helpers.animateCountChange(countEl, data.likes_count);
          countEl.classList.toggle("is-empty", Number(data.likes_count) <= 0);
        }
      } catch (err) {
        console.error("Like toggle error:", err);
      } finally {
        delete btn.dataset.busy;
      }
    },

    openDeleteModal(postId) {
      if (!els.postDeleteModal) return;
      state.pendingDeletePostId = postId;
      els.postDeleteModal.classList.add("open");
      helpers.setBodyLocked(true);
    },

    closeDeleteModal() {
      if (!els.postDeleteModal) return;
      state.pendingDeletePostId = null;
      els.postDeleteModal.classList.remove("open");
      helpers.setBodyLocked(false);
    },

    openReportModal(postId) {
      if (!els.postReportModal) return;
      state.pendingReportPostId = postId;
      if (els.postReportText) els.postReportText.value = "";
      els.postReportModal.classList.add("open");
      helpers.setBodyLocked(true);
    },

    closeReportModal() {
      if (!els.postReportModal) return;
      state.pendingReportPostId = null;
      if (els.postReportText) els.postReportText.value = "";
      els.postReportModal.classList.remove("open");
      helpers.setBodyLocked(false);
    },

    async deleteConfirmed() {
      if (!state.pendingDeletePostId) return;

      const originalButtonText = els.postDeleteConfirm?.textContent || t("delete", "Delete");

      if (els.postDeleteConfirm) {
        els.postDeleteConfirm.disabled = true;
        els.postDeleteConfirm.textContent = t("deleting", "Deleting...");
      }

      try {
        const postId = state.pendingDeletePostId;

        const res = await fetch(`/posts/${postId}/delete/`, {
          method: "POST",
          headers: helpers.csrfHeaders(),
        });

        const data = await res.json();

        if (!res.ok || !data.ok) {
          throw new Error(data.error || t("deleteFailed", "Delete failed."));
        }

        document
          .querySelector(`.post-delete-btn[data-id="${postId}"]`)
          ?.closest(".post")
          ?.remove();

        postActions.closeDeleteModal();

        helpers.showToast(t("postDeleted", "Post deleted."), "success");
      } catch (err) {
        console.error("Delete post error:", err);

        helpers.showToast(
          err.message || t("deleteFailed", "Delete failed."),
          "error"
        );
      } finally {
        if (els.postDeleteConfirm) {
          els.postDeleteConfirm.disabled = false;
          els.postDeleteConfirm.textContent = originalButtonText;
        }
      }
    },

    async reportConfirmed() {
      if (!state.pendingReportPostId) return;

      const fd = new FormData();
      fd.append("reason", els.postReportText?.value?.trim() || "");

      const originalButtonText = els.postReportConfirm?.textContent || t("sendReport", "Send report");

      if (els.postReportConfirm) {
        els.postReportConfirm.disabled = true;
        els.postReportConfirm.textContent = t("sending", "Sending...");
      }

      try {
        const res = await fetch(`/posts/${state.pendingReportPostId}/report/`, {
          method: "POST",
          headers: helpers.csrfHeaders(),
          body: fd,
        });

        const data = await res.json();

        if (!res.ok || !data.ok) {
          throw new Error(data.error || t("reportFailed", "Report failed."));
        }

        postActions.closeReportModal();

        helpers.showToast(
          data.message || t("reportSent", "Report sent."),
          data.created === false ? "info" : "success"
        );
      } catch (err) {
        console.error("Report post error:", err);

        helpers.showToast(
          err.message || t("reportFailed", "Report failed."),
          "error"
        );
      } finally {
        if (els.postReportConfirm) {
          els.postReportConfirm.disabled = false;
          els.postReportConfirm.textContent = originalButtonText;
        }
      }
    },
  };

  const comments = {
    async openModal(commentBtn) {
      if (commentBtn.dataset.commentsDisabled === "1") return;

      const postId = commentBtn.dataset.post;
      const postEl = commentBtn.closest(".post");

      if (!postId || !postEl || !els.postModal || !els.postModalLeft || !els.modalCommentsList) {
        console.warn("Comment modal: missing required element");
        return;
      }

      state.currentPostId = postId;

      const clonedPost = postEl.cloneNode(true);
      clonedPost.querySelector(".post-actions")?.remove();

      els.postModalLeft.innerHTML = "";
      els.postModalLeft.appendChild(clonedPost);

      els.postModalLeft.querySelectorAll(".post-media-renderer").forEach(savedMedia.rehydrate);

      try {
        const res = await fetch(`/posts/${postId}/comments/`, {
          headers: helpers.ajaxHeaders(),
        });

        const data = await res.json();
        comments.refreshHtml(data.html || "");

        els.postModal.classList.add("open");
        helpers.setBodyLocked(true);
      } catch (err) {
        console.error("Open comments modal error:", err);
      }
    },

    closeModal() {
      if (!els.postModal) return;
      els.postModal.classList.remove("open");
      helpers.setBodyLocked(false);
      if (els.postModalLeft) els.postModalLeft.innerHTML = "";
      if (els.modalCommentsList) els.modalCommentsList.innerHTML = "";
      state.currentPostId = null;
    },

    refreshHtml(html) {
      if (!els.modalCommentsList) return;

      els.modalCommentsList.innerHTML = html || "";
      els.modalCommentsList.querySelectorAll(".like-count").forEach((el) => {
        const valueNode = el.querySelector(".count-value");
        const original = valueNode ? valueNode.textContent.trim() : el.textContent.trim();
        el.innerHTML = `<span class="count-value">${helpers.formatCount(original)}</span>`;
        el.title = original;
      });
    },

    updatePostCounter(newCount) {
      const originalPost = document
        .querySelector(`.comment-btn[data-post="${state.currentPostId}"]`)
        ?.closest(".post");

      const countEl = originalPost?.querySelector(".comment-count");
      if (!countEl) return;

      helpers.animateCountChange(countEl, newCount);
      countEl.title = String(newCount);
    },

    async submit(e) {
      e.preventDefault();

      if (!state.currentPostId || !els.modalCommentInput) return;

      const content = els.modalCommentInput.value.trim();
      if (!content) return;

      const fd = new FormData();
      fd.append("content", content);
      fd.append("parent_id", els.modalCommentInput.dataset.replyTo || "");

      try {
        const res = await fetch(`/posts/${state.currentPostId}/comment/`, {
          method: "POST",
          headers: helpers.csrfHeaders(),
          body: fd,
        });

        const data = await res.json();
        if (!data.ok) return;

        await comments.reloadCurrent();
        comments.updatePostCounter(data.comments_count);

        els.modalCommentInput.value = "";
        delete els.modalCommentInput.dataset.replyTo;
        els.modalCommentForm.innerHTML = `
          <input
            type="text"
            id="modal-comment-input"
            placeholder="${t("writeComment", "Write a comment...")}"
            autocomplete="off"
          >
          <button type="submit">${t("send", "Send")}</button>
        `;
      } catch (err) {
        console.error("Create comment error:", err);
      }
    },

    async reloadCurrent() {
      if (!state.currentPostId) return;

      const res = await fetch(`/posts/${state.currentPostId}/comments/`, {
        headers: helpers.ajaxHeaders(),
      });

      const data = await res.json();
      comments.refreshHtml(data.html || "");
    },

    async toggleLike(btn) {
      if (btn.dataset.busy === "1") return;
      btn.dataset.busy = "1";

      const id = btn.dataset.id;

      try {
        const res = await fetch(`/posts/comment/${id}/like/`, {
          method: "POST",
          headers: helpers.csrfHeaders(),
        });

        const data = await res.json();
        if (!data.ok) return;

        const countEl = btn.querySelector(".like-count");
        if (countEl) helpers.animateCountChange(countEl, data.count);

        const icon = btn.querySelector(".comment-like-icon");
        btn.classList.toggle("liked", data.liked);

        if (icon) {
          icon.src = data.liked
            ? "/static/icons/liked.svg"
            : "/static/icons/heart-circle-svgrepo-com.svg";

          icon.classList.toggle("pop-animate", data.liked);
          if (data.liked) {
            icon.classList.remove("pop-animate");
            void icon.offsetWidth;
            icon.classList.add("pop-animate");
          }
        }
      } catch (err) {
        console.error("Comment like error:", err);
      } finally {
        delete btn.dataset.busy;
      }
    },

    reply(btn) {
      if (!els.modalCommentInput) return;

      const username = btn.dataset.user;
      const commentId = btn.dataset.id;

      els.modalCommentInput.value = `@${username} `;
      els.modalCommentInput.focus();
      els.modalCommentInput.dataset.replyTo = commentId;
    },

    toggleReplies(btn) {
      const commentId = btn.dataset.commentId;
      const repliesBlock = document.querySelector(`.comment-replies[data-comment-id="${commentId}"]`);
      if (!repliesBlock) return;

      const isHidden = repliesBlock.hasAttribute("hidden");

      if (isHidden) {
        repliesBlock.removeAttribute("hidden");
        btn.textContent = t("hideReplies", "Hide replies");
      } else {
        repliesBlock.setAttribute("hidden", "");
        const count = repliesBlock.querySelectorAll(".comment-reply").length;
        btn.textContent = `${t("viewReplies", "View replies")} (${count})`;
      }
    },

    openEditModal(commentId, oldContent, contentEl) {
      if (!els.commentEditModal || !els.commentEditTextarea) return;

      state.editingCommentId = commentId;
      state.editingCommentContentEl = contentEl;
      els.commentEditTextarea.value = oldContent;

      els.commentEditModal.classList.add("open");
      helpers.setBodyLocked(true);

      setTimeout(() => {
        els.commentEditTextarea.focus();
        els.commentEditTextarea.setSelectionRange(
          els.commentEditTextarea.value.length,
          els.commentEditTextarea.value.length,
        );
      }, 10);
    },

    closeEditModal() {
      if (!els.commentEditModal) return;

      els.commentEditModal.classList.remove("open");
      helpers.setBodyLocked(false);
      state.editingCommentId = null;
      state.editingCommentContentEl = null;
      if (els.commentEditTextarea) els.commentEditTextarea.value = "";
    },

    async saveEdit() {
      if (!state.editingCommentId || !state.editingCommentContentEl || !els.commentEditTextarea) return;

      const trimmed = els.commentEditTextarea.value.trim();
      const oldContent = state.editingCommentContentEl.textContent.trim();

      if (!trimmed || trimmed === oldContent) {
        comments.closeEditModal();
        return;
      }

      const fd = new FormData();
      fd.append("content", trimmed);

      try {
        const res = await fetch(`/posts/comment/${state.editingCommentId}/edit/`, {
          method: "POST",
          headers: helpers.csrfHeaders(),
          body: fd,
        });

        const data = await res.json();
        if (!data.ok) return;

        state.editingCommentContentEl.textContent = data.content;
        comments.closeEditModal();
      } catch (err) {
        console.error("Edit comment error:", err);
      }
    },

    openDeleteModal(commentId) {
      if (!els.commentDeleteModal) return;
      state.pendingDeleteCommentId = commentId;
      els.commentDeleteModal.classList.add("open");
      helpers.setBodyLocked(true);
    },

    closeDeleteModal() {
      if (!els.commentDeleteModal) return;
      state.pendingDeleteCommentId = null;
      els.commentDeleteModal.classList.remove("open");
      helpers.setBodyLocked(false);
    },

    async deleteConfirmed() {
      if (!state.pendingDeleteCommentId) return;

      try {
        const res = await fetch(`/posts/comment/${state.pendingDeleteCommentId}/delete/`, {
          method: "POST",
          headers: helpers.csrfHeaders(),
        });

        const data = await res.json();
        if (!data.ok) return;

        await comments.reloadCurrent();
        comments.updatePostCounter(data.comments_count);
        comments.closeDeleteModal();
      } catch (err) {
        console.error("Delete comment error:", err);
      }
    },

    openReportModal(commentId) {
      if (!els.commentReportModal) return;
      state.pendingReportCommentId = commentId;
      if (els.commentReportText) els.commentReportText.value = "";
      els.commentReportModal.classList.add("open");
      helpers.setBodyLocked(true);
    },

    closeReportModal() {
      if (!els.commentReportModal) return;
      state.pendingReportCommentId = null;
      if (els.commentReportText) els.commentReportText.value = "";
      els.commentReportModal.classList.remove("open");
      helpers.setBodyLocked(false);
    },

    async reportConfirmed() {
      if (!state.pendingReportCommentId) return;

      const fd = new FormData();
      fd.append("reason", els.commentReportText?.value?.trim() || "");

      const originalButtonText = els.commentReportConfirm?.textContent || t("sendReport", "Send report");

      if (els.commentReportConfirm) {
        els.commentReportConfirm.disabled = true;
        els.commentReportConfirm.textContent = t("sending", "Sending...");
      }

      try {
        const res = await fetch(`/posts/comment/${state.pendingReportCommentId}/report/`, {
          method: "POST",
          headers: helpers.csrfHeaders(),
          body: fd,
        });

        const data = await res.json();

        if (!res.ok || !data.ok) {
          throw new Error(data.error || t("reportFailed", "Report failed."));
        }

        comments.closeReportModal();

        helpers.showToast(
          data.message || t("reportSent", "Report sent."),
          data.created === false ? "info" : "success"
        );
      } catch (err) {
        console.error("Report comment error:", err);

        helpers.showToast(
          err.message || t("reportFailed", "Report failed."),
          "error"
        );
      } finally {
        if (els.commentReportConfirm) {
          els.commentReportConfirm.disabled = false;
          els.commentReportConfirm.textContent = originalButtonText;
        }
      }
    }
  };

  function initCounters() {
    document.querySelectorAll(".like-count, .comment-count").forEach((el) => {
      const original = el.textContent.trim();
      el.innerHTML = `<span class="count-value">${helpers.formatCount(original)}</span>`;
      el.title = original;
    });
  }

  function initLightboxEvents() {
    els.lbClose?.addEventListener("click", lightbox.close);
    els.lbPrev?.addEventListener("click", () => lightbox.go(-1));
    els.lbNext?.addEventListener("click", () => lightbox.go(1));

    els.lightbox?.addEventListener("click", (e) => {
      if (e.target === els.lightbox) lightbox.close();
    });

    document.addEventListener("keydown", (e) => {
      const isLightboxOpen = els.lightbox?.classList.contains("open");

      if (isLightboxOpen) {
        if (e.key === "Escape") lightbox.close();
        if (e.key === "ArrowLeft") lightbox.go(-1);
        if (e.key === "ArrowRight") lightbox.go(1);
        return;
      }

      if (state.previewMode !== "carousel" || !state.selectedFiles.length) return;

      if (e.key === "ArrowLeft") preview.setCarouselIndex(state.carouselIndex - 1);
      if (e.key === "ArrowRight") preview.setCarouselIndex(state.carouselIndex + 1);
    });
  }

  function initPostEvents() {
    function openShareSoonModal() {
      if (!els.shareSoonModal) return;

      els.shareSoonModal.classList.add("open");
      els.shareSoonModal.setAttribute("aria-hidden", "false");
      helpers.setBodyLocked(true);
    }

    function closeShareSoonModal() {
      if (!els.shareSoonModal) return;

      els.shareSoonModal.classList.remove("open");
      els.shareSoonModal.setAttribute("aria-hidden", "true");
      helpers.setBodyLocked(false);
    }

    els.shareSoonClose?.addEventListener("click", closeShareSoonModal);
    els.shareSoonOk?.addEventListener("click", closeShareSoonModal);
    els.shareSoonModal?.addEventListener("click", (e) => {
      if (e.target === els.shareSoonModal) closeShareSoonModal();
    });

    document.addEventListener("click", async (e) => {
      const likeBtn = e.target.closest(".like-btn");
      if (likeBtn) {
        e.preventDefault();
        await postActions.toggleLike(likeBtn);
        return;
      }

      const bookmarkBtn = e.target.closest(".bookmark-btn");
      if (bookmarkBtn) {
        e.preventDefault();

        if (bookmarkBtn.dataset.busy === "1") return;
        bookmarkBtn.dataset.busy = "1";

        const postId = bookmarkBtn.dataset.post;

        try {
          const res = await fetch(`/posts/${postId}/bookmark/`, {
            method: "POST",
            headers: helpers.csrfHeaders(),
          });

          const data = await res.json();
          if (!data.ok) return;

          bookmarkBtn.classList.toggle("bookmarked", data.bookmarked);
        } catch (err) {
          console.error("Bookmark toggle error:", err);
        } finally {
          delete bookmarkBtn.dataset.busy;
        }

        return;
      }

      const shareBtn = e.target.closest(".share-btn");
      if (shareBtn) {
        e.preventDefault();
        openShareSoonModal();
        return;
      }

      const menuBtn = e.target.closest(".post-menu-btn");
      const clickedInsideMenu = e.target.closest(".post-menu");

      if (menuBtn) {
        e.preventDefault();
        e.stopPropagation();

        const menu = menuBtn.nextElementSibling;
        const isOpen = menu?.classList.contains("open");

        helpers.closeMenus(".post-menu.open");
        if (menu && !isOpen) menu.classList.add("open");
        return;
      }

      if (!clickedInsideMenu) helpers.closeMenus(".post-menu.open");

      const deleteBtn = e.target.closest(".post-delete-btn");
      if (deleteBtn) {
        e.preventDefault();
        helpers.closeMenus(".post-menu.open");
        const postId = deleteBtn.dataset.id;
        if (postId) postActions.openDeleteModal(postId);
        return;
      }

      const reportBtn = e.target.closest(".post-report-btn");
      if (reportBtn) {
        e.preventDefault();
        helpers.closeMenus(".post-menu.open");
        const postId = reportBtn.dataset.id;
        if (postId) postActions.openReportModal(postId);
      }
    });

    els.postDeleteCancel?.addEventListener("click", postActions.closeDeleteModal);
    els.postDeleteModalClose?.addEventListener("click", postActions.closeDeleteModal);
    els.postDeleteConfirm?.addEventListener("click", postActions.deleteConfirmed);
    els.postDeleteModal?.addEventListener("click", (e) => {
      if (e.target === els.postDeleteModal) postActions.closeDeleteModal();
    });

    els.postReportCancel?.addEventListener("click", postActions.closeReportModal);
    els.postReportModalClose?.addEventListener("click", postActions.closeReportModal);
    els.postReportConfirm?.addEventListener("click", postActions.reportConfirmed);
    els.postReportModal?.addEventListener("click", (e) => {
      if (e.target === els.postReportModal) postActions.closeReportModal();
    });
  }

  function initCommentEvents() {
    async function openPostModalFromPost(postEl, postId, options = {}) {
      const keepActions = options.keepActions === true;

      if (!postId || !postEl || !els.postModal || !els.postModalLeft || !els.modalCommentsList) {
        console.warn("Post modal: missing required element");
        return;
      }

      state.currentPostId = postId;

      const commentsDisabled =
        postEl.querySelector(".comment-btn")?.dataset.commentsDisabled === "1";

      const clonedPost = postEl.cloneNode(true);

      if (!keepActions) {
        clonedPost.querySelector(".post-actions")?.remove();
      } else {
        const clonedActions = clonedPost.querySelector(".post-actions");
        const clonedBubble = clonedPost.querySelector(".message-bubble");

        if (clonedActions && clonedBubble) {
          clonedActions.classList.add("post-actions-in-modal");
          clonedBubble.appendChild(clonedActions);
        }
      }

      els.postModalLeft.innerHTML = "";
      els.postModalLeft.appendChild(clonedPost);

      els.postModalLeft.querySelectorAll(".post-media-renderer").forEach((container) => {
        savedMedia.rehydrate(container);
      });

      try {
        const res = await fetch(`/posts/${postId}/comments/`, {
          headers: helpers.ajaxHeaders(),
        });

        const data = await res.json();
        comments.refreshHtml(data.html || "");

        if (els.modalCommentForm) {
          if (commentsDisabled) {
            els.modalCommentForm.classList.add("is-disabled");
            els.modalCommentForm.innerHTML = `
              <div class="modal-comments-disabled">
                ${t("commentsDisabled", "Comments are disabled for this post.")}
              </div>
            `;
          } else {
            els.modalCommentForm.classList.remove("is-disabled");
            els.modalCommentForm.innerHTML = `
              <input
                type="text"
                id="modal-comment-input"
                placeholder="${t("writeComment", "Write a comment...")}"
                autocomplete="off"
              >
              <button type="submit">${t("send", "Send")}</button>
            `;

            els.modalCommentInput = document.getElementById("modal-comment-input");
          }
        }

        els.postModal.classList.add("open");
        helpers.setBodyLocked(true);
      } catch (err) {
        console.error("Open post modal error:", err);
      }
    }

    document.addEventListener("click", async function (e) {
      const commentBtn = e.target.closest(".comment-btn");
      if (!commentBtn) return;

      e.preventDefault();

      if (commentBtn.dataset.commentsDisabled === "1") return;

      const postId = commentBtn.dataset.post;
      const postEl = commentBtn.closest(".post");

      await openPostModalFromPost(postEl, postId, { keepActions: false });
    });

    document.addEventListener("click", async function (e) {
      const profilePostCard = e.target.closest(".profile-post-card");
      if (!profilePostCard) return;

      e.preventDefault();

      const postId = profilePostCard.dataset.postId;
      if (!postId) return;

      const hiddenPost = document.querySelector(
        `.profile-hidden-posts .post[data-post-id="${postId}"]`
      );

      if (!hiddenPost) {
        console.warn("Profile post: hidden full post not found", postId);
        return;
      }

      await openPostModalFromPost(hiddenPost, postId, { keepActions: true });
    });

    els.postModalClose?.addEventListener("click", comments.closeModal);
    els.postModal?.addEventListener("click", (e) => {
      if (e.target === els.postModal) comments.closeModal();
    });

    els.modalCommentForm?.addEventListener("submit", comments.submit);
    els.modalCommentsList?.addEventListener("click", async (e) => {
    const likeBtn = e.target.closest(".comment-like-btn");
    if (likeBtn) {
      e.preventDefault();
      e.stopPropagation();
      await comments.toggleLike(likeBtn);
      return;
    }

    const replyBtn = e.target.closest(".comment-reply-btn");
    if (replyBtn) {
      e.preventDefault();
      e.stopPropagation();
      comments.reply(replyBtn);
      return;
    }

    const toggleRepliesBtn = e.target.closest(".comment-toggle-replies");
    if (toggleRepliesBtn) {
      e.preventDefault();
      e.stopPropagation();
      comments.toggleReplies(toggleRepliesBtn);
      return;
    }

    const menuBtn = e.target.closest(".comment-menu-btn");
    if (menuBtn) {
      e.preventDefault();
      e.stopPropagation();

      const wrapper = menuBtn.closest(".comment-menu-wrapper");
      if (!wrapper) return;

      document.querySelectorAll(".comment-menu-wrapper.open").forEach((item) => {
        if (item !== wrapper) item.classList.remove("open");
      });

      wrapper.classList.toggle("open");
      return;
    }

    const editBtn = e.target.closest(".comment-edit-btn");
    if (editBtn) {
      e.preventDefault();
      e.stopPropagation();

      const commentId = editBtn.dataset.id;
      const commentItem = editBtn.closest(".comment-item");
      const contentEl = commentItem?.querySelector(".comment-content");

      if (!commentId || !contentEl) return;

      helpers.closeMenus(".comment-menu-wrapper.open");

      const oldContent = contentEl.textContent.trim();

      if (els.commentEditModal && els.commentEditTextarea) {
        comments.openEditModal(commentId, oldContent, contentEl);
        return;
      }

      const newContent = prompt(t("editCommentPrompt", "Edit comment:"), oldContent);
      if (!newContent || !newContent.trim() || newContent.trim() === oldContent) return;

      const fd = new FormData();
      fd.append("content", newContent.trim());

      try {
        const res = await fetch(`/posts/comment/${commentId}/edit/`, {
          method: "POST",
          headers: helpers.csrfHeaders(),
          body: fd,
        });

        const data = await res.json();
        if (!data.ok) return;

        contentEl.textContent = data.content;
      } catch (err) {
        console.error("Inline edit comment error:", err);
      }

      return;
    }

    const deleteBtn = e.target.closest(".comment-delete-btn");
    if (deleteBtn) {
      e.preventDefault();
      e.stopPropagation();

      const commentId = deleteBtn.dataset.id;
      if (!commentId) return;

      helpers.closeMenus(".comment-menu-wrapper.open");

      if (els.commentDeleteModal) {
        comments.openDeleteModal(commentId);
        return;
      }

      if (!confirm(t("deleteCommentConfirm", "Delete this comment?"))) return;

      try {
        const res = await fetch(`/posts/comment/${commentId}/delete/`, {
          method: "POST",
          headers: helpers.csrfHeaders(),
        });

        const data = await res.json();
        if (!data.ok) return;

        await comments.reloadCurrent();
        comments.updatePostCounter(data.comments_count);
      } catch (err) {
        console.error("Delete comment error:", err);
      }

      return;
    }

    const reportBtn = e.target.closest(".comment-report-btn");
    if (reportBtn) {
      e.preventDefault();
      e.stopPropagation();

      const commentId = reportBtn.dataset.id;
      if (!commentId) return;

      helpers.closeMenus(".comment-menu-wrapper.open");

      if (els.commentReportModal) {
        comments.openReportModal(commentId);
        return;
      }

      try {
        const res = await fetch(`/posts/comment/${commentId}/report/`, {
          method: "POST",
          headers: helpers.csrfHeaders(),
        });

        const data = await res.json();
        alert(data.message || t("reportSent", "Report sent."));
      } catch (err) {
        console.error("Report comment error:", err);
      }

      return;
    }
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".comment-menu-wrapper")) {
      helpers.closeMenus(".comment-menu-wrapper.open");
    }
  });

    els.commentEditSave?.addEventListener("click", comments.saveEdit);
    els.commentEditCancel?.addEventListener("click", comments.closeEditModal);
    els.commentEditModalClose?.addEventListener("click", comments.closeEditModal);
    els.commentEditModal?.addEventListener("click", (e) => {
      if (e.target === els.commentEditModal) comments.closeEditModal();
    });

    els.commentDeleteCancel?.addEventListener("click", comments.closeDeleteModal);
    els.commentDeleteModalClose?.addEventListener("click", comments.closeDeleteModal);
    els.commentDeleteConfirm?.addEventListener("click", comments.deleteConfirmed);
    els.commentDeleteModal?.addEventListener("click", (e) => {
      if (e.target === els.commentDeleteModal) comments.closeDeleteModal();
    });

    els.commentReportCancel?.addEventListener("click", comments.closeReportModal);
    els.commentReportModalClose?.addEventListener("click", comments.closeReportModal);
    els.commentReportConfirm?.addEventListener("click", comments.reportConfirmed);
    els.commentReportModal?.addEventListener("click", (e) => {
      if (e.target === els.commentReportModal) comments.closeReportModal();
    });
  }

  initCounters();
  initLightboxEvents();
  savedMedia.initAll();
  initPostEvents();
  initCommentEvents();
  preview.init();
});
