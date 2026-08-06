(() => {
  "use strict";

  const language = (document.documentElement.lang || "en").split("-")[0];
  const locale = ["en", "fr", "ru"].includes(language) ? language : "en";
  const text = {
    en: {
      guestPrompt: "Log in or create an account to keep this result.",
      login: "Log in",
      signup: "Create account",
      savedTitle: "Your saved references",
      savedSubtitle: "Tattoo ideas you bookmarked while discovering your style.",
      savedEmpty: "You did not save any references during this Style Match.",
      savedOpen: "Open saved tattoo reference",
      mapEyebrow: "Tatzo Style Match",
      mapTitle: "Not sure which style fits you?",
      mapText: "Discover your tattoo taste before choosing filters or an artist.",
      mapAction: "Find my style",
    },
    fr: {
      guestPrompt: "Connectez-vous ou créez un compte pour conserver ce résultat.",
      login: "Se connecter",
      signup: "Créer un compte",
      savedTitle: "Vos références enregistrées",
      savedSubtitle: "Les idées de tatouage ajoutées pendant la découverte de votre style.",
      savedEmpty: "Vous n’avez enregistré aucune référence pendant ce Style Match.",
      savedOpen: "Ouvrir la référence de tatouage enregistrée",
      mapEyebrow: "Tatzo Style Match",
      mapTitle: "Vous ne connaissez pas encore votre style ?",
      mapText: "Découvrez vos goûts avant de choisir des filtres ou un artiste.",
      mapAction: "Découvrir mon style",
    },
    ru: {
      guestPrompt: "Чтобы сохранить результат, войдите или зарегистрируйтесь.",
      login: "Войти",
      signup: "Регистрация",
      savedTitle: "Сохранённые референсы",
      savedSubtitle: "Идеи татуировок, которые вы отметили во время подбора стиля.",
      savedEmpty: "Во время этого Style Match вы не сохранили ни одного референса.",
      savedOpen: "Открыть сохранённый референс",
      mapEyebrow: "Tatzo Style Match",
      mapTitle: "Ещё не знаете свой стиль?",
      mapText: "Узнайте себя лучше прямо сейчас — до выбора фильтров и мастера.",
      mapAction: "Узнать свой стиль",
    },
  }[locale];

  document.querySelectorAll('a[href^="/style-match/"]').forEach((link) => {
    link.addEventListener("click", () => {
      document.cookie = `django_language=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
    });
  });

  function injectMapStyleMatchCta() {
    const filterPanel = document.querySelector(".maps-filter-panel");
    if (!filterPanel || document.querySelector(".maps-style-match-cta")) return;

    const cta = document.createElement("a");
    cta.className = "maps-style-match-cta";
    cta.href = "/style-match/";
    cta.innerHTML = `
      <span class="maps-style-match-visual" aria-hidden="true">
        <i></i><i></i><b>✦</b>
      </span>
      <span class="maps-style-match-copy">
        <small>${text.mapEyebrow}</small>
        <strong>${text.mapTitle}</strong>
        <span>${text.mapText}</span>
      </span>
      <span class="maps-style-match-action">${text.mapAction}<b aria-hidden="true">→</b></span>`;
    filterPanel.before(cta);
  }

  injectMapStyleMatchCta();

  const app = document.getElementById("style-match-app");
  if (!app) return;

  const $ = (selector) => app.querySelector(selector);
  const nativeFetch = window.fetch.bind(window);

  const actionIcons = {
    "sm-reject": '<svg class="sm-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    "sm-save": '<svg class="sm-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 4.5h11v15l-5.5-3.4-5.5 3.4z"/></svg>',
    "sm-like": '<svg class="sm-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 8.8c0 5.1-8.5 10.2-8.5 10.2S3.5 13.9 3.5 8.8A4.3 4.3 0 0 1 12 7.7a4.3 4.3 0 0 1 8.5 1.1z"/></svg>',
    "sm-favorite": '<svg class="sm-action-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
  };

  function replaceBrandingAndIcons() {
    app.querySelectorAll(".sm-wordmark").forEach((wordmark) => {
      if (wordmark.querySelector(".sm-official-logo")) return;
      wordmark.replaceChildren();
      const image = document.createElement("img");
      image.src = "/static/images/tatzo7.png";
      image.alt = "Tatzo";
      image.className = "sm-official-logo";
      wordmark.appendChild(image);
    });

    Object.entries(actionIcons).forEach(([id, markup]) => {
      const button = $(`#${id}`);
      if (!button || button.dataset.smIconReady === "true") return;
      button.innerHTML = markup;
      button.dataset.smIconReady = "true";
    });
  }

  function showResults() {
    ["onboarding", "discovery", "analysis"].forEach((name) => {
      const screen = $(`#sm-${name}`);
      if (screen) {
        screen.hidden = true;
        screen.classList.remove("sm-screen-active");
      }
    });
    const results = $("#sm-results");
    results.hidden = false;
    results.classList.add("sm-screen-active");
  }

  function appendList(target, values) {
    if (!target) return;
    target.replaceChildren();
    (values || []).forEach((value) => {
      const item = document.createElement("li");
      item.textContent = value;
      target.appendChild(item);
    });
  }

  function savedReferencesPanel() {
    let panel = $("#sm-saved-references");
    if (panel) return panel;

    panel = document.createElement("section");
    panel.id = "sm-saved-references";
    panel.className = "sm-panel sm-saved-references";
    panel.innerHTML = `
      <div class="sm-saved-references-head">
        <div>
          <h2>${text.savedTitle}</h2>
          <p>${text.savedSubtitle}</p>
        </div>
        <span class="sm-saved-references-count">0</span>
      </div>
      <div class="sm-saved-references-grid" aria-live="polite"></div>`;

    const personality = $(".sm-personality-card");
    if (personality) personality.after(panel);
    else app.querySelector(".sm-results-column")?.prepend(panel);
    return panel;
  }

  async function renderSavedReferences(result) {
    if (!result?.session_id) return;
    const panel = savedReferencesPanel();
    const grid = panel.querySelector(".sm-saved-references-grid");
    const count = panel.querySelector(".sm-saved-references-count");
    grid.innerHTML = '<span class="sm-saved-references-loading" aria-hidden="true"></span>';

    try {
      const response = await nativeFetch(`/style-match/session/${result.session_id}/saved/`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("saved references unavailable");
      const payload = await response.json();
      const cards = payload.cards || [];
      count.textContent = String(cards.length);
      grid.replaceChildren();

      if (!cards.length) {
        const empty = document.createElement("p");
        empty.className = "sm-saved-references-empty";
        empty.textContent = text.savedEmpty;
        grid.appendChild(empty);
        return;
      }

      cards.forEach((card) => {
        const link = document.createElement("a");
        link.className = "sm-saved-reference";
        link.href = card.image_url;
        link.target = "_blank";
        link.rel = "noopener";
        link.setAttribute("aria-label", `${text.savedOpen} ${card.card_id}`);

        const image = document.createElement("img");
        image.src = card.image_url;
        image.alt = card.alt || card.card_id;
        image.loading = "lazy";

        const badge = document.createElement("span");
        badge.innerHTML = actionIcons["sm-save"];
        link.append(image, badge);
        grid.appendChild(link);
      });
    } catch (_error) {
      panel.remove();
    }
  }

  function renderResult(result) {
    const top = result.top_style || { label: "" };
    $("#sm-match-number").textContent = `${result.match_confidence}%`;
    $("#sm-results-title").textContent = top.label;
    $(".sm-result-hero").dataset.score = result.match_confidence;
    const spectrum = $("#sm-style-spectrum");
    spectrum.replaceChildren();
    (result.styles || []).forEach((style) => {
      const row = document.createElement("div");
      row.className = "sm-style-row";
      row.innerHTML = '<div class="sm-style-label"><span></span><strong></strong></div><div class="sm-style-bar"><span></span></div>';
      row.querySelector(".sm-style-label span").textContent = style.label;
      row.querySelector(".sm-style-label strong").textContent = `${style.score}%`;
      spectrum.appendChild(row);
      requestAnimationFrame(() => {
        row.querySelector(".sm-style-bar span").style.width = `${style.score}%`;
      });
    });
    $("#sm-personality-title").textContent = result.personality?.label || "";
    $("#sm-personality-description").textContent = result.personality?.description || "";
    appendList($("#sm-drawn-to"), result.drawn_to);
    appendList($("#sm-skip"), result.tend_to_skip);
    $("#sm-community-copy").textContent = `${result.community_count || 1} ${result.personality?.label || ""}`;
    $("#sm-saved-count").textContent = `${result.saved_count} ${app.dataset.i18nSavedCount || ""}`;
    $("#sm-wrapped-style").textContent = top.label;
    $("#sm-wrapped-count").textContent = result.completed_count;
    $("#sm-wrapped-personality").textContent = result.personality?.label || "";
  }

  function addGuestCta(metadata) {
    if (metadata.authenticated || $("#sm-auth-cta")) return;
    const panel = document.createElement("section");
    panel.id = "sm-auth-cta";
    panel.className = "sm-auth-cta";
    panel.innerHTML = `
      <strong>${text.guestPrompt}</strong>
      <div>
        <a class="sm-secondary-button" href="${metadata.login_url}">${text.login}</a>
        <a class="sm-primary-button sm-home-button" href="${metadata.signup_url}">${text.signup}</a>
      </div>`;
    $(".sm-result-actions").before(panel);
  }

  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    const rawUrl = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
    if (response.ok && /\/style-match\/session\/[0-9a-f-]+\/result\/?(?:\?|$)/i.test(rawUrl)) {
      response.clone().json().then(renderSavedReferences).catch(() => {});
    }
    return response;
  };

  async function restore() {
    try {
      const metaResponse = await nativeFetch("/style-match/latest/", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!metaResponse.ok) return;
      const metadata = await metaResponse.json();
      addGuestCta(metadata);
      if (!metadata.authenticated || !metadata.has_result) return;
      const resultResponse = await nativeFetch(metadata.result_url, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!resultResponse.ok) return;
      const result = await resultResponse.json();
      renderResult(result);
      renderSavedReferences(result);
      showResults();
    } catch (_error) {
      // The original Style Match flow stays available when restoration fails.
    }
  }

  replaceBrandingAndIcons();
  restore();
  new MutationObserver(replaceBrandingAndIcons).observe(app, {
    childList: true,
    subtree: true,
  });
})();
