
# Shtora — World Engine Roadmap

## Цель

Постепенно превратить существующий chat engine в World Engine — единый слой состояния персонажа и мира, на который могут ссылаться чат, фотографии, Instagram и другие поверхности Shtora.

## Phase 0 — Architecture foundation

Сделать:

- PhotoIntent
- VisualMemory
- Scene
- VisualContext
- CameraMode
- reference policy

Acceptance: контракты не зависят от конкретного image provider.

## Phase 1 — Deterministic visual continuity

Поддержать selfie, side, back, full, mirror, POV.

Пример:

~~~text
"повернись боком"
→ continue / side / last_photo
~~~

Acceptance: после первой фотографии "теперь боком" использует предыдущую как reference.

## Phase 2 — Scene continuity

Ввести sceneId.

Хранить place, clothes, hair, activity, time context.

Изменение ракурса не меняет scene.

Изменение одежды, места или существенной активности создаёт новый scene.

## Phase 3 — Structured semantic intent

Добавить LLM resolver со structured output + Zod.

Поддержать естественные запросы:

> Покажи, как ты сейчас лежишь.

> А можешь сфоткать ноги?

> Теперь давай из зеркала.

> Скинь ещё одну, только со спины.

LLM интерпретирует запрос, но не выполняет side effects.

## Phase 4 — Visual Memory

Сделать фотографии объектами памяти.

Поддержать:

~~~text
покажи ту фотку в зелёном платье
покажи вчерашнюю
покажи ту, где я была в ванной
сделай ещё одну как на той фотке
~~~

Metadata: outfit, place, scene, camera, parent, tags, timestamp.

## Phase 5 — POV & environmental photography

Использовать world state.

Bathroom: ноги, ванна, пол, полотенце, телефон.

Car: колени, руль, приборная панель, дорога.

Cafe: стол, чашка, рука, окно.

POV строится из текущего world state, а не из случайного prompt.

## Phase 6 — Cross-product world

Один world state постепенно используется в:

~~~text
Chat
├── generated photos
├── Instagram stories
├── Instagram posts
├── profile
├── Dropbox memories
└── Imagine
~~~

## Phase 7 — World events

Добавить события:

~~~text
character left home
character arrived at cafe
character changed clothes
character went to bed
character woke up
~~~

World Engine становится источником истины.

## Phase 8 — Long-term memory

После стабилизации Visual Continuity:

- episodic memory;
- semantic memory;
- visual memory;
- relationship memory;
- world state.

Это отдельный этап и не должен блокировать MVP.

## Priority

P0:
- PhotoIntent
- VisualContext
- Scene
- VisualMemory
- deterministic continuation
- parentId
- failure-safe generation
- generation job ID

P1:
- structured LLM resolver
- memory retrieval
- POV
- gallery
- anti-repeat source history
- Scene Planner

P2:
- cross-product world
- world events
- richer episodic memory

P3:
- long-term semantic world simulation

## Основной принцип

Не строить отдельные chat world / instagram world / photo world.

Строить:

~~~text
                    WORLD
                      │
        ┌─────────────┼─────────────┐
        │             │             │
       CHAT        INSTAGRAM      PHOTOS
        │             │             │
        └─────────────┼─────────────┘
                      │
                   MEMORY
~~~

Это позволит Shtora развиваться из набора отдельных функций в единый виртуальный социальный мир.
