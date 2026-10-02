import { asBond, photoTier, pullOf, stageFrom, type AffairStage, type ChatBond } from "./bond";
import {
  looksLikeCameraAsk,
  looksLikeCatalogAsk,
  looksLikeCircleAsk,
  looksLikeDescribeAsk,
  looksLikeDirtyTalk,
  looksLikeGalleryAsk,
  looksLikeLookPoseAsk,
  looksLikePhotoAsk,
} from "./functions";
import { cameraKindFromText } from "./world";

export type ChatMove = "catalog" | "camera" | "look" | "gallery" | "circle" | "talk";
export type ChatTone = "snap" | "ice" | "dry" | "warm" | "flirt" | "hot";

export type TurnPolicy = {
  stage: AffairStage;
  pull: number;
  tone: ChatTone;
  bubbles: 1 | 2 | 3;
  photo: string;
  force: boolean;
  pingOk: boolean;
  reason: string;
  line: string;
};

export function classifyMove(text: string): ChatMove {
  const t = text || "";
  if (looksLikeLookPoseAsk(t) || looksLikeCameraAsk(t)) return "camera";
  if (looksLikeCatalogAsk(t)) return "catalog";
  if (looksLikeGalleryAsk(t)) return "gallery";
  if (looksLikeCircleAsk(t)) return "circle";
  if (looksLikeDescribeAsk(t)) return "talk";
  if (looksLikePhotoAsk(t)) return "look";
  return "talk";
}

export function turnPolicy(opts: {
  bond: ChatBond;
  girlfriend?: boolean;
  text: string;
  namedClothes?: boolean;
  busy?: boolean;
  night?: boolean;
  alreadySent?: boolean;
}): TurnPolicy {
  const b = asBond(opts.bond);
  const gf = Boolean(opts.girlfriend);
  const stage = stageFrom(b, gf);
  const pull = Math.round(pullOf(b));
  const tier = photoTier(b, gf);
  const move = classifyMove(opts.text);
  const cam = cameraKindFromText(opts.text) || (move === "camera" ? "back" : "");
  const dirty = looksLikeDirtyTalk(opts.text) || looksLikeDescribeAsk(opts.text);
  const open = stage === "fall" || stage === "secret";

  let tone: ChatTone = "warm";
  if (stage === "snap" || b.irrit >= 62) tone = "snap";
  else if (stage === "ice") tone = "ice";
  else if (stage === "test") tone = "dry";
  else if (stage === "fall" && (b.heat >= 28 || b.spark >= 62 || Boolean(opts.night) || dirty)) tone = "hot";
  else if (b.spark >= 55 || pull >= 68 || stage === "secret" || stage === "fall") tone = "flirt";
  else if (pull >= 50 || stage === "person" || stage === "crack") tone = "warm";
  else tone = "dry";

  const bubbles: 1 | 2 | 3 = tone === "snap" || tone === "ice" || tone === "dry" ? 1 : tone === "hot" ? 3 : 2;

  let photo = "none";
  let force = false;
  let reason = `${stage}/${pull}`;

  if (tone === "snap" || tone === "ice" || tier === 0) {
    reason = "closed";
  } else if (opts.busy && move !== "gallery" && move !== "circle" && !open) {
    reason = "busy";
  } else if (move === "catalog") {
    reason = "catalog";
  } else if (move === "camera" && cam && tier >= 2 && b.warmth >= 70 && b.trust >= 48 && b.irrit < 50) {
    photo = cam;
    force = true;
    reason = `camera:${cam}`;
  } else if (move === "look") {
    if (opts.alreadySent && !open) reason = "already";
    else if (tier >= 1 && (b.warmth >= 68 || pull >= 62) && (opts.namedClothes || tier >= 2) && b.irrit < 50) {
      photo = opts.night && b.heat >= 40 ? "mirror" : "selfie";
      force = true;
      reason = "look";
    } else reason = "look-gated";
  } else if (move === "gallery" && tier >= 1) {
    photo = "gallery";
    force = true;
    reason = "gallery";
  } else if (move === "circle" && tier >= 1 && b.trust >= 40) {
    photo = "selfie";
    force = true;
    reason = "circle";
  } else {
    reason = dirty ? "talk-hot" : "talk";
  }

  const pingOk =
    tone !== "snap" &&
    tone !== "ice" &&
    b.irrit < 45 &&
    pull >= 54 &&
    (b.spark >= 40 || pull >= 70);

  const bits = [
    force
      ? `Кинь ${move === "circle" ? "кружок" : "это фото"} в этом ходе. В тексте просто согласись, без отказа.`
      : move === "catalog"
        ? tone === "hot" || tone === "flirt"
          ? "Голое по команде не отправляешь. В словах можешь дразнить, без лекции."
          : "На просьбу голого — короткий отказ, без проповеди."
        : "",
    (tone === "hot" || tone === "flirt") && dirty
      ? "Он пишет грязно. Отвечай в том же тоне, как в обычном чате: что на тебе, как ты сейчас, что ему видно. Не уходи в работу и не отшивай."
      : tone === "flirt" || tone === "hot"
        ? "Можно флиртовать. Не обрывай разговор."
        : "",
    tone === "ice" || tone === "snap" ? "Сухо и коротко." : "",
  ];
  const line = bits.filter(Boolean).join(" ");

  return { stage, pull, tone, bubbles, photo, force, pingOk, reason, line };
}

export function pingSilenceMs(bond: ChatBond, slot: string) {
  const b = asBond(bond);
  const pull = pullOf(b);
  if (slot === "sleep") return 8 * 3600_000;
  if (slot === "work") return pull >= 75 ? 40 * 60_000 : 80 * 60_000;
  if (slot === "weekend") return pull >= 75 ? 22 * 60_000 : 38 * 60_000;
  if (slot === "evening" || slot === "night") {
    if (pull >= 75 && b.spark >= 50 && b.irrit < 35) return 16 * 60_000;
    if (pull >= 50) return 26 * 60_000;
    return 40 * 60_000;
  }
  return pull >= 75 ? 20 * 60_000 : 40 * 60_000;
}
