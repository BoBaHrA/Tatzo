document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("search-discovery-form");
  if (!form) return;

  const panel = document.getElementById("search-filter-panel");
  const backdrop = document.getElementById("search-filter-backdrop");
  const openButton = document.getElementById("search-mobile-filter-trigger");
  const closeButton = document.getElementById("search-filter-close");
  const geoButtons = Array.from(document.querySelectorAll("[data-search-geolocate]"));
  const feedback = document.getElementById("search-location-feedback");
  const latInput = document.getElementById("search-lat");
  const lngInput = document.getElementById("search-lng");
  const mobileMedia = window.matchMedia("(max-width: 900px)");

  const submit = () => {
    if (typeof form.requestSubmit === "function") {
      form.requestSubmit();
    } else {
      form.submit();
    }
  };

  const closeFilters = () => {
    if (!panel) return;
    panel.classList.remove("is-open");
    backdrop?.classList.remove("is-open");
    document.body.classList.remove("search-filters-open");
    openButton?.setAttribute("aria-expanded", "false");
  };

  const openFilters = () => {
    if (!panel) return;
    panel.classList.add("is-open");
    backdrop?.classList.add("is-open");
    document.body.classList.add("search-filters-open");
    openButton?.setAttribute("aria-expanded", "true");
    closeButton?.focus();
  };

  openButton?.setAttribute("aria-expanded", "false");
  openButton?.addEventListener("click", openFilters);
  closeButton?.addEventListener("click", closeFilters);
  backdrop?.addEventListener("click", closeFilters);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && panel?.classList.contains("is-open")) {
      closeFilters();
    }
  });

  if (typeof mobileMedia.addEventListener === "function") {
    mobileMedia.addEventListener("change", (event) => {
      if (!event.matches) closeFilters();
    });
  }

  // Desktop filters are intentionally instant. On mobile users can make several
  // choices first and apply them with the button at the bottom of the sheet.
  form.querySelectorAll(
    '#search-filter-panel input[type="checkbox"], ' +
    '#search-filter-panel input[type="radio"], ' +
    '#search-sort'
  ).forEach((control) => {
    control.addEventListener("change", () => {
      if (!mobileMedia.matches || control.id === "search-sort") {
        submit();
      }
    });
  });

  const locationInput = document.getElementById("search-location");
  locationInput?.addEventListener("change", () => {
    // A typed city/country replaces a previous browser-origin search. Keeping
    // both would silently intersect two unrelated locations.
    if (locationInput.value.trim() && latInput && lngInput) {
      latInput.value = "";
      lngInput.value = "";
    }
    if (!mobileMedia.matches) submit();
  });

  document.querySelectorAll("[data-search-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const name = button.dataset.searchToggle;
      const value = button.dataset.searchValue || "1";
      let target = null;

      if (name === "style") {
        target = Array.from(form.querySelectorAll('input[name="style"]')).find(
          (input) => input.value === value
        );
      } else {
        target = form.querySelector(`input[name="${name}"]`);
      }

      if (!target) return;

      if (target.type === "checkbox") {
        target.checked = !target.checked;
      } else {
        target.value = value;
      }
      submit();
    });
  });

  const setFeedback = (message, error = false) => {
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.toggle("is-error", error);
    feedback.hidden = !message;
  };

  const copy = (en, fr, ru) => {
    const lang = (document.documentElement.lang || "en").toLowerCase();
    if (lang.startsWith("fr")) return fr;
    if (lang.startsWith("ru")) return ru;
    return en;
  };

  const setGeoLoading = (loading) => {
    geoButtons.forEach((button) => {
      button.disabled = loading;
      button.classList.toggle("is-loading", loading);
    });
  };

  const locate = (sourceButton) => {
    const isQuickToggle =
      sourceButton?.classList.contains("search-quick-chip") &&
      sourceButton?.classList.contains("active");

    if (isQuickToggle && latInput && lngInput) {
      latInput.value = "";
      lngInput.value = "";
      submit();
      return;
    }

    if (!navigator.geolocation) {
      setFeedback(
        copy(
          "Geolocation is not available in this browser.",
          "La géolocalisation n’est pas disponible dans ce navigateur.",
          "Геолокация недоступна в этом браузере."
        ),
        true
      );
      return;
    }

    setGeoLoading(true);
    setFeedback(
      copy(
        "Finding your location…",
        "Recherche de votre position…",
        "Определяем ваше местоположение…"
      )
    );

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (latInput && lngInput) {
          latInput.value = position.coords.latitude.toFixed(6);
          lngInput.value = position.coords.longitude.toFixed(6);
        }
        if (locationInput) {
          locationInput.value = "";
        }
        setFeedback("");
        submit();
      },
      () => {
        setGeoLoading(false);
        setFeedback(
          copy(
            "We could not access your location. Check the browser permission.",
            "Impossible d’accéder à votre position. Vérifiez l’autorisation du navigateur.",
            "Не удалось получить местоположение. Проверьте разрешение браузера."
          ),
          true
        );
      },
      {
        enableHighAccuracy: false,
        timeout: 9000,
        maximumAge: 5 * 60 * 1000,
      }
    );
  };

  geoButtons.forEach((button) => {
    button.addEventListener("click", () => locate(button));
  });
});
