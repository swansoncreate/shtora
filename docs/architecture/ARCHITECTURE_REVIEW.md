
# Shtora — Architecture Review: World Engine & Visual Continuity

**Status:** Draft for Architecture Review

## Executive summary

Shtora already has persona/context, relationship state, world state (place, clothes, hair), previous-photo references, camera modes, media generation and delayed replies.

The main architectural gap is an explicit Photo Intent + Visual Memory layer.

> A character should feel like they inhabit a continuous visual world. A new photo is an observation of that world, not an unrelated generation.

## Target architecture

~~~text
User message
  ↓
Chat Engine
  ├─ Persona / relationship
  ├─ World State
  ├─ Conversation
  └─ Visual Memory
        ↓
Photo Intent Resolver
        ↓
Scene Planner
        ↓
Recent History / anti-repeat
        ↓
Dropbox Source Selector
        ↓
Prompt Compiler
        ↓
Image Generation Gateway
        ↓
Generated Image
  ├─ chat media
  ├─ Instagram
  └─ Visual Memory
~~~

## Core behaviors

### Sequential photo

"Скинь селфи" → selfie.

"А теперь повернись боком" → previous photo as reference; preserve identity, clothes, place and light; change only the requested view.

### New scene

"Покажи себя в зелёном платье" → new visual scene based on identity + requested outfit/world state.

### POV

If the character says "Я сейчас лежу в ванной", then "Скинь фотку" can resolve to a POV/environmental image based on current world state.

## Architectural separation

Keep four concerns separate:

1. Intent — what photo is requested?
2. Reference — what existing visual/world information is preserved?
3. Generation — how is the image produced?
4. Memory — how can the result be referenced later?

The LLM interprets intent; application code performs side effects.

## PhotoIntent

~~~text
mode: continue | new_scene | pov | memory | gallery | none
reference: last_photo | identity | world | visual_memory
camera: selfie | mirror | side | back | full | pov | candid | gallery
changes: string[]
scene?: string
clothes?: string
memoryQuery?: string
~~~

## VisualMemory

Each photo should retain:

- id, username, imageUrl, createdAt;
- sceneId and optional parentId;
- scene/world snapshot: place, clothes, hair, activity;
- camera mode/angle/perspective;
- source: instagram, dropbox, generated, edited;
- tags and final prompt.

## Scene continuity

Keep the same scene when only camera/angle changes.

Create a new scene when place, clothes, activity or significant time context changes.

parentId links sequential visual edits even across scene changes.

## Scene Planner

Feed and free-form photo generation should be able to choose:

- location;
- activity;
- time/weather;
- free-form outfit;
- pose;
- camera.

The current user visual preset remains a style layer, not a fixed outfit/location list.

Recommended base style:

"She takes a casual photo in natural light, in raw smartphone style. Realistic details, natural skin texture, grain and imperfections. The scene, activity, pose and outfit are freely chosen to feel like a plausible moment from her real life. Clothing should be varied and context-appropriate, with no fixed outfit list and no deliberate repetition of recent outfits."

## Dropbox source rotation

Dropbox is an identity/source library, not the world state.

The selector should exclude recently used source paths, prefer identity-safe images, rotate candidates and persist the selected source path.

A seed alone is not a sufficient anti-repeat strategy.

## Generation gateway

World Engine must not call a provider directly.

~~~text
World / PhotoIntent
        ↓
ImageGenerationGateway
        ├─ Grok publication provider
        └─ xAI API fallback
~~~

## Reliability

Every generation gets a job id and explicit state:

~~~text
queued → planning → source_selected → generating → persisted
                         ↘ failed / retryable
~~~

Persist PhotoIntent, ScenePlan, WorldSnapshot, source image/path, final prompt, provider, parentId, sceneId, timestamps and error/retry information.

The prompt is not the source of truth. Structured state is.

## Existing implementation surface

Relevant modules:

- src/lib/chat/engine.ts
- src/lib/chat/media.ts
- src/lib/chat/world.ts
- src/lib/chat/photo.ts
- src/lib/imagine/jobs.ts
- src/lib/imagine/functions.ts
- src/lib/dropbox/dropbox.server.ts

This is an incremental refactor, not a rewrite.

## MVP acceptance criteria

1. selfie → side → back preserves identity and scene.
2. Explicit new clothes/place creates a new scene.
3. POV uses world state.
4. Every generated photo creates VisualMemory metadata.
5. Source images rotate without immediate repeats.
6. Ordinary chat never triggers image generation.
7. Provider can be swapped without changing World Engine contracts.
8. Failed generation does not corrupt chat/world state.
