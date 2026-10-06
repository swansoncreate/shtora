# Shtora — Data Models

## CameraMode

~~~ts
type CameraMode =
  | "selfie"
  | "mirror"
  | "side"
  | "back"
  | "full"
  | "pov"
  | "candid"
  | "gallery";
~~~

## PhotoIntent

~~~ts
type PhotoIntent =
  | {
      mode: "continue";
      camera?: CameraMode;
      changes?: string[];
      reference: "last_photo";
    }
  | {
      mode: "new_scene";
      camera?: CameraMode;
      scene?: string;
      clothes?: string;
      changes?: string[];
      reference: "identity";
    }
  | {
      mode: "pov";
      camera: "pov";
      subject?: string;
      scene?: string;
      reference: "world" | "last_photo" | "identity";
    }
  | {
      mode: "memory";
      memoryQuery: string;
      camera?: CameraMode;
      reference: "visual_memory";
    }
  | {
      mode: "gallery";
      query?: string;
      reference: "visual_memory";
    }
  | {
      mode: "none";
    };
~~~

## VisualContext

~~~ts
type VisualContext = {
  place?: string;
  clothes?: string;
  hair?: string;
  activity?: string;
  timeContext?: string;
  sceneId?: string;
};
~~~

## Scene

~~~ts
type Scene = {
  id: string;
  username: string;
  createdAt: number;
  place?: string;
  clothes?: string;
  hair?: string;
  activity?: string;
  timeContext?: string;
  parentSceneId?: string;
};
~~~

## VisualMemory

~~~ts
type VisualMemory = {
  id: string;
  username: string;
  imageUrl: string;
  createdAt: number;
  scene: VisualContext;
  camera: {
    mode: CameraMode;
    angle?: string;
    perspective?: string;
  };
  source: "instagram" | "dropbox" | "generated" | "edited";
  parentId?: string;
  sceneId?: string;
  tags?: string[];
  prompt?: string;
  worldSnapshot?: VisualContext;
  sourcePath?: string;
};
~~~

## ScenePlan

~~~ts
type ScenePlan = {
  place?: string;
  activity?: string;
  timeContext?: string;
  weather?: string;
  outfit?: string;
  pose?: string;
  camera?: CameraMode;
};
~~~

## GenerationJob

~~~ts
type GenerationJob = {
  id: string;
  username: string;
  status:
    | "queued"
    | "planning"
    | "source_selected"
    | "generating"
    | "persisted"
    | "failed";
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
~~~

## Invariants

1. Failed jobs do not create successful VisualMemory.
2. CONTINUE normally keeps sceneId.
3. NEW_SCENE normally creates a new sceneId.
4. parentId points to an earlier visual memory when continuity is sequential.
5. World state changes are not inferred from a failed generation.
6. Provider implementation is not part of product-level types.
