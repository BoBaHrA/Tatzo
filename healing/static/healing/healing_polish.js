(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
  const ICONS = {
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    "heart-pulse": '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l3.35-3.35"/><path d="M3.22 12H9l2-4 4 8 2-4h3.78"/>',
    "calendar-days": '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    flame: '<path d="M12 2c.5 4-2 5.5-2 8a4 4 0 0 0 8 0c0-1.8-.8-3.4-2.3-5 3.8 2.2 5.3 5.5 4.1 9.1A8 8 0 1 1 6.2 6.4C6 9 7.5 10.5 9 11c-.4-3.1.7-6.2 3-9z"/>',
    "message-circle": '<path d="m21 15-3.86 3.86a2 2 0 0 1-1.41.59H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5h10a5 5 0 0 1 5 5v6.59A2 2 0 0 1 21 15z"/>',
    award: '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
    trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  };

  function language() {
    const value = (document.documentElement.lang || "en").split("-")[0];
    return ["en", "fr", "ru"].includes(value) ? value : "en";
  }

  function icon(name, className = "healing-ui-icon") {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add(...className.split(" ").filter(Boolean));
    svg.innerHTML = ICONS[name] || ICONS.activity;
    return svg;
  }

  function replaceWithIcon(target, name, className) {
    if (!target) return;
    target.replaceChildren(icon(name, className));
  }

  function fixComparisonDirection() {
    const stage = document.querySelector(".healing-photo-stage.is-comparison");
    const firstPhoto = document.getElementById("healing-before-photo");
    const selectedPhoto = document.getElementById("healing-after-photo");
    const clippedLayer = document.getElementById("healing-after-wrap");
    if (!stage || !firstPhoto || !selectedPhoto || !clippedLayer || clippedLayer.contains(firstPhoto)) return;

    // The first check-in belongs on the left. The selected/newer check-in stays
    // underneath and is revealed on the right as the comparison handle moves.
    stage.insertBefore(selectedPhoto, clippedLayer);
    clippedLayer.appendChild(firstPhoto);
  }

  function decorateStats() {
    const section = document.querySelector(".healing-stats-section");
    if (!section) return;
    replaceWithIcon(
      section.querySelector(".healing-section-head > span:last-child"),
      "activity",
      "healing-ui-icon healing-heading-icon"
    );

    const definitions = [
      ["heart-pulse", "is-teal"],
      ["calendar-days", "is-blue"],
      ["camera", "is-pink"],
      ["flame", "is-gold"],
      ["message-circle", "is-green"],
    ];
    const cards = Array.from(section.querySelectorAll(".healing-stats-grid article"));
    cards.forEach((card, index) => {
      const current = card.firstElementChild;
      const [name, tone] = definitions[index] || definitions[0];
      const holder = document.createElement("span");
      holder.className = `healing-stat-icon ${tone}`;
      holder.appendChild(icon(name));
      if (current) current.replaceWith(holder);
      else card.prepend(holder);
    });

    const remainingLabel = cards[1]?.querySelector("small");
    if (remainingLabel) {
      remainingLabel.textContent = {
        en: "Days remaining",
        fr: "Jours restants",
        ru: "Дней осталось",
      }[language()];
    }
  }

  function decorateAchievements() {
    const card = document.querySelector(".healing-achievements");
    if (!card) return;
    replaceWithIcon(
      card.querySelector(".healing-section-head > span:last-child"),
      "award",
      "healing-ui-icon healing-heading-icon is-gold"
    );
    const names = ["camera", "flame", "heart-pulse", "trophy"];
    card.querySelectorAll(".healing-achievement-grid > div").forEach((item, index) => {
      replaceWithIcon(
        item.firstElementChild,
        names[index] || "award",
        "healing-ui-icon healing-achievement-icon"
      );
    });
  }

  function enhanceArtistCard() {
    const card = document.querySelector(".healing-person-card");
    if (!card) return;
    const status = card.querySelector(".healing-section-head > i");
    if (status) status.className = "healing-person-online";
    const personCopy = card.querySelector(".healing-person > div:last-child");
    if (personCopy) personCopy.classList.add("healing-person-copy");
    const button = card.querySelector(".healing-chat-button");
    if (button && !button.querySelector("svg")) {
      const text = button.textContent.trim().replace(/^➤\s*/, "");
      const label = document.createElement("span");
      label.textContent = text;
      button.replaceChildren(icon("send", "healing-ui-icon healing-send-icon"), label);
    }
  }

  function protectPhotoUpload() {
    const input = document.getElementById("healing-photo-input");
    if (!input) return;
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file || file.size <= MAX_PHOTO_BYTES) return;
      const message = {
        en: "This photo is larger than 10 MB. Please choose a smaller image.",
        fr: "Cette photo dépasse 10 Mo. Choisissez une image plus légère.",
        ru: "Это фото больше 10 МБ. Выберите изображение меньшего размера.",
      }[language()];
      input.value = "";
      const filename = document.getElementById("healing-upload-name");
      if (filename) filename.textContent = message;
      window.alert(message);
    });
  }

  function journeyId() {
    const direct = new URLSearchParams(window.location.search).get("journey");
    if (direct) return direct;
    const template = document.getElementById("healing-app")?.dataset.taskUrlTemplate || "";
    return template.match(/\/healing\/([0-9a-f-]{36})\/tasks\//i)?.[1] || "";
  }

  function communitySkeleton() {
    const card = document.createElement("article");
    card.className = "glass-panel healing-community-card";

    const header = document.createElement("div");
    header.className = "healing-section-head";
    const headings = document.createElement("div");
    const eyebrow = document.createElement("p");
    eyebrow.className = "healing-eyebrow healing-pink";
    eyebrow.dataset.communityEyebrow = "";
    const title = document.createElement("h2");
    title.dataset.communityTitle = "";
    headings.append(eyebrow, title);
    header.append(headings, icon("users", "healing-ui-icon healing-heading-icon is-pink"));

    const subtitle = document.createElement("p");
    subtitle.className = "healing-community-subtitle";
    subtitle.dataset.communitySubtitle = "";
    const grid = document.createElement("div");
    grid.className = "healing-community-grid";
    grid.dataset.communityGrid = "";
    card.append(header, subtitle, grid);
    return card;
  }

  function renderCommunity(card, payload) {
    const copy = payload.copy || {};
    card.querySelector("[data-community-eyebrow]").textContent = copy.eyebrow || "Never heal alone";
    card.querySelector("[data-community-title]").textContent = copy.title || "Tatzo community";
    card.querySelector("[data-community-subtitle]").textContent = copy.subtitle || "";
    const grid = card.querySelector("[data-community-grid]");
    grid.replaceChildren();

    if (!payload.items?.length) {
      const empty = document.createElement("div");
      empty.className = "healing-community-empty";
      const text = document.createElement("p");
      text.textContent = copy.empty || "The community gallery is growing.";
      const link = document.createElement("a");
      link.href = payload.feed_url || "/";
      link.textContent = copy.action || "Explore community";
      empty.append(text, link);
      grid.appendChild(empty);
      return;
    }

    payload.items.forEach((item) => {
      const link = document.createElement("a");
      link.className = "healing-community-item";
      link.href = item.url;
      const image = document.createElement("img");
      image.src = item.image_url;
      image.alt = item.caption || item.label;
      image.loading = "lazy";
      const copyWrap = document.createElement("span");
      const label = document.createElement("strong");
      label.textContent = item.label;
      const caption = document.createElement("small");
      caption.textContent = item.caption || "Tatzo";
      copyWrap.append(label, caption);
      link.append(image, copyWrap);
      grid.appendChild(link);
    });
  }

  async function addCommunity() {
    const lowerGrid = document.querySelector(".healing-lower-grid");
    const achievements = document.querySelector(".healing-achievements");
    const id = journeyId();
    if (!lowerGrid || !achievements || !id) return;

    achievements.classList.add("healing-achievements-wide");
    lowerGrid.after(achievements);

    let card = lowerGrid.querySelector(".healing-community-card");
    if (!card) {
      card = communitySkeleton();
      lowerGrid.appendChild(card);
    }

    try {
      const response = await fetch(`/healing/${id}/community/`, {
        credentials: "same-origin",
        headers: {Accept: "application/json"},
      });
      if (!response.ok) return;
      renderCommunity(card, await response.json());
    } catch (_error) {
      // The rest of Healing remains fully usable when community content is unavailable.
    }
  }

  function init() {
    if (!document.getElementById("healing-app")) return;
    fixComparisonDirection();
    decorateStats();
    decorateAchievements();
    enhanceArtistCard();
    protectPhotoUpload();
    addCommunity();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, {once: true});
  } else {
    init();
  }
})();
