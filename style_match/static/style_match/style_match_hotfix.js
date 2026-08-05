(() => {
  "use strict";

  const app = document.getElementById("style-match-app");
  if (!app) return;

  const $ = (selector) => app.querySelector(selector);
  const latestUrl = "/style-match/latest/";

  function replaceBranding() {
    app.querySelectorAll(".sm-wordmark").forEach((wordmark) => {
      wordmark.replaceChildren();
      const image = document.createElement("img");
      image.src = "/static/images/tatzo5.png";
      image.alt = "Tatzo";
      image.className = "sm-official-logo";
      wordmark.appendChild(image);
    });

    const saveButton = $("#sm-save");
    if (saveButton) {
      saveButton.replaceChildren();
      const image = document.createElement("img");
      image.src = "/static/icons/bookmark.svg";
      image.alt = "";
      image.className = "sm-save-icon";
      saveButton.appendChild(image);
    }
  }

  function showScreen(name) {
    ["onboarding", "discovery", "analysis", "results"].forEach((screenName) => {
      const screen = $(`#sm-${screenName}`);
      if (!screen) return;
      const active = screenName === name;
      screen.hidden = !active;
      screen.classList.toggle("sm-screen-active", active);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
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

  function renderSpectrum(styles) {
    const spectrum = $("#sm-style-spectrum");
    if (!spectrum) return;
    spectrum.replaceChildren();
    (styles || []).forEach((style) => {
      const row = document.createElement("div");
      row.className = "sm-style-row";
      row.innerHTML = `
        <div class="sm-style-label"><span></span><strong></strong></div>
        <div class="sm-style-bar"><span></span></div>`;
      row.querySelector(".sm-style-label span").textContent = style.label;
      row.querySelector(".sm-style-label strong").textContent = `${style.score}%`;
      spectrum.appendChild(row);
      requestAnimationFrame(() => {
        row.querySelector(".sm-style-bar span").style.width = `${style.score}%`;
      });
    });
  }

  function renderArtists(artists, metadata) {
    const list = $("#sm-artist-list");
    if (!list) return;
    list.replaceChildren();
    if (!(artists || []).length) {
      const empty = document.createElement("p");
      empty.className = "sm-no-artists";
      empty.textContent = app.dataset.i18nNoArtists || "";
      list.appendChild(empty);
      return;
    }
    artists.forEach((artist) => {
      const row = document.createElement("a");
      row.className = "sm-artist-row";
      row.href = artist.profile_url;
      const avatar = document.createElement("span");
      avatar.className = "sm-artist-avatar";
      if (artist.image_url) {
        const image = document.createElement("img");
        image.src = artist.image_url;
        image.alt = "";
        avatar.appendChild(image);
      } else {
        avatar.textContent = artist.username.slice(0, 1).toUpperCase();
      }
      const copy = document.createElement("span");
      copy.className = "sm-artist-copy";
      const username = document.createElement("strong");
      username.textContent = artist.username;
      const details = document.createElement("span");
      details.textContent = `${artist.top_style} · ${artist.location || app.dataset.i18nLocationPending || ""}`;
      copy.append(username, details);
      const score = document.createElement("strong");
      score.className = "sm-artist-score";
      score.textContent = `${artist.score}%`;
      row.append(avatar, copy, score);
      list.appendChild(row);
    });
  }

  function renderTags(styles) {
    const cloud = $("#sm-tag-cloud");
    if (!cloud) return;
    cloud.replaceChildren();
    (styles || []).slice(0, 5).forEach((style) => {
      const tag = document.createElement("span");
      tag.className = "sm-tag";
      tag.textContent = style.label;
      cloud.appendChild(tag);
    });
  }

  function renderResult(result) {
    const topStyle = result.top_style || { label: "", score: 0 };
    $("#sm-match-number").textContent = `${result.match_confidence}%`;
    $("#sm-results-title").textContent = topStyle.label;
    $(".sm-result-hero").dataset.score = result.match_confidence;
    renderSpectrum(result.styles);
    $("#sm-personality-title").textContent = result.personality?.label || "";
    $("#sm-personality-description").textContent = result.personality?.description || "";
    appendList($("#sm-drawn-to"), result.drawn_to);
    appendList($("#sm-skip"), result.tend_to_skip);
    renderArtists(result.artists);
    renderTags(result.styles);
    const count = Number(result.community_count || 1);
    const people = count.toLocaleString(document.documentElement.lang || undefined);
    const suffix = count === 1 ? app.dataset.i18nPerson : app.dataset.i18nPeople;
    $("#sm-community-copy").textContent = `${people} ${result.personality?.label || ""}: ${suffix || ""}`;
    $("#sm-saved-count").textContent = `${result.saved_count} ${app.dataset.i18nSavedCount || ""}`;
    $("#sm-wrapped-style").textContent = topStyle.label;
    $("#sm-wrapped-count").textContent = result.completed_count;
    $("#sm-wrapped-personality").textContent = result.personality?.label || "";
  }

  function addGuestCallToAction(metadata) {
    if (metadata.authenticated || $("#sm-auth-cta")) return;
    const actions = $(".sm-result-actions");
    if (!actions) return;
    const panel = document.createElement("section");
    panel.id = "sm-auth-cta";
    panel.className = "sm-auth-cta";
    panel.innerHTML = `
      <strong>Чтобы сохранить результат, войдите или зарегистрируйтесь</strong>
      <div>
        <a class="sm-secondary-button" href="${metadata.login_url}">Войти</a>
        <a class="sm-primary-button sm-home-button" href="${metadata.signup_url}">Регистрация</a>
      </div>`;
    actions.before(panel);
  }

  async function restoreLatestResult() {
    try {
      const metadataResponse = await fetch(latestUrl, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!metadataResponse.ok) return;
      const metadata = await metadataResponse.json();
      addGuestCallToAction(metadata);
      if (!metadata.authenticated || !metadata.has_result || !metadata.result_url) return;

      const resultResponse = await fetch(metadata.result_url, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!resultResponse.ok) return;
      renderResult(await resultResponse.json());
      showScreen("results");
    } catch (_error) {
      // The original flow remains available when restoration fails.
    }
  }

  replaceBranding();
  restoreLatestResult();

  const observer = new MutationObserver(replaceBranding);
  observer.observe(app, { childList: true, subtree: true });
})();
