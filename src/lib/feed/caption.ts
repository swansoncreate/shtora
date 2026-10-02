import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const captionFeed = createServerFn({ method: "POST" })
  .validator(
    z.object({
      username: z.string().min(1).max(40),
      persona: z.string().max(1400).optional(),
      mood: z.string().max(40).optional(),
      place: z.string().max(80).optional(),
      slot: z.enum(["morning", "evening"]),
    }),
  )
  .handler(async ({ data }) => {
    const key = typeof process === "undefined" ? "" : process.env.XAI_API_KEY || "";
    if (!key) return { caption: "", slides: 1 };
    const slot = data.slot === "morning" ? "утро" : "вечер";
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "grok-4-fast-non-reasoning",
        temperature: 0.7,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Пиши подпись к своему посту Instagram от первого лица. Одна или две короткие фразы, как сообщение, не как описание кадра. Без хештегов и без слов «так» и «сегодня» в одиночку. Верни JSON {caption, slides}. slides — 1, 2 или 3.",
          },
          {
            role: "user",
            content: `Ник: ${data.username}\nПерсона: ${data.persona || "—"}\nНастроение: ${data.mood || "—"}\nМесто: ${data.place || "—"}\nСлот: ${slot}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(25_000),
    });
    const json = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
    const raw = json?.choices?.[0]?.message?.content || "";
    try {
      const parsed = JSON.parse(raw) as { caption?: string; slides?: number };
      const slides = parsed.slides === 2 || parsed.slides === 3 ? parsed.slides : 1;
      return { caption: String(parsed.caption || "").replace(/\s+/g, " ").trim().slice(0, 180), slides };
    } catch {
      return { caption: raw.replace(/\s+/g, " ").trim().slice(0, 180), slides: 1 };
    }
  });
