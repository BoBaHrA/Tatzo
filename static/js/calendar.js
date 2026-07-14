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
    const main = document.createElement("div");
    main.className = "calendar-event-main";
    main.tabIndex = 0;
    main.setAttribute("role", "button");
    main.setAttribute("aria-label", "Toggle event details");

    const top = document.createElement("div");
    top.className = "calendar-event-top";
    const time = document.createElement("span");
    time.className = "calendar-event-time";
    const start = new Date(ev.starts_at);
    const end = new Date(ev.ends_at);
    time.textContent = `${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} — ${end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ${ev.duration_hours}h`;
    top.appendChild(time);
    const badge = document.createElement("span");
    badge.className = `calendar-event-badge calendar-event-badge--${ev.status}`;
    badge.textContent = ev.status_label;
    top.appendChild(badge);
    main.appendChild(top);

    const heading = document.createElement("h4");
    heading.className = "calendar-event-title";
    heading.textContent = ev.project_title || ev.title || ev.event_type_label;
    main.appendChild(heading);

    const person = document.createElement("p");
    person.className = "calendar-event-person";
    person.textContent = state.role === "artist" ? (ev.client_name || "No client") : ev.artist_name;
    main.appendChild(person);

    const metaItems = state.role === "artist"
      ? [ev.placement, ev.tattoo_style].filter(Boolean)
      : [ev.location, ev.project_title && ev.project_title !== ev.title ? ev.project_title : ""].filter(Boolean);
    if (metaItems.length) {
      const meta = document.createElement("p");
      meta.className = "calendar-event-meta";
      meta.textContent = metaItems.join(" · ");
      main.appendChild(meta);
    }

    if (state.role === "artist" && ev.deposit_status_label) {
      const deposit = document.createElement("p");
      deposit.className = `calendar-event-deposit calendar-event-deposit--${ev.deposit_status}`;
      deposit.textContent = ev.deposit_status_label;
      main.appendChild(deposit);
    }

    const details = document.createElement("div");
    details.className = "calendar-event-details";
    details.hidden = true;
    addDetail(details, "Placement", ev.placement);
    addDetail(details, "Style", ev.tattoo_style);
    addDetail(details, "Deposit", ev.deposit_status_label);
    addDetail(details, "Location", ev.location);
    addDetail(details, "Notes", ev.notes);
    if (state.role !== "artist") addDetail(details, "Preparation", ev.preparation_note);
    main.appendChild(details);

    main.addEventListener("click", () => {
      details.hidden = !details.hidden;
    });
    main.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        details.hidden = !details.hidden;
      }
    });
    card.appendChild(main);
    card.appendChild(actionBar(ev));
    return card;
  }

  function addDetail(parent, label, value) {
    if (!value) return;
    const row = document.createElement("p");
    row.className = "calendar-event-detail-row";
    const strong = document.createElement("strong");
    strong.textContent = `${label}: `;
    row.appendChild(strong);
    row.append(document.createTextNode(value));
    parent.appendChild(row);
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
    if (event.key === "Escape") closeAllMenus();
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
