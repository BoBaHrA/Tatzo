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
        // appointments.js updates the internal duration state first. This listener
        // runs afterwards and keeps every visual selection class in sync.
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

    // Reuse the existing wizard handler so its private state and hidden fields
    // stay authoritative. The modal remains hidden, so the user is not asked twice.
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
        // A user who confirmed an earlier consultation may temporarily choose
        // to book another consultation. If they switch back, restore the fact
        // that the required consultation was already completed.
        if (!consultationToggle.checked && consultationDecision === "completed") {
          restoreConsultationDecision();
          consultationToggle.checked = false;
          return;
        }

        // If the initial decision was to book the required consultation, do not
        // allow the optional toggle to silently bypass that requirement later.
        if (!consultationToggle.checked && consultationDecision === "book") {
          consultationToggle.checked = true;
          restoreConsultationDecision();
        }
      });
    });
  }

  const modalObserver = new MutationObserver(() => {
    if (!consultationModal.hidden && consultationDecision && !restoringDecision) {
      // validateConsultationRequirement() may try to show the same question on
      // Next/Submit. Reapply the already-made choice silently instead.
      consultationModal.hidden = true;
      restoreConsultationDecision();
    }
  });

  modalObserver.observe(consultationModal, {
    attributes: true,
    attributeFilter: ["hidden"],
  });
});
