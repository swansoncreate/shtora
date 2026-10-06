# Shtora — Chat Specification

## Goal

Make character communication feel persistent, stateful and visually continuous while keeping ordinary conversation fast.

## Message pipeline

~~~text
user message
  ↓
chat engine
  ├─ context
  ├─ relationship
  ├─ world state
  ├─ recent visual memory
  └─ intent detection
       ↓
  ordinary reply OR photo/media job
~~~

## Photo dispatch rule

Only an explicit or semantically resolved photo/media intent can enter the image pipeline.

Examples:

- "скинь селфи" → photo
- "теперь боком" → continuation photo
- "покажи, как ты сейчас лежишь" → POV/environmental photo
- "что делаешь?" → ordinary chat

## Continuation

When a previous generated photo exists:

~~~text
lastPhoto
+
current world
+
camera change
→ next photo
~~~

The default behavior for a follow-up camera command is CONTINUE, not NEW_SCENE.

## Relationship

Existing relationship state remains independent from visual generation.

Photo failure must not change:

- warmth;
- trust;
- heat;
- irritation;
- guilt;
- spark.

## Delayed replies

Existing delayed/offline catch-up behavior remains.

Visual jobs must not block ordinary message persistence.

## Media message

A completed generation should become a normal chat media message containing:

- generated image URL;
- jobId;
- VisualMemory id;
- sceneId;
- camera;
- optional parentId.

## Future

The chat can eventually query VisualMemory:

- "покажи вчерашнюю";
- "сделай как на той фотке";
- "что на мне было вчера?".

This should be implemented through structured retrieval, not by stuffing the full image history into the prompt.
