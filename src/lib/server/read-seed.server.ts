import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function readBundledSeed(): Promise<{ snapshots: Array<{ username: string }>; chats: Array<{ username: string }> } | null> {
  const paths = [
    join(process.cwd(), "public/shtora-seed/state.json"),
    join(process.cwd(), "shtora-seed/state.json"),
    "/workspace/public/shtora-seed/state.json",
    join(process.cwd(), "client/shtora-seed/state.json"),
  ];
  for (const path of paths) {
    try {
      const raw = await readFile(path, "utf8");
      const parsed = JSON.parse(raw) as { snapshots?: Array<{ username: string }>; chats?: Array<{ username: string }> };
      if (parsed?.snapshots || parsed?.chats) {
        return { snapshots: parsed.snapshots ?? [], chats: parsed.chats ?? [] };
      }
    } catch {
      /* next */
    }
  }
  return null;
}
