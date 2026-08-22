# Tatzo mobile release checklist

This is the handoff from repository readiness to real store accounts. Start with
internal distribution and TestFlight; do not send the first binary directly to
public production.

## Repository gates

- [x] Stable iOS bundle ID and Android package: `eu.tatzo.app`.
- [x] Opaque 1024×1024 store icon plus Android adaptive and monochrome layers.
- [x] Separate development, preview, and production EAS environments/channels.
- [x] Remote build-number management and automatic production increments.
- [x] Google Play submissions default to the internal testing track.
- [x] Privacy policy, terms, community rules, safety contact, block/report tools,
      and permanent in-app account deletion are discoverable in the app.
- [x] Localized draft store copy exists for English, French, and Russian.
- [x] `npm run release:check` runs in pull-request CI.

## One-time account setup

- [ ] Enrol the legal owner in the Apple Developer Program and create the app in
      App Store Connect with bundle ID `eu.tatzo.app`.
- [ ] Create the app in Google Play Console with package `eu.tatzo.app` and enable
      Play App Signing.
- [ ] Create/link the Expo EAS project, then set
      `EXPO_PUBLIC_EXPO_OWNER`, `EXPO_PUBLIC_EAS_PROJECT_ID`,
      `EXPO_PUBLIC_API_BASE_URL=https://tatzo.eu/api/v1`, and
      `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY` in the matching EAS environments.
- [ ] Restrict the Android Maps key to `eu.tatzo.app` and every signing-certificate
      SHA fingerprint used by preview/Play builds. Do not commit credential files.
- [ ] Configure APNs and FCM v1 credentials in EAS, then verify push delivery on one
      physical iPhone and one physical Android phone.
- [ ] Configure Stripe Connect in live mode, register the production webhook endpoint,
      store the Stripe secret and webhook secret only on the backend, and complete one
      end-to-end deposit plus refund test with a real-device release build.
- [ ] Add App Store Connect and Google Play service credentials to EAS only when
      automated submission is desired. Keep them out of Expo public variables and Git.

## Policy and listing review

- [ ] Open every URL in `store/store-listing.json` in a private browser window.
- [ ] Confirm the web account-deletion path lets a signed-out former app user sign
      in on the website and complete deletion without reinstalling the app.
- [ ] Reconcile `store/data-safety.md` with the production backend, hosting logs,
      Cloudinary, Expo push, Google Maps, Stripe, Health & Safety/Healing retention, and
      support access before completing either privacy form.
- [ ] Complete Apple App Privacy, Google Play Data safety, content-rating, age-rating,
      export-compliance, UGC, and advertising declarations with the account owner.
- [ ] Prepare a review account with representative content and give reviewers concise
      login and navigation instructions. Never place production admin credentials there.
- [ ] Capture final screenshots from release builds, with no test data, private messages,
      personal addresses, or system debug overlays.

## Build and beta sequence

1. Run `npm run release:check:production` with the production public values loaded.
2. Build `preview` for real-device smoke testing. Android preview intentionally produces
   an APK; production keeps EAS's store-ready AAB default.
3. Test sign-up and verification, feed/media, public profiles, Style Match, map/location,
   private chat attachments, booking flows, Health & Safety share/revoke, Healing photo
   check-ins/tasks/artist access/completion, Stripe Connect, deposit payment/webhook/refund,
   artist actions, notifications, blocking, reporting, support links, sign-out, token
   revocation, and account deletion.
4. Build `production` for both platforms.
5. Submit iOS to TestFlight and Android to Google Play internal testing.
6. Fix review/beta issues, repeat the smoke test, then move to closed/external beta.
7. Promote the exact tested build to public release only after metadata and privacy
   declarations have their final human approval.

Official references:

- [Expo EAS build profiles](https://docs.expo.dev/build/eas-json/)
- [Expo EAS environments](https://docs.expo.dev/eas/environment-variables/)
- [Apple screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)
- [Google Play account deletion](https://support.google.com/googleplay/android-developer/answer/13327111)
- [Google Play preview assets](https://support.google.com/googleplay/android-developer/answer/9866151)
