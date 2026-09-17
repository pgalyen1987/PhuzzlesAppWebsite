# Phuzzles iOS launch — flip these the moment Apple approves

You'll need two things from App Store Connect after approval:
- **App Store URL** → `https://apps.apple.com/app/id<APP_ID>`
- The **official Apple "Download on the App Store" badge** (grab from
  developer.apple.com/app-store/marketing/guidelines/ — Apple requires their asset).
  Save it into the repo as `app-store-badge.svg`.

## 1. Landing page (`index.html`) — 3 edits

**a) Hero button** (~line 369): right after the Google Play `<a>…</a>`, add:
```html
<a href="https://apps.apple.com/app/id<APP_ID>" class="download-btn"
   target="_blank" rel="noopener">
  <img src="app-store-badge.svg" alt="Download on the App Store" />
</a>
```

**b) Secondary button** (~line 421): same, but match the inline height:
```html
<a href="https://apps.apple.com/app/id<APP_ID>" class="download-btn"
   target="_blank" rel="noopener">
  <img src="app-store-badge.svg" alt="Download on the App Store" style="height:50px;" />
</a>
```

**c) Nav badge** (~line 358): `Now on Android` → `Now on iOS &amp; Android`.

## 2. The linkShared viral loop (Android + iOS)

- Android: build from commit `ac5e6a8` (the "Share as a link" button) — bump versionCode above "build 19".
- **iOS: make the same change before/at launch** — add the equivalent `linkShared` flag,
  the sender-side "Share as a link" action, and the share of `https://phuzzles.app/puzzle/<id>`.
  Backend (Firestore rules + anon auth) is already live and shared across both platforms.

## 3. QR for distribution (DONE)

- `qr/phuzzles-qr.png` (black, print), `qr/phuzzles-qr-brand.png` (orange), `qr/phuzzles-qr.svg`.
- Live at `https://phuzzles.app/qr/phuzzles-qr.png`.
- Regenerate / make per-channel UTM variants: `node tools/generate-qr.js "https://phuzzles.app/?utm_source=flyer"`.
