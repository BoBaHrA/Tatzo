# Tatzo Maps — Vector Lab

## Preview

Download `tatzo-maps.html` from this directory and open it in a WebGL-capable browser with internet access. If the browser restricts fetches from local files, serve the directory locally with `python -m http.server 8000` and open `http://localhost:8000/tatzo-maps.html`.

This is a standalone prototype; no Django route, production assets, mobile files, API credentials, database records or deployment configuration are changed.

Three themes: Midnight (current Tatzo brand), Porcelain (warm light), Ink (plum/graphite). The lab constructs its own MapLibre style layers using a vector source and glyph endpoint discovered from the OpenFreeMap Liberty style; it does not display Liberty's original layers. The four pins are explicitly fictional. Export generates the currently selected MapLibre style JSON. OpenStreetMap/OpenMapTiles/OpenFreeMap attribution must remain visible.

## Manual review (not yet executed)

- [ ] Desktop: 1920×1080, 1366×768, 1024×600 and 3440×1440.
- [ ] Tablet and phone: 768×1024, 390×844 and 320×568, landscape and portrait.
- [ ] Real roads, water, labels and buildings appear; no retail POI clutter.
- [ ] Switch each theme repeatedly; pan, zoom, markers and attribution survive.
- [ ] Toggle 3D, reset camera, export a valid style JSON.
- [ ] Test slow internet, WebGL disabled and unavailable tile service.
- [ ] Verify keyboard navigation, label contrast, browser console and Android performance.

## Migration after approval

1. Pin and self-host the selected style and MapLibre assets; retain a documented compatible vector source and glyphs. Verify licensing and production service capacity; keep attribution. Consider self-hosted PMTiles later, without requiring it for the first release.
2. Add an opt-in feature flag on web. Consider a MapLibre–Leaflet bridge to preserve existing Leaflet markers, popups, clustering, location selection and events during migration; compare with a native MapLibre adapter. Keep existing raster map as fallback, including for WebGL failures.
3. Retain existing Django APIs, filter semantics, artist/studio cards, claim actions, profile and booking links, localization, permissions and moderation. Don't enable availability/rating/budget filters unless actual backend data supports them.
4. Fix map container sizing independently of sidebar, use responsive breakpoints and ResizeObserver, test route changes and sheet state. Run current web and mobile tests plus browser/device acceptance checks before enabling.
5. Port the selected style to the Expo mobile map separately; test Android WebGL/DOM bridge and native fallback. No automatic production merge or deploy from this branch.

Official references: https://openfreemap.org/quick_start/ and https://maplibre.org/maplibre-gl-js/docs/ and https://openmaptiles.org/docs/schema/
