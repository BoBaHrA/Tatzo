# Tatzo mobile

The Tatzo iOS and Android client is an Expo/React Native application. Django and
PostgreSQL remain the single backend and data source; the app communicates only
through the versioned JSON API under `/api/v1/`.

## Local development

1. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_BASE_URL` to a URL the
   device or emulator can reach. `127.0.0.1` works only for an iOS simulator or
   when the API runs on the same device. Android Emulator commonly uses
   `http://10.0.2.2:8000/api/v1`.
2. Install dependencies with `npm ci`.
3. Run `npm start`, then choose Android, iOS, or a development build.

Tokens are stored with `expo-secure-store`. Access tokens are short-lived;
refresh tokens rotate and the replaced token is blacklisted by Django.

## Current vertical slice

- client/artist registration with terms acceptance;
- email-verification handoff to the existing Tatzo web flow;
- username or email login;
- automatic access-token refresh;
- authenticated profile read/edit;
- secure sign out;
- authenticated cursor-paginated feed with Cloudinary-backed image/video media;
- pull-to-refresh, infinite loading, likes, bookmarks, and post reports;
- public artist profiles with follow, portfolio, recent posts, and two-way privacy;
- block/unblock controls, blocked-user management, safety contact, and in-app account deletion;
- native Style Match with resumable sessions, adaptive clarification cards, saved references,
  localized results, and artist recommendations.
- native private chat with unread badges, background polling, read receipts, protected
  photo/video/file attachments, message editing/deletion, and two-way block enforcement.

The next slices are booking and map.
