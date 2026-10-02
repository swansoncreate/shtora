import { runImageEdit } from "./functions";
import { PHONE_RAW, keepPreset, withPhoneRaw } from "./prompt";

function lookFromAsk(raw: string) {
  const t = (raw || "").toLowerCase();
  const color: Array<[RegExp, string]> = [
    [/бордов|burgundy/, "burgundy"],
    [/винн|марсал/, "wine"],
    [/чёрн|черн|\bblack\b/, "black"],
    [/бел(ое|ая|ый)|\bwhite\b/, "white"],
    [/красн|\bred\b/, "red"],
    [/син(ее|яя|ий)|\bblue\b/, "blue"],
    [/голуб/, "light-blue"],
    [/зелён|зелен/, "green"],
    [/роз(ов)/, "pink"],
    [/бежев/, "beige"],
    [/коричнев/, "brown"],
  ];
  const item: Array<[RegExp, string]> = [
    [/плать|\bdress\b/, "dress"],
    [/юбк|\bskirt\b/, "skirt"],
    [/комплект/, "matching set"],
    [/рубашк|\bshirt\b/, "shirt"],
    [/блуз|\bblouse\b/, "blouse"],
    [/\bтоп\b|crop top/, "top"],
    [/майк|маечк|tank/, "tank top"],
    [/футболк|t-shirt/, "t-shirt"],
    [/джинс|\bjeans\b/, "jeans"],
    [/шорт|\bshorts\b/, "shorts"],
    [/пиджак|блейз|\bblazer\b/, "blazer"],
    [/боди|\bbodysuit\b/, "bodysuit"],
    [/пижам|\bpajama/, "pajamas"],
    [/халат|\brobe\b/, "robe"],
    [/худи|\bhoodie\b/, "hoodie"],
  ];
  const colors: string[] = [];
  const items: string[] = [];
  for (const [re, word] of color) if (re.test(t)) colors.push(word);
  for (const [re, word] of item) if (re.test(t)) items.push(word);
  if (!items.length) return "";
  return [...colors.slice(0, 1), ...items.slice(0, 3)].join(" ").trim();
}

