document.addEventListener("DOMContentLoaded", () => {
  const dataEl = document.getElementById("booking-data");
  const form = document.getElementById("booking-form");

  if (!dataEl || !form) return;

  const bookingData = JSON.parse(dataEl.textContent);
  const i18nEl = document.getElementById("booking-i18n");
  const bookingI18n = i18nEl ? JSON.parse(i18nEl.textContent) : {};

  function t(key, fallback, params = {}) {
    const value = bookingI18n[key] || fallback;
    return Object.entries(params).reduce(
      (text, [name, replacement]) => text.replaceAll(`%(${name})s`, replacement),
      value
    );
  }

  const state = {
    step: 1,
    cursor: new Date(),
    selectedDate: "",
    selectedTime: "",
    duration: 60,
    bookingType: "tattoo_session",
    isConsultation: false,
    consultationAlreadyCompleted: false,
    consultationNote: "",
    consultationChoiceMade: false,
    styles: [],
    placement: "",
    placementZones: [],
    size: "",
    budget: "",
    references: [],
  };

  const calendarGrid = document.getElementById("booking-calendar-grid");
  const monthLabel = document.getElementById("booking-month-label");
  const slotsWrap = document.getElementById("booking-slots");
  const nextBtn = document.getElementById("booking-next-btn");
  const backBtn = document.getElementById("booking-back-btn");
  const submitBtn = document.getElementById("booking-submit-btn");
  const referenceInput = document.getElementById("booking-references");
  const referenceError = document.getElementById("booking-reference-error");
  const referenceHelp = document.getElementById("booking-reference-help");
  const consultationToggle = document.getElementById("booking-consultation-toggle");
  const consultationModal = document.getElementById("booking-consultation-modal");
  const consultationContinue = document.getElementById("booking-consultation-continue");
  const consultationModalNote = document.getElementById("booking-consultation-modal-note");
  const consultationError = document.getElementById("booking-consultation-error");

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function toISO(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function timeToMinutes(value) {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
  }

  function minutesToTime(value) {
    return `${pad(Math.floor(value / 60))}:${pad(value % 60)}`;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function consultationIsRequired() {
    return Boolean(bookingData.settings.consultation_required_before_booking);
  }

  function bookingTypeLabel() {
    if (state.bookingType === "consultation") return t("Consultation", "Consultation");
    if (state.bookingType === "online_consultation") {
      return t("Online consultation", "Online consultation");
    }
    return t("Tattoo session", "Tattoo session");
  }

  function consultationStatusLabel() {
    if (state.isConsultation) return t("Consultation booking", "Consultation booking");
    return state.consultationAlreadyCompleted
      ? t("Already completed", "Already completed")
      : t("Not completed", "Not completed");
  }

  function setConsultationError(message) {
    if (!consultationError) return;
    consultationError.textContent = message;
    consultationError.hidden = !message;
  }

  function updateDurationButtons() {
    document.querySelectorAll("[data-duration]").forEach((button) => {
      const isOneHour = Number(button.dataset.duration) === 60;
      button.hidden = state.isConsultation && !isOneHour;
      button.disabled = state.isConsultation && !isOneHour;
      button.classList.toggle("is-disabled", button.disabled);
      button.classList.toggle("is-active", Number(button.dataset.duration) === state.duration);
    });
  }

  function applyBookingTypeState({ rerenderSlots = true } = {}) {
    state.isConsultation = ["consultation", "online_consultation"].includes(state.bookingType);

    if (state.isConsultation) {
      state.duration = 60;
      state.consultationAlreadyCompleted = false;
      state.consultationNote = "";
    }

    if (consultationToggle) {
      consultationToggle.checked = state.isConsultation;
    }

    updateDurationButtons();
    syncHiddenFields();

    if (rerenderSlots) {
      state.selectedTime = "";
      document.getElementById("booking-time").value = "";
      renderCalendar();
      renderSlots();
    }
  }

  function openConsultationModal() {
    if (!consultationModal) return;
    consultationModal.hidden = false;
  }

  function closeConsultationModal() {
    if (!consultationModal) return;
    consultationModal.hidden = true;
  }

  function validateConsultationRequirement() {
    if (
      consultationIsRequired()
      && state.bookingType === "tattoo_session"
      && !state.consultationAlreadyCompleted
    ) {
      setConsultationError(t(
        "This artist requires a consultation before booking a tattoo session.",
        "This artist requires a consultation before booking a tattoo session."
      ));
      openConsultationModal();
      return false;
    }

    setConsultationError("");
    return true;
  }

  function getReferenceMinimum() {
    return Number(bookingData.settings.minimum_reference_images) || 0;
  }

  function getReferenceMaximum() {
    return Number(bookingData.settings.maximum_reference_images) || 0;
  }

  function getReferenceRequiredMessage(minimum) {
    return minimum === 1
      ? t("Please upload at least 1 reference image.", "Please upload at least 1 reference image.")
      : t(
        "Please upload at least %(count)s reference images.",
        "Please upload at least %(count)s reference images.",
        { count: minimum }
      );
  }

  function setReferenceError(message) {
    if (!referenceError) return;

    referenceError.textContent = message;
    referenceError.hidden = !message;
  }

  function validateReferences() {
    const count = state.references.length;
    const minimum = getReferenceMinimum();
    const maximum = getReferenceMaximum();

    if (minimum > 0 && count < minimum) {
      setReferenceError(getReferenceRequiredMessage(minimum));
      return false;
    }

    if (maximum && count > maximum) {
      setReferenceError(
        maximum === 1
          ? t("Please upload no more than 1 reference image.", "Please upload no more than 1 reference image.")
          : t(
            "Please upload no more than %(count)s reference images.",
            "Please upload no more than %(count)s reference images.",
            { count: maximum }
          )
      );
      return false;
    }

    setReferenceError("");
    return true;
  }

  function getScheduleForDate(date) {
    const weekday = date.getDay();
    return bookingData.schedule[String(weekday)] || { open: null, close: null, breaks: [] };
  }

  function isVacation(date) {
    return bookingData.vacations.includes(toISO(date));
  }

  function isPastDay(date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const current = new Date(date);
    current.setHours(0, 0, 0, 0);

    return current < today;
  }

  function overlaps(startA, endA, startB, endB) {
    return startA < endB && endA > startB;
  }

  function slotIsOccupied(dateISO, start, end) {
    return bookingData.bookings.some((booking) => {
      if (booking.date !== dateISO || !booking.end_time) return false;

      return overlaps(
        start,
        end,
        timeToMinutes(booking.start_time),
        timeToMinutes(booking.end_time)
      );
    });
  }

  function generateSlots(date) {
    const schedule = getScheduleForDate(date);
    const dateISO = toISO(date);

    if (!schedule.open || !schedule.close || isVacation(date)) {
      return [];
    }

    const open = timeToMinutes(schedule.open);
    const close = timeToMinutes(schedule.close);
    const step = bookingData.settings.slot_step_minutes || 30;
    const duration = state.duration;
    const slots = [];

    const now = new Date();
    const minimum = new Date(
      now.getTime() + (bookingData.settings.minimum_notice_hours || 24) * 60 * 60 * 1000
    );

    for (let start = open; start + duration <= close; start += step) {
      const end = start + duration;

      const slotDate = new Date(date);
      slotDate.setHours(Math.floor(start / 60), start % 60, 0, 0);

      const inBreak = (schedule.breaks || []).some(([breakStart, breakEnd]) => {
        return overlaps(start, end, timeToMinutes(breakStart), timeToMinutes(breakEnd));
      });

      const occupied = slotIsOccupied(dateISO, start, end);

      if (!inBreak && !occupied && slotDate >= minimum) {
        slots.push(minutesToTime(start));
      }
    }

    return slots;
  }

  function renderCalendar() {
    calendarGrid.innerHTML = "";

    const year = state.cursor.getFullYear();
    const month = state.cursor.getMonth();

    monthLabel.textContent = state.cursor.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });

    const first = new Date(year, month, 1);
    const mondayOffset = (first.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - mondayOffset);

    for (let i = 0; i < 42; i += 1) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);

      const button = document.createElement("button");
      button.type = "button";
      button.className = "booking-day";
      button.textContent = day.getDate();

      const schedule = getScheduleForDate(day);
      const disabled =
        day.getMonth() !== month ||
        isPastDay(day) ||
        isVacation(day) ||
        !schedule.open ||
        !schedule.close ||
        generateSlots(day).length === 0;

      if (disabled) {
        button.disabled = true;
      }

      if (toISO(day) === state.selectedDate) {
        button.classList.add("is-selected");
      }

      button.addEventListener("click", () => {
        state.selectedDate = toISO(day);
        state.selectedTime = "";
        document.getElementById("booking-date").value = state.selectedDate;
        document.getElementById("booking-time").value = "";
        renderCalendar();
        renderSlots();
      });

      calendarGrid.appendChild(button);
    }
  }

  function renderSlots() {
    slotsWrap.innerHTML = "";

    if (!state.selectedDate) {
      slotsWrap.innerHTML = `<p class="booking-muted">${escapeHtml(t("Choose a date first.", "Choose a date first."))}</p>`;
      return;
    }

    const date = new Date(`${state.selectedDate}T00:00:00`);
    const slots = generateSlots(date);

    if (!slots.length) {
      slotsWrap.innerHTML = `<p class="booking-muted">${escapeHtml(t("No available slots for this day.", "No available slots for this day."))}</p>`;
      return;
    }

    slots.forEach((slot) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = slot;

      if (slot === state.selectedTime) {
        button.classList.add("is-selected");
      }

      button.addEventListener("click", () => {
        state.selectedTime = slot;
        document.getElementById("booking-time").value = slot;
        renderSlots();
      });

      slotsWrap.appendChild(button);
    });
  }

  function showStep(step) {
    state.step = step;

    document.querySelectorAll("[data-booking-panel]").forEach((panel) => {
      panel.classList.toggle("is-active", Number(panel.dataset.bookingPanel) === step);
    });

    document.querySelectorAll("[data-booking-step]").forEach((dot) => {
      dot.classList.toggle("is-active", Number(dot.dataset.bookingStep) === step);
    });

    backBtn.hidden = step === 1;
    nextBtn.hidden = step === 4;
    submitBtn.hidden = step !== 4;

    if (step === 4) {
      renderReview();
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function composePlacement() {
    const zones = state.placementZones.join(", ");
    const details = (state.placementDetails || "").trim();

    if (zones && details) return `${zones} — ${details}`;
    return zones || details;
  }

  function syncPlacement() {
    state.placement = composePlacement();
    renderPlacementChips();

    document.querySelectorAll("[data-placement-zone]").forEach((button) => {
      const isSelected = state.placementZones.includes(button.dataset.placementZone);
      button.classList.toggle("is-selected", isSelected);
      button.setAttribute("aria-pressed", isSelected ? "true" : "false");
    });

    const placementInput = document.getElementById("booking-placement");
    if (placementInput) {
      placementInput.value = state.placement;
    }
  }

  function syncHiddenFields() {
    syncPlacement();
    document.getElementById("booking-duration").value = state.duration;
    document.getElementById("booking-type").value = state.bookingType;
    document.getElementById("booking-consultation-completed").value = state.consultationAlreadyCompleted ? "true" : "false";
    document.getElementById("booking-consultation-note").value = state.consultationNote;
    document.getElementById("booking-styles").value = state.styles.join(",");
    document.getElementById("booking-size").value = state.size;
    document.getElementById("booking-budget").value = state.budget;
  }

  function renderPlacementChips() {
    const chips = document.getElementById("booking-placement-chips");

    if (!chips) {
      return;
    }

    chips.innerHTML = "";

    if (!state.placementZones.length) {
      const empty = document.createElement("span");
      empty.className = "booking-placement-empty";
      empty.textContent = t("No placement selected", chips.dataset.emptyLabel || "No placement selected");
      chips.appendChild(empty);
      return;
    }

    state.placementZones.forEach((zone) => {
      const chip = document.createElement("span");
      chip.className = "booking-placement-chip";
      chip.textContent = zone;
      chips.appendChild(chip);
    });
  }

  function renderReview() {
    syncHiddenFields();

    const review = document.getElementById("booking-review-card");

    review.innerHTML = `
      <div><span>${escapeHtml(t("Date", "Date"))}</span><strong>${state.selectedDate || "—"}</strong></div>
      <div><span>${escapeHtml(t("Time", "Time"))}</span><strong>${state.selectedTime || "—"}</strong></div>
      <div><span>${escapeHtml(t("Booking type", "Booking type"))}</span><strong>${bookingTypeLabel()}</strong></div>
      <div><span>${escapeHtml(t("Session", "Session"))}</span><strong>${state.duration / 60}h</strong></div>
      <div><span>${escapeHtml(t("Consultation", "Consultation"))}</span><strong>${consultationStatusLabel()}</strong></div>
      ${state.consultationNote ? `<div><span>${escapeHtml(t("Consultation note", "Consultation note"))}</span><strong>${escapeHtml(state.consultationNote)}</strong></div>` : ""}
      <div><span>${escapeHtml(t("Styles", "Styles"))}</span><strong>${state.styles.join(", ") || "—"}</strong></div>
      <div><span>${escapeHtml(t("Placement", "Placement"))}</span><strong>${state.placement || "—"}</strong></div>
      <div><span>${escapeHtml(t("Size", "Size"))}</span><strong>${state.size || "—"}</strong></div>
      <div><span>${escapeHtml(t("Budget", "Budget"))}</span><strong>${state.budget || "—"}</strong></div>
      <div><span>${escapeHtml(t("References", "References"))}</span><strong>${state.references.length} ${escapeHtml(t("uploaded", "uploaded"))}</strong></div>
    `;
  }

  document.getElementById("booking-prev").addEventListener("click", () => {
    state.cursor.setMonth(state.cursor.getMonth() - 1);
    renderCalendar();
  });

  document.getElementById("booking-next").addEventListener("click", () => {
    state.cursor.setMonth(state.cursor.getMonth() + 1);
    renderCalendar();
  });

  document.querySelectorAll("[data-duration]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) return;

      state.duration = Number(button.dataset.duration);

      document.querySelectorAll("[data-duration]").forEach((btn) => {
        btn.classList.toggle("is-active", btn === button);
      });

      state.selectedTime = "";
      document.getElementById("booking-time").value = "";

      renderCalendar();
      renderSlots();
    });
  });

  if (consultationToggle) {
    consultationToggle.addEventListener("change", (event) => {
      state.bookingType = event.target.checked ? "consultation" : "tattoo_session";
      state.consultationAlreadyCompleted = false;
      state.consultationChoiceMade = true;
      applyBookingTypeState();
    });
  }

  document.querySelectorAll('[name="booking-consultation-required-choice"]').forEach((input) => {
    input.addEventListener("change", () => {
      const completed = input.value === "completed" && input.checked;
      if (consultationModalNote) consultationModalNote.hidden = !completed;
    });
  });

  if (consultationModalNote) {
    consultationModalNote.addEventListener("input", (event) => {
      state.consultationNote = event.target.value.trim();
      syncHiddenFields();
    });
  }

  if (consultationContinue) {
    consultationContinue.addEventListener("click", () => {
      const selected = document.querySelector('[name="booking-consultation-required-choice"]:checked');
      const completed = selected && selected.value === "completed";

      state.consultationChoiceMade = true;
      state.bookingType = completed ? "tattoo_session" : "consultation";
      state.consultationAlreadyCompleted = completed;
      state.consultationNote = completed && consultationModalNote ? consultationModalNote.value.trim() : "";

      closeConsultationModal();
      applyBookingTypeState();
      validateConsultationRequirement();
    });
  }

  document.querySelectorAll('[data-choice-group="styles"] button').forEach((button) => {
    button.addEventListener("click", () => {
      const value = button.dataset.value;
      const exists = state.styles.includes(value);

      state.styles = exists
        ? state.styles.filter((item) => item !== value)
        : [...state.styles, value];

      button.classList.toggle("is-selected", !exists);
      syncHiddenFields();
    });
  });

  document.querySelectorAll('[data-choice-group="size"] button').forEach((button) => {
    button.addEventListener("click", () => {
      state.size = button.dataset.value;

      document.querySelectorAll('[data-choice-group="size"] button').forEach((btn) => {
        btn.classList.toggle("is-selected", btn === button);
      });

      syncHiddenFields();
    });
  });

  document.querySelectorAll('[data-choice-group="budget"] button').forEach((button) => {
    button.addEventListener("click", () => {
      state.budget = button.dataset.value;

      document.querySelectorAll('[data-choice-group="budget"] button').forEach((btn) => {
        btn.classList.toggle("is-selected", btn === button);
      });

      syncHiddenFields();
    });
  });

  document.querySelectorAll("[data-placement-zone]").forEach((button) => {
    button.addEventListener("click", () => {
      const zone = button.dataset.placementZone;
      const exists = state.placementZones.includes(zone);

      state.placementZones = exists
        ? state.placementZones.filter((item) => item !== zone)
        : [...state.placementZones, zone];

      syncPlacement();
    });
  });

  renderPlacementChips();

  document.getElementById("booking-references").addEventListener("change", (event) => {
    const grid = document.getElementById("booking-reference-grid");
    const files = Array.from(event.target.files || []);
    state.references = files;
    grid.innerHTML = "";

    files.forEach((file) => {
      const url = URL.createObjectURL(file);
      const img = document.createElement("img");
      img.src = url;
      img.alt = file.name;
      grid.appendChild(img);
    });

    validateReferences();
  });

  nextBtn.addEventListener("click", () => {
    if (state.step === 1 && (!state.selectedDate || !state.selectedTime)) {
      alert(t("Please choose a date and time.", "Please choose a date and time."));
      return;
    }

    if (state.step === 1 && !validateConsultationRequirement()) {
      return;
    }

    if (state.step === 3 && !validateReferences()) {
      return;
    }

    if (state.step < 4) {
      showStep(state.step + 1);
    }
  });

  backBtn.addEventListener("click", () => {
    if (state.step > 1) {
      showStep(state.step - 1);
    }
  });

  form.addEventListener("submit", (event) => {
    syncHiddenFields();

    if (!state.selectedDate || !state.selectedTime) {
      event.preventDefault();
      alert(t("Please choose a date and time.", "Please choose a date and time."));
      return;
    }

    if (!validateConsultationRequirement()) {
      event.preventDefault();
      return;
    }

    if (!validateReferences()) {
      event.preventDefault();
    }
  });

  if (consultationIsRequired()) {
    const bookConsultationChoice = document.querySelector(
      '[name="booking-consultation-required-choice"][value="book"]'
    );

    if (bookConsultationChoice) bookConsultationChoice.checked = true;
    if (consultationModalNote) consultationModalNote.hidden = true;

    state.bookingType = "consultation";
    state.duration = 60;
    state.consultationAlreadyCompleted = false;
    state.consultationChoiceMade = false;
    openConsultationModal();
  }

  applyBookingTypeState({ rerenderSlots: false });
  renderCalendar();
  renderSlots();
  showStep(1);
});
