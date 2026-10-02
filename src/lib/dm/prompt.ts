import { storyFacts } from "@/lib/chat/functions";
import type { ChatWorld } from "@/lib/chat/world";
import { flagPhrase, type DmFlags, type DmMove } from "./flags";

export function dmSystem(opts: {
  name: string;
  username: string;
  persona?: string;
  backstory?: string;
  world: ChatWorld;
  flags: DmFlags;
  ping: boolean;
  event: string;
  slotLabel: string;
  onShift: boolean;
}) {
  const facts = storyFacts(opts.backstory);
  const world = [
    `Слот: ${opts.slotLabel}.`,
    `Где: ${opts.world.placeRu || "не сказано"}.`,
    `На ней: ${opts.world.clothesRu || "не названо"}.`,
    `Волосы: ${opts.world.hairRu || "как обычно"}.`,
    opts.world.clothesNamed ? "Лук уже назван." : "Лук ещё заглушка дня, сам не описывай файл.",
    opts.onShift && (opts.flags.stage === "fall" || opts.flags.stage === "secret")
      ? "Ты можешь быть на работе, но разговор не закрывай. Не пиши «не здесь», «я на смене», «такое не пиши»."
      : opts.onShift
        ? ""
        : "Сейчас не работа, про смену не пиши.",
  ]
    .filter(Boolean)
    .join(" ");
  const mem = [
    opts.world.memAbout ? `Про него: ${opts.world.memAbout}` : "",
    opts.world.memOpen ? `Не договорила: ${opts.world.memOpen}` : "",
    opts.world.memDodged ? `Обошла: ${opts.world.memDodged}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const event = opts.ping
    ? "Пишешь первая. Не «как дела». Продолжи недоговорённое или вчерашнюю нить."
    : opts.event;
  return [
    `Ты ${opts.name} (@${opts.username}). Личка Instagram. 1–3 коротких сообщения, живой телефон. Без эссе, без четвёртой стены, без полезного ассистента. Не объясняешь шутку. Не благодаришь за вопрос.`,
    `Характер: ${(opts.persona || "как в директe").slice(0, 700)}`,
    facts.text || facts.relationLine,
    facts.relationLine,
    `Стадия разговора: ${opts.flags.stage}. Регистр: ${opts.flags.register}. ${opts.flags.verbal}`,
    world,
    flagPhrase(opts.flags),
    mem,
    event,
    `Ответь только JSON.
Пиши как она в личке, на её языке.
bubbles — то, что уходит в директ, без ремарок. По порядку, второй не отменяет первый.
Не повторяй фразы, которые уже есть в переписке.
photo_offer не обещай, если кадр нельзя.
Если кадр можно и ты его кидаешь, пузырь не описывает файл, он как сообщение перед ним.
Одежду меняй только если сама сейчас назвала другой лук. Тогда заполни clothes_ru и clothes_en конкретно.
Пустые clothes и place — не менять.
{"bubbles":["..."],"photo_offer":"none","scene_en":"","clothes_ru":"","clothes_en":"","place_ru":"","place_en":"","hair_ru":"","hair_en":"","mood":"","mem_about_him":"","mem_open":"","mem_dodged":"","warmth_delta":0}
photo_offer: none | selfie | angle | gallery | circle.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function classifierSystem() {
  return `Классифицируй последнюю реплику. Только JSON {"move":"talk","nude_ask":false,"confidence":0.8}.
Поставь свою уверенность от 0 до 1. Ноль не пиши.
move: camera | catalog | gallery | circle | look | talk.
catalog только если просят кадр без одежды или половые части в кадре.
camera только если просят кадр с ракурсом, не если описывают тело или рассказывают «сзади».
look — просят показать текущий лук или «что на тебе».
gallery — просят старый названный лук.
circle — просят кружок.
Иначе talk.
hint ниже — подсказка, не приговор.`;
}

export function eventLine(kind: string | undefined, text: string) {
  if (kind === "action") return `Он уже сделал в мире: «${text.slice(0, 160)}». Это факт.`;
  if (kind === "heart" || kind === "post") return "Он лайкнул твой пост. Кадр — ты. Не спрашивай какое фото.";
  if (kind === "story") return "Он ответил на твою сторис. Картинка — ты.";
  return `Последнее его: «${text.slice(0, 180)}».`;
}

export type { DmMove };
