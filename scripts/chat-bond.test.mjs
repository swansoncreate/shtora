import { asBond, photoAllowed, photoTier, pullOf, stageFrom, wantsLookPhoto, scoreTurn } from "../src/lib/chat/bond.ts";
import { cameraKindFromText, clothesFromBlob } from "../src/lib/chat/world.ts";
import { classifyMove, turnPolicy } from "../src/lib/chat/policy.ts";
import { stripChatTic, looksLikeCatalogAsk, looksLikeDirtyTalk, looksLikeDescribeAsk } from "../src/lib/chat/functions.ts";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const inna = asBond({ warmth: 88, trust: 91, heat: 41, irrit: 23, guilt: 59, spark: 89 });
const pull = pullOf(inna);
const stageGf = stageFrom(inna, true);
const stageNo = stageFrom(inna, false);
console.log("inna pull", pull, "stage gf", stageGf, "no-gf", stageNo, "tier", photoTier(inna, true));
assert(pull >= 78, `closeness 88 must pull high, got ${pull}`);
assert(stageGf === "fall" || stageGf === "secret", `high closeness not ice/test, got ${stageGf}`);
assert(photoTier(inna, true) >= 2, "photo tier at 88");

const named = Boolean(clothesFromBlob("но я в шортах и топе сейчас"));
console.log("named clothes", named, clothesFromBlob("но я в шортах и топе сейчас"));
assert(named, "shorts+top should parse as named clothes");
assert(
  wantsLookPhoto({
    bond: inna,
    girlfriend: true,
    asked: true,
    namedClothes: named,
    pressure: false,
    busy: false,
  }),
  "at 88 after naming outfit she sends the photo",
);

assert(
  wantsLookPhoto({
    bond: inna,
    girlfriend: true,
    asked: true,
    namedClothes: named,
    pressure: false,
    busy: false,
    angleAsk: true,
    cameraAsk: true,
    alreadySent: true,
  }),
  "сзади at 88 must send the rear shot even after a front photo",
);

assert(
  !wantsLookPhoto({
    bond: inna,
    girlfriend: true,
    asked: true,
    namedClothes: named,
    pressure: true,
    busy: false,
    cameraAsk: false,
  }),
  "попа/грудь catalog must not be forced",
);

assert(
  !wantsLookPhoto({
    bond: inna,
    girlfriend: true,
    asked: true,
    namedClothes: named,
    pressure: false,
    alreadySent: true,
  }),
  "second identical photo after one already sent must not be forced",
);

assert(photoAllowed(inna, "back", true) === "back", `back must stay back, got ${photoAllowed(inna, "back", true)}`);
assert(photoAllowed(inna, "side", true) === "side", `side must stay side, got ${photoAllowed(inna, "side", true)}`);
assert(photoAllowed(inna, "full", true) === "full", `full must stay full, got ${photoAllowed(inna, "full", true)}`);
assert(cameraKindFromText("А можно сзади?") === "back", cameraKindFromText("А можно сзади?"));
assert(cameraKindFromText("а можно задом") === "back", cameraKindFromText("а можно задом"));
assert(cameraKindFromText("а можно боком?") === "side", cameraKindFromText("а можно боком?"));
assert(cameraKindFromText("скинь попу") === "", "попа is catalog not camera");
assert(cameraKindFromText("а можешь нагнуться") === "back", "нагнись is rear pose");
assert(cameraKindFromText("фото где попу лучше видно") === "back", "попу лучше is rear crop of same look");

assert(classifyMove("А можно фото?") === "look", classifyMove("А можно фото?"));
assert(classifyMove("А можно сзади?") === "camera", classifyMove("А можно сзади?"));
assert(classifyMove("скинь попу") === "catalog", classifyMove("скинь попу"));
assert(classifyMove("Охуенная у тебя жопа") === "talk", "ass compliment is talk not catalog");
assert(classifyMove("Вчера постоянно смотрел на твою попу)") === "talk", "ass comment is talk");
assert(classifyMove("хочу подрочить") === "talk", "dirty talk is talk");
assert(classifyMove("А опиши как ты сейчас лежишь) буду дрочить на твои фотки") === "talk", "describe is talk not look");
assert(classifyMove("Можно кружок?") === "circle", classifyMove("Можно кружок?"));
assert(looksLikeCatalogAsk("скинь попу"), "скинь попу is catalog");
assert(!looksLikeCatalogAsk("Охуенная у тебя жопа"), "compliment is not catalog");
assert(looksLikeDirtyTalk("Охуенная у тебя жопа"), "ass compliment is dirty talk");
assert(looksLikeDescribeAsk("А опиши как ты сейчас лежишь)"), "describe ask");

