import { specificClothes } from "@/lib/chat/world";
import type { DmFlags, DmMove } from "./flags";
import { offerAllowed } from "./flags";
import { isBannedClothes } from "./world";

export function decideDmMedia(opts: {
  offer: string;
  flags: DmFlags;
  move: DmMove;
  camera: "" | "back" | "side" | "full";
  clothesEn?: string;
}) {
  const offer = opts.offer === "selfie" || opts.offer === "angle" || opts.offer === "gallery" || opts.offer === "circle" ? opts.offer : "none";
  if (offer === "angle" && opts.move !== "camera") return { kind: "none", scene: "" };
  if (!offerAllowed(opts.flags, offer)) return { kind: "none", scene: "" };
  const look = specificClothes(opts.clothesEn);
  if ((offer === "selfie" || offer === "angle") && (!look || isBannedClothes(look))) {
    return { kind: "none", scene: "" };
  }
  if (offer === "angle") return { kind: opts.camera || "back", scene: "" };
  if (offer === "circle") return { kind: "circle", scene: "" };
  if (offer === "gallery") return { kind: "gallery", scene: "" };
  if (offer === "selfie" && opts.flags.nightMirror) return { kind: "mirror", scene: "mirror selfie at home" };
  if (offer === "selfie") return { kind: "selfie", scene: "" };
  return { kind: "none", scene: "" };
}