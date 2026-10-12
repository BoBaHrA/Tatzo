# Tatzo mobile parity audit — 12 October 2026

Base: PR #137 (`052d2687ff0e23bc3e0bd83d5b79dce744fbbfff`) includes current
main (`0589b536b7ade78241cfd228124d7a3616b9b017`). PR #137 is open and was not
merged by this audit. Its saved Style Match result/session work is preserved.

## Scope and findings

| Area | Reviewed behavior and changes | Remaining device/live validation |
| --- | --- | --- |
| Identity and layout | Compared live web home, discovery search, map and login; kept web icons and teal/pink/navy palette; bundled Poppins weights, placed auth logo inside the card, made menu scrollable and bottom spacing safe-area aware. | Native screen screenshots at small/large font settings, keyboard and Android gesture/button navigation. |
| Login / session | Single-flight refresh with atomic token-pair storage and legacy migration; rejects old-account responses; offline bootstrap retains credentials and offers retry; API timeouts; providers reset across account changes. Six concurrency/failure behavior tests. | Real-device cold start, expired token and airplane-mode recovery. Web preview uses an in-memory session because SecureStore is native. |
| Languages | EN/FR/RU preference is shared by translations, date formatting and API headers. Consumers subscribe to changes; Settings has a real language selector. | Server-provided copy changes on the next data refresh; check all three languages on device. |
| Feed / likes / bookmarks | Guarded refresh and pagination, preserve loaded pages on focus, protect changes and newly published posts from stale responses, synchronous tap guards, one delete confirmation, Android-compatible report-reason sheet. Native saved-post list uses the same privacy/block filtering as feed. | Post media, native sharing, rapid taps and navigation with a test account. |
| Publishing / comments / profiles | Existing authenticated APIs and owner/visibility tests inspected; publishing, portfolio, comment/reply/like/report, profile/follow/block routes retained. | Camera/gallery permissions, file selection and media rendering on device. |
| Discovery / map | Existing rich discovery filters and prepared-profile web handoff retained. Map request invalidation and safe-area fix; failed Leaflet scripts can retry instead of remaining blank forever. | Actual WebView, map gestures/clusters, location permission denial and offline tiles. Web map fallback is not an APK screenshot. |
| Chat | Stable chat refresh callback, account-scoped cache, foreground polling, preserve scroll while reading history. Polling updates edited/deleted recent messages; server only returns messages in the authenticated participant's thread. | Push delivery, attachments, keyboard, two-device conversation. Edit/delete synchronization covers the latest 100 loaded messages per poll; older pages are fetched again when loaded. |
| Calendar / booking / dashboard | Existing artist/customer role checks, scheduling, availability, time off, booking preferences, deposits and ratings reviewed through server tests and parity checks. Fixed test fixtures using fixed UTC+2 instead of the artist's Europe/Paris zone. Dashboard remains its own artist workspace with a menu shortcut. | Device calendar/form flow; real Stripe onboarding and payments were not executed. |
| Support | Native report form and validated, rate-limited API; authenticated author cannot be overridden. | New API must be deployed before this screen works against production. Attachments remain available in the web support flow. |
| Administration | Staff-only native moderation hub, permission-filtered report queues, pagination, resolve/delete actions, confirmation and Django audit log. Verification/private documents and full account administration open the existing protected web tools. | Staff account walkthrough. This does not replace every Django admin screen with a native screen. New endpoints require server deployment. |
| Style Match / healing / safety / notifications | Retained PR #137 persistence and existing profile/dashboard/healing/search parity gates; backend regression suite includes privacy and lifecycle cases. | Actual push registration/delivery, healing media capture, persisted result reopening on device. |

## Build and release

`Android preview APK` builds a bundled, installable release variant using Expo's
generated development signing key, with a separate `eu.tatzo.app.preview`
application ID and `Tatzo Preview` name. It can coexist with the main app. It is
not a Play Store release and does not use production signing credentials.
The workflow uploads the APK for 14 days. Production EAS configuration is retained.

New bookmark, support, moderation and chat synchronization endpoints need the
matching backend release. There are no schema migrations. Existing API paths and
old mobile clients remain supported. No merge, deployment, live payment, user
message, production report, or moderation deletion was performed for testing.

## Evidence and limits

Run the full repository suite with collected static assets, as CI does. Without
`collectstatic`, template tests fail on missing manifest assets. Two baseline
booking tests additionally failed across the October DST transition because their
fixtures hard-coded UTC+2; they now use the artist's actual zone.

Validation commands:

- `python manage.py collectstatic --noinput`
- `python manage.py test --verbosity 1`
- `python manage.py check`
- `python manage.py makemigrations --check --dry-run`
- `npm run typecheck --prefix mobile`
- `npm test --prefix mobile`
- `npm run release:check --prefix mobile`
- `npx expo export --platform all`
- `npx expo prebuild --platform android --no-install`

The cloud browser cannot access the local preview (`ERR_BLOCKED_BY_CLIENT`). The
Expo account build list requires sign-in. No Android device/emulator is available
in this workspace. Therefore successful checks, bundle export and APK compilation
must not be described as a completed visual/device acceptance test.
