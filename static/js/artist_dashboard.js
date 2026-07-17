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

function getCookie(name) {
  const cookies = document.cookie ? document.cookie.split(";") : [];

  for (const cookie of cookies) {
    const trimmedCookie = cookie.trim();
    const prefix = `${name}=`;

    if (trimmedCookie.startsWith(prefix)) {
      return decodeURIComponent(trimmedCookie.slice(prefix.length));
    }
  }

  return "";
}

function getAutosaveUrl() {
  return document.querySelector(".artist-dashboard-page")?.dataset.autosaveUrl || "";
}

function setAutosaveIndicator(message, state) {
  const indicator = document.querySelector("[data-autosave-indicator]");

  if (!indicator) {
    return;
  }

  window.clearTimeout(Number(indicator.dataset.hideTimer || 0));
  indicator.textContent = message;
  indicator.hidden = false;
  indicator.classList.remove("is-saving", "is-saved", "is-error");

  if (state) {
    indicator.classList.add(`is-${state}`);
  }

  if (state === "saved") {
    const timer = window.setTimeout(() => {
      indicator.hidden = true;
    }, 2600);
    indicator.dataset.hideTimer = String(timer);
  }
}

function getCsrfToken() {
  return (
    getCookie("csrftoken") ||
    document.querySelector('input[name="csrfmiddlewaretoken"]')?.value ||
    ""
  );
}

function updateAutosaveFormState(data) {
  if (!data) {
    return;
  }

  if (data.current_status) {
    const currentStatus = document.querySelector("[data-current-status]");

    if (currentStatus) {
      currentStatus.textContent = data.current_status;
    }
  }

  if (data.booking_status) {
    const bookingStatusInput = document.getElementById("artist-booking-status");

    if (bookingStatusInput) {
      bookingStatusInput.value = data.booking_status;
    }
  }

  if (typeof data.bookings_enabled === "boolean") {
    document.querySelectorAll('[name="bookings_enabled"]').forEach((input) => {
      if (input.type === "checkbox") {
        input.checked = data.bookings_enabled;
      }
    });
  }

  if (data.setting && typeof data.value === "boolean") {
    document.querySelectorAll(`[name="${data.setting}"]`).forEach((input) => {
      if (input.type === "checkbox") {
        input.checked = data.value;
      }
    });
  }

  if (data.setting === "active_styles" && Array.isArray(data.value)) {
    document.querySelectorAll('[name="active_styles"]').forEach((input) => {
      input.checked = data.value.includes(input.value);
    });
  }
}

async function autosaveSetting(setting, value) {
  const autosaveUrl = getAutosaveUrl();

  if (!autosaveUrl) {
    setAutosaveIndicator("Autosave unavailable", "error");
    console.error("Tatzo autosave failed", {
      setting,
      value,
      status: "missing-url",
      data: null,
    });
    throw new Error("Autosave URL is missing.");
  }

  setAutosaveIndicator("Saving...", "saving");

  let response;
  let data = {};

  try {
    response = await fetch(autosaveUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCsrfToken(),
      },
      body: JSON.stringify({ setting, value }),
    });
    data = await response.json().catch(() => ({}));
  } catch (error) {
    setAutosaveIndicator("Could not save", "error");
    console.error("Tatzo autosave failed", {
      setting,
      value,
      status: "network-error",
      data: error,
    });
    throw error;
  }

  if (!response.ok || data.ok === false) {
    setAutosaveIndicator("Could not save", "error");
    console.error("Tatzo autosave failed", {
      setting,
      value,
      status: response.status,
      data,
    });
    throw new Error(data.error || "Autosave failed.");
  }

  updateAutosaveFormState(data);
  window.dispatchEvent(new CustomEvent("tatzo:autosave-success", { detail: data }));
  setAutosaveIndicator("Saved", "saved");
  return data;
}

function collectActiveStyles() {
  return Array.from(document.querySelectorAll("[data-autosave-styles]:checked")).map(
    (input) => input.value
  );
}

function syncCalendarRows() {
  document.querySelectorAll("[data-calendar-row], [data-week-row]").forEach((row) => {
    const checkbox = row.querySelector("[data-day-open], .artist-switch-input");

    if (!checkbox) {
      return;
    }

    const isOpen = checkbox.checked;
    row.classList.toggle("is-closed", !isOpen);

    if (row.matches("[data-week-row]")) {
      row.querySelectorAll('input[type="time"]').forEach((input) => {
        input.disabled = !isOpen;
      });
    }
  });
}

function openManualBookingModal() {
  const modal = document.querySelector("[data-manual-booking-modal]");

  if (!modal) {
    return;
  }

  modal.hidden = false;
  modal.querySelector("input, select, textarea, button")?.focus();
}

