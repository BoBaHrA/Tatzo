(() => {
  const cards = Array.from(document.querySelectorAll("[data-location-card]"));
  const pins = Array.from(document.querySelectorAll(".maps-pin"));
  const search = document.querySelector("[data-map-search]");
  const filters = Array.from(document.querySelectorAll("[data-map-filter]"));
  const styleFilters = Array.from(document.querySelectorAll("[data-draft-filter]"));
  const bookingFilters = Array.from(document.querySelectorAll("[data-booking-filter]"));
  const shell = document.querySelector(".maps-shell");
  const mobileSheetButtons = Array.from(document.querySelectorAll("[data-mobile-sheet]"));
  const mobileSheetToggle = document.querySelector("[data-mobile-sheet-toggle]");
  const mobileSheetBackdrop = document.querySelector("[data-mobile-sheet-backdrop]");
  const mobileSheetClose = document.querySelector("[data-mobile-sheet-close]");
  const mobileMediaQuery = window.matchMedia("(max-width: 760px)");
  let activeFilter = "all";
  let leafletMap = null;
  let leafletMarkerLayer = null;
  let isPickingLocationPin = false;
  let pickedLocationMarker = null;
  let addLocationDialog = null;
  const leafletMarkersByArtist = new Map();
  const activeStyleFilters = new Set();
  const activeBookingFilters = new Set();


  function isMobileMapLayout() {
    return mobileMediaQuery.matches;
  }

  function refreshMapSize() {
    if (!leafletMap) return;
    window.setTimeout(() => leafletMap.invalidateSize(), 120);
  }

  function closeMobileSheet() {
    shell?.classList.remove("is-mobile-sheet-open");
    shell?.removeAttribute("data-mobile-sheet-mode");
    document.body.classList.remove("maps-mobile-sheet-active");
    mobileSheetBackdrop?.setAttribute("hidden", "");
    cards.forEach((card) => card.classList.remove("is-mobile-selected"));
    refreshMapSize();
  }

  function openMobileSheet(mode, selectedCard = null) {
    if (!isMobileMapLayout() || !shell) return;
    cards.forEach((card) => card.classList.toggle("is-mobile-selected", card === selectedCard));
    shell.dataset.mobileSheetMode = mode;
    shell.classList.add("is-mobile-sheet-open");
    document.body.classList.add("maps-mobile-sheet-active");
    mobileSheetBackdrop?.removeAttribute("hidden");
    if (mode === "search") {
      window.setTimeout(() => search?.focus({ preventScroll: true }), 160);
    }
    refreshMapSize();
  }

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

  function safeExternalUrl(value) {
    if (!value) return "";
    try {
      const url = new URL(value, window.location.origin);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch (_error) {
      return "";
    }
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

    const defaultLat = Number(shell?.dataset.defaultLat || 46.8);
    const defaultLng = Number(shell?.dataset.defaultLng || 2.5);
    const defaultZoom = Number(shell?.dataset.defaultZoom || 5);
    const worldBounds = L.latLngBounds([[-85, -180], [85, 180]]);
    const map = L.map(mapContainer, {
      scrollWheelZoom: true,
      zoomControl: true,
      minZoom: isMobileMapLayout() ? 3 : 2,
      maxZoom: 19,
      maxBounds: worldBounds,
      maxBoundsViscosity: 1.0,
      worldCopyJump: false,
    }).setView([defaultLat, defaultLng], Math.max(defaultZoom, isMobileMapLayout() ? 3 : 2));
    leafletMap = map;

    // Development tile layer only. Production should use an approved tile provider,
    // API key/configuration when required, and comply with provider usage policies.
    // TODO: Future POI imports must use official APIs only (Google Places API,
    // Apple Maps API, Geoapify/OSM, or Foursquare). Do not scrape public maps.
    // Imported POIs should be saved as Location records with source, source_place_id,
    // name, address, latitude, longitude, and status="imported" or "unclaimed".
    const tileUrl = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
    L.tileLayer(tileUrl, {
      minZoom: 2,
      maxZoom: 19,
      noWrap: true,
      bounds: worldBounds,
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

    map.on("click", (event) => {
      if (!isPickingLocationPin) return;
      isPickingLocationPin = false;
      const lat = event.latlng.lat.toFixed(6);
      const lng = event.latlng.lng.toFixed(6);
      const latInput = document.querySelector("[data-location-latitude]");
      const lngInput = document.querySelector("[data-location-longitude]");
      const output = document.querySelector("[data-location-pin-output]");
      if (latInput) latInput.value = lat;
      if (lngInput) lngInput.value = lng;
      if (output) output.textContent = `Pin selected: ${lat}, ${lng}`;

      if (pickedLocationMarker) {
        pickedLocationMarker.setLatLng(event.latlng);
      } else {
        pickedLocationMarker = L.marker(event.latlng, {
          icon: L.divIcon({
            className: "tatzo-map-marker tatzo-map-marker-unclaimed",
            html: "<span>⌖</span>",
            iconSize: [34, 34],
            iconAnchor: [17, 17],
          }),
        }).addTo(map);
      }

      addLocationDialog?.showModal();
      refreshMapSize();
    });

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

      const isVerified = source === "verified";
      const popupType = isVerified ? "verified" : "unclaimed";
      const popupStatus = isVerified ? "Verified Tatzo location" : "Not yet on Tatzo / Unclaimed";
      const popupBadge = isVerified ? "Verified" : "Imported location";
      const confidence = card.dataset.confidence ? `${escapeHtml(card.dataset.confidence)}%` : "Pending";
      const website = safeExternalUrl(card.dataset.website || "");
      const websiteLabel = website.replace(/^https?:\/\//, "").replace(/\/$/, "");

      const profileButton = isVerified && card.dataset.profileUrl
        ? `<a class="tatzo-map-popup-action tatzo-map-popup-profile" href="${escapeHtml(card.dataset.profileUrl)}">Profile</a>`
        : "";

      let actionButton = "";
      if (isVerified && card.dataset.canBook === "true") {
        actionButton = `<a class="tatzo-map-popup-action tatzo-map-popup-book" href="${escapeHtml(card.dataset.bookUrl)}">Book</a>`;
      } else if (!isVerified) {
        actionButton = `<button class="tatzo-map-popup-action tatzo-map-popup-claim" type="button" data-open-claim data-claim-url="/maps/location/${card.dataset.locationId}/claim/" data-claim-location="${escapeHtml(card.dataset.location)}" data-claim-artist="${escapeHtml(card.dataset.artist)}" data-claim-kind="${source}">${escapeHtml(card.dataset.actionLabel || "Claim this location")}</button>`;
      }

      const contactDetails = [
        card.dataset.phone
          ? `<span class="tatzo-map-popup-pill">${escapeHtml(card.dataset.phone)}</span>`
          : "",
        website
          ? `<a class="tatzo-map-popup-pill" href="${escapeHtml(website)}" target="_blank" rel="noopener noreferrer">${escapeHtml(websiteLabel || "Website")}</a>`
          : "",
      ].filter(Boolean).join("");

      marker.bindPopup(`
        <div class="tatzo-map-popup tatzo-map-popup-${popupType}">
          <div class="tatzo-map-popup-head">
            <span class="tatzo-map-popup-icon">${isVerified ? "✓" : "⌖"}</span>
            <div>
              <strong>${escapeHtml(card.dataset.artist)}</strong>
              <span class="tatzo-map-popup-status">${popupStatus}</span>
            </div>
          </div>
          <div class="tatzo-map-popup-meta">
            <span>${popupBadge}</span>
            <span>Data ${confidence}</span>
          </div>
          <p class="tatzo-map-popup-address">${escapeHtml(card.dataset.location || card.dataset.city || "Address pending")}</p>
          ${contactDetails ? `<div class="tatzo-map-popup-contact">${contactDetails}</div>` : ""}
          <div class="tatzo-map-popup-actions">
            ${profileButton}
            ${actionButton}
          </div>
        </div>
      `);

      addMarkerToLayer(marker);
      leafletMarkersByArtist.set(card.dataset.artist, marker);
      marker.on("click", () => {
        if (isMobileMapLayout()) {
          map.closePopup();
          openMobileSheet("selected", card);
          return;
        }

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

  mobileSheetToggle?.addEventListener("click", () => openMobileSheet("list"));
  mobileSheetButtons.forEach((button) => {
    button.addEventListener("click", () => openMobileSheet(button.dataset.mobileSheet || "list"));
  });
  mobileSheetClose?.addEventListener("click", closeMobileSheet);
  mobileSheetBackdrop?.addEventListener("click", closeMobileSheet);
  mobileMediaQuery.addEventListener?.("change", () => {
    closeMobileSheet();
    refreshMapSize();
  });
  window.addEventListener("orientationchange", refreshMapSize);
  window.addEventListener("resize", refreshMapSize);

  addLocationDialog = document.querySelector("[data-add-location-dialog]");
  document.querySelectorAll("[data-open-add-location]").forEach((button) => {
    button.addEventListener("click", () => {
      closeMobileSheet();
      addLocationDialog?.showModal();
      refreshMapSize();
    });
  });
  document.querySelector("[data-close-add-location]")?.addEventListener("click", () => {
    addLocationDialog?.close();
    refreshMapSize();
  });
  document.querySelector("[data-pick-location-pin]")?.addEventListener("click", () => {
    isPickingLocationPin = true;
    addLocationDialog?.close();
    closeMobileSheet();
    refreshMapSize();
  });
  addLocationDialog?.addEventListener("close", refreshMapSize);


  const claimDialog = document.querySelector("[data-claim-dialog]");
  const claimForm = document.querySelector("[data-claim-form]");
  const claimSummary = document.querySelector("[data-claim-summary]");
  const claimTitle = document.querySelector("[data-claim-title]");
  const claimSubmit = claimForm?.querySelector("[type='submit']");
  document.querySelector("[data-close-claim]")?.addEventListener("click", () => {
    claimDialog?.close();
    refreshMapSize();
  });
  claimDialog?.addEventListener("close", refreshMapSize);

  document.querySelectorAll(".maps-dialog form[method='post']").forEach((form) => {
    form.addEventListener("submit", () => {
      const submitButton = form.querySelector("button[type='submit']");
      if (!submitButton) return;
      submitButton.disabled = true;
      submitButton.textContent = "Submitting…";
    });
  });
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
        : "Use Add location for address review";
    }

    if (claimSummary) {
      const title = isImportedLocation ? "Claim this location" : "Request location verification";
      const summary = isImportedLocation
        ? "Submit a verification request for this studio. Tatzo will review it before anything changes."
        : "Submit your address details for review. Nothing is published until Tatzo verifies it.";
      if (claimTitle) claimTitle.textContent = title;
      claimSummary.textContent = summary;
    }
    closeMobileSheet();
    claimDialog?.showModal();
    refreshMapSize();
  });
})();
