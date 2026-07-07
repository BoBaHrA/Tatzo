(() => {
  const cards = Array.from(document.querySelectorAll("[data-location-card]"));
  const pins = Array.from(document.querySelectorAll(".maps-pin"));
  const search = document.querySelector("[data-map-search]");
  const filters = Array.from(document.querySelectorAll("[data-map-filter]"));
  let activeFilter = "all";

  function applyFilters() {
    const query = (search?.value || "").trim().toLowerCase();
    cards.forEach((card, index) => {
      const sourceMatch = activeFilter === "all" || card.dataset.source === activeFilter;
      const textMatch = !query || (card.dataset.search || "").toLowerCase().includes(query);
      const hidden = !(sourceMatch && textMatch);
      card.classList.toggle("is-hidden", hidden);
      pins[index]?.classList.toggle("is-hidden", hidden);
    });
  }

  search?.addEventListener("input", applyFilters);
  filters.forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.mapFilter;
      filters.forEach((item) => item.classList.toggle("is-active", item === button));
      applyFilters();
    });
  });

  pins.forEach((pin, index) => {
    pin.addEventListener("click", () => {
      cards[index]?.scrollIntoView({ behavior: "smooth", block: "center" });
      cards[index]?.animate([{ transform: "scale(1)" }, { transform: "scale(1.02)" }, { transform: "scale(1)" }], { duration: 420 });
    });
  });

  const dialog = document.querySelector("[data-add-location-dialog]");
  document.querySelector("[data-open-add-location]")?.addEventListener("click", () => dialog?.showModal());
  document.querySelector("[data-check-location]")?.addEventListener("click", () => {
    const input = document.querySelector("[data-new-location-input]");
    const output = document.querySelector("[data-location-check]");
    const value = (input?.value || "").trim().toLowerCase();
    const duplicate = value && cards.some((card) => (card.dataset.search || "").toLowerCase().includes(value));
    output.textContent = !value
      ? "Enter a location first."
      : duplicate
        ? "Possible duplicate found — review existing verified locations before adding."
        : "No duplicate in the current map preview. Ready to create a claim draft.";
  });
})();
