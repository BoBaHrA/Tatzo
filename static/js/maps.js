(() => {
  const cards = Array.from(document.querySelectorAll("[data-location-card]"));
  const pins = Array.from(document.querySelectorAll(".maps-pin"));
  const search = document.querySelector("[data-map-search]");
  const filters = Array.from(document.querySelectorAll("[data-map-filter]"));
  const styleFilters = Array.from(document.querySelectorAll("[data-draft-filter]"));
  const bookingFilters = Array.from(document.querySelectorAll("[data-booking-filter]"));
  let activeFilter = "all";
  let leafletMap = null;
  let leafletMarkerLayer = null;
  const leafletMarkersByArtist = new Map();
  const activeStyleFilters = new Set();
  const activeBookingFilters = new Set();

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

  function matchesActiveTokens(cardValue, activeTokens) {
    if (!activeTokens.size) return true;
    const normalizedValue = normalizeText(cardValue);
    return [...activeTokens].some((token) => normalizedValue.includes(normalizeText(token)));
  }


  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value || "";
    return div.innerHTML;
  }


  function createClusterIcon(cluster) {
    const markers = cluster.getAllChildMarkers();
    const hasVerified = markers.some((marker) => marker.options.tatzoSource === "verified");
    const hasUnclaimed = markers.some((marker) => marker.options.tatzoSource !== "verified");
    const clusterType = hasVerified && hasUnclaimed
      ? "mixed"
      : hasVerified
        ? "verified"
        : "unclaimed";

    return L.divIcon({
      className: `tatzo-cluster tatzo-cluster-${clusterType}`,
      html: `<span>${cluster.getChildCount()}</span>`,
      iconSize: [42, 42],
      iconAnchor: [21, 21],
    });
  }

  function addMarkerToLayer(marker) {
    if (leafletMarkerLayer?.addLayer) {
      leafletMarkerLayer.addLayer(marker);
    } else {
      marker.addTo(leafletMap);
    }
  }

  function removeMarkerFromLayer(marker) {
    if (leafletMarkerLayer?.removeLayer) {
      leafletMarkerLayer.removeLayer(marker);
    } else if (leafletMap?.hasLayer(marker)) {
      leafletMap.removeLayer(marker);
    }
  }

  function initializeLeafletMap() {
    const mapContainer = document.querySelector("[data-map-container]");
    if (!mapContainer || !window.L) return;

    const shell = document.querySelector(".maps-shell");
    const defaultLat = Number(shell?.dataset.defaultLat || 46.8);
    const defaultLng = Number(shell?.dataset.defaultLng || 2.5);
    const defaultZoom = Number(shell?.dataset.defaultZoom || 5);
    const map = L.map(mapContainer, {
      scrollWheelZoom: true,
      zoomControl: true,
    }).setView([defaultLat, defaultLng], defaultZoom);
    leafletMap = map;

    // Development tile layer only. Production should use an approved tile provider,
    // API key/configuration when required, and comply with provider usage policies.
    // TODO: Future POI imports must use official APIs only (Google Places API,
    // Apple Maps API, Geoapify/OSM, or Foursquare). Do not scrape public maps.
    // Imported POIs should be saved as Location records with source, source_place_id,
    // name, address, latitude, longitude, and status="imported" or "unclaimed".
    const tileUrl = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
    L.tileLayer(tileUrl, {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(map);

    leafletMarkerLayer = window.L.markerClusterGroup
      ? L.markerClusterGroup({
          showCoverageOnHover: false,
          spiderfyOnMaxZoom: true,
          zoomToBoundsOnClick: true,
          maxClusterRadius: 46,
          iconCreateFunction: createClusterIcon,
        })
      : L.layerGroup();
    leafletMarkerLayer.addTo(map);

    const bounds = [];
    // TODO: add viewport-based API loading before scaling to very large datasets.
    cards.forEach((card) => {
      const rawLat = (card.dataset.lat || "").trim();
      const rawLng = (card.dataset.lng || "").trim();
      if (!rawLat || !rawLng) return;

      const lat = Number(rawLat);
      const lng = Number(rawLng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const source = card.dataset.source || "verified";
      const marker = L.marker([lat, lng], {
        icon: L.divIcon({
          className: `tatzo-map-marker tatzo-map-marker-${source}`,
          html: `<span>${source === "verified" ? "✓" : "•"}</span>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
          popupAnchor: [0, -18],
        }),
        tatzoSource: source,
      });

      const profileButton = card.dataset.profileUrl
        ? `<a class="tatzo-map-popup-action" href="${card.dataset.profileUrl}">Profile</a>`
        : "";

      let actionButton = "";
      if (card.dataset.canBook === "true") {
        actionButton = `<a class="tatzo-map-popup-action tatzo-map-popup-book" href="${card.dataset.bookUrl}">Book</a>`;
      } else if (source !== "verified") {
        actionButton = `<button class="tatzo-map-popup-action tatzo-map-popup-claim" type="button" data-open-claim data-claim-url="/maps/location/${card.dataset.locationId}/claim/" data-claim-location="${escapeHtml(card.dataset.location)}" data-claim-artist="${escapeHtml(card.dataset.artist)}" data-claim-kind="${source}">${escapeHtml(card.dataset.actionLabel || "Claim this location")}</button>`;
      }

      const contactDetails = [card.dataset.phone, card.dataset.website]
        .filter(Boolean)
        .map((value) => `<p>${escapeHtml(value)}</p>`)
        .join("");

      marker.bindPopup(`
        <div class="tatzo-map-popup">
          <strong>${escapeHtml(card.dataset.artist)}</strong>
          <span>${escapeHtml(card.dataset.locationLabel || card.dataset.locationKind || card.dataset.source)}</span>
          <p>${escapeHtml(card.dataset.location)}</p>
          ${contactDetails}
          <div class="tatzo-map-popup-actions">
            ${profileButton}
            ${actionButton}
          </div>
        </div>
      `);

      addMarkerToLayer(marker);
      leafletMarkersByArtist.set(card.dataset.artist, marker);
      marker.on("click", () => {
        card.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      bounds.push([lat, lng]);
    });

    const emptyMessage = document.querySelector("[data-empty-map-message]");
    if (bounds.length) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
      emptyMessage?.setAttribute("hidden", "");
    } else {
      emptyMessage?.removeAttribute("hidden");
    }

    setTimeout(() => map.invalidateSize(), 120);
  }

  function applyFilters() {
    const query = normalizeText(search?.value || "");
    cards.forEach((card, index) => {
      const sourceMatch = activeFilter === "all" || card.dataset.source === activeFilter;
      const textMatch = !query || normalizeText(card.dataset.search || "").includes(query);
      const styleMatch = matchesActiveTokens(card.dataset.styles || "", activeStyleFilters);
      const bookingMatch = matchesActiveTokens(card.dataset.booking || "", activeBookingFilters);
      const hidden = !(sourceMatch && textMatch && styleMatch && bookingMatch);
      card.classList.toggle("is-hidden", hidden);
      pins
        .filter((pin) => pin.dataset.pinArtist === card.dataset.artist)
        .forEach((pin) => pin.classList.toggle("is-hidden", hidden));

      const marker = leafletMarkersByArtist.get(card.dataset.artist);
      if (leafletMap && marker) {
        if (hidden) {
          removeMarkerFromLayer(marker);
        } else {
          addMarkerToLayer(marker);
        }
      }
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

  function bindChipFilters(buttons, activeSet, datasetKey) {
    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        const value = button.dataset[datasetKey];
        if (activeSet.has(value)) {
          activeSet.delete(value);
        } else {
          activeSet.add(value);
        }
        button.classList.toggle("is-active", activeSet.has(value));
        applyFilters();
      });
    });
  }

  bindChipFilters(styleFilters, activeStyleFilters, "draftFilter");
  bindChipFilters(bookingFilters, activeBookingFilters, "bookingFilter");

  initializeLeafletMap();

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
        : "No duplicate in current verified artist/location data. Backend is required to save it.";
  });

  const claimDialog = document.querySelector("[data-claim-dialog]");
  const claimForm = document.querySelector("[data-claim-form]");
  const claimSummary = document.querySelector("[data-claim-summary]");
  const claimTitle = document.querySelector("[data-claim-title]");
  const claimSubmit = claimForm?.querySelector("[type='submit']");
  document.querySelector("[data-close-claim]")?.addEventListener("click", () => claimDialog?.close());
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-claim]");
    if (!button) return;

    const claimUrl = button.dataset.claimUrl || "";
    const isImportedLocation = Boolean(claimUrl);

    if (claimForm) {
      claimForm.action = claimUrl || window.location.href;
    }

    if (claimSubmit) {
      claimSubmit.disabled = !isImportedLocation;
      claimSubmit.textContent = isImportedLocation
        ? "Submit claim request"
        : "Backend required for location requests";
    }

    if (claimSummary) {
      const title = isImportedLocation ? "Claim this location" : "Request location verification";
      const actionLabel = isImportedLocation ? "Claim request" : "Location verification request";
      if (claimTitle) claimTitle.textContent = title;
      claimSummary.textContent = `${actionLabel} for ${button.dataset.claimLocation || "this location"} (${button.dataset.claimArtist || "artist/studio"}). Admin review is required and nothing is changed instantly.`;
    }
    claimDialog?.showModal();
  });
})();
