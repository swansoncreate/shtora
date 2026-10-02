import { looksLikeCatalogAsk, looksLikeCircleAsk, looksLikeClothesAsk, looksLikeGalleryAsk, looksLikePhotoAsk } from "@/lib/chat/functions";
import type { DmMove } from "./flags";

export function asksForCamera(text: string) {
  const t = (text || "").toLowerCase();
  if (!/сзади|задом|боком|сбоку|со спин|полный рост|во весь рост|в рост/.test(t)) return false;
  return /скинь|покажи|кинь|сфотк|можно|давай|хочу|пришли|отправ/.test(t);
}

export function dmHint(text: string): { hint: DmMove; hintNude: boolean } {
  if (looksLikeCatalogAsk(text)) return { hint: "catalog", hintNude: true };
  if (asksForCamera(text)) return { hint: "camera", hintNude: false };
  if (looksLikeGalleryAsk(text)) return { hint: "gallery", hintNude: false };
  if (looksLikeCircleAsk(text)) return { hint: "circle", hintNude: false };
  if (looksLikeClothesAsk(text) || looksLikePhotoAsk(text)) return { hint: "look", hintNude: false };
  return { hint: "talk", hintNude: false };
}

export function settleMove(
  judged: { move: DmMove; nude: boolean; confidence: number } | null,
  hint: DmMove,
  hintNude: boolean,
  text: string,
) {
  const confidence = judged?.confidence ?? 0;
  let move: DmMove = !judged || confidence < 0.65 ? "talk" : judged.move;
  let nude = !judged || confidence < 0.65 ? hintNude && Boolean(judged?.nude) : judged.nude;
  if ((move === "catalog" || nude) && !looksLikeCatalogAsk(text)) {
    move = hint === "catalog" ? "catalog" : "talk";
    nude = hintNude && looksLikeCatalogAsk(text);
  }
  if (move === "camera" && !asksForCamera(text)) move = "talk";
  if (hint === "look" && move === "talk" && confidence < 0.65) move = "look";
  return { hint, move, nude, confidence };
}
