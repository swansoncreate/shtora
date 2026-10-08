# Shtora — Product Specification

## Product

Shtora is a social-world simulator centered on Instagram, character communication and visual continuity.

Existing product surfaces remain:

- Instagram home/feed
- profile
- posts
- stories
- highlights
- Instagram DMs/chat
- Dropbox
- Imagine
- Settings

## Priority

1. Instagram + communication
2. visual continuity
3. world state
4. Imagine / media generation
5. Dropbox as source and memory library
6. settings/infrastructure

## Core product principle

The character is not a collection of generated messages and images.

The character lives in a continuous world.

Chat describes that world. Instagram shows it. Photos observe it. Visual Memory records it.

## World state

Minimum state:

- place
- clothes
- hair
- activity
- time context
- sceneId

Future state:

- weather
- objects
- recent events
- location transitions
- episodic memory

## Photo behavior

### Continue

A follow-up photo in the same situation preserves identity, scene, outfit, lighting and relevant environment.

### New scene

An explicit change of place, outfit or activity starts a new scene.

### POV

POV reflects the current world instead of inventing an unrelated environment.

### Memory

Previously generated/imported images can be referenced semantically.

## Feed generation

Feed uses a life-mode planner:

- free-form location;
- activity;
- weather/time context;
- free-form outfit;
- pose;
- camera.

The user's base visual preset controls style/photographic language, not a fixed outfit list.

Recent history prevents obvious repetition.

## Chat

Ordinary chat must not trigger image generation unless the intent resolver determines that the user explicitly or semantically requested a photo/media action.

The chat engine remains the owner of:

- persona;
- relationship;
- conversation;
- world updates;
- photo intent dispatch.

## Reliability

Generation is asynchronous and observable.

Every job has:

- jobId;
- status;
- intent;
- scene;
- source;
- provider;
- timestamps;
- error/retry information.

Failed generation must not mutate successful world/memory state.

## UX direction

The redesign should preserve real Shtora windows but introduce a genuinely new visual language rather than cloning the current dark UI.

Recommended direction:

- editorial social magazine;
- asymmetric grid;
- large typography;
- milky/light surfaces;
- cobalt, coral and lime accents;
- full-bleed imagery;
- chat with a cleaner messenger hierarchy;
- Imagine as a creative lab;
- Dropbox as a visual library;
- Settings as a control center.

The visual redesign must not invent unrelated product areas.
