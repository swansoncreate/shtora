# Test: VPS → published Grok → Imagine

This branch tests the architecture where the phone talks only to the Shtora VPS, and the VPS delegates Imagine generation to the user's published Grok Build.

## Request path

```
Phone
  ↓
Shtora VPS
  ↓  POST /api/grok-chat
Published Grok Build
  ↓
Grok Imagine
  ↓
image URL
  ↓
Shtora VPS
  ↓
Phone
```

Chat already uses the same publication path. This branch extends the image-generation path.

## Shtora VPS requirements

Set:

- `SHTORA_GROK_ORIGIN=https://<your-build>.grok.me`
- `SHTORA_RPC_KEY=<same shared RPC key used by the current publication bridge>`

The origin is stored by the existing `grok-origin.txt` mechanism as an alternative to the environment variable.

## Build-side contract

The published Build must accept:

`POST /api/grok-chat`

Headers:

- `Content-Type: application/json`
- `X-Shtora-Key: <shared key>`

Body:

```json
{
  "op": "imagine",
  "engine": "grok",
  "data": {
    "source": "shtora-vps",
    "payload": {
      "model": "grok-imagine-image-2.0",
      "prompt": "...",
      "image": {
        "url": "data:image/jpeg;base64,...",
        "type": "image_url"
      },
      "aspect_ratio": "9:16"
    }
  }
}
```

The Build returns:

```json
{
  "ok": true,
  "url": "https://..."
}
```

or:

```json
{
  "ok": false,
  "error": "..."
}
```

The existing Shtora server code deliberately does not emulate browser cookies, OAuth sessions, or SuperGrok authentication. The published Build is the provider boundary.

## What this branch changes

- `callGrokApp()` accepts the `imagine` operation.
- `runImageEdit()` detects VPS execution and sends the image-edit payload to the published Grok Build.
- `imagineVariation` no longer rejects VPS execution; it uses the same gateway.
- Non-VPS execution remains on the existing direct xAI API path.

## Important

This branch is only end-to-end when the published Build implements the `op: "imagine"` handler. The Shtora side is ready for that contract; it does not pretend that the existing chat-only Build endpoint can generate images by magic.
