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

const OUTFITS = [
  "fitted knit top with straight-leg jeans and a small shoulder bag",
  "ribbed midi dress with simple sneakers and a light jacket",
  "oversized shirt half-tucked into tailored trousers",
  "cropped cardigan with wide-leg trousers and minimal jewelry",
  "soft hoodie with relaxed shorts and sneakers",
  "satin camisole under an open blazer with dark jeans",
  "simple tank top with a denim skirt and canvas sneakers",
  "fine sweater with a pleated skirt and ankle boots",
  "light blouse with straight jeans and a tote bag",
  "leather jacket over a fitted tee with relaxed jeans",
  "striped knit polo with loose trousers and flats",
  "linen shirt over a fitted tank with relaxed jeans",
  "soft cardigan with a long skirt and low-profile sneakers",
  "simple black top with cargo trousers and a crossbody bag",
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

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
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
  const hour = new Date(now).getHours();
  const slot = hour < 11 ? "morning" : hour < 17 ? "daytime" : hour < 23 ? "evening" : "late night";
  const seed = input.username + ":" + now.toString(36);
  const entry = distinct(PLACES, input.recentPlaces, seed, "place");
  const outfit = distinct(OUTFITS, input.recentOutfits, seed, "outfit");
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
