import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

test("own caption does not fall back to the stock list, and Instagram captions stay", () => {
  const daily = readFileSync(new URL("../src/lib/feed/daily.ts", import.meta.url), "utf8");
  const viewer = readFileSync(new URL("../src/components/post-viewer.tsx", import.meta.url), "utf8");
  const imagine = readFileSync(new URL("../src/lib/imagine/functions.ts", import.meta.url), "utf8");
  assert.equal(daily.includes("generatedLine("), false);
  assert.match(daily, /ownCaption/);
  assert.match(daily, /4:5 frame, 1080x1350/);
  assert.match(viewer, /frame === "feed" \? "aspect-\[4\/5\]/);
  assert.match(imagine, /4:5\|1080x1350/);
  assert.match(imagine, /: "9:16"/);
});

test("daily.ts parses", async () => {
  const out = await run("npx", ["tsc", "--noEmit", "--pretty", "false"], { cwd: process.cwd() }).catch((err) => err);
  const text = `${out.stdout || ""}\n${out.stderr || ""}`;
  assert.equal(text.includes("src/lib/feed/daily.ts"), false, text);
});
