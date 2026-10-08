# Shtora functional-base audit

## Purpose

This branch is a safety snapshot of `test/vps-grok-imagine` before separating the functional architecture from the experimental UI/Pages showroom work.

Source snapshot:
- `test/vps-grok-imagine`
- HEAD: `19ec9ac53ab8a4a72d041025bfdd0400f1439ed3`

## Keep

1. VPS/Grok/Imagine gateway and RPC contract.
2. Visual Scene Engine: scene identity, memory, continuity, generation jobs.
3. Chat/DM visual continuity.
4. Feed realism: combinatorial outfit planning, lived-in scenes, non-fixed pose rotation.
5. Dropbox source history and recent-repeat avoidance.
6. Persistence, restart recovery, serialization and security fixes.
7. Tests/typecheck/lint that protect the above.

## Isolate / review separately

- New editorial visual system.
- New shell/navigation and settings drawer.
- New media viewers/gallery.
- Static GitHub Pages showroom and preview-only UI.
- Preview seed data and preview-specific navigation.

## Important

Do NOT delete the functional visual engine merely because it arrived in the same branch as the UI experiment. The visual engine is a core product capability for the Instagram + character communication concept.

Do NOT modify `main` as part of this cleanup.

## Next implementation step

Create a clean working branch from the current known-good baseline and transplant the functional commits/files into it, then reintroduce only selected UI improvements. Keep the current experimental branch untouched as rollback/reference.
