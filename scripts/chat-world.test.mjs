import { rebuildWorld, clothesFromBlob, clothesToRu, sceneCard, sceneRule, looksLikeWorkStatus, preferClothes, cameraKindFromText, isAtWorkNow, isWeekendAt, moscowWhen } from "../src/lib/chat/world.ts";
import { dayNow } from "../src/lib/chat/day.ts";

function at(iso) {
  return new Date(iso).getTime();
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const inna = [
  { role: "assistant", text: "на работе сейчас, потом перепишемся?", at: at("2026-09-03T07:19:00+03:00") },
  { role: "assistant", text: "а я уже в офисе", at: at("2026-09-03T07:20:00+03:00") },
  { role: "user", text: "Во что сегодня на работу оделась?", at: at("2026-09-03T10:01:00+03:00") },
  { role: "assistant", text: "блузка и джинсы, обычный офисный вайб", at: at("2026-09-03T10:01:30+03:00") },
  { role: "assistant", text: "до восьми сегодня", at: at("2026-09-03T11:30:00+03:00") },
  { role: "assistant", text: "ещё нет, ещё доеду минут 20-25, но уже выхожу", at: at("2026-09-03T15:34:00+03:00") },
  { role: "assistant", text: "ладно, добралась уже", at: at("2026-09-03T15:38:00+03:00") },
  { role: "assistant", text: "вот только дома", at: at("2026-09-03T15:39:00+03:00") },
  { role: "assistant", text: "ну как-то быстро ты хочешь, да и я ещё даже блузку не сняла, может чуть позже", at: at("2026-09-03T16:08:00+03:00") },
  { role: "user", text: "А что под блузкой?", at: at("2026-09-03T16:09:00+03:00") },
  { role: "assistant", text: "маечка чёрная, обычная", at: at("2026-09-03T16:09:10+03:00") },
];

const evening = rebuildWorld(inna, at("2026-09-03T16:10:00+03:00"));
console.log("evening", evening);
assert(/tank/.test(evening.clothes || ""), `expected tank in clothes, got ${evening.clothes}`);
assert(/black/.test(evening.clothes || ""), `expected black, got ${evening.clothes}`);
assert(/home|apartment/.test(evening.place || ""), `expected home, got ${evening.place}`);
assert(!/work|office/.test(evening.place || ""), `must not be at work at 19:10, got ${evening.place}`);

const atWork = rebuildWorld(inna.slice(0, 4), at("2026-09-03T14:00:00+03:00"));
console.log("afternoon work", atWork);
assert(/blouse/.test(atWork.clothes || "") && /jeans/.test(atWork.clothes || ""), `named outfit at work: ${atWork.clothes}`);
assert(/work|office/.test(atWork.place || ""), `still at work at 14:00, got ${atWork.place}`);

const named = clothesFromBlob("блузка и джинсы, обычный офисный вайб");
assert(/blouse/.test(named) && /jeans/.test(named), `blob parse ${named}`);
assert(clothesToRu("black tank top and jeans").includes("майка"), clothesToRu("black tank top and jeans"));

const nightPoison = [
  ...inna,
  { role: "assistant", text: "ещё на работе", at: at("2026-09-04T04:05:00+03:00") },
  { role: "assistant", text: "ещё не раздевалась, на работе", at: at("2026-09-04T06:50:00+03:00") },
  { role: "assistant", text: "ещё на работе", at: at("2026-09-04T13:17:00+03:00") },
  { role: "assistant", text: "на работе ещё", at: at("2026-09-05T20:05:00+03:00") },
];
const late = rebuildWorld(nightPoison, at("2026-09-05T21:00:00+03:00"));
console.log("late evening after poisoned pings", late);
assert(!/work|office/.test(late.place || ""), `4am/evening pings must not keep her at work, got ${late.place}`);
assert(looksLikeWorkStatus("ещё на работе"), "work status detector");

const rich = "black bicycle shorts and short cropped top";
assert(preferClothes("shorts", rich) === rich, `preferClothes must keep detailed look, got ${preferClothes("shorts", rich)}`);
const restated = rebuildWorld(
  [
    { role: "assistant", text: "black bicycle shorts and cropped top", at: at("2026-09-18T23:00:00+03:00") },
    { role: "user", text: "А в чем ты сейчас?", at: at("2026-09-18T23:10:00+03:00") },
    { role: "assistant", text: "сейчас в шортах и топе", at: at("2026-09-18T23:10:10+03:00") },
  ],
  at("2026-09-18T23:11:00+03:00"),
);
console.log("restated", restated);
assert(/black/.test(restated.clothes || ""), `restating shorts+top must keep black, got ${restated.clothes}`);
assert(/short/.test(restated.clothes || "") && /top/.test(restated.clothes || ""), `must keep top, got ${restated.clothes}`);

assert(cameraKindFromText("А можно сзади?") === "back", "сзади is back");
assert(cameraKindFromText("а задом можно") === "back", "задом is back");
assert(cameraKindFromText("скинь боком") === "side", "боком is side");
assert(cameraKindFromText("во весь рост") === "full", "full body");
assert(cameraKindFromText("со спины") === "back", "со спины is back");

const sat = at("2026-09-19T14:00:00+03:00");
const weekendHome = rebuildWorld(
  [
    { role: "assistant", text: "привет)", at: sat },
    { role: "user", text: "ты как?", at: sat + 1000 },
    { role: "assistant", text: "норм, в кроп топе и шортах", at: sat + 2000 },
  ],
  sat + 3000,
);
console.log("saturday", weekendHome);
assert(!/work|office/.test(weekendHome.place || ""), `saturday afternoon must not be office, got ${weekendHome.place}`);
assert(/short/.test(weekendHome.clothes || ""), `keep shorts on saturday, got ${weekendHome.clothes}`);

const fridayOffice = [
  { role: "assistant", text: "на работе сейчас, потом перепишемся?", at: at("2026-09-18T14:00:00+03:00") },
  { role: "assistant", text: "блузка и джинсы, обычный офисный вайб", at: at("2026-09-18T14:01:00+03:00") },
];
const stillFri = rebuildWorld(fridayOffice, at("2026-09-18T14:30:00+03:00"));
assert(/work|office/.test(stillFri.place || ""), `friday 14:30 stays office, got ${stillFri.place}`);
const satAfterFri = rebuildWorld(fridayOffice, sat);
console.log("sat after friday office", satAfterFri);
assert(!/work|office/.test(satAfterFri.place || ""), `friday office must not carry into saturday, got ${satAfterFri.place}`);

const satWorkTalk = rebuildWorld(
  [
    { role: "assistant", text: "ещё на работе", at: sat },
    { role: "assistant", text: "на смене", at: sat + 2000 },
  ],
  sat + 4000,
);
assert(!/work|office/.test(satWorkTalk.place || ""), `saturday work-talk must not stick, got ${satWorkTalk.place}`);

assert(isWeekendAt(sat), "19 sep 2026 is saturday");
assert(!isAtWorkNow("at work, indoor office", sat), "isAtWorkNow false on saturday");
assert(isAtWorkNow("at work, indoor office", at("2026-09-18T14:00:00+03:00")), "isAtWorkNow true friday afternoon");

const satCard = sceneCard({ place: "at home, apartment, weekend daytime", clothes: "home clothes" }, sat);
assert(/суббот/i.test(satCard), `card weekday: ${satCard}`);
assert(/выходн/.test(satCard), `card weekend: ${satCard}`);
assert(/19 сентября/.test(satCard), `card date: ${satCard}`);
const satRule = sceneRule({ place: "at work, indoor office" }, sat);
assert(/ВЫХОДНОЙ/.test(satRule) && /НЕ на работе/.test(satRule), satRule);

const satDay = dayNow(new Date("2026-09-19T14:00:00+03:00"));
assert(satDay.slot === "weekend", `saturday 14:00 slot ${satDay.slot}`);
assert(/суббот/i.test(satDay.label) && /выходн/.test(satDay.label), satDay.label);

const sunEve = dayNow(new Date("2026-09-20T20:00:00+03:00"));
assert(sunEve.slot === "evening", sunEve.slot);
assert(/воскресень/i.test(sunEve.label), sunEve.label);

const when = moscowWhen(sat);
assert(when.weekday === "суббота", when.weekday);

const card = sceneCard(evening, at("2026-09-03T16:10:00+03:00"));
assert(/19:10/.test(card) || /одежда/.test(card), card);
console.log("ok", card);
