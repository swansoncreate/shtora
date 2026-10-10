# Shtora end-to-end request tracing

## Goal

A single user action in Direct or Feed must be reconstructable across the browser, Shtora server, published Grok handler, model request, generated result, and persistence. Use one opaque `traceId` per logical operation and include it in every related JSONL event.

This is diagnostic metadata, not a replacement for functional logs. Do not log raw user messages, full prompt/system instructions, image bytes/data URLs, access tokens, cookies, API keys, or complete upstream response bodies.

## Required event chain

### Direct messages

1. `dm.client.received`: trace ID, username hash or bounded account key, message ID, input JSON byte count, history count, image-present boolean.
2. `dm.input.validated`: operation, field-presence map, history count, image-present boolean.
3. `dm.turn.started`: current stage/slot and bounded world-state field-presence map.
4. `dm.classifier.started|finished`: model operation, attempt number, latency, HTTP status, parsed/fallback outcome.
5. `model.request.started|finished|failed`: provider route, selected model, JSON-mode flag, message count, serialized request byte count, attempt number, latency, HTTP status, response byte count, error class/code.
6. `dm.output.parsed`: parse success, bubble count, photo kind, world fields changed, result byte count. Never include generated bubble text or raw model output.
7. `dm.commit.started|finished|failed`: number of bubbles, duplicate bubbles removed, thread patch outcome, messages persisted, elapsed time.
8. `dm.photo.started|finished|failed`: image-generation route, photo kind, input-reference count, provider, status/latency, saved-message outcome. Never log image URLs or prompt text.
9. `visual.continuation source context resolved`: whether the requested source image and scene ID matched stored visual memory, plus the safe resolution class (`source-url`, `scene-id`, or `none`). Never log either identifier or the URL.
10. `visual.source selected|selection failed`: image-present boolean, byte count, identity-present boolean, and source-path-present boolean; never log the source path or image data.
11. `visual.image persistence resolved`: distinguish a locally addressable `/chat-media/` URL from an unpersisted upstream fallback. The URL itself is never logged.
12. `visual.visual memory saved|persistence chain failed` and `visual.source history persistence failed`: record whether the visual memory save completed, whether a generation job exists, and the error class only. A history-write failure must not turn a successfully generated image into a failed request.

Use the same `traceId` from the DM turn for these events. The visual-generation job ID can be inspected through the generation-job store; do not expose it in ordinary user-facing messages.

### Feed generation

1. `feed.fill.started`: trace ID, force flag, number of selected accounts, existing post count.
2. `feed.post.started|finished|failed`: trace ID, attempt, account key, generation path, latency, outcome, response byte count, image-present boolean.
3. `feed.post.deduplicated`: reason (`post_id` or `image_key`), without image URL.
4. `feed.post.persisted`: trace ID, post ID, storage type/key, post count before/after, save outcome.
5. `feed.fill.finished`: trace ID, attempted/added/duplicate/failed counts and total duration.

## JSONL schema

Each event must contain:

- `at`: UTC ISO-8601 timestamp
- `level`: `info`, `warn`, or `error`
- `traceId`: opaque ID shared by all events for one logical operation
- `area`, `event`
- `durationMs` when the operation completes
- `details`: bounded, typed metadata only

Generate the ID at the first trusted boundary. Preserve it through server-function validation, internal model calls, Grok RPC payloads, response parsing, and persistence. For child operations, keep the parent `traceId` and add a bounded `spanId`/operation name rather than generating a disconnected trace.

## Privacy and safety

- Never log complete request/response JSON. Log the JSON byte count, field names/presence, counts, types, and explicitly allow-listed numeric/boolean metadata.
- Redact secrets before logging; do not attempt to make prompt text safe with URL replacement alone.
- Do not log image URLs, data URLs, Dropbox paths/tokens, RPC credentials, or account personal data.
- Bound every string, array, event count, and log file; retain the current size-limited rotation and restrictive file permissions.
- Logging failures must not fail or delay the user-visible chat/feed operation.
- Do not change model selection, retries, generation prompts, feed deduplication, or persistence semantics merely to add tracing.

## Implementation order

1. Add a trace context and safe structured-event helper to the single server JSONL implementation.
2. Propagate trace IDs through `runLiveTurn → chatReply → DmChat → runChatModel → Grok RPC`.
3. Add commit and photo-generation completion events to Direct.
4. Thread trace IDs through `FeedEngine → generateNextDaily/generateExtraPost → model/Imagine calls → saveDaily`.
5. Add focused tests for propagation, error paths, JSONL validity, redaction, and log-write failure isolation.
6. Verify CI, inspect sample JSONL from a test run, then separately plan deployment. No production/VPS deployment is implied by this document.
