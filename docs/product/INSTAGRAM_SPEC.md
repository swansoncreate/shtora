# Shtora — Instagram Specification

## Scope

Instagram remains the primary product surface.

Existing areas:

- home feed;
- profile;
- posts;
- stories;
- highlights;
- comments;
- media viewer;
- chat entry points.

## World-driven content

Instagram content should gradually reflect the same World Engine used by chat.

Example:

~~~text
World:
Paris
black dress
evening
cafe

Instagram:
post/story/photo can reflect the same state
~~~

## Feed

Feed generation uses Scene Planner + Dropbox Source Selector + Image Generation Gateway.

Persist:

- source path;
- final prompt;
- scene plan;
- outfit;
- location;
- pose;
- sceneId;
- timestamp.

## Stories

Stories should use the same visual memory and scene continuity rules as chat media.

A story generated during an active scene should normally retain that sceneId.

## Posts

Posts can be:

- generated from current world;
- imported/source-based;
- manually selected from Dropbox.

Generated posts should retain their VisualMemory metadata.

## Profile

Profile remains an identity surface. It should not be used as a second independent world state.

## Chat integration

Opening a DM from a profile/post/story should preserve the same character identity and world context.

## Acceptance criteria

1. Feed and chat can reference the same character identity.
2. A generated image can become an Instagram post/story without losing metadata.
3. Scene continuity is not reset when moving between Instagram and chat.
4. Instagram does not create a separate conflicting world state.
