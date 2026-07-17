(function () {
  const root = document.querySelector(".tatzo-calendar-page.calendar-shell");
  if (!root) return;

  const state = {
    view: "month",
    date: new Date(),
    events: [],
    days: {},
    role: root.dataset.role,
  };

  const grid = document.getElementById("calendar-grid");
  const title = document.getElementById("calendar-title");
  const status = document.getElementById("calendar-status");
  const csrf = () => document.querySelector("[name=csrfmiddlewaretoken]")?.value || "";
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const startOfWeek = (d) => {
    const x = new Date(d);
    const day = (x.getDay() + 6) % 7;
    x.setDate(x.getDate() - day);
    return x;
  };
  const isSameDay = (a, b) => ymd(a) === ymd(b);
  const plural = (count, singular, pluralForm = `${singular}s`) => `${count} ${count === 1 ? singular : pluralForm}`;

  function range() {
    let s;
    let e;
    if (state.view === "month") {
      s = new Date(state.date.getFullYear(), state.date.getMonth(), 1);
      s = startOfWeek(s);
      e = new Date(s);
      e.setDate(e.getDate() + 41);
    } else if (state.view === "week") {
      s = startOfWeek(state.date);
      e = new Date(s);
      e.setDate(e.getDate() + 6);
    } else {
      s = new Date(state.date);
      e = new Date(state.date);
    }
    return [s, e];
  }

  async function load() {
    const [s, e] = range();
    status.textContent = "Loading calendar…";
    const r = await fetch(`${root.dataset.eventsUrl}?start=${ymd(s)}&end=${ymd(e)}`);
    if (!r.ok) {
      status.textContent = "Could not load calendar.";
      return;
    }
    const data = await r.json();
    state.events = data.events || [];
    state.days = data.days || {};
    renderInsights(data.insights || []);
    render();
    status.textContent = state.view === "day" && !state.events.length ? "Nothing scheduled." : "";
  }

  function renderInsights(items) {
    const box = document.getElementById("calendar-insights");
    box.textContent = "";
    if (!items.length) {
      const p = document.createElement("p");
      p.textContent = "No alerts right now.";
      box.appendChild(p);
      return;
    }
    items.forEach((t) => {
      const p = document.createElement("p");
      p.textContent = t;
      box.appendChild(p);
    });
  }

  function render() {
    grid.textContent = "";
    const [s, e] = range();
    title.textContent = state.date.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
      day: state.view === "day" ? "numeric" : undefined,
    });
    grid.className = `calendar-grid ${state.view === "day" ? "timeline" : ""}`;
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      addCell(new Date(d));
      if (state.view === "day") break;
    }
  }

  function addCell(d) {
    const key = ymd(d);
    const day = state.days[key] || {};
    const evs = eventsForDay(key);
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = `calendar-cell workload-${day.workload || "empty"}`;
    if (state.view === "month" && d.getMonth() !== state.date.getMonth()) cell.classList.add("muted");
    if (isSameDay(d, new Date())) cell.classList.add("today");

    const head = document.createElement("div");
    head.className = "day-head";
    const n = document.createElement("span");
    n.className = "day-number";
    n.textContent = d.getDate();
    head.appendChild(n);
    const dots = document.createElement("span");
    dots.className = "day-dots";
    head.appendChild(dots);
    cell.appendChild(head);

    evs.slice(0, 4).forEach((ev) => {
      const dot = document.createElement("i");
      dot.className = `type-dot type-${ev.event_type}`;
      dots.appendChild(dot);
    });

    if (state.role === "artist" && day.events) {
      if (day.sessions) appendCellLine(cell, plural(day.sessions, "session"));
      if (day.consultations) appendCellLine(cell, plural(day.consultations, "consultation"));
      if (day.booked_hours) appendCellLine(cell, `${day.booked_hours}h booked`, true);
    }

    if (state.role !== "artist") {
      evs.slice(0, 2).forEach((ev) => {
        const p = document.createElement("span");
        p.className = "event-dot";
        const time = new Date(ev.starts_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        p.textContent = `${time} ${ev.event_type_label} · ${ev.artist_name}`;
        cell.appendChild(p);
      });
      if (evs.length > 2) appendCellLine(cell, `+${evs.length - 2} more`, true);
    }

    if (day.workload === "vacation" || day.workload === "blocked") appendCellLine(cell, day.workload, true);
    cell.addEventListener("click", () => openDay(d));
    grid.appendChild(cell);
  }

  function appendCellLine(cell, text, muted = false) {
    const line = document.createElement("div");
    line.className = `cell-line${muted ? " muted-line" : ""}`;
    line.textContent = text;
    cell.appendChild(line);
  }

  function eventsForDay(key) {
    return state.events.filter((ev) => ymd(new Date(ev.starts_at)) === key);
  }

  function openDay(d) {
    closeAllMenus();
    const key = ymd(d);
    const evs = eventsForDay(key);
    const modal = document.getElementById("day-modal");
    document.getElementById("day-modal-title").textContent = d.toLocaleDateString();
    const sum = document.getElementById("day-modal-summary");
    const day = state.days[key] || {};
    sum.textContent = state.role === "artist"
      ? `${plural(day.sessions || 0, "session")} · ${plural(day.consultations || 0, "consultation")} · ${day.booked_hours || 0}/${root.dataset.capacity}h booked`
      : plural(evs.length, "appointment");
    const wrap = document.getElementById("day-modal-events");
    wrap.textContent = "";
    if (!evs.length) {
      const empty = document.createElement("p");
      empty.className = "calendar-empty";
      empty.textContent = "Nothing scheduled.";
      wrap.appendChild(empty);
    }
    evs.forEach((ev) => wrap.appendChild(eventCard(ev)));
    modal.hidden = false;
  }

  function eventCard(ev) {
    const card = document.createElement("article");
    card.className = `calendar-event-card calendar-event-card--${ev.event_type}`;
    card.dataset.appointmentId = ev.appointment_id || ev.id;

    const main = document.createElement("div");
    main.className = "calendar-event-main";
    main.tabIndex = 0;
    main.setAttribute("role", "button");
    main.setAttribute("aria-expanded", "false");
    main.setAttribute("aria-label", "Show appointment details");

    const top = document.createElement("div");
    top.className = "calendar-event-top";
    const time = document.createElement("span");
    time.className = "calendar-event-time";
    time.textContent = `${formatTimeRange(ev)} · ${formatDuration(ev)}`;
    top.appendChild(time);
    const badge = document.createElement("span");
    badge.className = `calendar-event-badge calendar-event-badge--${ev.status}`;
    badge.textContent = ev.status_label;
    top.appendChild(badge);
    main.appendChild(top);

    const heading = document.createElement("h4");
    heading.className = "calendar-event-title";
    heading.textContent = ev.project_title || ev.title || ev.booking_type_label || ev.event_type_label;
    main.appendChild(heading);

    const person = document.createElement("p");
    person.className = "calendar-event-person";
    person.textContent = state.role === "artist"
      ? `Client: ${ev.client_name || "No client"}`
      : `Artist: ${ev.artist_name || "No artist"}`;
    main.appendChild(person);

    const metaItems = [ev.placement, formatStyles(ev)].filter(Boolean);
    if (metaItems.length) {
      const meta = document.createElement("p");
      meta.className = "calendar-event-meta";
      meta.textContent = metaItems.join(" · ");
      main.appendChild(meta);
    }

    main.addEventListener("click", (event) => {
      if (event.target.closest("a, button, .calendar-event-actions, .calendar-event-menu")) return;
      toggleEventCard(card);
    });
    main.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleEventCard(card);
      }
    });

    card.appendChild(main);
    card.appendChild(expandedDetails(ev));
    return card;
  }

  function toggleEventCard(card) {
    closeAllMenus();
    const wasExpanded = card.classList.contains("is-expanded");
    document.querySelectorAll("#day-modal-events .calendar-event-card.is-expanded").forEach((item) => {
      item.classList.remove("is-expanded");
      item.querySelector(".calendar-event-main")?.setAttribute("aria-expanded", "false");
      const details = item.querySelector(".calendar-event-expanded");
      if (details) details.hidden = true;
    });
    if (!wasExpanded) {
      card.classList.add("is-expanded");
      card.querySelector(".calendar-event-main")?.setAttribute("aria-expanded", "true");
      const details = card.querySelector(".calendar-event-expanded");
      if (details) details.hidden = false;
    }
  }

  function expandedDetails(ev) {
    const panel = document.createElement("section");
    panel.className = "calendar-event-expanded";
    panel.hidden = true;

    const grid = document.createElement("div");
    grid.className = "calendar-event-detail-grid";
    addSummaryRow(grid, "Client", ev.client_name);
    addSummaryRow(grid, "Artist", ev.artist_name);
    addSummaryRow(grid, "Date", formatDate(ev.date || ev.starts_at));
    addSummaryRow(grid, "Time", formatTimeRange(ev));
    addSummaryRow(grid, "Duration", formatDuration(ev));
    addSummaryRow(grid, "Size", ev.size);
    addSummaryRow(grid, "Placement", ev.placement);
    addSummaryRow(grid, "Style(s)", formatStyles(ev));
    addSummaryRow(grid, "Budget", ev.budget);
    addSummaryRow(grid, "References", plural(ev.reference_count || 0, "image"));
    panel.appendChild(grid);

    const brief = [ev.description, ev.notes].filter(Boolean).join("\n\n");
    addTextSection(panel, "Brief / Notes", brief);
    if (ev.consultation_already_completed || ev.consultation_note) {
      addTextSection(
        panel,
        "Consultation",
        [ev.consultation_already_completed ? "Already completed" : "", ev.consultation_note].filter(Boolean).join(" · "),
      );
    }

    const refSection = document.createElement("section");
    refSection.className = "calendar-event-references";
    const refTitle = document.createElement("h5");
    refTitle.textContent = "Reference images";
    refSection.appendChild(refTitle);
    const images = Array.isArray(ev.reference_images) ? ev.reference_images.filter((image) => image?.url) : [];
    if (!images.length) {
      const empty = document.createElement("p");
      empty.className = "calendar-reference-empty";
      empty.textContent = "No reference images uploaded.";
      refSection.appendChild(empty);
    } else {
      const refs = document.createElement("div");
      refs.className = "calendar-reference-grid";
      images.forEach((image) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "calendar-reference-thumb";
        button.setAttribute("aria-label", `Preview ${image.original_name || "appointment reference image"}`);
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          openReferencePreview(image);
        });
        const img = document.createElement("img");
        img.src = image.url;
        img.alt = image.original_name || "Appointment reference image";
        button.appendChild(img);
        refs.appendChild(button);
      });
      refSection.appendChild(refs);
    }
    panel.appendChild(refSection);
    panel.appendChild(actionBar(ev));
    return panel;
  }

  function addTextSection(parent, label, value) {
    if (!value) return;
    const section = document.createElement("section");
    section.className = "calendar-event-text-section";
    const title = document.createElement("h5");
    title.textContent = label;
    const text = document.createElement("p");
    text.textContent = value;
    section.append(title, text);
    parent.appendChild(section);
  }

  function addSummaryRow(parent, label, value) {
    if (!value) return;
    const row = document.createElement("div");
    row.className = "calendar-event-detail-item";
    const labelEl = document.createElement("span");
    labelEl.className = "calendar-event-detail-label";
    labelEl.textContent = label;
    const valueEl = document.createElement("span");
    valueEl.className = "calendar-event-detail-value";
    valueEl.textContent = value;
    row.append(labelEl, valueEl);
    parent.appendChild(row);
  }

  function formatStyles(ev) {
    if (Array.isArray(ev.styles) && ev.styles.length) return ev.styles.join(", ");
    return ev.tattoo_style || "";
  }

  function formatDate(value) {
    if (!value) return "";
    const date = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
  }

  function formatTimeRange(ev) {
    if (ev.start_time || ev.end_time) return [ev.start_time, ev.end_time].filter(Boolean).join(" — ");
    if (!ev.starts_at) return "";
    const start = new Date(ev.starts_at);
    const end = ev.ends_at ? new Date(ev.ends_at) : null;
    const startText = start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const endText = end ? end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
    return [startText, endText].filter(Boolean).join(" — ");
  }

  function formatDuration(ev) {
    if (ev.duration_minutes) return `${ev.duration_minutes} minutes (${ev.duration_hours}h)`;
    return ev.duration_hours ? `${ev.duration_hours}h` : "";
  }

  function actionBar(ev) {
    const actions = document.createElement("div");
    actions.className = "calendar-event-actions";

    if (ev.actions?.detail_url) {
      addActionLink(actions, ev.actions.detail_url, state.role === "artist" ? "Open project" : "View project", "primary");
    }
    if (ev.actions?.chat_url) {
      addActionLink(actions, ev.actions.chat_url, state.role === "artist" ? "Open chat" : "Message artist", "ghost");
    }
    if (state.role !== "artist" && ev.location) {
      addActionLink(actions, `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.location)}`, "Directions", "ghost");
    }

    const overflowItems = [];
    if (ev.actions?.complete_url) {
      overflowItems.push({ label: "Mark completed", kind: "success", action: () => postUrl(ev.actions.complete_url) });
    }
    if (ev.actions?.reschedule_url) {
      overflowItems.push({ label: state.role === "artist" ? "Reschedule" : "Request reschedule", kind: "ghost", action: () => postUrl(ev.actions.reschedule_url, { reason: "Client requested reschedule from calendar." }) });
    }

    if (overflowItems.length) actions.appendChild(overflowMenu(overflowItems));
    return actions;
  }

  function addActionLink(parent, href, text, variant) {
    const a = document.createElement("a");
    a.href = href;
    a.className = `calendar-event-action calendar-event-action--${variant}`;
    a.textContent = text;
    parent.appendChild(a);
  }

  function overflowMenu(items) {
    const wrap = document.createElement("div");
    wrap.className = "calendar-event-menu";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-event-menu-button";
    button.textContent = "•••";
    button.setAttribute("aria-label", "More event actions");
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", "false");
    const menu = document.createElement("div");
    menu.className = "calendar-event-menu-list";
    menu.setAttribute("role", "menu");
    menu.hidden = true;

    items.forEach((item) => {
      const action = document.createElement("button");
      action.type = "button";
      action.className = `calendar-event-menu-item calendar-event-menu-item--${item.kind}`;
      action.textContent = item.label;
      action.setAttribute("role", "menuitem");
      action.addEventListener("click", async (event) => {
        event.stopPropagation();
        action.disabled = true;
        action.classList.add("is-loading");
        await item.action();
        closeAllMenus();
      });
      menu.appendChild(action);
    });

    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const open = menu.hidden;
      closeAllMenus();
      menu.hidden = !open;
      button.setAttribute("aria-expanded", String(open));
    });

    wrap.appendChild(button);
    wrap.appendChild(menu);
    return wrap;
  }

  function closeAllMenus() {
    document.querySelectorAll(".calendar-event-menu-list").forEach((menu) => {
      menu.hidden = true;
    });
    document.querySelectorAll(".calendar-event-menu-button").forEach((button) => {
      button.setAttribute("aria-expanded", "false");
    });
  }


  function openReferencePreview(image) {
    const modal = document.getElementById("reference-preview-modal");
    const preview = document.getElementById("reference-preview-image");
    const title = document.getElementById("reference-preview-title");
    if (!modal || !preview || !title || !image?.url) return;

    closeAllMenus();
    preview.src = image.url;
    preview.alt = image.original_name || "Appointment reference image";
    title.textContent = image.original_name || "Reference image";
    modal.hidden = false;
  }

  function closeReferencePreview() {
    const modal = document.getElementById("reference-preview-modal");
    const preview = document.getElementById("reference-preview-image");
    if (!modal) return;

    modal.hidden = true;
    if (preview) {
      preview.removeAttribute("src");
      preview.alt = "";
    }
  }

  async function postUrl(url, body = {}) {
    const fd = new FormData();
    Object.entries(body).forEach(([k, v]) => fd.append(k, v));
    const r = await fetch(url, { method: "POST", headers: { "X-CSRFToken": csrf() }, body: fd });
    if (r.ok) load();
  }

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".calendar-event-menu")) closeAllMenus();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAllMenus();
      closeReferencePreview();
    }
  });

  document.getElementById("reference-preview-modal")?.addEventListener("click", (event) => {
    if (event.target.id === "reference-preview-modal") closeReferencePreview();
  });

  document.querySelectorAll("[data-close-reference-preview]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeReferencePreview();
    });
  });

  document.querySelectorAll("[data-nav]").forEach((b) => b.onclick = () => {
    const n = b.dataset.nav;
    if (n === "today") state.date = new Date();
    else if (state.view === "day") state.date.setDate(state.date.getDate() + (n === "next" ? 1 : -1));
    else if (state.view === "week") state.date.setDate(state.date.getDate() + (n === "next" ? 7 : -7));
    else state.date.setMonth(state.date.getMonth() + (n === "next" ? 1 : -1));
    load();
  });
  document.querySelectorAll("[data-view]").forEach((b) => b.onclick = () => {
    document.querySelectorAll("[data-view]").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    state.view = b.dataset.view;
    load();
  });
  document.querySelectorAll("[data-close-modal]").forEach((b) => b.onclick = () => {
    closeAllMenus();
    b.closest(".calendar-modal").hidden = true;
  });
  document.querySelectorAll("[data-open-create]").forEach((b) => b.onclick = () => {
    document.getElementById("event-type").value = b.dataset.openCreate;
    document.getElementById("create-modal").hidden = false;
  });
  document.getElementById("create-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const type = fd.get("event_type");
    const url = type === "blocked" ? root.dataset.blockUrl : type === "vacation" ? root.dataset.vacationUrl : root.dataset.createUrl;
    const r = await fetch(url, { method: "POST", headers: { "X-CSRFToken": csrf() }, body: fd });
    if (r.ok) {
      document.getElementById("create-modal").hidden = true;
      e.target.reset();
      load();
    } else {
      document.getElementById("create-error").textContent = JSON.stringify((await r.json()).error);
    }
  });

  load();
})();
