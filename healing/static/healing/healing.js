(() => {
  "use strict";
  const app = document.getElementById("healing-app");
  if (!app) return;

  const csrfToken = () => {
    const token = document.cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith("csrftoken="));
    return token ? decodeURIComponent(token.split("=").slice(1).join("=")) : "";
  };

  const timelineElement = document.getElementById("healing-timeline-data");
  const timeline = timelineElement ? JSON.parse(timelineElement.textContent) : {};
  function activateTimeline(key) {
    const item = timeline[key];
    if (!item) return;
    document.querySelectorAll("[data-timeline-day]").forEach((button) => button.classList.toggle("is-active", button.dataset.timelineDay === key));
    document.getElementById("healing-phase").textContent = item.phase;
    document.getElementById("healing-timeline-heading").textContent = item.heading;
    document.getElementById("healing-timeline-copy").textContent = item.copy;
    const tags = document.getElementById("healing-timeline-tags");
    tags.replaceChildren();
    (item.tags || []).forEach((label) => {
      const tag = document.createElement("span");
      tag.textContent = label;
      tags.appendChild(tag);
    });
  }
  const activeTimeline = document.querySelector("[data-timeline-day].is-active");
  if (activeTimeline) activateTimeline(activeTimeline.dataset.timelineDay);
  document.querySelectorAll("[data-timeline-day]").forEach((button) => button.addEventListener("click", () => activateTimeline(button.dataset.timelineDay)));

  const range = document.getElementById("healing-comparison-range");
  const afterWrap = document.getElementById("healing-after-wrap");
  const control = document.getElementById("healing-comparison-control");
  function updateComparison() {
    if (!range || !afterWrap || !control) return;
    const value = `${range.value}%`;
    afterWrap.style.width = value;
    control.style.left = value;
  }
  range?.addEventListener("input", updateComparison);
  updateComparison();

  const checkinsElement = document.getElementById("healing-checkins-data");
  const checkins = checkinsElement ? JSON.parse(checkinsElement.textContent) : [];
  const afterPhoto = document.getElementById("healing-after-photo");
  const latestLabel = document.getElementById("healing-latest-label");
  document.querySelectorAll("[data-photo-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const checkin = checkins[Number(button.dataset.photoIndex)];
      if (!checkin || !afterPhoto) return;
      afterPhoto.src = checkin.url;
      if (latestLabel) latestLabel.textContent = `${app.dataset.dayLabel || "Day"} ${checkin.day}`;
      document.querySelectorAll("[data-photo-index]").forEach((item) => item.classList.toggle("is-active", item === button));
    });
  });

  const fileInput = document.getElementById("healing-photo-input");
  const uploadName = document.getElementById("healing-upload-name");
  fileInput?.addEventListener("change", () => {
    if (uploadName && fileInput.files?.length) uploadName.textContent = fileInput.files[0].name;
  });

  const tasks = Array.from(document.querySelectorAll("[data-healing-task]"));
  const counter = document.getElementById("healing-routine-count");
  const syncCounter = (doneCount) => { if (counter) counter.textContent = `${doneCount}/${tasks.length}`; };
  async function toggleTask(button) {
    if (!app.dataset.taskUrlTemplate || button.disabled) return;
    const url = app.dataset.taskUrlTemplate.replace("__slug__", button.dataset.healingTask);
    button.disabled = true;
    try {
      const response = await fetch(url, {method:"POST",credentials:"same-origin",headers:{"X-CSRFToken":csrfToken(),"X-Requested-With":"XMLHttpRequest",Accept:"application/json"}});
      if (!response.ok) throw new Error("Task update failed");
      const data = await response.json();
      button.classList.toggle("is-complete", data.completed);
      syncCounter(data.done_count);
      if (data.done_count === data.total) document.getElementById("healing-complete-routine")?.classList.add("is-complete");
    } finally { button.disabled = false; }
  }
  tasks.forEach((button) => button.addEventListener("click", () => toggleTask(button)));
  document.getElementById("healing-complete-routine")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    for (const item of tasks.filter((task) => !task.classList.contains("is-complete"))) await toggleTask(item);
    button.textContent = app.dataset.routineComplete || button.textContent;
    button.classList.add("is-complete");
    button.disabled = false;
  });
})();
