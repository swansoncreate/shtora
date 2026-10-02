import type { ChatMessage } from "./store";

export function rememberPlot(messages: ChatMessage[], prev = "") {
  const bits: string[] = [];
  const take = (line: string) => {
    const t = line.replace(/\s+/g, " ").trim();
    if (t && !bits.includes(t)) bits.push(t);
  };
  for (const item of messages) {
    const t = (item.text || "").toLowerCase();
    if (item.kind === "action") take(`он сделал: ${(item.text || "как просила").slice(0, 80)}`);
    if (item.role === "user" && /вдво[её]м/.test(t) && /хочу/.test(t)) take("он хочет встречу вдвоём, без её подруги/его девушки");
    if (item.role === "assistant" && /и я хочу/.test(t)) take("она согласилась встретиться вдвоём");
    if (item.role === "assistant" && /бордов/.test(t) && /плать/.test(t)) take("она сказала, что будет в бордовом платье");
    if (item.role === "user" && /удал/.test(t) && item.kind === "action") take("он удалил фото, как она просила — не злись за это");
    if (item.role === "assistant" && /удали то фото/.test(t)) take("она просила удалить ночное фото");
    if (item.role === "user" && /по работе/.test(t) && /сказал/.test(t)) take("он сказал девушке, что уходит по работе");
    if (item.role === "assistant" && /страшн/.test(t)) take("ей страшно, что их увидят");
  }
  const keepPrev = prev
    .split(/[.;\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8 && !/он просит кадр/.test(s));
  for (const line of keepPrev.slice(-6)) take(line);
  return bits.slice(-10).join(". ").slice(0, 900);
}