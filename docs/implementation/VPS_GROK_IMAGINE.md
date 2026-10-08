# Visual / Grok publication architecture

## Runtime path

The product uses the VPS as the user-facing Shtora backend. Image generation is provider-routed:

```
Phone
  ↓
Shtora VPS
  ├─ Chat → published Grok Build → Grok chat
  └─ Imagine → published Grok Build → Imagine
                    ↓
                 image URL
                    ↓
                 Shtora VPS
                    ↓
                  Phone
```

The published Build is the same application source that lives in `main`. The VPS calls its explicit `POST /api/grok-chat` endpoint with a shared RPC key.

No browser cookies, consumer-session replay, OAuth emulation, or SuperGrok credential forwarding is used.

## Operations

- `reply` and `ping` keep the existing DM path.
- `imagine` accepts a constrained image payload and is handled by the image gateway.
- On the VPS, `@/lib/imagine/gateway` forwards image work to the published Build.
- Outside the VPS runtime, the gateway retains the direct xAI API fallback for development.

## Visual continuity

A generated photo is treated as an observation of a scene.

- `continue` references the latest frame.
- `new_scene` changes scene identity and can carry explicit place/outfit changes.
- `pov` uses world/previous-frame context.
- `memory` and `gallery` retrieve from VisualMemory instead of generating a new image.
- Each generated image records the scene id, parent id, source path, prompt, camera and world snapshot.

## Feed life mode

The feed planner uses the current user prompt as the style layer, then chooses:

- place and activity;
- Moscow-time slot and light/weather;
- free-form combinatorial clothing;
- a natural pose and camera;
- recent-history exclusions for source photos and recent outfits/places.

Carousel slides continue from the first generated frame and keep the same scene metadata.

## Persistence boundary

The VPS owns durable visual state:

- `/data/visual/memory` — visual memory;
- `/data/visual/jobs` — generation jobs;
- `/data/visual/source-history.json` — recent Dropbox sources;
- shared world state — scene id, place, activity and clothes.

Published runtime persistence is treated as best-effort because deployment filesystems may be ephemeral. A storage failure must not discard an otherwise successful generated image.

## Security boundary

The publication endpoint is guarded by `X-Shtora-Key`. The shared key is handled by the existing server-side RPC secret path and never enters browser code.

For production, configure the published Build and VPS with the same RPC key and the VPS with `SHTORA_GROK_ORIGIN`.

## Verification status

The Shtora-side routing, continuity, source rotation, memory, generation jobs and shared-world integration are implemented on `test/vps-grok-imagine`.

End-to-end publication verification still depends on the deployed Build exposing `/api/grok-chat` and having working image-generation access in that runtime.
