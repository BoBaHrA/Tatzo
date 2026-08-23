# Mobile data-safety inventory

This is an engineering inventory for the store forms, not a completed legal or
policy declaration. The account owner must reconcile it with production hosting,
retention, support operations, and every enabled third-party service before submission.

| Data or capability | Observed mobile use | Processing path to verify | Store-form action |
| --- | --- | --- | --- |
| Account identifiers | Username, email, public tag, account type, profile data | Tatzo Django API and database | Declare account management and app functionality |
| User photos and videos | Avatar, posts, portfolio, booking references, chat attachments | Tatzo API and configured media storage/Cloudinary | Declare collection; verify public/private purpose per surface |
| Messages and project details | Private chat, booking brief, consultation notes, comments | Tatzo API and database | Declare app functionality; verify retention after deletion |
| Files and documents | Chat files and private location-claim evidence | Tatzo API and private media storage | Declare collection and confirm access controls/retention |
| App activity | Likes, follows, bookmarks, Style Match answers, booking actions, reports | Tatzo API and database | Declare personalization/app functionality as applicable |
| Health, safety, and healing information | Optional conditions, medication, allergies/sensitivities, healing risks, safety notes, private healing photos, optional symptom tags/notes, and care-task completion | Tatzo API and database plus configured private media storage/Cloudinary; shared only with the artist for the relevant appointment or healing journey | Declare sensitive health data and user photos for app functionality/safety; verify consent, retention, access, and deletion answers |
| Payment and deposit activity | Deposit amount, currency, status, deadline, Stripe Checkout session reference, and artist payout readiness | Tatzo API and database plus Stripe Connect/hosted Checkout; card and bank details are entered on Stripe-hosted pages | Declare purchase/payment activity as applicable; verify Stripe's processor disclosures and confirm Tatzo never receives card or bank credentials |
| Location | Foreground GPS centers the native map; viewport bounds are queried for nearby results | Device, map provider, and Tatzo map endpoint | Treat as potentially collected location until console taxonomy is reviewed |
| Device/app identifiers | Installation UUID, Expo push token, locale, platform | Tatzo API plus Expo push delivery | Declare notification functionality and verify provider disclosures |
| Diagnostics and logs | No mobile analytics or crash-reporting SDK is currently present | Backend, CDN, hosting, and provider logs may still record network metadata | Audit production logs before selecting “not collected” answers |

## Current safeguards visible in source

- HTTPS is required by the production release check.
- Access and rotating refresh tokens are stored with `expo-secure-store`.
- Private media endpoints enforce authorization; push lock-screen copy avoids message,
  booking, and profile details.
- Health & Safety responses are non-cacheable, require explicit consent, are limited to
  appointment participants, can be revoked by the client, and are hidden from the artist
  when the appointment is cancelled, declined, or outside the access window.
- Healing journals are created only for completed tattoo appointments. Only the client can
  add photos, notes, symptom tags, care tasks, or mark healing complete; the appointment
  artist has read-only access. Photo links are participant-bound, short-lived, and sent
  with `private, no-store` responses.
- Payment and bank credentials stay on Stripe-hosted onboarding and Checkout pages.
  Tatzo accepts payment state only from the verified Stripe webhook, never from a redirect.
- Users can block accounts; report posts and comments; edit/delete their own comments;
  contact safety support; and permanently delete their account in-app after password
  confirmation.
- The website also exposes authenticated account deletion at
  `https://tatzo.eu/settings/delete-account/` for users who no longer have the app.
- There is no advertising or mobile analytics SDK in the current dependency manifest.

## Mandatory human verification before submission

- Confirm deletion cascades, asynchronous media deletion, backups, legal-retention
  exceptions, and the maximum retention period.
- Confirm whether Cloudinary, Expo, Google Maps, Stripe, the production host, email
  delivery, and any CDN constitute processors or sharing under each store's definitions.
- Confirm Health & Safety card/share and Healing journal/photo retention, deletion,
  support access, audit access, and the exact Apple App Privacy and Google Play Data
  safety categories with counsel or the accountable store owner before submission.
- Confirm whether map viewport queries must be declared as approximate or precise location.
- Confirm encryption in transit for every production API/media URL and whether users can
  request data export, correction, and deletion through published support channels.
- Repeat this inventory whenever a new SDK, analytics tool, payment flow, ad network,
  health feature, or background permission is added.
