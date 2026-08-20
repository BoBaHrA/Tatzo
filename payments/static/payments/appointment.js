document.addEventListener("DOMContentLoaded", () => {
  const match = window.location.pathname.match(/^\/appointments\/(\d+)\/?$/);
  const details = document.querySelector(".appointment-details-grid");
  if (!match || !details) return;
  const appointmentId = match[1];

  function messageFor(data) {
    const amount = data.amount;
    if (data.role === "artist") {
      if (data.status === "paid") return data.copy.deposit_artist_paid.replace("%(amount)s", amount);
      if (data.status === "refunded") return data.copy.deposit_refunded;
      if (data.status === "expired") return data.copy.deposit_expired;
      if (data.status === "cancelled") return data.copy.deposit_cancelled;
      return data.copy.deposit_artist_pending.replace("%(amount)s", amount);
    }
    if (data.status === "paid") return data.copy.deposit_paid;
    if (data.status === "refunded") return data.copy.deposit_refunded;
    if (data.status === "expired") return data.copy.deposit_expired;
    if (data.status === "cancelled") return data.copy.deposit_cancelled;
    if (data.status === "failed") return data.copy.deposit_failed;
    return data.copy.deposit_pending.replace("%(amount)s", amount);
  }

  async function pay(data, button) {
    button.disabled = true;
    try {
      const csrf = document.querySelector('input[name="csrfmiddlewaretoken"]')?.value || "";
      const response = await fetch(data.checkout_url, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "X-CSRFToken": csrf,
          Accept: "application/json",
        },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.url) throw new Error(payload.error || "checkout_failed");
      window.location.assign(payload.url);
    } catch (_error) {
      button.disabled = false;
      alert(data.copy.checkout_error);
    }
  }

  function render(data) {
    if (!data.has_deposit || document.querySelector("[data-appointment-deposit]")) return;
    const card = document.createElement("section");
    card.className = "tatzo-payment-card is-deposit";
    card.dataset.appointmentDeposit = "";

    const heading = document.createElement("h3");
    heading.textContent = data.copy.deposit_title;
    const status = document.createElement("div");
    status.className = `tatzo-payment-status${data.status === "paid" ? " is-paid" : ""}`;
    status.textContent = messageFor(data);
    card.append(heading, status);

    if (data.status !== "paid" && data.status !== "refunded") {
      const amount = document.createElement("p");
      amount.className = "tatzo-payment-amount";
      amount.textContent = `${data.amount} ${data.currency === "EUR" ? "€" : data.currency}`;
      card.appendChild(amount);
    }

    if (data.expires_at && !["paid", "refunded", "cancelled"].includes(data.status)) {
      const due = document.createElement("p");
      due.className = "tatzo-payment-due";
      const date = new Date(data.expires_at);
      due.textContent = `${data.copy.deposit_due}: ${date.toLocaleString()}`;
      card.appendChild(due);
    }

    if (data.can_pay) {
      const actions = document.createElement("div");
      actions.className = "tatzo-payment-actions";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tatzo-payment-btn";
      button.textContent = data.copy.deposit_checkout.replace("%(amount)s", data.amount);
      button.addEventListener("click", () => pay(data, button));
      actions.appendChild(button);
      card.appendChild(actions);
    }

    details.after(card);
  }

  fetch(`/payments/appointments/${appointmentId}/deposit/status/`, {
    credentials: "same-origin",
    headers: {Accept: "application/json"},
  })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => data && render(data))
    .catch(() => {});
});