function latin(raw: string) {
  return (raw || "")
    .replace(/[\u0400-\u04FF]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function field(raw: string, key: string) {
  const m = new RegExp(`${key}:\\s*([^.]*)`, "i").exec(raw || "");
  const v = (m?.[1] || "").trim();
  if (!v) return "";
  const en = latin(v);
  if (en.length >= 8) return en.slice(0, 80);
  return lookFromAsk(v) || v.slice(0, 64);
}

const HINT: Record<string, string> = {
  feed: "",
  gallery: "Old recents selfie.",
  roll: "Old recents selfie.",
  selfie: "Front selfie.",
  mirror: "Mirror selfie.",
  full: "Step back. Full body from head to shoes. Crop MAY change.",
  pov: "POV, phone down her body.",
  belly: "POV, phone down her body.",
  back: "FROM BEHIND. She is turned away. Face not toward camera.",
  side: "True side profile. Body turned 90 degrees. Not a front selfie.",
  spicy: "Private selfie.",
  dice: "Same crop, slight change.",
  studio: "Same face, one frame.",
};

const CAMERA_SHIFT = new Set(["back", "side", "full", "pov", "belly"]);

export type StillJob = {
  kind: string;
  source: string;
  identity?: string;
  extras?: string[];
  userText?: string;
  scene?: string;
  world?: string;
  prompt?: string;
};

export function stillPrompt(job: Pick<StillJob, "kind" | "userText" | "scene" | "world" | "prompt">) {
  if (job.prompt?.trim()) return job.prompt.replace(/\s+/g, " ").trim().slice(0, 1200);
  const asked = (job.userText || "").toLowerCase();
  let kind = (job.kind || "selfie").toLowerCase();
  if (/нагн|наклон|по(пу|пку) лучше|спин.{0,16}лучше/.test(asked) || (/сзад|задом|со спин|from behind/.test(asked) && !/сиськ|грудь/.test(asked)))
    kind = "back";
  else if (/боком|сбоку|в профиль/.test(asked)) kind = "side";
  else if (/полн(ый|ым)? рост|во весь рост/.test(asked)) kind = "full";
  const clothes = field(job.world || "", "CLOTHES") || lookFromAsk(job.userText || "") || latin(job.userText || "").slice(0, 40);
  const place = field(job.world || "", "PLACE") || latin(job.scene || "").slice(0, 48);
  const sameShot =
    "This is a re-shoot of THIS SAME phone photo: same adult woman, same body, same hair, same clothes, same room and lighting. Do not swap in a different picture or a different outfit.";
  if (kind === "back") {
    const lean = /нагн|наклон|по(пу|пку) лучше/.test(asked)
      ? "Slight natural lean forward, weight on one leg, still FROM BEHIND. Same shorts/top as the source."
      : "She has TURNED HER BACK to the camera. FROM-BEHIND phone snapshot.";
    return keepPreset(
      [
        sameShot,
        `CRITICAL CAMERA CHANGE: ${lean}`,
        "We see the BACK of her head and hair, shoulders, waist, the outfit from the REAR.",
        "Her face is NOT toward the camera — no front portrait, no mirror selfie of her face.",
        "DISCARD the original front crop. New angle from behind her. Vertical candid phone photo, grain, not CGI.",
        clothes && `Clothes seen from the back: ${clothes}.`,
        place && `Place: ${place}.`,
      ]
        .filter(Boolean)
        .join(" "),
    );
  }
  if (kind === "side") {
    return keepPreset(
      [
        "This is a re-shoot of THIS SAME phone photo: same adult woman, same clothes, same room.",
        "CRITICAL CAMERA CHANGE: true SIDE / three-quarter profile. Body turned about 90 degrees.",
        "We see her side: ear, jawline, shoulder, hip, the outfit in profile. NOT a front-facing selfie.",
        "Original front crop MAY change. Vertical candid phone photo.",
        clothes && `Clothes: ${clothes}.`,
        place && `Place: ${place}.`,
      ]
        .filter(Boolean)
        .join(" "),
    );
  }
  if (kind === "full") {
    return keepPreset(
      [
        "Same adult woman, same clothes, same room.",
        "Step back so the FULL BODY is in frame, head to shoes. Crop MAY change to fit.",
        "Candid vertical phone snapshot, not studio.",
        clothes && `Clothes: ${clothes}.`,
        place && `Place: ${place}.`,
      ]
        .filter(Boolean)
        .join(" "),
    );
  }
  const hint = kind in HINT ? HINT[kind] : "Front selfie.";
  const keepCrop = CAMERA_SHIFT.has(kind) ? "" : "Same face as source.";
  return keepPreset(
    [keepCrop, hint, clothes && `Clothes: ${clothes}.`, place && `Place: ${place}.`].filter(Boolean).join(" "),
  );
}

export function videoPrompt(kind: "circle" | "live" | "edit" | "extend", extra = "") {
  const hint =
    kind === "circle"
      ? "Front-camera video note. Same face."
      : kind === "extend"
        ? "Continue from last frame. Same face."
        : kind === "edit"
          ? "Same face and scene, apply the change."
          : "Subtle motion. Same face.";
  return keepPreset([hint, latin(extra).slice(0, 80)].filter(Boolean).join(" "));
}

export async function runStill(job: StillJob) {
  if (!job.source || job.kind === "none") return { ok: false as const, url: undefined, error: "Нет кадра.", prompt: "" };
  const prompt = stillPrompt(job);
  const extras = job.extras?.length ? job.extras : job.identity;
  const mode = job.extras && job.extras.length > 1 ? "compose" : "identity";
  const asked = (job.userText || "").toLowerCase();
  const cam =
    job.kind === "back" ||
    job.kind === "side" ||
    job.kind === "full" ||
    (/сзад|задом|со спин|from behind|нагн|по(пу|пку) лучше/.test(asked) && !/сиськ|грудь/.test(asked)) ||
    /боком|сбоку/.test(asked);
  const pic = await runImageEdit(job.source, prompt, extras, mode);
  if (pic.ok) return { ok: true as const, url: pic.url, prompt };
  if (cam) {
    const retryPrompt = keepPreset(
      "Same adult woman, same clothes, same room. She is facing away from the camera. Over-the-shoulder or from behind: we see her back, hair from behind, the outfit from the rear. Not a front selfie. Vertical candid phone photo.",
    );
    const retry = await runImageEdit(job.source, retryPrompt, extras, mode);
    if (retry.ok) return { ok: true as const, url: retry.url, prompt: retryPrompt };
    return { ok: false as const, url: undefined, error: pic.error || "Imagine не собрал кадр.", prompt };
  }
  if (/422|не принял|unprocessable|фильтр/i.test(pic.error || "")) {
    return { ok: true as const, url: job.source, prompt };
  }
  return { ok: false as const, url: undefined, error: pic.error || "Imagine не собрал кадр.", prompt };
}

export { lookFromAsk, withPhoneRaw, PHONE_RAW, keepPreset };
