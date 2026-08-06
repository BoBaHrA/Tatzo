(() => {
  "use strict";

  const healingIconUrl = "/static/icons/healing.svg";

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

  async function addChatContext() {
    const input = document.getElementById("chatMessageInput");
    if (!input) return;
    const journeyId = new URLSearchParams(window.location.search).get("healing_journey");
    if (!journeyId) return;
    try {
      const response = await fetch(`/healing/${journeyId}/chat-draft/`, {credentials:"same-origin",headers:{Accept:"application/json"}});
      if (!response.ok) return;
      const data = await response.json();
      if (!input.value.trim()) {
        input.value = data.draft || "";
        input.dispatchEvent(new Event("input", {bubbles:true}));
      }
      const form = document.getElementById("chatMessageForm");
      if (form && !document.getElementById("healing-chat-context")) {
        const context = document.createElement("a");
        context.id = "healing-chat-context";
        context.href = data.journey_url;
        context.className = "healing-chat-context-link";
        const contextText = document.createElement("span");
        contextText.textContent = data.label;
        context.append(createHealingIcon("healing-chat-context-icon"), contextText);
        form.parentNode.insertBefore(context, form);
      }
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    } catch (_error) {}
  }

  document.addEventListener("DOMContentLoaded", () => {
    addNavigationLinks();
    addChatContext();
  });
})();
