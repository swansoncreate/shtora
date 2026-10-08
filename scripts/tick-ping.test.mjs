import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createJiti } from "jiti";

const dataDir = mkdtempSync(join(tmpdir(), "shtora-tick-"));
process.env.SHTORA_DATA_DIR = dataDir;
process.env.SHTORA_RPC_KEY = "tick-test-key";
process.env.SHTORA_SELF = "1";
delete process.env.SHTORA_FRONT_ORIGIN;
delete process.env.SHTORA_PING_LOCAL;

const jiti = createJiti(import.meta.url, { alias: { "@": join(process.cwd(), "src") } });
const { writeDiskThread, readDiskThread } = await jiti.import("../src/lib/chat/disk.server.ts");
const { runTick } = await jiti.import("../src/lib/server/tick.server.ts");

function thread(username) {
  const now = Date.now();
  return {
    username,
    fullName: "Inna",
    warmth: 80,
    bond: { warmth: 80, trust: 70, heat: 20, irrit: 5, spark: 40 },
    world: { place: "home", memOpen: "open thread" },
    updatedAt: now - 60_000,
    messages: [
      { role: "user", text: "ты тут", at: now - 10 * 60_000 },
      { role: "assistant", text: "уже было", at: now - 9 * 60_000 },
    ],
  };
}

test("without front origin the tick finishes and does not call the model", async () => {
  const seen = [];
  const prev = globalThis.fetch;
  globalThis.fetch = async (url) => {
    seen.push(String(url));
    throw new Error("fetch should not run");
  };
  try {
    await writeDiskThread(thread("silent"));
    const out = await runTick({ chats: true, instagram: false, dropbox: false });
    assert.equal(out.ok, true);
    assert.equal(out.pinged, 0);
    const row = await readDiskThread("silent");
    assert.deepEqual(row.messages.map((m) => m.text), ["ты тут", "уже было"]);
    assert.equal(seen.some((url) => url.includes("api.x.ai")), false);
    assert.equal(seen.some((url) => url.includes("/api/grok-chat")), false);
    const logPath = join(dataDir, "logs", "shtora.log");
    let log = "";
    for (let i = 0; i < 20 && !log.includes("нет SHTORA_FRONT_ORIGIN"); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      try {
        log = readFileSync(logPath, "utf8");
      } catch {
        log = "";
      }
    }
    assert.match(log, /нет SHTORA_FRONT_ORIGIN/);
  } finally {
    globalThis.fetch = prev;
  }
});

test("with front origin the ping is appended from publication, not api.x.ai", async () => {
  process.env.SHTORA_FRONT_ORIGIN = "https://front.example/";
  delete process.env.SHTORA_PING_LOCAL;
  const seen = [];
  const prev = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), key: new Headers(init?.headers).get("x-shtora-key"), body: init?.body });
    return new Response(
      JSON.stringify({ ok: true, text: "пинг с публикации", bubbles: ["пинг с публикации"] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const realDateNow = Date.now;
  Date.now = () => Date.parse("2026-10-07T17:00:00Z"); // 20:00 Moscow: deterministic evening slot.
  try {
    await writeDiskThread(thread("front"));
    const out = await runTick({ chats: true, instagram: false, dropbox: false });
    assert.equal(out.ok, true);
    assert.ok(out.pinged >= 1);
    assert.ok(seen.length >= 1);
    assert.equal(seen.every((row) => row.url === "https://front.example/api/grok-chat"), true);
    assert.equal(seen.every((row) => row.key === "tick-test-key"), true);
    assert.equal(seen.every((row) => JSON.parse(row.body).op === "ping"), true);
    assert.equal(seen.some((row) => row.url.includes("api.x.ai")), false);
    const row = await readDiskThread("front");
    assert.equal(row.messages.some((m) => m.text === "пинг с публикации"), true);
    assert.equal(row.messages.some((m) => m.text === "уже было"), true);
    assert.ok(row.lastPingAt > 0);
  } finally {
    globalThis.fetch = prev;
    Date.now = realDateNow;
    delete process.env.SHTORA_FRONT_ORIGIN;
  }
});

test("local rollback calls chatPing and is off by default", () => {
  const text = readFileSync(new URL("../src/lib/server/tick.server.ts", import.meta.url), "utf8");
  assert.match(text, /SHTORA_PING_LOCAL === "1"/);
  assert.match(text, /return chatPing\(\{ data \}\)/);
  assert.match(text, /localPing \? await pingLocal\(payload\) : await pingPublication\(front, payload\)/);
  assert.equal(text.includes("api.x.ai"), false);
  assert.match(text, /appendMessages\(/);
  assert.equal(text.includes("writeDiskThread"), false);
});

test("typecheck does not add an error in the tick file", async () => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
  let stdout = "";
  let stderr = "";
  try {
    const out = await run("npx", ["tsc", "--noEmit", "--pretty", "false"], { cwd: process.cwd() });
    stdout = out.stdout;
    stderr = out.stderr;
  } catch (err) {
    stdout = err.stdout || "";
    stderr = err.stderr || "";
  }
  const text = `${stdout}\n${stderr}`;
  assert.equal(text.includes("src/lib/server/tick.server.ts"), false, text);
});
