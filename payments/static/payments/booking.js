document.addEventListener("DOMContentLoaded", () => {
  const bookingDataNode = document.getElementById("booking-data");
  const reviewPanel = document.querySelector('[data-booking-panel="4"]');
  const bookingType = document.getElementById("booking-type");
  if (!bookingDataNode || !reviewPanel || !bookingType) return;

  let bookingData = {};
  try {
    bookingData = JSON.parse(bookingDataNode.textContent || "{}");
  } catch (_error) {
    return;
  }

  const language = (document.documentElement.lang || "en").split("-")[0];
  const copy = {
    en: {
      title: "Deposit",
      text: "This artist requires a €%(amount)s deposit after accepting your booking. You are not charged when you send this request.",
    },
    fr: {
      title: "Acompte",
      text: "Ce tatoueur demande un acompte de %(amount)s € après acceptation de la réservation. Aucun montant n'est débité lors de l'envoi de la demande.",
    },
    ru: {
      title: "Предоплата",
      text: "Этот мастер требует предоплату %(amount)s € после принятия записи. При отправке заявки деньги не списываются.",
    },
  }[language] || null;
  if (!copy) return;

  const required = Boolean(bookingData.settings?.deposit_required);
  const amount = Number(bookingData.settings?.deposit_amount || 0);
  if (!required || !(amount > 0)) return;

  const notice = document.createElement("div");
  notice.className = "tatzo-payment-notice";
  notice.dataset.bookingDepositNotice = "";
  const strong = document.createElement("strong");
  strong.textContent = copy.title;
  const text = document.createElement("span");
  text.textContent = copy.text.replace("%(amount)s", amount.toFixed(2).replace(/\.00$/, ""));
  notice.append(strong, text);

  const reviewCard = document.getElementById("booking-review-card");
  reviewPanel.insertBefore(notice, reviewCard || reviewPanel.firstChild?.nextSibling || null);

  function syncVisibility() {
    notice.hidden = bookingType.value !== "tattoo_session";
  }

  document.getElementById("booking-consultation-toggle")?.addEventListener("change", () => queueMicrotask(syncVisibility));
  document.getElementById("booking-consultation-continue")?.addEventListener("click", () => queueMicrotask(syncVisibility));
  syncVisibility();
});
