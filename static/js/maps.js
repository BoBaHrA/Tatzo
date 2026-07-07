(() => {
  const cards = Array.from(document.querySelectorAll("[data-location-card]"));
  const pins = Array.from(document.querySelectorAll(".maps-pin"));
  const search = document.querySelector("[data-map-search]");
  const filters = Array.from(document.querySelectorAll("[data-map-filter]"));
  let activeFilter = "all";

  function normalizeText(value) {
    return (value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9а-яё\s,._-]+/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokenSet(value) {
    return new Set(normalizeText(value).split(/[\s,._-]+/).filter(Boolean));
  }

  function tokenSimilarity(left, right) {
    const leftTokens = tokenSet(left);
    const rightTokens = tokenSet(right);

    if (!leftTokens.size || !rightTokens.size) return 0;

    const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
    const union = new Set([...leftTokens, ...rightTokens]).size;
    return intersection / union;
  }

  function applyFilters() {
    const query = normalizeText(search?.value || "");
    cards.forEach((card, index) => {
      const sourceMatch = activeFilter === "all" || card.dataset.source === activeFilter;
      const textMatch = !query || normalizeText(card.dataset.search || "").includes(query);
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
      cards[index]?.animate(
        [{ transform: "scale(1)" }, { transform: "scale(1.02)" }, { transform: "scale(1)" }],
        { duration: 420 }
      );
    });
  });

  const dialog = document.querySelector("[data-add-location-dialog]");
  document.querySelector("[data-open-add-location]")?.addEventListener("click", () => dialog?.showModal());
  document.querySelector("[data-check-location]")?.addEventListener("click", () => {
    const input = document.querySelector("[data-new-location-input]");
    const output = document.querySelector("[data-location-check]");
    const value = normalizeText(input?.value || "");

    const duplicate = value && cards.some((card) => {
      const knownLocation = normalizeText(card.dataset.location || "");
      const knownCity = normalizeText(card.dataset.city || "");
      const knownCountry = normalizeText(card.dataset.country || "");
      const knownArtist = normalizeText(card.dataset.artist || "");
      const knownTag = normalizeText(card.dataset.tag || "");
      const combinedKnownData = [knownLocation, knownCity, knownCountry, knownArtist, knownTag]
        .filter(Boolean)
        .join(" ");

      const locationMatches = Boolean(
        knownLocation && (
          knownLocation === value ||
          knownLocation.includes(value) ||
          value.includes(knownLocation)
        )
      );

      return locationMatches || tokenSimilarity(value, combinedKnownData) >= 0.55;
    });

    output.textContent = !value
      ? "Enter a location first."
      : duplicate
        ? "Possible duplicate found from existing artist/location data. Review before adding."
        : "No duplicate in current verified artist/location data. Ready to create a claim draft.";
  });
})();
