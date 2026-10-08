# Shtora — Current Project Status

Updated: 2026-10-08

## Current task
Mobile-first visual redesign preview for the existing Shtora application.

Core product: **Instagram simulator + personal communication with a character**.

## Repository baseline inspected
Branch used as redesign baseline: `test/vps-grok-imagine`.

The requested file `docs/implementation/CURRENT_PROJECT_STATUS.md` did **not** exist in the baseline branch when checked. This document is being created on the redesign branch so future work has a persistent status record.

## Existing UI map confirmed in code

- Instagram/feed:
  - `src/components/instagram/app.tsx`
  - `src/components/home-feed.tsx`
  - `src/components/instagram/profile.tsx`
  - `src/components/favorites-strip.tsx`
  - `src/components/feed-comments.tsx`
- Personal chat:
  - `src/components/chats.tsx`
  - `src/components/chat-send-button.tsx`
  - `src/lib/chat/*`
- Photo viewer:
  - `src/components/post-viewer.tsx`
  - `src/components/shtora-media-viewer.tsx`
  - `src/components/media-save-button.tsx`
  - `src/components/imagine-dice.tsx`
- Imagine:
  - `src/components/imagine-studio.tsx`
  - `src/components/imagine-dice.tsx`
  - `src/lib/imagine/*`
- Dropbox:
  - `src/components/dropbox-browser.tsx`
  - `src/components/dropbox-picker.tsx`
  - `src/lib/dropbox/*`
- Settings:
  - `src/components/settings-sheet.tsx`
- Existing preview infrastructure:
  - `src/components/preview-home.tsx`
  - `preview/index.html`
  - `.github/workflows/preview-pages.yml`

## Important implementation constraint
The redesign preview must not replace or delete existing application functionality. The V3 design is therefore isolated under `preview/v3/` and published as a separate GitHub Pages path.

## V3 visual concept
**Shtora / Living World**

A dark, editorial mobile interface with:
- high-contrast near-black surfaces;
- acid-lime primary action color;
- soft cyan/pink secondary visual accents;
- compact Instagram-like feed cards;
- persistent bottom navigation for Feed / Chat / Imagine / Dropbox / Settings;
- visual continuity between feed, conversation media, photo viewer, Imagine and archive;
- no landing page and no arbitrary new product sections.

## Clickable prototype coverage
The V3 preview includes clickable states for:
1. Feed with stories, posts, reactions and Imagine entry points.
2. Personal chat list.
3. Concrete chat with messages and generated media.
4. Photo Viewer with Save / Imagine edit / Send to chat actions.
5. Imagine Studio with prompt, source selection, generation state and result actions.
6. Dropbox with folders and recent media.
7. Settings with existing conceptual settings groups.

## GitHub Pages
Redesign branch: `design/mobile-redesign-v3`.

The Pages workflow publishes:
- the existing built application as before;
- V3 prototype at `/v3/`.

## Changes on this branch
- Added `preview/v3/index.html` — standalone clickable mobile redesign prototype.
- Updated `.github/workflows/preview-pages.yml` to copy `preview/v3` into the Pages artifact at `site/v3`.
- Added this status file.

## Next validation
After GitHub Actions completes:
1. Open the V3 Pages path on a phone.
2. Check Feed → Photo Viewer → Imagine.
3. Check Feed/Chat → concrete conversation → generated image.
4. Check Dropbox → image viewer.
5. Check Settings.
6. Confirm no blocking overlay/search sheet appears over the prototype.
7. Confirm the existing application build remains the Pages root and was not replaced by V3.
