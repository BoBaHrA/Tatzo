(function () {
  "use strict";

  const DEFAULT_OPTIONS = {
    maxWidthOrHeight: 1800,
    maxSizeMB: 1.6,
    hardLimitMB: 9.5,
    initialQuality: 0.82,
    minQuality: 0.58,
    outputType: "image/jpeg",
  };

  function bytesToMB(bytes) {
    return bytes / (1024 * 1024);
  }

  function formatMB(bytes) {
    return `${bytesToMB(bytes).toFixed(1)} MB`;
  }

  function isCompressibleImage(file) {
    if (!file || !file.type) return false;

    if (!file.type.startsWith("image/")) return false;

    // GIF лучше не трогать, иначе убьём анимацию.
    if (file.type === "image/gif") return false;

    // SVG тоже не трогаем.
    if (file.type === "image/svg+xml") return false;

    return true;
  }

  function makeCompressedName(file, outputType) {
    const baseName = (file.name || "image").replace(/\.[^/.]+$/, "");
    const extension = outputType === "image/webp" ? "webp" : "jpg";
    return `${baseName}-compressed.${extension}`;
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();

      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Image could not be loaded for compression."));
      };

      img.src = url;
    });
  }

  function getTargetSize(width, height, maxWidthOrHeight) {
    const maxSide = Math.max(width, height);

    if (maxSide <= maxWidthOrHeight) {
      return { width, height };
    }

    const ratio = maxWidthOrHeight / maxSide;

    return {
      width: Math.max(1, Math.round(width * ratio)),
      height: Math.max(1, Math.round(height * ratio)),
    };
  }

  function drawToCanvas(image, width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");

    // JPEG не поддерживает прозрачность. Белый фон лучше, чем чёрные артефакты.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    ctx.drawImage(image, 0, 0, width, height);

    return canvas;
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Image compression failed."));
          }
        },
        type,
        quality
      );
    });
  }

  async function compressImage(file, options = {}) {
    const config = {
      ...DEFAULT_OPTIONS,
      ...options,
    };

    if (!isCompressibleImage(file)) {
      return {
        file,
        compressed: false,
        skipped: true,
        originalSize: file.size,
        compressedSize: file.size,
      };
    }

    const maxSizeBytes = config.maxSizeMB * 1024 * 1024;

    const image = await loadImage(file);
    let target = getTargetSize(
      image.naturalWidth || image.width,
      image.naturalHeight || image.height,
      config.maxWidthOrHeight
    );

    const alreadySmallEnough =
      file.size <= maxSizeBytes &&
      Math.max(target.width, target.height) <= config.maxWidthOrHeight;

    if (alreadySmallEnough) {
      return {
        file,
        compressed: false,
        skipped: true,
        originalSize: file.size,
        compressedSize: file.size,
      };
    }

    let canvas = drawToCanvas(image, target.width, target.height);
    let quality = config.initialQuality;
    let blob = await canvasToBlob(canvas, config.outputType, quality);

    while (blob.size > maxSizeBytes && quality > config.minQuality) {
      quality = Math.max(config.minQuality, quality - 0.06);
      blob = await canvasToBlob(canvas, config.outputType, quality);
    }

    let resizeAttempts = 0;

    while (blob.size > maxSizeBytes && resizeAttempts < 4) {
      target = {
        width: Math.max(900, Math.round(target.width * 0.86)),
        height: Math.max(900, Math.round(target.height * 0.86)),
      };

      canvas = drawToCanvas(image, target.width, target.height);
      blob = await canvasToBlob(canvas, config.outputType, config.minQuality);
      resizeAttempts += 1;
    }

    if (!blob || blob.size >= file.size) {
      return {
        file,
        compressed: false,
        skipped: true,
        originalSize: file.size,
        compressedSize: file.size,
      };
    }

    const compressedFile = new File(
      [blob],
      makeCompressedName(file, config.outputType),
      {
        type: config.outputType,
        lastModified: Date.now(),
      }
    );

    return {
      file: compressedFile,
      compressed: true,
      skipped: false,
      originalSize: file.size,
      compressedSize: compressedFile.size,
    };
  }

  window.TatzoImageCompression = {
    compressImage,
    formatMB,
    isCompressibleImage,
  };
})();