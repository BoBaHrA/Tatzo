(() => {
  "use strict";

  const language = (document.documentElement.lang || "en").split("-")[0];
  const navLabels = {
    en: "Health & safety",
    fr: "Santé et sécurité",
    ru: "Здоровье и безопасность",
  };
  const navLabel = navLabels[language] || navLabels.en;

  function csrfToken() {
    const hidden = document.querySelector('input[name="csrfmiddlewaretoken"]');
    if (hidden?.value) return hidden.value;
    const match = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function addNavigation() {
    const desktop = document.querySelector(".sidebar-more-menu");
    if (desktop && !desktop.querySelector('[data-health-nav="desktop"]')) {
      const link = document.createElement("a");
      link.href = "/health-safety/";
      link.className = "sidebar-more-link health-nav-injected";
      link.dataset.healthNav = "desktop";
      const icon = document.createElement("img");
      icon.src = "/static/icons/health-safety.svg";
      icon.alt = "";
      const text = document.createElement("span");
      text.textContent = navLabel;
      link.append(icon, text);
      const legalHeading = desktop.querySelector(".sidebar-more-title-secondary");
      desktop.insertBefore(link, legalHeading || null);
    }

    const mobile = document.querySelector(".mobile-menu-grid");
    if (mobile && !mobile.querySelector('[data-health-nav="mobile"]')) {
      const link = document.createElement("a");
      link.href = "/health-safety/";
      link.dataset.healthNav = "mobile";
      const icon = document.createElement("img");
      icon.src = "/static/icons/health-safety.svg";
      icon.alt = "";
      const text = document.createElement("span");
      text.textContent = navLabel;
      link.append(icon, text);
      mobile.appendChild(link);
    }

    if (window.location.pathname.startsWith("/health-safety/")) {
      const title = document.querySelector(".mobile-topbar-title");
      if (title) title.textContent = navLabel;
    }
  }

  async function postAction(url) {
    const response = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "X-CSRFToken": csrfToken(),
        Accept: "application/json",
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "request_failed");
    return data;
  }

  function button(text, action, danger = false) {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = text;
    if (danger) element.classList.add("is-danger");
    element.addEventListener("click", action);
    return element;
  }

  function renderAppointmentContext(data, appointmentId) {
    const details = document.querySelector(".appointment-details-grid");
    if (!details || document.querySelector(".appointment-health-card")) return;

    if (data.role === "artist" && !data.active) return;

    const card = document.createElement("section");
    card.className = "appointment-health-card";
    const heading = document.createElement("h2");
    heading.textContent = data.role === "artist" ? data.copy.artist_title : navLabel;
    card.appendChild(heading);

    if (data.role === "artist") {
      const intro = document.createElement("p");
      intro.textContent = data.copy.artist_intro;
      card.appendChild(intro);

      const list = document.createElement("ul");
      list.className = "appointment-health-items";
      (data.items || []).forEach((item) => {
        const li = document.createElement("li");
        li.textContent = item;
        list.appendChild(li);
      });
      if (!list.children.length && !data.other) {
        const li = document.createElement("li");
        li.textContent = data.copy.none_declared;
        list.appendChild(li);
      }
      card.appendChild(list);
      if (data.other) {
        const other = document.createElement("p");
        other.className = "appointment-health-other";
        other.textContent = data.other;
        card.appendChild(other);
      }
    } else {
      const status = document.createElement("p");
      status.textContent = data.active ? data.copy.client_shared : data.copy.client_not_shared;
      card.appendChild(status);

      if (data.expires_on && data.active) {
        const expires = document.createElement("p");
        expires.textContent = `${data.copy.expires} ${data.expires_on}`;
        card.appendChild(expires);
      }

      const actions = document.createElement("div");
      actions.className = "appointment-health-actions";
      const manage = document.createElement("a");
      manage.href = data.card_url;
      manage.textContent = data.has_card ? data.copy.manage_card : navLabel;
      actions.appendChild(manage);

      if (data.active) {
        actions.appendChild(
          button(
            data.copy.revoke,
            async () => {
              await postAction(`/health-safety/appointments/${appointmentId}/revoke/`);
              window.location.reload();
            },
            true
          )
        );
      } else if (data.can_share) {
        actions.appendChild(
          button(data.copy.share_now, async () => {
            await postAction(`/health-safety/appointments/${appointmentId}/share/`);
            window.location.reload();
          })
        );
      }
      card.appendChild(actions);
    }

    details.after(card);
  }

  async function loadAppointmentContext() {
    const match = window.location.pathname.match(/^\/appointments\/(\d+)\/?$/);
    if (!match || !document.querySelector(".appointment-card")) return;
    try {
      const response = await fetch(`/health-safety/appointments/${match[1]}/context/`, {
        credentials: "same-origin",
        headers: {Accept: "application/json"},
      });
      if (!response.ok) return;
      renderAppointmentContext(await response.json(), match[1]);
    } catch (_error) {
      // Appointment remains usable when optional health context is unavailable.
    }
  }

  function bindCardRevokes() {
    document.querySelectorAll("[data-health-revoke]").forEach((control) => {
      control.addEventListener("click", async () => {
        control.disabled = true;
        try {
          await postAction(`/health-safety/appointments/${control.dataset.healthRevoke}/revoke/`);
          control.closest("[data-health-share-row]")?.remove();
        } catch (_error) {
          control.disabled = false;
        }
      });
    });
  }

  function init() {
    addNavigation();
    loadAppointmentContext();
    bindCardRevokes();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, {once: true});
  } else {
    init();
  }
})();
