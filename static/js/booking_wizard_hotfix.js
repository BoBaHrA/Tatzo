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

  function healthCardElement() {
    let card = reviewPanel.querySelector(".booking-health-card");
    if (!card) {
      card = document.createElement("section");
      card.className = "booking-health-card";
      const review = document.getElementById("booking-review-card");
      reviewPanel.insertBefore(card, review || reviewPanel.firstChild?.nextSibling || null);
    }
    return card;
  }

  function renderHealthStatus(data) {
    statusData = data;
    const card = healthCardElement();
    card.replaceChildren();

    const heading = document.createElement("h3");
    heading.textContent = data.copy.booking_title;
    const text = document.createElement("p");
    text.textContent = data.has_card ? data.copy.booking_ready : data.copy.booking_missing;
    card.append(heading, text);

    if (data.has_card) {
      const label = document.createElement("label");
      label.className = "booking-health-choice";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = "booking-health-share";
      const span = document.createElement("span");
      span.textContent = data.copy.booking_share;
      label.append(checkbox, span);
      card.appendChild(label);
    } else {
      const link = document.createElement("a");
      link.href = data.card_url;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = data.copy.booking_create;
      card.appendChild(link);
    }
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

  async function saveIntent(share) {
    const date = document.getElementById("booking-date")?.value || "";
    const startTime = document.getElementById("booking-time")?.value || "";
    const body = new URLSearchParams({
      artist,
      date,
      start_time: startTime,
      share: share ? "true" : "false",
    });
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
    if (!response.ok) throw new Error("health_share_intent_failed");
  }

  form.addEventListener("submit", async (event) => {
    if (event.defaultPrevented || intentReady || preparingIntent) return;

    event.preventDefault();
    preparingIntent = true;
    const share = Boolean(document.getElementById("booking-health-share")?.checked);

    try {
      await saveIntent(share);
      intentReady = true;
      preparingIntent = false;
      form.requestSubmit();
    } catch (_error) {
      preparingIntent = false;
      alert(statusData?.copy?.booking_error || "Could not confirm health-information sharing choice.");
    }
  });

  window.addEventListener("focus", () => {
    loadHealthStatus();
  });

  loadHealthStatus();
});
