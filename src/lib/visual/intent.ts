import { z } from "zod";
import type { CameraMode, PhotoIntent } from "./types";
import { diagnosticLog } from "@/lib/diagnostics";

const cameraSchema = z.enum(["selfie", "mirror", "side", "back", "full", "pov", "candid", "gallery"]);

export const photoIntentSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("continue"),
    camera: cameraSchema.optional(),
    changes: z.array(z.string().max(80)).max(6).optional(),
    reference: z.literal("last_photo"),
  }),
  z.object({
    mode: z.literal("new_scene"),
    camera: cameraSchema.optional(),
    scene: z.string().max(160).optional(),
    clothes: z.string().max(160).optional(),
    changes: z.array(z.string().max(80)).max(6).optional(),
    reference: z.literal("identity"),
  }),
  z.object({
    mode: z.literal("pov"),
    camera: z.literal("pov"),
    subject: z.string().max(120).optional(),
    scene: z.string().max(160).optional(),
    reference: z.enum(["world", "last_photo", "identity"]),
  }),
  z.object({
    mode: z.literal("memory"),
    memoryQuery: z.string().min(1).max(180),
    camera: cameraSchema.optional(),
    reference: z.literal("visual_memory"),
  }),
  z.object({
    mode: z.literal("gallery"),
    query: z.string().max(180).optional(),
    reference: z.literal("visual_memory"),
  }),
  z.object({ mode: z.literal("none") }),
]);

function cameraFromText(text: string): CameraMode | undefined {
  const t = text.toLowerCase();
  if (/в зеркало|зеркал/.test(t)) return "mirror";
  if (/со спины|сзади|задом|спину/.test(t)) return "back";
  if (/боком|сбоку|профил/.test(t)) return "side";
  if (/во весь рост|полный рост|в полный рост/.test(t)) return "full";
  if (/от первого лица|pov|от себя/.test(t)) return "pov";
  if (/селфи|selfie/.test(t)) return "selfie";
  return undefined;
}

function explicitSceneChange(text: string) {
  return /пошли в|идём в|идем в|перейдём в|перейдем в|теперь в|на улице|в кафе|в ресторан|в бар|на пляж|в парк|в аэропорт|на вокзал/.test(
    text.toLowerCase(),
  );
}

export function deterministicPhotoIntent(raw: string, previousPhoto = false): PhotoIntent {
  const text = raw.replace(/\s+/g, " ").trim();
  const t = text.toLowerCase();
  if (!text) return { mode: "none" };

  if (/из галере|вчерашн|та фот|как на (той|этом)|покажи стар|втор(?:ую|ую) фот|старую фот|то фото/.test(t)) {
    return { mode: "gallery", query: text, reference: "visual_memory" };
  }

  const camera = cameraFromText(text);
  if (camera === "pov") {
    return {
      mode: "pov",
      camera: "pov",
      scene: text.slice(0, 160),
      reference: previousPhoto ? "last_photo" : "world",
    };
  }

  const photoWord = /фото|фотк|кадр|селфи|сфот|скинь|кинь|покажи/.test(t);
  if (camera || photoWord) {
    const changes: string[] = [];
    if (/в кафе|в ресторан|в бар/.test(t)) changes.push((t.match(/в (кафе|ресторан|бар)[^,.!?]*/) || [])[0] || "");
    if (/на улице/.test(t)) changes.push("outdoors");
    if (/переод|другая одеж|другой наряд/.test(t)) changes.push("new outfit");
    const isNew = explicitSceneChange(text);
    if (isNew) {
      return {
        mode: "new_scene",
        camera: camera || "selfie",
        scene: text.slice(0, 160),
        changes: changes.filter(Boolean),
        reference: "identity",
      };
    }
    return {
      mode: "continue",
      camera: camera || "selfie",
      changes: changes.filter(Boolean),
      reference: "last_photo",
    };
  }

  const continuationAsk = /продолжи|продолжение|друг(ую|ой|ое) поз|позу|поменяй поз|измени поз|повернись|развернись|друг(ой|ой) ракурс|ракурс|поближе|подальше|сверху|снизу|переоденься|переодень|смени одеж|другую одеж|другой наряд|в этой же одеж|так же но|такую же|такой же|ещ[её] одну|ещ[её] одно|теперь иначе|ещ[её] вариант|another pose|different pose|change (the )?pose|different angle|change outfit|one more/i.test(t);
  if (continuationAsk && previousPhoto && !explicitSceneChange(text)) {
    const changes: string[] = [];
    if (/поз|повернись|развернись/.test(t)) changes.push("change pose");
    if (/ракурс|поближе|подальше|сверху|снизу/.test(t)) changes.push("change camera angle");
    if (/переод|одеж|наряд/.test(t)) changes.push("change outfit");
    diagnosticLog("info", "photo-intent", "continuation phrase matched", { mode: "continue", changesCount: changes.length });
    return { mode: "continue", camera: camera || "selfie", changes, reference: "last_photo" };
  }

  diagnosticLog("info", "photo-intent", "no deterministic photo intent", { previousPhoto, sceneChange: explicitSceneChange(text) });
  return { mode: "none" };
}

export function parseSemanticPhotoIntent(raw: string, fallback: PhotoIntent): PhotoIntent {
  try {
    return photoIntentSchema.parse(JSON.parse(raw));
  } catch {
    return fallback;
  }
}
