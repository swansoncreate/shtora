import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createJiti } from "jiti";

process.env.SHTORA_DATA_DIR = mkdtempSync(join(tmpdir(), "shtora-media-"));

const jiti = createJiti(import.meta.url, {
  alias: {
    "@": join(process.cwd(), "src"),
    "@tanstack/react-router": join(process.cwd(), "scripts/router-stub.mjs"),
  },
});

const media = await jiti.import("../src/routes/api/media.ts");
const get = media.Route.server.handlers.GET;

async function mediaGet(url, fetchImpl) {
  const prev = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (target, init) => {
    seen.push(String(target));
    return fetchImpl(target, init);
  };
  try {
    const res = await get({ request: new Request(url) });
    return { status: res.status, body: await res.text(), seen };
  } finally {
    globalThis.fetch = prev;
  }
}

test("a foreign host is rejected before any outbound request", async () => {
  const out = await mediaGet("https://vps.test/api/media?u=https://evil.example/a.jpg", async () => {
    throw new Error("fetch should not run");
  });
  assert.equal(out.status, 400);
  assert.equal(out.body, "Host not allowed");
  assert.deepEqual(out.seen, []);
});

test("explicit suffixes stay allowed and loose scontent or fbcdn matches do not", async () => {
  const allowed = [
    "https://scontent.cdninstagram.com/scontent.jpg",
    "https://video.xx.fbcdn.net/fbcdn.mp4",
    "https://instagram.com/ig.jpg",
    "https://dl.dropboxusercontent.com/dbx.jpg",
    "https://www.dropbox.com/dropbox.jpg",
    "https://api.hikerapi.com/hiker.jpg",
    "https://api.apifyusercontent.com/apify.jpg",
    "https://v3.fal.media/fal.jpg",
    "https://api.x.ai/xai.jpg",
  ];
  for (const url of allowed) {
    const out = await mediaGet(`https://vps.test/api/media?u=${encodeURIComponent(url)}`, async () => new Response("ok"));
    assert.equal(out.status, 200, url);
    assert.equal(out.seen.length, 1, url);
  }
  const denied = [
    "https://scontent.evil.com/a.jpg",
    "https://cdn.evil.fbcdn.example/a.jpg",
    "https://evilcdninstagram.com/a.jpg",
    "https://notfbcdn.net.evil.com/a.jpg",
    "https://grok.com/a.jpg",
    "https://fal.ai/a.jpg",
  ];
  for (const url of denied) {
    const out = await mediaGet(`https://vps.test/api/media?u=${encodeURIComponent(url)}`, async () => {
      throw new Error("fetch should not run");
    });
    assert.equal(out.status, 400, url);
    assert.deepEqual(out.seen, [], url);
  }
});

test("server failure banner replaces the cache banner, and the worker is not registered", () => {
  const index = readFileSync(new URL("../src/routes/index.tsx", import.meta.url), "utf8");
  assert.equal(index.includes("из кэша"), false);
  assert.match(index, /offline \|\| apiOk === false/);
  assert.match(index, /Сервер не отвечает/);
  assert.equal(index.includes("serviceWorker.register"), false);
  assert.match(index, /getRegistrations\(\)/);
  const host = readFileSync(new URL("../src/lib/media-host.ts", import.meta.url), "utf8");
  assert.equal(host.includes('includes("scontent")'), false);
  assert.equal(host.includes('includes(".fbcdn.")'), false);
  const seed = JSON.parse(readFileSync(new URL("../public/shtora-seed/state.json", import.meta.url), "utf8"));
  assert.equal(seed.chats.length, 0);
});
