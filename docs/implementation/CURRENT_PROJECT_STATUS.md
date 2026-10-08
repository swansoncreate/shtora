# Shtora — Current Project Status

Updated: 2026-10-08

## Current task
Mobile-first visual redesign previews for the existing Shtora application.

Core product: **Instagram simulator + personal communication with a character**.

## Repository baseline inspected
Redesign baseline: `test/vps-grok-imagine`.

The requested status file did not exist in the baseline branch when first checked; it was created on the redesign work so future chats have a persistent status record.

## Existing UI map confirmed in code
- Instagram/feed: `src/components/instagram/app.tsx`, `src/components/home-feed.tsx`, `src/components/instagram/profile.tsx`, `src/components/favorites-strip.tsx`, `src/components/feed-comments.tsx`
- Personal chat: `src/components/chats.tsx`, `src/components/chat-send-button.tsx`, `src/lib/chat/*`
- Photo viewer: `src/components/post-viewer.tsx`, `src/components/shtora-media-viewer.tsx`, `src/components/media-save-button.tsx`, `src/components/imagine-dice.tsx`
- Imagine: `src/components/imagine-studio.tsx`, `src/components/imagine-dice.tsx`, `src/lib/imagine/*`
- Dropbox: `src/components/dropbox-browser.tsx`, `src/components/dropbox-picker.tsx`, `src/lib/dropbox/*`
- Settings: `src/components/settings-sheet.tsx`
- Preview infrastructure: `src/components/preview-home.tsx`, `preview/index.html`, `.github/workflows/preview-pages.yml`

## V3
Branch: `design/mobile-redesign-v3`.
Concept: **Living World** — dark editorial UI, lime accent, persistent navigation.
Preview path: `/v3/`.
V3 was deployed successfully by GitHub Actions.

## V4 — current
Branch: `design/mobile-redesign-v4`.
Concept: **Afterglow** — warm editorial/personal-photo-journal direction. It deliberately differs from V3:
- warm paper background and graphite surfaces;
- restrained coral accent;
- large editorial photography instead of dense card UI;
- Feed feels like the character's living photo journal;
- personal chat is a first-class screen;
- Photo Viewer is immersive and action-focused;
- Imagine is a creative studio connected to the current photo;
- Dropbox becomes a personal Moments archive;
- Settings keeps the existing conceptual settings area in the same visual language.

V4 is a standalone clickable prototype under `preview/v4/index.html`. It does not replace the real application components.

## V4 clickable coverage
Feed → Photo Viewer → Imagine → Chat/conversation → Dropbox/Moments → Settings.

## GitHub Pages
Workflow now publishes:
- existing application at root;
- V3 at `/v3/`;
- V4 at `/v4/`.

## Safety/implementation constraint
No landing page, no showcase homepage, no arbitrary product sections, and no replacement of the existing application. The redesign previews are isolated under `preview/v3` and `preview/v4`.

## Next validation
1. Wait for Actions on `design/mobile-redesign-v4` to complete.
2. Open `https://swansoncreate.github.io/shtora/v4/` on a phone.
3. Check all primary flows and confirm no blocking overlay.
4. Confirm root app and V3 remain intact.
