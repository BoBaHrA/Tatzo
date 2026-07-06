function refreshArtistIcons() {
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

function showArtistPanel(target) {
  document.querySelectorAll("[data-artist-panel]").forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.artistPanel === target);
  });

  document.querySelectorAll("[data-artist-panel-target]").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.artistPanelTarget === target);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
  refreshArtistIcons();
}

function syncCalendarRows() {
  document.querySelectorAll("[data-calendar-row]").forEach((row) => {
    const checkbox = row.querySelector("[data-day-open]");

    if (!checkbox) {
      return;
    }

    row.classList.toggle("is-closed", !checkbox.checked);
  });
}

function rebuildBlockedHiddenFields() {
  const hiddenWrap = document.getElementById("artist-blocked-hidden-fields");

  if (!hiddenWrap) {
    return;
  }

  hiddenWrap.innerHTML = "";

  document.querySelectorAll("[data-blocked-chip]").forEach((chip) => {
    const value = chip.dataset.date;

    if (!value) {
      return;
    }

    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "blocked_dates";
    input.value = value;

    hiddenWrap.appendChild(input);
  });
}

function formatBlockedDate(value) {
  const date = new Date(`${value}T00:00:00`);

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

document.addEventListener("DOMContentLoaded", () => {
  refreshArtistIcons();
  syncCalendarRows();
  rebuildBlockedHiddenFields();

  document.addEventListener("click", (event) => {
    const panelTrigger = event.target.closest("[data-artist-panel-target]");

    if (panelTrigger) {
      event.preventDefault();
      showArtistPanel(panelTrigger.dataset.artistPanelTarget);
      return;
    }

    const blockedChip = event.target.closest("[data-blocked-chip]");

    if (blockedChip) {
      blockedChip.remove();
      rebuildBlockedHiddenFields();

      const list = document.getElementById("artist-blocked-list");
      const existing = list?.querySelector("[data-blocked-chip]");

      if (list && !existing) {
        const empty = document.createElement("p");
        empty.className = "artist-empty";
        empty.dataset.emptyBlocked = "";
        empty.textContent = "No blocked dates yet.";
        list.appendChild(empty);
      }

      return;
    }

    const vacationToggle = event.target.closest("[data-vacation-toggle]");

    if (vacationToggle) {
      vacationToggle.classList.toggle("is-on");
    }

    const ruleCard = event.target.closest(".artist-rule-card");

    if (ruleCard) {
      document.querySelectorAll(".artist-rule-card").forEach((card) => {
        card.classList.toggle("is-active", card === ruleCard);
      });
    }
  });

  document.addEventListener("change", (event) => {
    if (event.target.matches("[data-day-open]")) {
      syncCalendarRows();
    }
  });

  const addBlockedButton = document.getElementById("artist-add-blocked-date");
  const blockedDateInput = document.getElementById("artist-blocked-date-input");
  const blockedList = document.getElementById("artist-blocked-list");

  addBlockedButton?.addEventListener("click", () => {
    if (!blockedDateInput || !blockedList || !blockedDateInput.value) {
      return;
    }

    const value = blockedDateInput.value;

    const exists = Array.from(
      blockedList.querySelectorAll("[data-blocked-chip]")
    ).some((chip) => chip.dataset.date === value);

    if (exists) {
      blockedDateInput.value = "";
      return;
    }

    blockedList.querySelector("[data-empty-blocked]")?.remove();

    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "artist-chip is-selected";
    chip.dataset.blockedChip = "";
    chip.dataset.date = value;
    chip.innerHTML = `${formatBlockedDate(value)} <span>×</span>`;

    blockedList.appendChild(chip);
    blockedDateInput.value = "";

    rebuildBlockedHiddenFields();
  });

  document.querySelectorAll(".artist-bar-fill[data-percent]").forEach((bar) => {
    const rawPercent = Number.parseFloat(bar.dataset.percent || "0");
    const safePercent = Math.max(0, Math.min(100, rawPercent));

    requestAnimationFrame(() => {
      bar.style.width = `${safePercent}%`;
    });
  });
});