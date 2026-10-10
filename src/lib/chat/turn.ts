import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { commitWorldDisk, getWorldDisk } from "@/lib/world/sync";

const line = z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(2000) });

export const runOneTurn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      username: z.string().min(1).max(40),
      text: z.string().max(2000),
      canon: z.string().max(1200).optional(),
      bond: z.string().max(240).optional(),
      history: z.array(line).max(16),
    }),
  )
  .handler(async ({ data }) => {
    if (process.env.SHTORA_TURN !== "1") return { legacy: true as const };
    const world = await getWorldDisk({ data: { username: data.username } }).catch(() => null);
    const snap = world?.snap;
    const placeNow = snap?.place?.value || "";
    const home = /уже дома|я дома/i.test(data.text);
    const asked = await askGrok(data, snap, false);
    const parsed = asked.json || (await askGrok(data, snap, true)).json;
    const reply = (parsed?.reply || asked.raw).replace(/\s+/g, " ").trim().slice(0, 2000);
    if (!reply) return { legacy: false as const, reply: "", error: "пустой ответ" };
    const place = home ? "home" : parsed ? cleanPlace(parsed.place) : "";
    if (place && place !== placeNow) {
      await commitWorldDisk({
        data: {
          username: data.username,
          patch: { place: { value: place, at: Date.now() } },
          event: { source: home ? "user" : "her", text: home ? "уже дома" : place, type: "place" },
        },
      }).catch(() => undefined);
    }
    return { legacy: false as const, reply };
  });

function cleanPlace(raw?: string) {
  const text = (raw || "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!text || text.length > 40) return "";
  return text;
}

async function askGrok(
  data: { username: string; text: string; canon?: string; bond?: string; history: { role: "user" | "assistant"; text: string }[] },
  snap: { place?: { value: string }; clothes?: { value: string }; mood?: { value: string } } | null | undefined,
  repair: boolean,
) {
  const key = process.env.XAI_API_KEY || "";
  if (!key) return { raw: "", json: null as { reply?: string; place?: string } | null };
  const shot = [snap?.place?.value, snap?.clothes?.value, snap?.mood?.value].filter(Boolean).join(", ").slice(0, 400);
  const history = data.history
    .slice(-16)
    .map((row) => `${row.role === "user" ? "он" : "она"}: ${row.text}`)
    .join("\n")
    .slice(0, 4000);
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "grok-4-fast-non-reasoning",
      temperature: repair ? 0 : 0.7,
      messages: [
        {
          role: "system",
          content: repair
            ? "Верни только JSON {reply, mood, place, clothes, memory, event}. reply обязателен."
            : "Ты она в переписке. Один ответ. JSON {reply, mood, place, clothes, memory, event}. В reply только реплика, без JSON и без служебных полей.",
        },
        {
          role: "user",
          content: `Канон: ${(data.canon || "").slice(0, 1200)}\nСнимок: ${shot}\nОтношения: ${(data.bond || "").slice(0, 240)}\nПереписка:\n${history}\nСейчас: ${data.text.slice(0, 2000)}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(40_000),
  });
  const json = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
  const raw = json?.choices?.[0]?.message?.content || "";
  return { raw, json: parseReply(raw) };
}

function parseReply(raw: string) {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as { reply?: string; place?: string };
    if (!parsed.reply) return null;
    return parsed;
  } catch {
    return null;
  }
}