function closeManualBookingModal() {
  const modal = document.querySelector("[data-manual-booking-modal]");

  if (!modal) {
    return;
  }

  modal.hidden = true;
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
  const year = date.getFullYear();
  const month = padDatePart(date.getMonth() + 1);
  const day = padDatePart(date.getDate());

  return `${year}-${month}-${day}`;
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
  const date = parseISODateValue(value);

  if (!date) {
    return value;
  }

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

function isDefaultBlockedReason(reason) {
  return reason === "Blocked from artist dashboard";
}

function readBlockedEntries() {
  const dateInputs = Array.from(document.querySelectorAll('input[name="blocked_dates"]'));
  const reasonInputs = Array.from(document.querySelectorAll('input[name="blocked_reasons"]'));
  const entriesByDate = new Map();

  dateInputs.forEach((input, index) => {
    const dateValue = input.value;

    if (!dateValue || !parseISODateValue(dateValue)) {
      return;
    }

    const reason = (reasonInputs[index]?.value || "").trim().slice(0, 160);
    const existingReason = entriesByDate.get(dateValue);

    if (
      existingReason === undefined
      || (!existingReason && reason)
      || (isDefaultBlockedReason(existingReason) && reason)
    ) {
      entriesByDate.set(dateValue, reason);
    }
  });

  return Array.from(entriesByDate, ([date, reason]) => ({ date, reason }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function normalizeBlockedRanges(entries) {
  const ranges = [];

  entries.forEach((entry) => {
    const previous = ranges[ranges.length - 1];

    if (
      previous
      && previous.reason === entry.reason
      && addDays(previous.endDate, 1) === entry.date
    ) {
      previous.endDate = entry.date;
      previous.dates.push(entry.date);
      return;
    }

    ranges.push({
      startDate: entry.date,
      endDate: entry.date,
      reason: entry.reason,
      dates: [entry.date],
    });
  });

  return ranges;
}

function createBlockedPeriodChip(range) {
  const chip = document.createElement("div");
  chip.className = "artist-blocked-chip";
  chip.dataset.blockedChip = "";
  chip.dataset.startDate = range.startDate;
  chip.dataset.endDate = range.endDate;
  chip.dataset.reason = range.reason;

  range.dates.forEach((dateValue) => {
    chip.appendChild(createHiddenInput("blocked_dates", dateValue));
    chip.appendChild(createHiddenInput("blocked_reasons", range.reason));
  });

  const label = document.createElement("span");
  label.textContent = formatBlockedLabel(range.startDate, range.endDate, range.reason);
  chip.appendChild(label);

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.setAttribute("aria-label", "Remove blocked period");
  removeButton.textContent = "×";
  chip.appendChild(removeButton);

  return chip;
}

function renderBlockedEntries(entries) {
  const list = document.getElementById("artist-blocked-list");

  if (!list) {
    return;
  }

  list.innerHTML = "";

  normalizeBlockedRanges(entries).forEach((range) => {
    list.appendChild(createBlockedPeriodChip(range));
  });

  syncBlockedEmptyState();
}

function rebuildBlockedChips() {
  renderBlockedEntries(readBlockedEntries());
}

function upsertBlockedDates(dates, reason) {
  const entriesByDate = new Map(
    readBlockedEntries().map((entry) => [entry.date, entry.reason])
  );
  let changed = false;

  dates.forEach((dateValue) => {
    const existingReason = entriesByDate.get(dateValue);

    if (existingReason === undefined) {
      entriesByDate.set(dateValue, reason);
      changed = true;
      return;
    }

    if (reason && (!existingReason || isDefaultBlockedReason(existingReason))) {
      entriesByDate.set(dateValue, reason);
      changed = true;
    }
  });

  return {
    changed,
    entries: Array.from(entriesByDate, ([date, entryReason]) => ({
      date,
      reason: entryReason,
    })).sort((a, b) => a.date.localeCompare(b.date)),
  };
}


function handleBookingRuleAutosave(ruleCard) {
  const bookingStatusInput = document.getElementById("artist-booking-status");
  const bookingStatus = ruleCard.dataset.bookingStatus;
  const previousStatus = bookingStatusInput?.value || "";
  const previousActiveCard = document.querySelector(".artist-rule-card.is-active");

  if (bookingStatusInput && bookingStatus) {
    bookingStatusInput.value = bookingStatus;
  }

  document.querySelectorAll(".artist-rule-card").forEach((card) => {
    card.classList.toggle("is-active", card === ruleCard);
  });

  if (!bookingStatus) {
    return;
  }

  autosaveSetting("booking_status", bookingStatus).catch(() => {
    if (bookingStatusInput) {
      bookingStatusInput.value = previousStatus;
    }

    document.querySelectorAll(".artist-rule-card").forEach((card) => {
      card.classList.toggle("is-active", card === previousActiveCard);
    });
  });
}

function handleAutosaveCheckboxChange(checkbox) {
  const setting = checkbox.dataset.autosaveSetting;
  const checked = checkbox.checked;

  autosaveSetting(setting, checked).catch(() => {
    checkbox.checked = !checked;
    syncCalendarRows();
  });
}

function handleActiveStylesAutosave(checkbox) {
  const checked = checkbox.checked;

  autosaveSetting("active_styles", collectActiveStyles()).catch(() => {
    checkbox.checked = !checked;
  });
}

function attachAutosaveHandlers() {
  document.querySelectorAll(".artist-rule-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      event.preventDefault();
      event.tatzoAutosaveHandled = true;
      handleBookingRuleAutosave(card);
    });
  });

  document.querySelectorAll("[data-autosave-setting]").forEach((input) => {
    input.addEventListener("change", (event) => {
      event.tatzoAutosaveHandled = true;
      handleAutosaveCheckboxChange(input);
    });
  });

  document.querySelectorAll("[data-autosave-styles]").forEach((input) => {
    input.addEventListener("change", (event) => {
      event.tatzoAutosaveHandled = true;
      handleActiveStylesAutosave(input);
    });
  });
}

window.tatzoAutosaveTest = function tatzoAutosaveTest(setting, value) {
  return autosaveSetting(setting, value);
};

document.addEventListener("DOMContentLoaded", () => {
  [refreshArtistIcons, syncCalendarRows, rebuildBlockedChips].forEach((init) => {
    try {
      init();
    } catch (error) {
      console.error("Tatzo dashboard init failed", error);
    }
  });
  attachAutosaveHandlers();

  document.addEventListener("click", (event) => {
    const panelTrigger = event.target.closest("[data-artist-panel-target]");

    if (panelTrigger) {
      if (panelTrigger.hasAttribute("data-artist-panel-link")) {
        return;
      }
      event.preventDefault();
      showArtistPanel(panelTrigger.dataset.artistPanelTarget);
      return;
    }

    if (event.target.closest("[data-open-manual-booking]")) {
      event.preventDefault();
      openManualBookingModal();
      return;
    }

    if (event.target.closest("[data-close-manual-booking]")) {
      event.preventDefault();
      closeManualBookingModal();
      return;
    }

    if (event.target.closest("[data-manual-booking-go-bookings]")) {
      event.preventDefault();
      closeManualBookingModal();
      showArtistPanel("bookings");
      return;
    }

    const removeBlockedButton = event.target.closest("[data-blocked-chip] button");

    if (removeBlockedButton) {
      removeBlockedButton.closest("[data-blocked-chip]")?.remove();
      rebuildBlockedChips();
      setBlockedError("");
      return;
    }

    const vacationToggle = event.target.closest("[data-vacation-toggle]");

    if (vacationToggle) {
      vacationToggle.classList.toggle("is-on");
    }

    const ruleCard = event.target.closest(".artist-rule-card");

    if (ruleCard && !event.tatzoAutosaveHandled) {
      event.preventDefault();
      handleBookingRuleAutosave(ruleCard);
    }
  });

  document.addEventListener("change", (event) => {
    if (event.target.matches("[data-day-open], .artist-switch-input")) {
      syncCalendarRows();
    }

    if (event.target.matches("[data-autosave-setting]") && !event.tatzoAutosaveHandled) {
      handleAutosaveCheckboxChange(event.target);
    }

    if (event.target.matches("[data-autosave-styles]") && !event.tatzoAutosaveHandled) {
      handleActiveStylesAutosave(event.target);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeManualBookingModal();
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

    const dates = expandDateRange(startValue, endValue);
    const result = upsertBlockedDates(dates, reason);

    if (!result.changed) {
      setBlockedError(blockedForm?.dataset.duplicateMessage || "Those dates are already blocked.");
      return;
    }

    renderBlockedEntries(result.entries);
    setBlockedError("");
    blockedStartInput.value = "";

    if (blockedEndInput) {
      blockedEndInput.value = "";
    }

    if (blockedReasonInput) {
      blockedReasonInput.value = "";
    }

  });

  document.querySelectorAll(".artist-bar-fill[data-percent]").forEach((bar) => {
    const rawPercent = Number.parseFloat(bar.dataset.percent || "0");
    const safePercent = Math.max(0, Math.min(100, rawPercent));

    requestAnimationFrame(() => {
      bar.style.width = `${safePercent}%`;
    });
  });
});