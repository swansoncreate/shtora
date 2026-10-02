/** Attractive phone edit. Avoid filter-trigger words; hotter asks still work via user prompt + auto-fallback. */
export const PHONE_RAW = "Vertical, candid, raw shot on phone with grain and imperfections.";

export const FEED_PROMPT =
  "Use the source photo only for her face. Same adult woman. Each post is a new candid: pick one new place (home, street, cafe, park, kitchen, or a shop), one new everyday outfit, and one new pose. Do not copy the source clothes, uniform, apron, office, room, crop, or background. Off duty, not a work shift. Vertical, candid, raw shot on phone with grain and imperfections. Not studio, not CGI, not beauty-AI skin. No extra limbs. No text, captions, watermarks, or UI.";

export const DEFAULT_VARIATION_PROMPT =
  `Edit this exact photo in place. Keep the original crop, camera distance, framing, background, room, lighting, and phone snapshot look. Same adult woman, same face. A natural shift in pose and clothing — clothes can sit closer, shorter hem, more skin than the source if it still looks like a private phone photo. ${PHONE_RAW} Not studio, not CGI, not beauty-AI skin. No extra limbs, no new location. No text, captions, watermarks, UI or chat screenshots on the image.`;

export const SAFE_VARIATION_PROMPT =
  `Edit this exact photo in place. Keep the original crop, camera distance, framing, background, room, lighting, and phone snapshot look. Same adult woman, same face. Only a slight natural shift in pose and a modest change of similar clothes. ${PHONE_RAW} Not studio, not CGI. No extra limbs, no new location. No text, captions, watermarks or UI on the image.`;

export const OLD_VARIATION_PROMPT =
  `Edit this exact photo in place. Keep the original crop, camera distance, framing, background, room, lighting, and phone snapshot look. If the source is waist-up or half-body, do NOT zoom out and do NOT generate a full-body standing shot. Same person, same face. Only a slight natural shift in pose (weight, arm, head) and a modest change of the same type of clothing, still fully covering the body. ${PHONE_RAW} Not studio, not CGI, not beauty-AI skin. No extra limbs, no new location. No text, captions, watermarks, UI or chat screenshots on the image.`;

export function withPhoneRaw(prompt: string) {
  const p = (prompt || "").trim();
  if (/vertical,\s*candid,\s*raw shot on phone/i.test(p)) return p;
  return `${p} ${PHONE_RAW}`.trim();
}

/** User text wins. Don't bury it under a style preset. */
export function keepPreset(prompt: string) {
  return (prompt || "")
    .replace(new RegExp(PHONE_RAW.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
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
  const rest = (extra || "").replace(/\s+/g, " ").trim().slice(0, 240);
  return [rest || hint, PHONE_RAW].filter(Boolean).join(" ").slice(0, 1200);
}
