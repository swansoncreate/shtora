import assert from "node:assert/strict";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { register } from "node:module";

await register(pathToFileURL(new URL("./src-alias-hook.mjs", import.meta.url).pathname));

const { rankDropboxCandidates } = await import("../src/lib/dropbox/source-selection.ts");

test("Dropbox source selection prefers candidates not used recently", () => {
  const rows = [
    { path: "/photos/recent.webp", at: "2026-10-10T10:00:00Z" },
    { path: "/photos/fresh.webp", at: "2026-10-01T10:00:00Z" },
  ];
  const result = rankDropboxCandidates(rows, ["/photos/recent.webp"]);
  assert.equal(result.exhaustedExclusions, false);
  assert.deepEqual(result.candidates.map((row) => row.path), ["/photos/fresh.webp"]);
});

test("Dropbox source selection cycles through least-recently-used photos when all are excluded", () => {
  const rows = [
    { path: "/photos/newest.webp", at: "2026-10-10T10:00:00Z" },
    { path: "/photos/middle.webp", at: "2026-10-09T10:00:00Z" },
    { path: "/photos/oldest.webp", at: "2026-10-08T10:00:00Z" },
  ];
  const result = rankDropboxCandidates(rows, [
    "/photos/newest.webp",
    "/photos/middle.webp",
    "/photos/oldest.webp",
  ]);
  assert.equal(result.exhaustedExclusions, true);
  assert.deepEqual(result.candidates.map((row) => row.path), [
    "/photos/oldest.webp",
    "/photos/middle.webp",
    "/photos/newest.webp",
  ]);
});
