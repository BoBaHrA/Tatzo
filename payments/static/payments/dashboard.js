document.addEventListener("DOMContentLoaded", () => {
  const depositToggle = document.querySelector('input[name="deposit_required"]');
  if (!depositToggle) return;

  const depositRow = depositToggle.closest(".artist-setting-row") || depositToggle.parentElement;
  const settingsForm = depositToggle.closest("form");
  const csrfToken = settingsForm?.querySelector('input[name="csrfmiddlewaretoken"]')?.value || "";

  function connectButton(copy, state) {
    const form = document.createElement("form");
    form.method = "post";
    form.action = "/payments/connect/start/";
    const csrf = document.createElement("input");
    csrf.type = "hidden";
    csrf.name = "csrfmiddlewaretoken";
    csrf.value = csrfToken;
    const button = document.createElement("button");
    button.type = "submit";
    button.className = "tatzo-payment-btn";
    button.textContent = state === "onboarding" ? copy.continue : copy.connect;
    form.append(csrf, button);
    return form;
  }

  function render(data) {
    document.querySelector("[data-stripe-connect-card]")?.remove();
    const card = document.createElement("section");
    card.className = "tatzo-payment-card";
    card.dataset.stripeConnectCard = "";

    const title = document.createElement("h3");
    title.textContent = data.copy.dashboard_title;
    const intro = document.createElement("p");
    intro.textContent = data.copy.dashboard_intro;
    const status = document.createElement("div");
    status.className = `tatzo-payment-status${data.ready ? " is-ready" : ""}`;
    status.textContent = data.label;
    card.append(title, intro, status);

    if (!data.ready) {
      const actions = document.createElement("div");
      actions.className = "tatzo-payment-actions";
      actions.appendChild(connectButton(data.copy, data.state));
      card.appendChild(actions);
    }

    if (!data.ready) {
      depositToggle.checked = false;
      depositToggle.disabled = true;
      depositToggle.title = data.label;
    } else {
      depositToggle.disabled = false;
      depositToggle.removeAttribute("title");
    }

    depositRow?.parentElement?.insertBefore(card, depositRow || null);
  }

  fetch("/payments/connect/status/", {
    credentials: "same-origin",
    headers: {Accept: "application/json"},
  })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => data && render(data))
    .catch(() => {});
});
