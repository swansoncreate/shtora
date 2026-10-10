import type { CameraMode, ScenePlan, VisualContext } from "./types";

const PLACES: Array<[string, string]> = [
  ["home", "slow morning and getting ready"],
  ["small cafe", "coffee break"],
  ["city street", "walking between errands"],
  ["bookstore", "browsing shelves"],
  ["park", "slow walk"],
  ["kitchen", "making something to eat"],
  ["bedroom", "quiet evening"],
  ["bar terrace", "meeting friends"],
  ["train station", "heading somewhere"],
  ["museum", "looking around"],
  ["riverside", "short walk"],
  ["bakery", "picking up something warm"],
  ["hotel room", "getting ready to go out"],
  ["flower market", "looking at stalls"],
  ["office lobby", "leaving work"],
];

const TOPS = [
  "fitted knit top",
  "cropped cardigan",
  "light blouse",
  "oversized shirt",
  "soft hoodie",
  "fine sweater",
  "ribbed tank top",
  "striped knit polo",
  "fitted tee",
  "linen shirt over a tank",
  "simple bodysuit",
  "lightweight crewneck",
];

const BOTTOMS = [
  "straight-leg jeans",
  "wide-leg trousers",
  "tailored trousers",
  "denim skirt",
  "pleated skirt",
  "relaxed cargo trousers",
  "ankle-length pants",
  "lounge shorts",
  "tailored shorts",
];

const LAYERS = [
  "",
  "light jacket",
  "open blazer",
  "leather jacket",
  "long cardigan",
  "denim overshirt",
];

const SHOES = [
  "simple sneakers",
  "ankle boots",
  "canvas sneakers",
  "low-profile trainers",
  "flat shoes",
  "simple sandals",
];

const ACCESSORIES = [
  "",
  "small shoulder bag",
  "canvas tote",
  "crossbody bag",
  "minimal jewelry",
  "small hoop earrings",
];

const DRESSES = [
  "ribbed midi dress with simple sneakers",
  "soft wrap dress with flat shoes",
  "simple slip dress under a light cardigan",
  "casual shirt dress with low-profile trainers",
];


const POSES = [
  "casual standing snapshot, mid-step",
  "sitting naturally, looking away from the phone",
  "walking candid, one hand occupied",
  "leaning lightly against the surroundings",
  "half-turned toward the camera",
  "small mirror selfie, relaxed posture",
  "resting one shoulder against a wall",
];

const WEATHER = ["clear", "bright overcast", "soft evening light", "cool cloudy weather", "warm daylight", "light rain outside"];

function moscowHour(at: number) {
  const raw = new Date(at).toLocaleString("en-GB", {
    hour: "2-digit",
    hour12: false,
    timeZone: "Europe/Moscow",
  });
  const hour = Number.parseInt(raw, 10);
  return Number.isFinite(hour) ? hour : new Date(at).getHours();
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function makeOutfit(seed: string, recent?: string[]) {
  const recentLow = new Set((recent || []).map((value) => value.toLowerCase()));
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const dress = pick(DRESSES, seed + ":" + attempt, "dress");
    const top = pick(TOPS, seed + ":" + attempt, "top");
    const bottom = pick(BOTTOMS, seed + ":" + attempt, "bottom");
    const layer = pick(LAYERS, seed + ":" + attempt, "layer");
    const shoes = pick(SHOES, seed + ":" + attempt, "shoes");
    const accessory = pick(ACCESSORIES, seed + ":" + attempt, "accessory");
    const useDress = hash(seed + ":" + attempt + ":dress-switch") % 5 === 0;
    const result = useDress
      ? dress + (layer ? ", " + layer : "") + (accessory ? ", " + accessory : "")
      : [top, bottom, layer, shoes, accessory].filter(Boolean).join(", ");
    if (!recentLow.has(result.toLowerCase())) return result;
  }
  return pick(DRESSES, seed, "fallback-dress");
}

function pick<T>(items: T[], seed: string, salt: string) {
  return items[hash(seed + ":" + salt) % items.length] as T;
}

function distinctPlace(items: Array<[string, string]>, recent: string[] | undefined, seed: string, salt: string): [string, string] {
  const blocked = new Set((recent || []).map((value) => value.toLowerCase()));
  const first = pick(items, seed, salt);
  if (!blocked.has(first[0].toLowerCase())) return first;
  for (let i = 1; i < items.length; i += 1) {
    const next = items[hash(seed + ":" + salt + ":" + i) % items.length];
    if (next && !blocked.has(next[0].toLowerCase())) return next;
  }
  return first;
}

export function planLifeScene(input: {
  username: string;
  now?: number;
  world?: VisualContext;
  recentPlaces?: string[];
  recentOutfits?: string[];
}): ScenePlan {
  const now = input.now || Date.now();
  const hour = moscowHour(now);
  const slot = hour < 11 ? "morning" : hour < 17 ? "daytime" : hour < 23 ? "evening" : "late night";
  const seed = input.username + ":" + now.toString(36);
  const entry = distinctPlace(PLACES, input.recentPlaces, seed, "place");
  const world = input.world;
  // The feed may vary framing and pose, but it must not silently reset the character's current world.
  const place = world?.place?.trim() || entry[0];
  const activity = world?.activity?.trim() || (world?.place ? "continuing her current day" : entry[1]);
  const timeContext = world?.timeContext?.trim() || slot;
  const weather = world?.weather?.trim() || pick(WEATHER, seed, "weather");
  const outfit = world?.clothes?.trim() || makeOutfit(seed, input.recentOutfits);
  const hair = world?.hair?.trim() || undefined;
  const pose = pick(POSES, seed, "pose");
  const camera: CameraMode = pose.startsWith("small mirror") ? "mirror" : (pick(["selfie", "full", "candid"], seed, "camera") as CameraMode);
  return {
    place,
    hair,
    activity,
    timeContext,
    weather,
    outfit,
    pose,
    camera,
  };
}

export function planPrompt(base: string, plan: ScenePlan) {
  const style =
    (base || "").replace(/\s+/g, " ").trim() ||
    "She takes a casual photo in natural light, in raw smartphone style. Realistic details, natural skin texture, grain and imperfections.";
  return [
    style,
    "Scene: " + plan.place + ". Activity: " + plan.activity + ". Time: " + plan.timeContext + ". Weather/light: " + plan.weather + ".",
    plan.hair ? "Hair: " + plan.hair + "." : "",
    "Outfit: " + plan.outfit + ". Pose/camera: " + plan.pose + ".",
    "Keep the moment plausible and lived-in. Preserve the supplied current location and outfit unless the shared world explicitly changes; only choose a new outfit when no current outfit is available. Vary pose and framing naturally without resetting the scene.",
  ]
    .join(" ")
    .slice(0, 1800);
}
