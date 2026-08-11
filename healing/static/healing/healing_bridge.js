(() => {
  "use strict";

  const healingIconUrl = "/static/icons/healing.svg";
  const polishCssUrl = "/static/healing/healing_polish.css";
  const polishJsUrl = "/static/healing/healing_polish.js";

  function label() {
    const language = (document.documentElement.lang || "en").split("-")[0];
    return language === "ru" ? "Заживление" : language === "fr" ? "Cicatrisation" : "Healing";
  }

  function createHealingIcon(className = "healing-nav-icon") {
    const icon = document.createElement("img");
    icon.src = healingIconUrl;
    icon.alt = "";
    icon.className = className;
    icon.setAttribute("aria-hidden", "true");
    return icon;
  }

  function createCalendarIcon() {
    const wrapper = document.createElement("span");
    wrapper.className = "healing-chat-session-calendar";
    wrapper.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/></svg>';
    return wrapper;
  }

  function loadHealingPageAssets() {
    if (!window.location.pathname.startsWith("/healing/")) return;
    if (!document.querySelector('link[data-healing-polish]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = polishCssUrl;
      link.dataset.healingPolish = "";
      document.head.appendChild(link);
    }
    if (!document.querySelector('script[data-healing-polish]')) {
      const script = document.createElement("script");
      script.src = polishJsUrl;
      script.defer = true;
      script.dataset.healingPolish = "";
      document.head.appendChild(script);
    }
  }

  function addNavigationLinks() {
    if (document.querySelector("[data-healing-nav]")) return;
    const desktopMenu = document.querySelector(".sidebar-main-menu");
    if (desktopMenu) {
      const item = document.createElement("li");
      item.dataset.healingNav = "desktop";
      const link = document.createElement("a");
      link.href = "/healing/";
      if (window.location.pathname.startsWith("/healing/")) link.classList.add("active");
      const text = document.createElement("span");
      text.textContent = label();
      link.append(createHealingIcon(), text);
      item.appendChild(link);
      const calendarItem = Array.from(desktopMenu.children).find((row) => row.querySelector('a[href="/calendar/"]'));
      desktopMenu.insertBefore(item, calendarItem || null);
    }

    const mobileGrid = document.querySelector(".mobile-menu-grid");
    if (mobileGrid && !mobileGrid.querySelector("[data-healing-nav]")) {
      const link = document.createElement("a");
      link.href = "/healing/";
      link.dataset.healingNav = "mobile";
      const text = document.createElement("span");
      text.textContent = label();
      link.append(createHealingIcon("healing-mobile-nav-icon"), text);
      mobileGrid.prepend(link);
    }
  }

  function chatThreadId() {
    return window.location.pathname.match(/\/chats\/(\d+)\/?$/)?.[1] || "";
  }

  function renderSessionContext(context) {
    const messages = document.getElementById("chatMessages");
    if (!messages || !context || document.getElementById("healing-chat-session-context")) return;

    const card = document.createElement("a");
    card.id = "healing-chat-session-context";
    card.className = `healing-chat-session-card is-${context.mode}`;
    card.href = context.url;

    const iconBox = document.createElement("span");
    iconBox.className = "healing-chat-session-icon";
    iconBox.append(context.mode === "healing" ? createHealingIcon("healing-chat-session-bandage") : createCalendarIcon());

    const body = document.createElement("span");
    body.className = "healing-chat-session-body";
    const eyebrow = document.createElement("small");
    eyebrow.textContent = context.eyebrow;
    const title = document.createElement("strong");
    title.textContent = context.title;
    const meta = document.createElement("span");
    meta.textContent = context.meta;
    body.append(eyebrow, title, meta);

    const side = document.createElement("span");
    side.className = "healing-chat-session-side";
    const status = document.createElement("small");
    status.textContent = context.status;
    const action = document.createElement("strong");
    action.textContent = `${context.action} →`;
    side.append(status, action);

    card.append(iconBox, body, side);
    messages.parentNode.insertBefore(card, messages);
  }

  async function addSessionContext() {
    const threadId = chatThreadId();
    if (!threadId || !document.getElementById("chatMessages")) return;
    try {
      const response = await fetch(`/healing/chat-context/${threadId}/`, {
        credentials: "same-origin",
        headers: {Accept: "application/json"},
      });
      if (!response.ok) return;
      const data = await response.json();
      renderSessionContext(data.context);
    } catch (_error) {}
  }

  async function addChatDraft() {
    const input = document.getElementById("chatMessageInput");
    if (!input) return;
    const journeyId = new URLSearchParams(window.location.search).get("healing_journey");
    if (!journeyId) return;
    try {
      const response = await fetch(`/healing/${journeyId}/chat-draft/`, {
        credentials: "same-origin",
        headers: {Accept: "application/json"},
      });
      if (!response.ok) return;
      const data = await response.json();
      if (!input.value.trim()) {
        input.value = data.draft || "";
        input.dispatchEvent(new Event("input", {bubbles: true}));
      }
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    } catch (_error) {}
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadHealingPageAssets();
    addNavigationLinks();
    addSessionContext();
    addChatDraft();
  });
})();
