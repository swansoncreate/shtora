import type { BondDelta, ChatBond } from "@/lib/chat/bond";
import { looksLikeCatalogAsk } from "@/lib/chat/functions";

export function scoreDm(opts: { userText: string; nude: boolean; dirty: boolean; girlfriend: boolean; memAbout?: string; namedNow: boolean; warmthDelta?: number }): BondDelta {
  const low = (opts.userText || "").toLowerCase();
  const d: Required<ChatBond> = { warmth: 0, trust: 0, heat: 0, irrit: 0, guilt: 0, spark: 0 };
  const about = /как ты|что делаешь|где ты|как смена|как спал|что ела|выходн|устал|что нового/.test(low);
  if (about && !opts.nude) {
    d.trust += 2;
    d.warmth += 1;
  } else if (!opts.nude && low.trim().length >= 8) d.trust += 1;
  if (opts.dirty && !opts.nude) {
    d.heat += 3;
    d.spark += 2;
    d.warmth += 1;
  }
  if (opts.nude || looksLikeCatalogAsk(low)) {
    d.irrit += 4;
    d.trust -= 2;
    d.spark -= 2;
    if (opts.girlfriend) d.guilt += 3;
  }
  if (/дура|сука|заткни|тупая|иди нах/.test(low)) {
    d.warmth -= 6;
    d.trust -= 6;
    d.irrit += 8;
  }
  const mem = (opts.memAbout || "").toLowerCase().slice(0, 24);
  if (mem.length >= 8 && low.includes(mem.slice(0, 12))) {
    d.warmth += 3;
    d.trust += 2;
  }
  if (opts.namedNow && !opts.nude) d.spark += 2;
  const extra = Math.max(-1, Math.min(1, opts.warmthDelta || 0)) * 2;
  d.warmth += extra;
  return d;
}
