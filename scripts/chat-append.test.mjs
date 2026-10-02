import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { register } from "node:module";

await register(pathToFileURL(new URL("./src-alias-hook.mjs", import.meta.url).pathname));

const dataDir = mkdtempSync(join(tmpdir(), "shtora-chats-"));
process.env.SHTORA_DATA_DIR = dataDir;

const { writeDiskThread, readDiskThread } = await import("../src/lib/chat/disk.server.ts");

function msg(role, at, text, id) {
  return { role, at, text, ...(id ? { id } : {}) };
}

function thread(username, extra) {
  return {
    username,
    fullName: "Inna",
    warmth: 10,
    mood: "file-mood",
    memory: "file-memory",
    persona: "file-persona",
    backstory: "file-story",
    world: { place: "file-place" },
    arc: { beat: "thaw", want: "file-want", avoid: "file-avoid", loops: [], lastMove: "file-move" },
    bond: { warmth: 80, trust: 70, heat: 20, irrit: 5, spark: 40 },
    lastPingAt: 5_000,
    updatedAt: 2_000,
    messages: [msg("user", 100, "old user"), msg("assistant", 200, "tick ping stays")],
    ...extra,
  };
}

test("old full dump merges and does not replace the file", async () => {
  await writeDiskThread(thread("merge"));
  await writeDiskThread(
    thread("merge", {
      metricsOk: true,
      updatedAt: 1_000,
      warmth: 1,
      mood: "stale",
      memory: "stale",
      persona: "stale",
      backstory: "stale",
      world: { place: "stale-place" },
      arc: { beat: "ice", want: "stale", avoid: "stale", loops: [], lastMove: "stale" },
      bond: { warmth: 1, trust: 1, heat: 1, irrit: 1 },
      lastPingAt: 100,
      messages: [msg("user", 100, "old user"), msg("user", 300, "new reply")],
    }),
  );
  const row = await readDiskThread("merge");
  assert.equal(row.bond.warmth, 80);
  assert.equal(row.world.place, "file-place");
  assert.equal(row.mood, "file-mood");
  assert.equal(row.memory, "file-memory");
  assert.equal(row.persona, "file-persona");
  assert.equal(row.backstory, "file-story");
  assert.equal(row.arc.beat, "thaw");
  assert.equal(row.lastPingAt, 5_000);
  assert.equal(row.updatedAt, 2_000);
  assert.deepEqual(
    row.messages.map((m) => m.text),
    ["old user", "tick ping stays", "new reply"],
  );
});

test("same role:at:prefix and same id do not duplicate a bubble", async () => {
  await writeDiskThread(thread("dup"));
  await writeDiskThread(
    thread("dup", {
      updatedAt: 3_000,
      messages: [
        msg("user", 100, "old user"),
        msg("assistant", 400, "ping body", "p1"),
        msg("assistant", 400, "ping body rewritten", "p1"),
      ],
    }),
  );
  const row = await readDiskThread("dup");
  const texts = row.messages.map((m) => m.text);
  assert.equal(texts.filter((text) => text === "old user").length, 1);
  assert.equal(texts.filter((text) => text.startsWith("ping body")).length, 1);
  assert.equal(texts.includes("tick ping stays"), true);
  assert.equal(texts.includes("ping body rewritten"), false);
});

test("a newer patch may update bond, and lastPingAt never decreases", async () => {
  await writeDiskThread(thread("fresh"));
  await writeDiskThread(
    thread("fresh", {
      updatedAt: 4_000,
      bond: { warmth: 90, trust: 91, heat: 22, irrit: 4, spark: 50 },
      world: { place: "new-place" },
      lastPingAt: 4_500,
      messages: [msg("assistant", 500, "appended ping")],
    }),
  );
  let row = await readDiskThread("fresh");
  assert.equal(row.bond.warmth, 90);
  assert.equal(row.world.place, "new-place");
  assert.equal(row.lastPingAt, 5_000);
  assert.equal(row.messages.some((m) => m.text === "appended ping"), true);

  await writeDiskThread(thread("fresh", { updatedAt: 6_000, lastPingAt: 9_000, messages: [] }));
  row = await readDiskThread("fresh");
  assert.equal(row.lastPingAt, 9_000);
});

test("missing file is created from the patch and the tail stays 250", async () => {
  await writeDiskThread({
    username: "newgirl",
    bond: { warmth: 3, trust: 3, heat: 1, irrit: 0 },
    lastPingAt: 10,
    updatedAt: 10,
    messages: [msg("user", 1, "hello")],
  });
  const created = await readDiskThread("newgirl");
  assert.equal(created.messages.length, 1);
  assert.equal(created.bond.warmth, 3);

  const many = Array.from({ length: 260 }, (_, i) => msg("user", 1_000 + i, `m${i}`));
  await writeDiskThread(thread("long", { updatedAt: 1, messages: many }));
  const tail = await readDiskThread("long");
  assert.equal(tail.messages.length, 250);
  assert.equal(tail.messages[0].text, "m10");
  assert.equal(tail.messages.at(-1).text, "m259");
});

test("json and markdown are renamed into place", async () => {
  await writeDiskThread(thread("atomic"));
  const dir = join(dataDir, "chats");
  const names = readdirSync(dir);
  assert.equal(names.some((name) => name.endsWith(".tmp")), false);
  const json = JSON.parse(readFileSync(join(dir, "atomic.json"), "utf8"));
  const md = readFileSync(join(dir, "atomic.md"), "utf8");
  assert.equal(json.username, "atomic");
  assert.match(md, /atomic/);
  assert.equal(json.metricsOk, undefined);
});

test("open reads the server and closing the sheet does not flush the store", () => {
  const sync = readFileSync(new URL("../src/lib/chat/sync.ts", import.meta.url), "utf8");
  const index = readFileSync(new URL("../src/routes/index.tsx", import.meta.url), "utf8");
  assert.equal(sync.includes("flushChatsToDisk"), false);
  assert.equal(sync.includes("setInterval"), false);
  assert.match(sync, /hydrateChats\(/);
  assert.equal(index.includes("flushChatsToDisk"), false);
});

test("two writers on one nick both land after the queue", async () => {
  const bursts = Array.from({ length: 12 }, (_, i) =>
    writeDiskThread(
      thread("race", {
        updatedAt: 100 + i,
        messages: [msg(i % 2 ? "assistant" : "user", 1_000 + i, `bubble-${i}`)],
      }),
    ),
  );
  await Promise.all(bursts);
  const row = await readDiskThread("race");
  const texts = row.messages.map((m) => m.text);
  for (let i = 0; i < 12; i += 1) assert.equal(texts.includes(`bubble-${i}`), true, `missing bubble-${i}`);
});
