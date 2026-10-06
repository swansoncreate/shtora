import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { register } from "node:module";

process.env.SHTORA_DATA_DIR = await mkdtemp(join(tmpdir(), "shtora-e2e-flow-"));
process.env.SHTORA_RPC_KEY = "mock-rpc-key";
await register(pathToFileURL(new URL("./src-alias-hook.mjs", import.meta.url).pathname));

const { saveVisualMemory, listVisualMemory, latestVisualMemory } =
  await import("../src/lib/visual/memory.server.ts");
const { createGenerationJob, updateGenerationJob, listGenerationJobs } =
  await import("../src/lib/visual/jobs.server.ts");
const { rememberSourcePath, recentSourcePaths } =
  await import("../src/lib/visual/source-history.server.ts");

test("full simulated Instagram → DM → visual memory → scene change → feed → Dropbox flow", async () => {
  const username = "full-flow";
  const firstScene = {
    place: "home",
    activity: "coffee",
    clothes: "white shirt",
    hair: "loose",
    timeContext: "morning",
    weather: "sunny",
  };

  // 1. Instagram DM requests a photo; generation is recorded against the current world.
  const firstJob = await createGenerationJob({
    username,
    intent: { mode: "continue", camera: "selfie", reference: "last_photo" },
    provider: "grok-imagine",
    sceneId: "scene-1",
    finalPrompt: "casual morning selfie",
  });
  await updateGenerationJob(username, firstJob.id, {
    status: "persisted",
    imageUrl: "https://img.test/frame-1.jpg",
    worldSnapshot: firstScene,
  });

  await saveVisualMemory({
    id: "frame-1",
    username,
    imageUrl: "https://img.test/frame-1.jpg",
    createdAt: Date.now(),
    scene: firstScene,
    camera: { mode: "selfie", perspective: "phone" },
    source: "generated",
    sceneId: "scene-1",
    tags: ["morning", "home", "coffee"],
  });

  // 2. Follow-up camera command keeps the same scene and chains from the prior frame.
  const secondJob = await createGenerationJob({
    username,
    intent: { mode: "continue", camera: "back", reference: "last_photo" },
    provider: "grok-imagine",
    sceneId: "scene-1",
    parentId: firstJob.id,
    finalPrompt: "same morning, from behind",
  });
  await updateGenerationJob(username, secondJob.id, {
    status: "persisted",
    imageUrl: "https://img.test/frame-2.jpg",
    parentId: firstJob.id,
    worldSnapshot: firstScene,
  });
  await saveVisualMemory({
    id: "frame-2",
    username,
    imageUrl: "https://img.test/frame-2.jpg",
    createdAt: Date.now() + 1,
    scene: firstScene,
    camera: { mode: "back", perspective: "phone" },
    source: "generated",
    parentId: "frame-1",
    sceneId: "scene-1",
    tags: ["morning", "home", "coffee", "back"],
  });

  // 3. Explicit scene change creates a new scene instead of mutating the old one.
  const secondScene = {
    place: "cafe",
    activity: "lunch",
    clothes: "black jacket",
    hair: "ponytail",
    timeContext: "afternoon",
    weather: "cloudy",
  };
  const thirdJob = await createGenerationJob({
    username,
    intent: {
      mode: "new_scene",
      camera: "full",
      scene: "cafe",
      clothes: "black jacket",
      changes: ["new location", "new outfit"],
      reference: "identity",
    },
    provider: "grok-imagine",
    sceneId: "scene-2",
    finalPrompt: "afternoon cafe full-body photo",
  });
  await updateGenerationJob(username, thirdJob.id, {
    status: "persisted",
    imageUrl: "https://img.test/frame-3.jpg",
    worldSnapshot: secondScene,
  });
  await saveVisualMemory({
    id: "frame-3",
    username,
    imageUrl: "https://img.test/frame-3.jpg",
    createdAt: Date.now() + 2,
    scene: secondScene,
    camera: { mode: "full", perspective: "phone" },
    source: "generated",
    parentId: "frame-2",
    sceneId: "scene-2",
    tags: ["afternoon", "cafe", "lunch", "full"],
  });

  // 4. Feed/save path uses the same durable visual memory, not a disconnected image.
  const memory = await listVisualMemory(username);
  assert.equal(memory.length, 3);
  assert.equal(memory.find((x) => x.id === "frame-1")?.sceneId, "scene-1");
  assert.equal(memory.find((x) => x.id === "frame-2")?.parentId, "frame-1");
  assert.equal(memory.find((x) => x.id === "frame-3")?.sceneId, "scene-2");
  assert.equal((await latestVisualMemory(username))?.imageUrl, "https://img.test/frame-3.jpg");

  // 5. Dropbox source history records the actual source and survives concurrent writes.
  await Promise.all([
    rememberSourcePath(username, "/identity/a.jpg"),
    rememberSourcePath(username, "/identity/b.jpg"),
    rememberSourcePath(username, "/identity/c.jpg"),
  ]);
  const sources = await recentSourcePaths(username);
  assert.ok(sources.includes("/identity/a.jpg"));
  assert.ok(sources.includes("/identity/b.jpg"));
  assert.ok(sources.includes("/identity/c.jpg"));


  // 7. A failed provider attempt can be retried without losing the original job history.
  const retryJob = await createGenerationJob({
    username,
    intent: { mode: "continue", camera: "selfie", reference: "last_photo" },
    provider: "grok-imagine",
    sceneId: "scene-2",
    parentId: thirdJob.id,
    finalPrompt: "retry after provider failure",
  });
  await updateGenerationJob(username, retryJob.id, {
    status: "failed",
    error: "mock provider timeout",
  });
  await updateGenerationJob(username, retryJob.id, {
    status: "queued",
    error: undefined,
  });
  await updateGenerationJob(username, retryJob.id, {
    status: "persisted",
    imageUrl: "https://img.test/retry.jpg",
    worldSnapshot: secondScene,
  });

  const retryRows = await listGenerationJobs(username);
  const retryRecord = retryRows.find((x) => x.id === retryJob.id);
  assert.equal(retryRecord?.status, "persisted");
  assert.equal(retryRecord?.provider, "grok-imagine");
  assert.equal(retryRecord?.sceneId, "scene-2");
  assert.equal(retryRecord?.parentId, thirdJob.id);
  assert.equal(retryRecord?.imageUrl, "https://img.test/retry.jpg");

  // 6. Restart boundary: a fresh Node process must recover visual memory, jobs and source history from disk.
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
  const probe = await run(process.execPath, ["--input-type=module", "-e", "import { createJiti } from \"jiti\"; import { join } from \"node:path\"; process.env.SHTORA_DATA_DIR = process.env.SHTORA_DATA_DIR; const j = createJiti(import.meta.url, { alias: { \"@\": join(process.cwd(), \"src\") } }); const m = await j.import(\"./src/lib/visual/memory.server.ts\"); const g = await j.import(\"./src/lib/visual/jobs.server.ts\"); const h = await j.import(\"./src/lib/visual/source-history.server.ts\"); const mem = await m.latestVisualMemory(\"full-flow\"); const jobs = await g.listGenerationJobs(\"full-flow\"); const src = await h.recentSourcePaths(\"full-flow\"); if (mem?.imageUrl !== \"https://img.test/frame-3.jpg\") throw new Error(\"visual memory did not survive restart\"); if (jobs.length !== 4 || jobs.filter((x) => x.status === \"persisted\").length !== 4) throw new Error(\"generation jobs did not survive restart\"); if (!src.includes(\"/identity/a.jpg\") || !src.includes(\"/identity/c.jpg\")) throw new Error(\"source history did not survive restart\");"], { cwd: process.cwd(), env: { ...process.env, SHTORA_DATA_DIR: process.env.SHTORA_DATA_DIR } });
  assert.equal(probe.stderr, "");

  // 6. Generation records remain inspectable after the whole flow.
  const jobs = await listGenerationJobs(username);
  assert.equal(jobs.length, 4);
  assert.equal(jobs.filter((x) => x.status === "persisted").length, 4);
  assert.equal(jobs.find((x) => x.id === thirdJob.id)?.sceneId, "scene-2");
  assert.equal(jobs.find((x) => x.id === secondJob.id)?.parentId, firstJob.id);
});
