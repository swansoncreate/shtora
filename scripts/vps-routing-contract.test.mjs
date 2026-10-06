import assert from "node:assert/strict";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { register } from "node:module";

await register(pathToFileURL(new URL("./src-alias-hook.mjs", import.meta.url).pathname));

process.env.SHTORA_RPC_KEY = "routing-test-key";

const { generateImage } = await import("../src/lib/imagine/gateway.ts");

function fakeImageResponse(url = "https://img.test/generated.jpg") {
  return new Response(JSON.stringify({ ok: true, url }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const payload = {
  model: "grok-imagine-image-2.0",
  prompt: "test frame",
  image: { url: "data:image/jpeg;base64,ZmFrZQ==", type: "image_url" },
  aspect_ratio: "9:16",
};

test("VPS Imagine routes through published Grok Build, not xAI directly", async () => {
  const previousSelf = process.env.SHTORA_SELF;
  const previousDataDir = process.env.SHTORA_DATA_DIR;
  const previousOrigin = process.env.SHTORA_GROK_ORIGIN;
  const previousFetch = globalThis.fetch;
  const calls = [];

  process.env.SHTORA_SELF = "1";
  process.env.SHTORA_GROK_ORIGIN = "https://shtora-test.grok.me";
  delete process.env.SHTORA_DATA_DIR;

  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return fakeImageResponse();
  };

  try {
    const out = await generateImage(payload);
    assert.deepEqual(out, {
      ok: true,
      url: "https://img.test/generated.jpg",
      provider: "grok-publication",
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://shtora-test.grok.me/api/grok-chat");
    assert.equal(calls[0].init.method, "POST");

    const headers = new Headers(calls[0].init.headers);
    assert.equal(headers.get("x-shtora-key"), "routing-test-key");
    const body = JSON.parse(String(calls[0].init.body));
    assert.equal(body.op, "imagine");
    assert.equal(body.engine, "grok");
    assert.equal(body.data?.source, "shtora-vps");
    assert.deepEqual(body.payload, payload);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousSelf === undefined) delete process.env.SHTORA_SELF;
    else process.env.SHTORA_SELF = previousSelf;
    if (previousDataDir === undefined) delete process.env.SHTORA_DATA_DIR;
    else process.env.SHTORA_DATA_DIR = previousDataDir;
    if (previousOrigin === undefined) delete process.env.SHTORA_GROK_ORIGIN;
    else process.env.SHTORA_GROK_ORIGIN = previousOrigin;
  }
});

test("non-VPS Imagine keeps the direct xAI API path", async () => {
  const previousSelf = process.env.SHTORA_SELF;
  const previousDataDir = process.env.SHTORA_DATA_DIR;
  const previousKey = process.env.XAI_API_KEY;
  const previousFetch = globalThis.fetch;
  const calls = [];

  delete process.env.SHTORA_SELF;
  process.env.SHTORA_DATA_DIR = "/tmp/shtora-local-routing-test";
  process.env.XAI_API_KEY = "local-xai-test-key";

  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return fakeImageResponse("https://img.test/local.jpg");
  };

  try {
    const out = await generateImage(payload);
    assert.deepEqual(out, {
      ok: true,
      url: "https://img.test/local.jpg",
      provider: "xai-api",
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.x.ai/v1/images/edits");
    const headers = new Headers(calls[0].init.headers);
    assert.equal(headers.get("authorization"), "Bearer local-xai-test-key");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousSelf === undefined) delete process.env.SHTORA_SELF;
    else process.env.SHTORA_SELF = previousSelf;
    if (previousDataDir === undefined) delete process.env.SHTORA_DATA_DIR;
    else process.env.SHTORA_DATA_DIR = previousDataDir;
    if (previousKey === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = previousKey;
    if (previousDataDir === undefined) delete process.env.SHTORA_DATA_DIR;
    else process.env.SHTORA_DATA_DIR = previousDataDir;
  }
});
