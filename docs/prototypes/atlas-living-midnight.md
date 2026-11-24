# Tatzo Atlas — Phase II / Living Midnight, first pass

## Audit
Based on main after PR #168. Existing native MapLibre 5.6.1 / OpenFreeMap vector source, Atlas settings disclosure, artist card filtering, fallback, branding, cluster split motion and classic map remain. The Canva export is a design reference only; its demo coordinates and photos are not imported. No new paid infrastructure.

## Implementation
- Independent Midnight cartography module replaces inherited road layers with separate local/avenue/arterial casings, surfaces, tunnels and bridges using OpenMapTiles class/brunnel metadata. High adds a restrained warm arterial highlight.
- Water polygons use deeper teal, bank and shoreline lines. Procedural repeating wave marks are clipped by real water polygons through fill-pattern; static, not flow simulation.
- Parks and landcover use procedural stippling at Medium/High. Not real tree positions. Low skips these images/layers.
- Building footprints and extrusions use existing geometry and height metadata (approximate fallback); height-dependent material colors and directional light. No roof meshes or true cast shadows yet.
- Dimension is independently selectable from the theme and quality. Extrusions switch with camera pitch; Low delays extrusions to z15.5 and skips texture layers.
- Canva-inspired portrait rings and verification-status dots use existing Tatzo card images, with initials or location glyph when absent. No live availability implied. Existing cluster split animation retained unchanged; exact parent/child and reverse merge animation remain a separate task.
- Added Lyon camera preset; existing Clermont-Ferrand shortcut retained.

## Verification
Static JS syntax and synthetic smoke checks passed for 18 theme/quality/dimension combinations; Midnight base layers 31/31/32 plus three optional texture layers for Medium/High. Mock map/image install checked all three quality levels; coordinate/status filtering checked. Reproducible Node test: node --test scripts/atlas_living.test.cjs (test file added; equivalent checks executed in connector JS environment). Not full MapLibre style validation or real browser/GPU measurements. Browser environment could not resolve the external tile endpoint, so actual screenshots unavailable.

## Review links
- Lyon: /maps/?basemap=atlas&theme=midnight&quality=high&lng=4.8357&lat=45.7601&z=15.5&pitch=48&bearing=-18
- Clermont: /maps/?basemap=atlas&theme=midnight&quality=medium&lng=3.087&lat=45.777&z=15.5&pitch=48&bearing=-22

## Remaining
Browser test geometry/labels/attribution, profile interactions, cluster animation, mobile/desktop layout and performance; confirm source attribute coverage. No true terrain, animated water, landmark models, independent Porcelain/Ink material system, or discovery heatmap yet. Do not fabricate density or availability. Existing Classic default remains unchanged.

Technical references: https://openmaptiles.org/docs/schema/ ; https://maplibre.org/maplibre-gl-js/docs/examples/add-a-pattern-to-a-polygon/ .
