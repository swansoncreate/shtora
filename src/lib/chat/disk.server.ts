import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { dataSubdir } from "@/lib/server/data-dir.server";
import type { DiskThread } from "./disk";
import { dumpBond } from "./bond";

export type { DiskThread };

async function chatDir() {
  try {
    return await dataSubdir("chats");
  } catch {
    const fallback = join(process.env.TMPDIR || "/tmp", "shtora-data", "chats");
    await mkdir(fallback, { recursive: true }).catch(() => undefined);
    return fallback;
  }
}

function safeUser(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9._-]+/gi, "_");
}

export async function readAllDiskThreads(): Promise<DiskThread[]> {
  try {
    const dir = await chatDir();
    const files = await readdir(dir);
    const out: DiskThread[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = await readFile(join(dir, file), "utf8");
        const parsed = JSON.parse(raw) as DiskThread;
        if (parsed?.username && Array.isArray(parsed.messages)) out.push(parsed);
      } catch {
        /* skip */
      }
    }
    return out;
  } catch {
    return [];
  }
}

export async function readDiskThread(username: string): Promise<DiskThread | null> {
  try {
    const raw = await readFile(join(await chatDir(), `${safeUser(username)}.json`), "utf8");
    const parsed = JSON.parse(raw) as DiskThread;
    if (!parsed?.username || !Array.isArray(parsed.messages)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function messageKey(m: DiskThread["messages"][number]) {
  return `${m.role}:${m.at}:${(m.text || "").slice(0, 40)}`;
}

function unionMessages(a: DiskThread["messages"], b: DiskThread["messages"]) {
  const out: DiskThread["messages"] = [];
  const seen = new Set<string>();
  for (const m of [...(a || []), ...(b || [])]) {
    const textKey = messageKey(m);
    const idKey = m.id ? `id:${m.id}` : "";
    if (seen.has(textKey) || (idKey && seen.has(idKey))) continue;
    seen.add(textKey);
    if (idKey) seen.add(idKey);
    out.push(m);
  }
  return out.sort((x, y) => (x.at || 0) - (y.at || 0)).slice(-250);
}

async function writeAtomic(dir: string, name: string, body: string) {
  const tmp = join(dir, `.${name}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  try {
    await writeFile(tmp, body, "utf8");
    await rename(tmp, join(dir, name));
  } catch (err) {
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
}

const appendTails = new Map<string, Promise<unknown>>();

function enqueueAppend<T>(username: string, job: () => Promise<T>): Promise<T> {
  const key = safeUser(username);
  const prev = appendTails.get(key) ?? Promise.resolve();
  const run = prev.then(job, job);
  appendTails.set(
    key,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

export async function appendMessages(
  username: string,
  messages: DiskThread["messages"],
  patch: Partial<DiskThread> = {},
) {
  const safe = safeUser(username);
  if (!safe) return;
  return enqueueAppend(safe, () => appendMessagesNow(username, messages, patch));
}

async function appendMessagesNow(
  username: string,
  messages: DiskThread["messages"],
  patch: Partial<DiskThread> = {},
) {
  const dir = await chatDir();
  const safe = safeUser(username);
  if (!safe) return;
  const prev = await readDiskThread(username);
  const incomingAt = patch.updatedAt || 0;
  const fileAt = prev?.updatedAt || 0;
  const fresh = !prev || incomingAt >= fileAt;
  const row: DiskThread = {
    username: prev?.username || username.trim(),
    fullName: fresh ? patch.fullName || prev?.fullName : prev?.fullName,
    mood: fresh ? patch.mood ?? prev?.mood : prev?.mood,
    memory: fresh ? patch.memory ?? prev?.memory : prev?.memory,
    warmth: fresh ? (patch.warmth ?? prev?.warmth) : prev?.warmth,
    persona: fresh ? patch.persona || prev?.persona : prev?.persona,
    backstory: fresh ? patch.backstory ?? prev?.backstory : prev?.backstory,
    world: fresh ? patch.world || prev?.world : prev?.world,
    arc: fresh ? patch.arc || prev?.arc : prev?.arc,
    bond: fresh ? patch.bond || prev?.bond : prev?.bond,
    lastPingAt: Math.max(prev?.lastPingAt || 0, patch.lastPingAt || 0) || undefined,
    updatedAt: Math.max(fileAt, incomingAt) || Date.now(),
    messages: unionMessages(prev?.messages || [], messages || []),
  };
  await writeAtomic(dir, `${safe}.json`, JSON.stringify(row, null, 2));
  await writeAtomic(dir, `${safe}.md`, toMarkdown(row));
}

export async function writeDiskThread(t: DiskThread & { metricsOk?: boolean }) {
  if (!t?.username) return;
  await appendMessages(t.username, t.messages || [], t);
}

export async function writeDiskThreads(threads: DiskThread[]) {
  const dir = await chatDir();
  for (const t of threads) {
    if (!t?.username) continue;
    try {
      await writeDiskThread(t);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await writeFile(join(dir, "_error.log"), `${new Date().toISOString()} ${t.username} ${msg}\n`, { flag: "a" }).catch(
        () => undefined,
      );
    }
  }
  const index = threads
    .filter((t) => t?.username)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .map((t) => `- @${t.username} · ${t.messages?.length ?? 0} сообщ. · ${new Date(t.updatedAt || 0).toLocaleString("ru-RU")}`)
    .join("\n");
  await writeFile(
    join(dir, "_index.md"),
    `# Чаты\n\nобновлено ${new Date().toISOString()}\n\n${index || "пусто"}\n`,
    "utf8",
  );
  await writeFile(
    join(dir, "_heartbeat.json"),
    JSON.stringify({ at: Date.now(), n: threads.length, users: threads.map((t) => t.username) }, null, 2),
    "utf8",
  );
}

export async function eraseDiskUsers(usernames: string[]) {
  try {
    const dir = await chatDir();
    for (const name of usernames) {
      const safe = safeUser(name);
      if (!safe) continue;
      await unlink(join(dir, `${safe}.json`)).catch(() => undefined);
      await unlink(join(dir, `${safe}.md`)).catch(() => undefined);
    }
  } catch {
    /* ignore */
  }
}

function toMarkdown(t: DiskThread) {
  const dump = dumpBond(t.bond, t.warmth ?? 40);
  const lines = [
    `# @${t.username}${t.fullName && t.fullName !== t.username ? ` — ${t.fullName}` : ""}`,
    "",
    `- updated: ${new Date(t.updatedAt).toISOString()}`,
    `- ${dump.head}`,
    `- ${dump.pullLine}`,
    `- mood: ${t.mood || "—"}`,
    `- memory: ${t.memory || "—"}`,
    `- place: ${t.world?.place || "—"}`,
    `- clothes: ${t.world?.clothes || "—"}`,
    `- hair: ${t.world?.hair || "—"}`,
    `- beat: ${t.arc?.beat || "—"}`,
    `- loops: ${(t.arc?.loops || []).join(" | ") || "—"}`,
    `- lastMove: ${t.arc?.lastMove || "—"}`,
    "",
  ];
  for (const item of t.messages) {
    const time = new Date(item.at).toLocaleString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
    });
    const who = item.role === "user" ? "Он" : "Она";
    const bits = [
      (item.text || "").trim(),
      item.photo || item.kind === "photo" ? "[фото]" : "",
      item.kind && item.kind !== "text" && item.kind !== "photo" ? `[${item.kind}]` : "",
    ]
      .filter(Boolean)
      .join(" ");
    const d = item.debug;
    const snap = d
      ? d.spark != null
        ? dumpBond(
            { warmth: d.warmth, trust: d.trust, heat: d.heat, irrit: d.irrit, spark: d.spark, guilt: d.guilt ?? 0 },
            d.warmth,
          ).short
        : `${d.warmth}/${d.trust}/${d.heat}/${d.irrit}`
      : "";
    const meta = d
      ? `  \n  _${d.hour ?? "?"}ч · ${snap} · ${d.beat || d.stage || "—"} · ${d.place || "—"} / ${d.clothes || "—"} · ${d.mood || "—"}_`
      : "";
    lines.push(`- ${time} **${who}:** ${bits || "…"}${meta}`);
  }
  return `${lines.join("\n")}\n`;
}
