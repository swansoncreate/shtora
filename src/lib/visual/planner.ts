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

function distinct<T>(items: T[], recent: T[] | undefined, seed: string, salt: string) {
  const blocked = new Set((recent || []).map((value) => String(value).toLowerCase()));
  const first = pick(items, seed, salt);
  if (!blocked.has(String(first).toLowerCase())) return first;
  for (let i = 1; i < items.length; i += 1) {
    const next = items[hash(seed + ":" + salt + ":" + i) % items.length];
    if (next != null && !blocked.has(String(next).toLowerCase())) return next;
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
  const entry = distinct(PLACES, input.recentPlaces, seed, "place");
  const outfit = makeOutfit(seed, input.recentOutfits);
  const pose = pick(POSES, seed, "pose");
  const weather = pick(WEATHER, seed, "weather");
  const camera: CameraMode = pose.startsWith("small mirror") ? "mirror" : (pick(["selfie", "full", "candid"], seed, "camera") as CameraMode);
  return {
    place: input.world?.place || entry[0],
    activity: input.world?.activity || entry[1],
    timeContext: input.world?.timeContext || slot,
    weather,
    outfit: input.world?.clothes || outfit,
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
    "Outfit: " + plan.outfit + ". Pose/camera: " + plan.pose + ".",
    "Keep the moment plausible and lived-in. Clothing is freely chosen for context; do not follow a fixed outfit list and do not deliberately repeat recent outfits.",
  ]
    .join(" ")
    .slice(0, 1800);
}
