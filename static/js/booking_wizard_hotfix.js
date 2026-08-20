document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("booking-form");
  if (!form) return;

  const durationButtons = Array.from(document.querySelectorAll("[data-duration]"));
  const durationInput = document.getElementById("booking-duration");

  function normalizeDurationSelection(selectedButton) {
    if (!selectedButton) return;

    const selectedDuration = String(selectedButton.dataset.duration || "");

    durationButtons.forEach((button) => {
      const isSelected = button === selectedButton;
      button.classList.toggle("is-active", isSelected);
      button.classList.toggle("is-selected", isSelected);
      button.setAttribute("aria-pressed", isSelected ? "true" : "false");
    });

    if (durationInput && selectedDuration) {
      durationInput.value = selectedDuration;
    }
  }

  if (durationButtons.length) {
    const currentDuration = String(durationInput?.value || "60");
    const currentButton = durationButtons.find(
      (button) => String(button.dataset.duration) === currentDuration && !button.hidden
    );
    normalizeDurationSelection(currentButton || durationButtons.find((button) => !button.hidden));

    durationButtons.forEach((button) => {
      button.addEventListener("click", () => {
        if (button.disabled || button.hidden) return;
        normalizeDurationSelection(button);
      });
    });
  }

  const consultationToggle = document.getElementById("booking-consultation-toggle");
  const consultationModal = document.getElementById("booking-consultation-modal");
  const consultationContinue = document.getElementById("booking-consultation-continue");
  const consultationNote = document.getElementById("booking-consultation-modal-note");

  if (!consultationModal || !consultationContinue) return;

  let consultationDecision = null;
  let completedConsultationNote = "";
  let restoringDecision = false;

  function selectedConsultationChoice() {
    return document.querySelector(
      '[name="booking-consultation-required-choice"]:checked'
    );
  }

  function rememberConsultationDecision() {
    if (restoringDecision) return;

    const selected = selectedConsultationChoice();
    if (!selected) return;

    consultationDecision = selected.value;
    if (consultationDecision === "completed") {
      completedConsultationNote = consultationNote?.value?.trim() || "";
    }
  }

  function restoreConsultationDecision() {
    if (!consultationDecision || restoringDecision) return;

    const choice = document.querySelector(
      `[name="booking-consultation-required-choice"][value="${consultationDecision}"]`
    );
    if (!choice) return;

    restoringDecision = true;
    choice.checked = true;

    if (consultationNote) {
      const completed = consultationDecision === "completed";
      consultationNote.hidden = !completed;
      if (completed) consultationNote.value = completedConsultationNote;
    }

    consultationModal.hidden = true;
    consultationContinue.click();
    consultationModal.hidden = true;
    restoringDecision = false;
  }

  consultationContinue.addEventListener("click", rememberConsultationDecision);

  if (consultationToggle) {
    consultationToggle.addEventListener("change", () => {
      if (!consultationDecision) return;

      queueMicrotask(() => {
        if (!consultationToggle.checked && consultationDecision === "completed") {
          restoreConsultationDecision();
          consultationToggle.checked = false;
          return;
        }

        if (!consultationToggle.checked && consultationDecision === "book") {
          consultationToggle.checked = true;
          restoreConsultationDecision();
        }
      });
    });
  }

  const modalObserver = new MutationObserver(() => {
    if (!consultationModal.hidden && consultationDecision && !restoringDecision) {
      consultationModal.hidden = true;
      restoreConsultationDecision();
    }
  });

  modalObserver.observe(consultationModal, {
    attributes: true,
    attributeFilter: ["hidden"],
  });
});

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("booking-form");
  const reviewPanel = document.querySelector('[data-booking-panel="4"]');
  if (!form || !reviewPanel) return;

  const artistMatch = form.action.match(/\/appointments\/artist\/([^/]+)\/book\/create\/?$/);
  if (!artistMatch) return;
  const artist = decodeURIComponent(artistMatch[1]);

  let statusData = null;
  let intentReady = false;
  let preparingIntent = false;

  function csrfToken() {
    return form.querySelector('input[name="csrfmiddlewaretoken"]')?.value || "";
  }

  function isTattooBooking() {
    return (document.getElementById("booking-type")?.value || "tattoo_session") === "tattoo_session";
  }

  function healthCardElement() {
    let card = reviewPanel.querySelector(".booking-health-card");
    if (!card) {
      card = document.createElement("section");
      card.className = "booking-health-card booking-health-card-v2";
      const review = document.getElementById("booking-review-card");
      reviewPanel.insertBefore(card, review || reviewPanel.firstChild?.nextSibling || null);
    }
    return card;
  }

  function modeOption(value, text, checked = false) {
    const label = document.createElement("label");
    label.className = "booking-health-mode";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "booking-health-mode";
    input.value = value;
    input.checked = checked;
    const span = document.createElement("span");
    span.textContent = text;
    label.append(input, span);
    return label;
  }

  function checkboxRow(name, text, className = "booking-health-check") {
    const label = document.createElement("label");
    label.className = className;
    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.healthField = name;
    const span = document.createElement("span");
    span.textContent = text;
    label.append(input, span);
    return label;
  }

  function renderHealthStatus(data) {
    statusData = data;
    const card = healthCardElement();
    card.replaceChildren();
    card.hidden = !isTattooBooking();

    const heading = document.createElement("h3");
    heading.textContent = data.copy.booking_title;
    const text = document.createElement("p");
    text.textContent = data.has_card ? data.copy.booking_ready : data.copy.booking_missing;
    card.append(heading, text);

    const modes = document.createElement("div");
    modes.className = "booking-health-modes";
    if (data.has_card) {
      modes.appendChild(modeOption("card", data.copy.booking_share, true));
      modes.appendChild(modeOption("quick", data.copy.booking_quick));
      modes.appendChild(modeOption("none", data.copy.booking_none));
    } else {
      modes.appendChild(modeOption("quick", data.copy.booking_quick, true));
      modes.appendChild(modeOption("none", data.copy.booking_none));
    }
    card.appendChild(modes);

    const quick = document.createElement("div");
    quick.className = "booking-health-quick";
    quick.hidden = data.has_card;

    const intro = document.createElement("p");
    intro.className = "booking-health-quick-intro";
    intro.textContent = data.copy.booking_quick_intro;
    quick.appendChild(intro);

    const fields = document.createElement("div");
    fields.className = "booking-health-field-grid";
    Object.entries(data.field_labels || {}).forEach(([field, label]) => {
      fields.appendChild(checkboxRow(field, label));
    });
    quick.appendChild(fields);

    const otherLabel = document.createElement("label");
    otherLabel.className = "booking-health-other-label";
    const otherTitle = document.createElement("span");
    otherTitle.textContent = data.copy.other;
    const other = document.createElement("textarea");
    other.id = "booking-health-other";
    other.maxLength = 1000;
    other.rows = 3;
    const otherHelp = document.createElement("small");
    otherHelp.textContent = data.copy.other_help;
    otherLabel.append(otherTitle, other, otherHelp);
    quick.appendChild(otherLabel);

    const none = checkboxRow("confirmed_none", data.copy.booking_confirm_none, "booking-health-check is-none");
    none.querySelector("input").id = "booking-health-confirmed-none";
    quick.appendChild(none);

    const consent = checkboxRow("share_consent", data.copy.booking_quick_consent, "booking-health-check is-consent");
    consent.querySelector("input").id = "booking-health-share-consent";
    quick.appendChild(consent);

    const save = checkboxRow("save_to_card", data.copy.booking_save_quick, "booking-health-check is-save");
    save.querySelector("input").id = "booking-health-save-card";
    quick.appendChild(save);

    const error = document.createElement("p");
    error.className = "booking-form-error";
    error.id = "booking-health-error";
    error.hidden = true;
    quick.appendChild(error);
    card.appendChild(quick);

    if (data.has_card) {
      const link = document.createElement("a");
      link.href = data.card_url;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = data.copy.booking_create;
      card.appendChild(link);
    }

    function selectedMode() {
      return card.querySelector('[name="booking-health-mode"]:checked')?.value || "none";
    }

    function syncQuickVisibility() {
      quick.hidden = selectedMode() !== "quick";
    }

    card.querySelectorAll('[name="booking-health-mode"]').forEach((input) => {
      input.addEventListener("change", syncQuickVisibility);
    });

    const confirmedNone = quick.querySelector("#booking-health-confirmed-none");
    const issueInputs = Array.from(
      quick.querySelectorAll('[data-health-field]:not([data-health-field="confirmed_none"]):not([data-health-field="share_consent"]):not([data-health-field="save_to_card"])')
    );

    confirmedNone?.addEventListener("change", () => {
      if (!confirmedNone.checked) return;
      issueInputs.forEach((input) => { input.checked = false; });
      other.value = "";
    });

    issueInputs.forEach((input) => {
      input.addEventListener("change", () => {
        if (input.checked && confirmedNone) confirmedNone.checked = false;
      });
    });
    other.addEventListener("input", () => {
      if (other.value.trim() && confirmedNone) confirmedNone.checked = false;
    });

    syncQuickVisibility();
  }

  async function loadHealthStatus() {
    try {
      const response = await fetch("/health-safety/status/", {
        credentials: "same-origin",
        headers: {Accept: "application/json"},
      });
      if (!response.ok) return;
      renderHealthStatus(await response.json());
    } catch (_error) {
      // Health sharing is optional; booking remains usable if status cannot load.
    }
  }

  function selectedMode() {
    if (!isTattooBooking()) return "none";
    return document.querySelector('[name="booking-health-mode"]:checked')?.value || "none";
  }

  function setHealthError(message) {
    const error = document.getElementById("booking-health-error");
    if (!error) return;
    error.textContent = message || "";
    error.hidden = !message;
  }

  function quickPayload() {
    const values = {};
    document.querySelectorAll(".booking-health-quick [data-health-field]").forEach((input) => {
      values[input.dataset.healthField] = Boolean(input.checked);
    });
    values.other_relevant_information = document.getElementById("booking-health-other")?.value?.trim() || "";
    return values;
  }

  function validateQuickHealth() {
    if (selectedMode() !== "quick") {
      setHealthError("");
      return true;
    }
    const values = quickPayload();
    const issueSelected = Object.entries(values).some(([key, value]) =>
      !["confirmed_none", "share_consent", "save_to_card", "other_relevant_information"].includes(key) && value
    );
    const hasDeclaration = issueSelected || Boolean(values.other_relevant_information) || values.confirmed_none;
    if (!hasDeclaration) {
      setHealthError(statusData?.copy?.booking_validation || "Please complete the health declaration.");
      return false;
    }
    if (!values.share_consent) {
      setHealthError(statusData?.copy?.booking_consent_required || "Please confirm sharing consent.");
      return false;
    }
    setHealthError("");
    return true;
  }

  async function saveIntent() {
    const date = document.getElementById("booking-date")?.value || "";
    const startTime = document.getElementById("booking-time")?.value || "";
    const mode = selectedMode();
    const body = new URLSearchParams({artist, date, start_time: startTime, mode});

    if (mode === "quick") {
      const values = quickPayload();
      Object.entries(values).forEach(([key, value]) => {
        body.set(key, typeof value === "boolean" ? (value ? "true" : "false") : value);
      });
    }

    const response = await fetch("/health-safety/share-intent/", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "X-CSRFToken": csrfToken(),
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        Accept: "application/json",
      },
      body,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "health_share_intent_failed");
  }

  form.addEventListener("submit", async (event) => {
    if (event.defaultPrevented || intentReady || preparingIntent) return;
    if (!validateQuickHealth()) {
      event.preventDefault();
      document.querySelector(".booking-health-card")?.scrollIntoView({behavior: "smooth", block: "center"});
      return;
    }

    event.preventDefault();
    preparingIntent = true;

    try {
      await saveIntent();
      intentReady = true;
      preparingIntent = false;
      form.requestSubmit();
    } catch (_error) {
      preparingIntent = false;
      alert(statusData?.copy?.booking_error || "Could not confirm health-information sharing choice.");
    }
  });

  function refreshVisibilitySoon() {
    queueMicrotask(() => {
      const card = document.querySelector(".booking-health-card");
      if (card) card.hidden = !isTattooBooking();
    });
  }

  document.getElementById("booking-consultation-toggle")?.addEventListener("change", refreshVisibilitySoon);
  document.getElementById("booking-consultation-continue")?.addEventListener("click", refreshVisibilitySoon);

  window.addEventListener("focus", () => {
    loadHealthStatus();
  });

  loadHealthStatus();
});
