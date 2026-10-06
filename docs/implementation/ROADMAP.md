# Shtora — Implementation Roadmap

## Branch

This branch is the active implementation/test line:

~~~text
test/vps-grok-imagine
~~~

The repository `main` is the source used by the published Grok Build. Promote the tested commits there only after end-to-end publication verification.

## P0 — contracts and persistence

### 1. Add shared visual types

Create a small shared module for:

- CameraMode
- PhotoIntent
- VisualMemory
- Scene
- VisualContext
- GenerationJob
- ScenePlan

### 2. Add VisualMemory persistence

Store:

- image;
- source;
- scene;
- parent;
- world snapshot;
- camera;
- prompt;
- timestamps.

### 3. Add generation job state

States:

~~~text
queued
planning
source_selected
generating
persisted
failed
~~~

### 4. Add provider boundary

Introduce:

~~~text
ImageGenerationGateway
  ├─ Grok publication
  └─ xAI API fallback
~~~

No product module should call provider URLs directly.

## P1 — deterministic continuity

### 5. Photo Intent Resolver

Implement deterministic parsing first:

- selfie;
- mirror;
- side;
- back;
- full;
- POV.

### 6. Continuation

Use lastPhotoUrl / VisualMemory as the reference for CONTINUE.

Preserve:

- identity;
- scene;
- clothes;
- hair;
- relevant environment.

### 7. Scene lifecycle

Create/reuse sceneId according to explicit world changes.

## P1 — source anti-repeat

### 8. Dropbox source history

Persist recent source paths.

Selection:

~~~text
eligible
→ exclude recent
→ identity-safe pool
→ choose candidate
~~~

Do not rely on seed alone.

## P1 — Scene Planner

Planner produces structured:

~~~text
location
activity
time/weather
outfit
pose
camera
~~~

It sees recent history and avoids deliberate repetition.

## P2 — semantic intent

Add structured LLM output + Zod validation.

LLM only interprets intent.

Application code performs all side effects.

## P2 — POV and Visual Memory retrieval

Support:

- POV generation;
- memory search;
- gallery;
- image-to-image "make another like this".

## P2 — Grok publication Imagine

After the publication contract is verified:

1. implement Grok image provider;
2. add image/edit operation;
3. route VPS Imagine through gateway;
4. retain xAI API only as explicit fallback/dev mode.

Never emulate browser cookies or subscription auth.

## P3 — cross-product world

Use the same world state in:

- Chat;
- Instagram;
- stories;
- posts;
- Dropbox memory;
- Imagine.

## P3 — events

Add world events:

- left home;
- arrived;
- changed clothes;
- went to bed;
- woke up.

## Suggested implementation order

~~~text
types
 ↓
VisualMemory
 ↓
GenerationJob
 ↓
PhotoIntent
 ↓
continuation
 ↓
Scene
 ↓
Dropbox history
 ↓
ScenePlanner
 ↓
semantic resolver
 ↓
POV/memory retrieval
 ↓
provider gateway
 ↓
Grok publication Imagine
 ↓
cross-product world
~~~

## Current implementation status

P0 is implemented: shared visual types, VisualMemory persistence, GenerationJob state and the image provider gateway exist.

P1 is implemented: deterministic camera intent, last-frame continuation, scene lifecycle, Dropbox recent-source exclusion and a life-mode scene planner are wired into chat/feed photo generation.

P2 is implemented on the Shtora side: Zod-validated DM classification, POV/memory/gallery contracts and published `/api/grok-chat` Imagine routing are present. The public Build runtime still needs real end-to-end image access verification.

P3 is implemented for the shared world boundary: successful generated photos commit scene/place/activity/clothes/scene id as world events. The durable owner is the VPS; publication storage is best-effort.

## Definition of done

The first milestone is complete when:

- sequential photos preserve the scene;
- explicit scene changes create a new scene;
- VisualMemory is persisted;
- Dropbox does not immediately reuse the same source;
- ordinary chat never accidentally generates an image;
- failures do not mutate world/relationship state;
- provider code is isolated behind a gateway.
