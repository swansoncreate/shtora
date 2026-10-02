import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

test("own slides share one source and a failed extra slide stays one frame", () => {
  const daily = readFileSync(new URL("../src/lib/feed/daily.ts", import.meta.url), "utf8");
  const home = readFileSync(new URL("../src/components/home-feed.tsx", import.meta.url), "utf8");
  assert.match(daily, /dropboxSeed: seed/);
  assert.match(daily, /Same room, clothes, light and time/);
  assert.match(daily, /if \(!next\?\.ok \|\| !next\.url\) break/);
  assert.match(home, /aspect-\[4\/5\]/);
  assert.match(home, /slides.length < 2/);
  assert.equal(home.includes("composeChatPhoto"), false);
});

test("feed slide types parse", async () => {
  const out = await run("npx", ["tsc", "--noEmit", "--pretty", "false"], { cwd: process.cwd() }).catch((err) => err);
  const text = `${out.stdout || ""}\n${out.stderr || ""}`;
  assert.equal(text.includes("src/lib/feed/simulate.ts"), false, text);
  assert.equal(text.includes("src/lib/feed/sync.ts"), false, text);
});
