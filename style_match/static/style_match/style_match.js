(() => {
  "use strict";

  const app = document.getElementById("style-match-app");
  if (!app) return;

  const $ = (selector) => app.querySelector(selector);
  const screens = ["onboarding", "discovery", "analysis", "results"];
  const i18n = {
    network: app.dataset.i18nNetwork,
    saved: app.dataset.i18nSaved,
    unsaved: app.dataset.i18nUnsaved,
    loading: app.dataset.i18nLoading,
    analyzing: app.dataset.i18nAnalyzing,
    comparing: app.dataset.i18nComparing,
    artists: app.dataset.i18nArtists,
    personality: app.dataset.i18nPersonality,
    noArtists: app.dataset.i18nNoArtists,
    locationPending: app.dataset.i18nLocationPending,
    viewProfile: app.dataset.i18nViewProfile,
    people: app.dataset.i18nPeople,
    savedCount: app.dataset.i18nSavedCount,
  };
  const state = {
    cards: [],
    index: 0,
    total: 0,
    sessionId: "",
    reactUrl: "",
    resultUrl: "",
    saved: new Set(),
    busy: false,
    toastTimer: null,
  };

  const deck = $("#sm-deck");
  const actionButtons = Array.from(app.querySelectorAll(".sm-action"));

  function csrfToken() {
    const token = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("csrftoken="));
    return token ? decodeURIComponent(token.split("=").slice(1).join("=")) : "";
  }

  async function request(url, payload) {
    const response = await fetch(url, {
      method: payload ? "POST" : "GET",
      credentials: "same-origin",
      headers: payload
        ? { "Content-Type": "application/json", "X-CSRFToken": csrfToken() }
        : { Accept: "application/json" },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    let data = {};
    try {
      data = await response.json();
    } catch (error) {
      data = {};
    }
    if (!response.ok) throw new Error(data.error || i18n.network);
    return data;
  }

  function showScreen(name) {
    screens.forEach((screenName) => {
      const screen = $(`#sm-${screenName}`);
      const active = screenName === name;
      screen.hidden = !active;
      screen.classList.toggle("sm-screen-active", active);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toast(message) {
    const element = $("#sm-toast");
    if (!element) return;
    element.textContent = message;
    element.classList.add("sm-toast-visible");
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => {
      element.classList.remove("sm-toast-visible");
    }, 2200);
  }

  function setBusy(busy) {
    state.busy = busy;
    actionButtons.forEach((button) => {
      button.disabled = busy;
    });
  }

  function currentCard() {
    return state.cards[state.index];
  }

  function updateProgress() {
    const current = Math.min(state.index + 1, state.total);
    $("#sm-progress-count").textContent = `${current} / ${state.total}`;
    $("#sm-progress-fill").style.width = `${(state.index / Math.max(1, state.total)) * 100}%`;
  }

  function makeCard(card, active) {
    const element = document.createElement("article");
    element.className = `sm-card${active ? " sm-card-active" : ""}`;
    element.dataset.cardId = card.id;

    const image = document.createElement("img");
    image.src = card.image_url;
    image.alt = card.alt || "";
    image.draggable = false;
    element.appendChild(image);

    const likeStamp = document.createElement("span");
    likeStamp.className = "sm-card-stamp sm-card-like";
    likeStamp.textContent = "LIKE";
    element.appendChild(likeStamp);

    const nopeStamp = document.createElement("span");
    nopeStamp.className = "sm-card-stamp sm-card-nope";
    nopeStamp.textContent = "NOPE";
    element.appendChild(nopeStamp);

    if (state.saved.has(card.id)) element.classList.add("sm-card-saved");
    if (active) bindCardGestures(element);
    return element;
  }

  function renderDeck() {
    deck.replaceChildren();
    const visible = state.cards.slice(state.index, state.index + 3);
    visible.reverse().forEach((card) => {
      deck.appendChild(makeCard(card, card.id === currentCard()?.id));
    });
    $("#sm-save").classList.toggle("sm-save-active", state.saved.has(currentCard()?.id));
    updateProgress();
  }

  function bindCardGestures(cardElement) {
    let startX = 0;
    let startY = 0;
    let deltaX = 0;
    let dragging = false;
    let longPressTimer = null;

    const resetCard = () => {
      cardElement.classList.remove("sm-card-dragging");
      cardElement.style.transform = "";
      cardElement.querySelector(".sm-card-like").style.opacity = "";
      cardElement.querySelector(".sm-card-nope").style.opacity = "";
    };

    cardElement.addEventListener("pointerdown", (event) => {
      if (state.busy) return;
      startX = event.clientX;
      startY = event.clientY;
      deltaX = 0;
      dragging = true;
      cardElement.setPointerCapture(event.pointerId);
      cardElement.classList.add("sm-card-dragging");
      longPressTimer = window.setTimeout(() => {
        if (dragging && Math.abs(deltaX) < 12) toggleSave();
      }, 650);
    });

    cardElement.addEventListener("pointermove", (event) => {
      if (!dragging || state.busy) return;
      deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;
      if (Math.abs(deltaX) > 12 || Math.abs(deltaY) > 12) {
        window.clearTimeout(longPressTimer);
      }
      cardElement.style.transform = `translate(${deltaX}px, ${deltaY * 0.12}px) rotate(${deltaX / 18}deg)`;
      cardElement.querySelector(".sm-card-like").style.opacity = Math.max(0, deltaX / 100);
      cardElement.querySelector(".sm-card-nope").style.opacity = Math.max(0, -deltaX / 100);
    });

    const finish = () => {
      if (!dragging) return;
      dragging = false;
      window.clearTimeout(longPressTimer);
      if (deltaX > 90) react("like", "right");
      else if (deltaX < -90) react("reject", "left");
      else resetCard();
    };

    cardElement.addEventListener("pointerup", finish);
    cardElement.addEventListener("pointercancel", () => {
      dragging = false;
      window.clearTimeout(longPressTimer);
      resetCard();
    });
    cardElement.addEventListener("dblclick", (event) => {
      event.preventDefault();
      react("favorite", "right");
    });
  }

  async function start() {
    const button = $("#sm-start");
    if (!button || state.busy) return;
    setBusy(true);
    button.disabled = true;
    const label = button.querySelector("span");
    const original = label.textContent;
    label.textContent = i18n.loading;
    try {
      const data = await request(app.dataset.startUrl, {});
      state.cards = data.cards || [];
      state.index = 0;
      state.total = data.total || state.cards.length;
      state.sessionId = data.session_id;
      state.reactUrl = data.react_url;
      state.resultUrl = data.result_url;
      state.saved.clear();
      renderDeck();
      showScreen("discovery");
    } catch (error) {
      toast(error.message || i18n.network);
    } finally {
      label.textContent = original;
      button.disabled = false;
      setBusy(false);
    }
  }

  async function toggleSave() {
    const card = currentCard();
    if (!card || state.busy) return;
    const saved = !state.saved.has(card.id);
    if (saved) state.saved.add(card.id);
    else state.saved.delete(card.id);
    $("#sm-save").classList.toggle("sm-save-active", saved);
    deck.querySelector(".sm-card-active")?.classList.toggle("sm-card-saved", saved);
    toast(saved ? i18n.saved : i18n.unsaved);
    try {
      await request(state.reactUrl, { action: "save", card_id: card.id, saved });
    } catch (error) {
      if (saved) state.saved.delete(card.id);
      else state.saved.add(card.id);
      renderDeck();
      toast(error.message || i18n.network);
    }
  }

  async function react(action, direction) {
    const card = currentCard();
    if (!card || state.busy) return;
    setBusy(true);
    const active = deck.querySelector(".sm-card-active");
    if (active) active.classList.add(direction === "left" ? "sm-card-exit-left" : "sm-card-exit-right");

    try {
      const data = await request(state.reactUrl, { action, card_id: card.id });
      await new Promise((resolve) => window.setTimeout(resolve, 220));
      state.index += 1;
      if (data.completed || state.index >= state.total) {
        runAnalysis();
        return;
      }
      renderDeck();
      setBusy(false);
    } catch (error) {
      renderDeck();
      setBusy(false);
      toast(error.message || i18n.network);
    }
  }

  async function runAnalysis() {
    showScreen("analysis");
    const messages = [i18n.analyzing, i18n.comparing, i18n.artists, i18n.personality];
    const message = $("#sm-analysis-message");
    const fill = $("#sm-analysis-fill");
    let resultPromise = request(state.resultUrl);
    for (let index = 0; index < messages.length; index += 1) {
      message.textContent = messages[index];
      fill.style.width = `${((index + 1) / messages.length) * 100}%`;
      await new Promise((resolve) => window.setTimeout(resolve, 550));
    }
    try {
      renderResults(await resultPromise);
      showScreen("results");
      celebrate();
    } catch (error) {
      showScreen("discovery");
      renderDeck();
      setBusy(false);
      toast(error.message || i18n.network);
    }
  }

  function appendList(target, values) {
    target.replaceChildren();
    values.forEach((value) => {
      const item = document.createElement("li");
      item.textContent = value;
      target.appendChild(item);
    });
  }

  function renderSpectrum(styles) {
    const spectrum = $("#sm-style-spectrum");
    spectrum.replaceChildren();
    styles.forEach((style) => {
      const row = document.createElement("div");
      row.className = "sm-style-row";
      const label = document.createElement("div");
      label.className = "sm-style-label";
      const name = document.createElement("span");
      name.textContent = style.label;
      const score = document.createElement("strong");
      score.textContent = `${style.score}%`;
      label.append(name, score);
      const bar = document.createElement("div");
      bar.className = "sm-style-bar";
      const fill = document.createElement("span");
      bar.appendChild(fill);
      row.append(label, bar);
      spectrum.appendChild(row);
      requestAnimationFrame(() => { fill.style.width = `${style.score}%`; });
    });
  }

  function renderArtists(artists) {
    const list = $("#sm-artist-list");
    list.replaceChildren();
    if (!artists.length) {
      const empty = document.createElement("p");
      empty.className = "sm-no-artists";
      empty.textContent = i18n.noArtists;
      list.appendChild(empty);
      return;
    }

    artists.forEach((artist) => {
      const row = document.createElement("a");
      row.className = "sm-artist-row";
      row.href = artist.profile_url;
      row.title = i18n.viewProfile;
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
      details.textContent = `${artist.top_style} · ${artist.location || i18n.locationPending}`;
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
    cloud.replaceChildren();
    styles.slice(0, 5).forEach((style) => {
      const tag = document.createElement("span");
      tag.className = "sm-tag";
      tag.textContent = style.label;
      cloud.appendChild(tag);
    });
  }

  function renderResults(result) {
    const topStyle = result.top_style || { label: "", score: 0 };
    $("#sm-match-number").textContent = `${result.match_confidence}%`;
    $("#sm-results-title").textContent = topStyle.label;
    $(".sm-result-hero").dataset.score = result.match_confidence;
    renderSpectrum(result.styles || []);
    $("#sm-personality-title").textContent = result.personality.label;
    $("#sm-personality-description").textContent = result.personality.description;
    appendList($("#sm-drawn-to"), result.drawn_to || []);
    appendList($("#sm-skip"), result.tend_to_skip || []);
    renderArtists(result.artists || []);
    renderTags(result.styles || []);
    const people = Number(result.community_count || 1).toLocaleString(document.documentElement.lang || undefined);
    $("#sm-community-copy").textContent = `${people} ${result.personality.label}: ${i18n.people}`;
    $("#sm-saved-count").textContent = `${result.saved_count} ${i18n.savedCount}`;
    $("#sm-wrapped-style").textContent = topStyle.label;
    $("#sm-wrapped-count").textContent = result.completed_count;
    $("#sm-wrapped-personality").textContent = result.personality.label;
    setBusy(false);
  }

  function celebrate() {
    const container = $("#sm-confetti");
    const colors = ["#09c8c2", "#8df3ec", "#ed0b70", "#ffffff"];
    for (let index = 0; index < 44; index += 1) {
      const piece = document.createElement("span");
      piece.className = "sm-confetti-piece";
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = colors[index % colors.length];
      piece.style.animationDelay = `${Math.random() * 0.7}s`;
      piece.style.setProperty("--drift", `${(Math.random() - 0.5) * 240}px`);
      container.appendChild(piece);
      window.setTimeout(() => piece.remove(), 3400);
    }
  }

  $("#sm-start")?.addEventListener("click", start);
  $("#sm-reject").addEventListener("click", () => react("reject", "left"));
  $("#sm-save").addEventListener("click", toggleSave);
  $("#sm-like").addEventListener("click", () => react("like", "right"));
  $("#sm-favorite").addEventListener("click", () => react("favorite", "right"));
  $("#sm-restart").addEventListener("click", () => {
    showScreen("onboarding");
    state.cards = [];
    state.index = 0;
    state.saved.clear();
    $("#sm-analysis-fill").style.width = "0";
  });

  document.addEventListener("keydown", (event) => {
    if ($("#sm-discovery").hidden || state.busy) return;
    if (event.key === "ArrowLeft") react("reject", "left");
    if (event.key === "ArrowRight") react("like", "right");
    if (event.key.toLowerCase() === "s") toggleSave();
    if (event.key.toLowerCase() === "f") react("favorite", "right");
  });
})();
