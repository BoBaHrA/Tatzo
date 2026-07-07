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

function getBlockedDates() {
  return new Set(
    Array.from(document.querySelectorAll('input[name="blocked_dates"]'))
      .map((input) => input.value)
      .filter(Boolean)
  );
}

function syncBlockedEmptyState() {
  const list = document.getElementById("artist-blocked-list");

  if (!list) {
    return;
  }

  const hasChips = Boolean(list.querySelector("[data-blocked-chip]"));
  let empty = list.querySelector("[data-empty-blocked]");

  if (hasChips) {
    empty?.remove();
    return;
  }

  if (!empty) {
    const form = document.querySelector(".artist-blocked-period-form");
    empty = document.createElement("p");
    empty.className = "artist-empty";
    empty.dataset.emptyBlocked = "";
    empty.textContent = form?.dataset.emptyMessage || "No blocked periods yet.";
    list.appendChild(empty);
  }
}

function setBlockedError(message) {
  const error = document.getElementById("artist-blocked-error");

  if (!error) {
    return;
  }

  error.textContent = message || "";
  error.hidden = !message;
}

function padDatePart(value) {
  return String(value).padStart(2, "0");
}

function parseISODateValue(value) {
  const parts = String(value || "").split("-").map(Number);

  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    return null;
  }

  const [year, month, day] = parts;
  return new Date(year, month - 1, day);
}

function formatISODateValue(date) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function addDays(value, days) {
  const date = parseISODateValue(value);

  if (!date) {
    return value;
  }

  date.setDate(date.getDate() + days);
  return formatISODateValue(date);
}

function expandDateRange(startValue, endValue) {
  const dates = [];
  const startDate = parseISODateValue(startValue);
  const endDate = parseISODateValue(endValue);

  if (!startDate || !endDate) {
    return dates;
  }

  const cursor = new Date(startDate);
  const maxDays = 370;

  while (cursor <= endDate && dates.length < maxDays) {
    dates.push(formatISODateValue(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function createHiddenInput(name, value) {
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = name;
  input.value = value;
  return input;
}

function formatBlockedDate(value) {
  const date = new Date(`${value}T00:00:00`);

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatBlockedLabel(startValue, endValue, reason) {
  const range = startValue === endValue
    ? formatBlockedDate(startValue)
    : `${formatBlockedDate(startValue)} — ${formatBlockedDate(endValue)}`;

  return reason ? `${range} · ${reason}` : range;
}

function addBlockedPeriodChip(startValue, endValue, dates, reason) {
  const list = document.getElementById("artist-blocked-list");

  if (!list) {
    return;
  }

  list.querySelector("[data-empty-blocked]")?.remove();

  const chip = document.createElement("div");
  chip.className = "artist-blocked-chip";
  chip.dataset.blockedChip = "";
  chip.dataset.startDate = startValue;
  chip.dataset.endDate = endValue;

  dates.forEach((dateValue) => {
    chip.appendChild(createHiddenInput("blocked_dates", dateValue));
    chip.appendChild(createHiddenInput("blocked_reasons", reason));
  });

  const label = document.createElement("span");
  label.textContent = formatBlockedLabel(startValue, endValue, reason);
  chip.appendChild(label);

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.setAttribute("aria-label", "Remove blocked period");
  removeButton.textContent = "×";
  chip.appendChild(removeButton);

  list.appendChild(chip);
}

document.addEventListener("DOMContentLoaded", () => {
  refreshArtistIcons();
  syncCalendarRows();
  syncBlockedEmptyState();

  document.addEventListener("click", (event) => {
    const panelTrigger = event.target.closest("[data-artist-panel-target]");

    if (panelTrigger) {
      event.preventDefault();
      showArtistPanel(panelTrigger.dataset.artistPanelTarget);
      return;
    }

    const removeBlockedButton = event.target.closest("[data-blocked-chip] button");

    if (removeBlockedButton) {
      removeBlockedButton.closest("[data-blocked-chip]")?.remove();
      syncBlockedEmptyState();
      setBlockedError("");
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

  const addBlockedButton = document.getElementById("artist-add-blocked-period");
  const blockedStartInput = document.getElementById("artist-blocked-start-date");
  const blockedEndInput = document.getElementById("artist-blocked-end-date");
  const blockedReasonInput = document.getElementById("artist-blocked-reason");
  const blockedForm = document.querySelector(".artist-blocked-period-form");

  addBlockedButton?.addEventListener("click", () => {
    if (!blockedStartInput) {
      return;
    }

    const startValue = blockedStartInput.value;
    const endValue = blockedEndInput?.value || startValue;
    const reason = (blockedReasonInput?.value || "").trim().slice(0, 160);

    if (!startValue) {
      setBlockedError(blockedForm?.dataset.missingStartMessage || "Choose a start date first.");
      blockedStartInput.focus();
      return;
    }

    if (endValue < startValue) {
      setBlockedError(blockedForm?.dataset.invalidRangeMessage || "End date cannot be before start date.");
      blockedEndInput?.focus();
      return;
    }

    const existingDates = getBlockedDates();
    const dates = expandDateRange(startValue, endValue).filter(
      (dateValue) => !existingDates.has(dateValue)
    );

    if (!dates.length) {
      setBlockedError(blockedForm?.dataset.duplicateMessage || "Those dates are already blocked.");
      return;
    }

    addBlockedPeriodChip(dates[0], dates[dates.length - 1], dates, reason);
    setBlockedError("");
    blockedStartInput.value = "";

    if (blockedEndInput) {
      blockedEndInput.value = "";
    }

    if (blockedReasonInput) {
      blockedReasonInput.value = "";
    }

    syncBlockedEmptyState();
  });

  document.querySelectorAll(".artist-bar-fill[data-percent]").forEach((bar) => {
    const rawPercent = Number.parseFloat(bar.dataset.percent || "0");
    const safePercent = Math.max(0, Math.min(100, rawPercent));

    requestAnimationFrame(() => {
      bar.style.width = `${safePercent}%`;
    });
  });
});