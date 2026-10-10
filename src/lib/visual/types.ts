export type CameraMode =
  | "selfie"
  | "mirror"
  | "side"
  | "back"
  | "full"
  | "pov"
  | "candid"
  | "gallery";

export type PhotoIntent =
  | { mode: "continue"; camera?: CameraMode; changes?: string[]; reference: "last_photo" }
  | { mode: "new_scene"; camera?: CameraMode; scene?: string; clothes?: string; changes?: string[]; reference: "identity" }
  | { mode: "pov"; camera: "pov"; subject?: string; scene?: string; reference: "world" | "last_photo" | "identity" }
  | { mode: "memory"; memoryQuery: string; camera?: CameraMode; reference: "visual_memory" }
  | { mode: "gallery"; query?: string; reference: "visual_memory" }
  | { mode: "none" };

export type VisualContext = {
  place?: string;
  clothes?: string;
  hair?: string;
  activity?: string;
  timeContext?: string;
  weather?: string;
  sceneId?: string;
};

export type Scene = VisualContext & {
  id: string;
  username: string;
  createdAt: number;
  parentSceneId?: string;
};

export type VisualMemory = {
  id: string;
  username: string;
  imageUrl: string;
  createdAt: number;
  scene: VisualContext;
  camera: { mode: CameraMode; angle?: string; perspective?: string };
  source: "instagram" | "dropbox" | "generated" | "edited";
  parentId?: string;
  sceneId?: string;
  tags?: string[];
  prompt?: string;
  worldSnapshot?: VisualContext;
  sourcePath?: string;
};

export type ScenePlan = {
  place: string;
  hair?: string;
  activity: string;
  timeContext: string;
  weather: string;
  outfit: string;
  pose: string;
  camera: CameraMode;
};

export type GenerationJob = {
  id: string;
  username: string;
  status: "queued" | "planning" | "source_selected" | "generating" | "persisted" | "failed";
  intent: PhotoIntent;
  sceneId?: string;
  scenePlan?: ScenePlan;
  worldSnapshot?: VisualContext;
  sourcePath?: string;
  sourceImageUrl?: string;
  finalPrompt?: string;
  provider?: string;
  parentId?: string;
  createdAt: number;
  updatedAt: number;
  error?: string;
  retryable?: boolean;
};