const look = turnPolicy({ bond: inna, girlfriend: true, text: "А можно фото?", namedClothes: true });
assert(look.force && look.photo === "selfie", `look at 88 must force selfie, got ${look.photo} ${look.reason}`);
assert(look.tone === "flirt" || look.tone === "hot", `tone at spark 89 must flirt/hot, got ${look.tone}`);

const rear = turnPolicy({ bond: inna, girlfriend: true, text: "А можно сзади?", namedClothes: true, alreadySent: true });
assert(rear.force && rear.photo === "back", `сзади must force back, got ${rear.photo} ${rear.reason}`);

const catalog = turnPolicy({ bond: inna, girlfriend: true, text: "скинь попу" });
assert(!catalog.force && catalog.photo === "none", `catalog must not send, got ${catalog.photo}`);
assert(catalog.tone === "hot" || catalog.tone === "flirt", `catalog at fall stays hot, got ${catalog.tone}`);

const dirty = turnPolicy({ bond: inna, girlfriend: true, text: "Охуенная у тебя жопа" });
assert(dirty.reason !== "catalog", `ass compliment must not be catalog, got ${dirty.reason}`);
assert(dirty.tone === "hot" || dirty.tone === "flirt", `dirty talk at fall is hot, got ${dirty.tone}`);
assert(!dirty.force, "compliment does not force a photo");

const describe = turnPolicy({ bond: inna, girlfriend: true, text: "А опиши как ты сейчас лежишь) Подробнее, буду представлять и дрочить на твои фотки)", alreadySent: true });
assert(describe.reason !== "already" && describe.reason !== "catalog", `describe must not gate as already/catalog, got ${describe.reason}`);
assert(describe.tone === "hot" || describe.tone === "flirt", `describe at fall is hot, got ${describe.tone}`);
assert(/опиши|играй|что на тебе/i.test(describe.line), `policy must tell her to describe, got ${describe.line}`);

const circle = turnPolicy({ bond: inna, girlfriend: true, text: "Можно кружок?" });
assert(circle.force && circle.reason === "circle", `circle must force, got ${circle.photo} ${circle.reason}`);
assert(circle.photo === "selfie", `circle still is selfie not kind=circle, got ${circle.photo}`);

const lookAgain = turnPolicy({ bond: inna, girlfriend: true, text: "А можешь фотку скинуть?", namedClothes: true, alreadySent: true });
assert(lookAgain.force, `at fall second look is allowed, got ${lookAgain.reason}`);

const snap = turnPolicy({ bond: { ...inna, irrit: 80 }, girlfriend: true, text: "А можно фото?", namedClothes: true });
assert(!snap.force && snap.tone === "snap", `irrit 80 is snap, got ${snap.tone} ${snap.photo}`);

const delta = scoreTurn({ userText: "Ммм, а можно фото?", girlfriend: true });
assert((delta.irrit || 0) <= 0, `casual photo ask must not raise irrit, got ${delta.irrit}`);

const dirtyDelta = scoreTurn({ userText: "Охуенная у тебя жопа", girlfriend: true });
assert((dirtyDelta.irrit || 0) <= 0, `ass compliment must not raise irrit, got ${dirtyDelta.irrit}`);
assert((dirtyDelta.heat || 0) >= 2, `ass compliment raises heat, got ${dirtyDelta.heat}`);

assert(stripChatTic("смотрел а") === "смотрел", stripChatTic("смотрел а"));
assert(stripChatTic("а почему? а") === "а почему?", stripChatTic("а почему? а"));
assert(stripChatTic("в кроп топе и шортах а") === "в кроп топе и шортах", stripChatTic("в кроп топе и шортах а"));
assert(stripChatTic("а") === "", "lone а dropped");
assert(stripChatTic("ааааа") === "ааааа", "reaction аааа kept");
assert(stripChatTic("мне спокойней когда ты на связи это бесит") === "", "playbook parrot dropped");
assert(stripChatTic("а у тебя что?") === "а у тебя что?", "leading а kept");

console.log("ok");
