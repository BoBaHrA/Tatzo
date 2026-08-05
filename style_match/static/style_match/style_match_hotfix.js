(() => {
  "use strict";

  const currentLanguage = (document.documentElement.lang || "").split("-")[0];
  if (["en", "fr", "ru"].includes(currentLanguage)) {
    document.querySelectorAll('a[href^="/style-match/"]').forEach((link) => {
      link.addEventListener("click", () => {
        document.cookie = `django_language=${currentLanguage}; Path=/; Max-Age=31536000; SameSite=Lax`;
      });
    });
  }

  const app = document.getElementById("style-match-app");
  if (!app) return;

  const $ = (selector) => app.querySelector(selector);

  function replaceBranding() {
    app.querySelectorAll(".sm-wordmark").forEach((wordmark) => {
      if (wordmark.querySelector(".sm-official-logo")) return;
      wordmark.replaceChildren();
      const image = document.createElement("img");
      image.src = "/static/images/tatzo5.png";
      image.alt = "Tatzo";
      image.className = "sm-official-logo";
      wordmark.appendChild(image);
    });
    const saveButton = $("#sm-save");
    if (saveButton && !saveButton.querySelector(".sm-save-icon")) {
      saveButton.replaceChildren();
      const image = document.createElement("img");
      image.src = "/static/icons/bookmark.svg";
      image.alt = "";
      image.className = "sm-save-icon";
      saveButton.appendChild(image);
    }
  }

  function showResults() {
    ["onboarding", "discovery", "analysis"].forEach((name) => {
      const screen = $(`#sm-${name}`);
      if (screen) { screen.hidden = true; screen.classList.remove("sm-screen-active"); }
    });
    const results = $("#sm-results");
    results.hidden = false;
    results.classList.add("sm-screen-active");
  }

  function appendList(target, values) {
    target.replaceChildren();
    (values || []).forEach((value) => {
      const item = document.createElement("li");
      item.textContent = value;
      target.appendChild(item);
    });
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
      requestAnimationFrame(() => { row.querySelector(".sm-style-bar span").style.width = `${style.score}%`; });
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
    panel.innerHTML = `<strong>Чтобы сохранить результат, войдите или зарегистрируйтесь</strong><div><a class="sm-secondary-button" href="${metadata.login_url}">Войти</a><a class="sm-primary-button sm-home-button" href="${metadata.signup_url}">Регистрация</a></div>`;
    $(".sm-result-actions").before(panel);
  }

  async function restore() {
    try {
      const metaResponse = await fetch("/style-match/latest/", { credentials: "same-origin", headers: { Accept: "application/json" } });
      if (!metaResponse.ok) return;
      const metadata = await metaResponse.json();
      addGuestCta(metadata);
      if (!metadata.authenticated || !metadata.has_result) return;
      const resultResponse = await fetch(metadata.result_url, { credentials: "same-origin", headers: { Accept: "application/json" } });
      if (!resultResponse.ok) return;
      renderResult(await resultResponse.json());
      showResults();
    } catch (_error) {}
  }

  replaceBranding();
  restore();
  new MutationObserver(replaceBranding).observe(app, { childList: true, subtree: true });
})();
