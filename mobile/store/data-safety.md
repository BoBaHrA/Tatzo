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
| Location | Foreground GPS centers the native map; viewport bounds are queried for nearby results | Device, map provider, and Tatzo map endpoint | Treat as potentially collected location until console taxonomy is reviewed |
| Device/app identifiers | Installation UUID, Expo push token, locale, platform | Tatzo API plus Expo push delivery | Declare notification functionality and verify provider disclosures |
| Diagnostics and logs | No mobile analytics or crash-reporting SDK is currently present | Backend, CDN, hosting, and provider logs may still record network metadata | Audit production logs before selecting “not collected” answers |

## Current safeguards visible in source

- HTTPS is required by the production release check.
- Access and rotating refresh tokens are stored with `expo-secure-store`.
- Private media endpoints enforce authorization; push lock-screen copy avoids message,
  booking, and profile details.
- Users can block accounts, report posts, contact safety support, and permanently delete
  their account in-app after password confirmation.
- The website also exposes authenticated account deletion at
  `https://tatzo.eu/settings/delete-account/` for users who no longer have the app.
- There is no advertising or mobile analytics SDK in the current dependency manifest.

## Mandatory human verification before submission

- Confirm deletion cascades, asynchronous media deletion, backups, legal-retention
  exceptions, and the maximum retention period.
- Confirm whether Cloudinary, Expo, Google Maps, the production host, email delivery,
  and any CDN constitute processors or sharing under each store's definitions.
- Confirm whether map viewport queries must be declared as approximate or precise location.
- Confirm encryption in transit for every production API/media URL and whether users can
  request data export, correction, and deletion through published support channels.
- Repeat this inventory whenever a new SDK, analytics tool, payment flow, ad network,
  health feature, or background permission is added.
