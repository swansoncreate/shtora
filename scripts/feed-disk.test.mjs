import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createJiti } from "jiti";

const dataDir = mkdtempSync(join(tmpdir(), "shtora-feed-"));
process.env.SHTORA_DATA_DIR = dataDir;
process.env.SHTORA_SELF = "1";
process.env.SHTORA_RPC_KEY = "feed-test-key";

const jiti = createJiti(import.meta.url, {
  alias: {
    "@": join(process.cwd(), "src"),
    "@tanstack/react-router": join(process.cwd(), "scripts/router-stub.mjs"),
  },
});

const disk = await jiti.import("../src/lib/feed/disk.server.ts");
const rpc = await jiti.import("../src/routes/api/rpc.ts");
const post = rpc.Route.server.handlers.POST;

function card(id, username = "inna") {
  return {
    id,
    username,
    at: 10,
    source: "generated",
    caption: "кадр",
    slides: [{ id, url: `https://cdn.example/${id}.jpg` }],
  };
}

function rpcRequest(body, key = process.env.SHTORA_RPC_KEY) {
  return new Request("https://vps.test/api/rpc", {
    method: "POST",
    headers: { "content-type": "application/json", ...(key ? { "x-shtora-key": key } : {}) },
    body: JSON.stringify(body),
  });
}

test("feed cards land in feed.json and a repeat id does not duplicate", async () => {
  const first = await disk.appendFeed(card("post-1"));
  assert.equal(first.id, "post-1");
  await disk.appendFeed(card("post-1"));
  const rows = JSON.parse(readFileSync(join(dataDir, "feed.json"), "utf8"));
  assert.equal(rows.filter((row) => row.id === "post-1").length, 1);
  assert.equal(existsSync(join(dataDir, "chats")), false);
  assert.equal(existsSync(join(dataDir, "shtora-config.json")), false);
  assert.equal(readdirSync(dataDir).some((name) => name.endsWith(".tmp")), false);
});

test("a legacy imageUrl becomes one slide and the tail stays 160", async () => {
  await disk.appendFeed({ id: "legacy", username: "inna", at: 1, imageUrl: "https://cdn.example/old.jpg", caption: "old" });
  const listed = await disk.listFeed("inna");
  const legacy = listed.cards.find((row) => row.id === "legacy");
  assert.equal(legacy.slides.length, 1);
  assert.equal(legacy.slides[0].url, "https://cdn.example/old.jpg");

  const many = Array.from({ length: 161 }, (_, i) => disk.appendFeed(card(`tail-${i}`, "long")));
  await Promise.all(many);
  const tail = await disk.listFeed("long");
  assert.equal(tail.cards.length, 160);
});

test("feed.append without a key is 401 and a bad card is 400", async () => {
  const before = readFileSync(join(dataDir, "feed.json"), "utf8");
  const denied = await post({ request: rpcRequest({ name: "feed.append", data: { card: card("secret") } }, "") });
  assert.equal(denied.status, 401);
  assert.equal(readFileSync(join(dataDir, "feed.json"), "utf8"), before);
  const bad = await post({ request: rpcRequest({ name: "feed.append", data: { card: { id: "" } } }) });
  assert.equal(bad.status, 400);
});

test("no response keeps the local cache and likes stay in the browser", () => {
  const sync = readFileSync(new URL("../src/lib/feed/sync.ts", import.meta.url), "utf8");
  const useFeed = readFileSync(new URL("../src/lib/feed/use-feed.ts", import.meta.url), "utf8");
  const likes = readFileSync(new URL("../src/lib/feed/likes.ts", import.meta.url), "utf8");
  assert.match(sync, /shtora-feed-v7|loadDaily/);
  assert.match(sync, /pullFeed\(\)\.catch/);
  assert.match(sync, /if \(!known.has\(post.id\)\) pushFeedCard\(post\)/);
  assert.match(useFeed, /hydrateFeedDisk\(\)/);
  assert.match(likes, /shtora-feed-likes-v1/);
  assert.equal(readFileSync(new URL("../src/components/instagram/app.tsx", import.meta.url), "utf8").includes("likeFeedDisk"), false);
});
