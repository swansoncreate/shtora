import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
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

function unionMessages(a: DiskThread["messages"], b: DiskThread["messages"]) {
  const out: DiskThread["messages"] = [];
  const seen = new Set<string>();
  for (const m of [...(a || []), ...(b || [])]) {
    const key = `${m.role}:${m.at}:${(m.text || "").slice(0, 40)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out.sort((x, y) => (x.at || 0) - (y.at || 0)).slice(-250);
}

export async function writeDiskThread(t: DiskThread & { metricsOk?: boolean }) {
  const dir = await chatDir();
  const safe = safeUser(t.username);
  if (!safe) return;
  let row: DiskThread = t;
  if (t.metricsOk === false) {
    const prev = await readDiskThread(t.username);
    if (prev) {
      row = {
        ...t,
        warmth: prev.warmth,
        bond: prev.bond,
        world: prev.world,
        memory: prev.memory,
        mood: prev.mood,
        arc: prev.arc,
        lastPingAt: prev.lastPingAt,
        persona: prev.persona || t.persona,
        messages: unionMessages(prev.messages, t.messages),
        updatedAt: Math.max(prev.updatedAt || 0, t.updatedAt || 0),
      };
    }
  }
  const { metricsOk: _drop, ...stored } = row as DiskThread & { metricsOk?: boolean };
  void _drop;
  await writeFile(join(dir, `${safe}.json`), JSON.stringify(stored, null, 2), "utf8");
  await writeFile(join(dir, `${safe}.md`), toMarkdown(stored), "utf8");
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
