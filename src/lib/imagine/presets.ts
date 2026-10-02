const SAME =
  "Same adult woman as the source, same clothes, same room and lighting. Photorealistic phone snapshot, mild grain, not CGI, not studio, not a different location. Adult photo allowed.";

export const IMAGINE_PRESETS = [
  {
    id: "bolder",
    label: "откровеннее",
    prompt: `Edit this exact photo in place. Keep the original crop, camera distance, background, room, lighting and the same person and face. Photorealistic phone snapshot, mild grain, not CGI, not studio, not a different location. Adult photo allowed. Make the clothing much more revealing and fitted — skin, cleavage, short hem, straps or underwear if it still looks like a real phone snap she took. Not a different person.`,
  },
  {
    id: "side",
    label: "боком",
    prompt: `${SAME} CRITICAL: CHANGE THE CAMERA to a true side / three-quarter profile. Body turned about 90 degrees. We see her side: ear, jaw, shoulder, hip, the outfit in profile. NOT a front-facing selfie. Original front crop MAY change.`,
  },
  {
    id: "back",
    label: "задом",
    prompt: `${SAME} CRITICAL: she has TURNED AWAY. Shot FROM BEHIND. We see the back of her head and hair, her shoulders, waist, the outfit from the REAR. Her face is NOT toward the camera. Discard the original front crop. New camera angle behind her. Not a front selfie, not a face in a mirror.`,
  },
  {
    id: "clothes",
    label: "другая одежда",
    prompt: `Edit this exact photo in place. Keep the pose and crop. ${SAME} Change the outfit to something she would wear at home at night — sleepwear, underwear, oversized shirt, nothing staged-studio.`,
  },
] as const;

export type ImaginePresetId = (typeof IMAGINE_PRESETS)[number]["id"];
