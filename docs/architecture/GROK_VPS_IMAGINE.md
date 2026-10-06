
# Shtora — архитектура Grok Build ↔ VPS ↔ Imagine

## Цель документа

Зафиксировать, как сейчас устроено взаимодействие Shtora с Grok/Imagine, что уже работает через опубликованное приложение Grok, что в репозитории всё ещё обращается напрямую к xAI API, и как перейти к архитектуре, в которой VPS хранит состояние мира Shtora, а Chat/Imagine выполняются через опубликованный Grok runtime.

## 1. Главное заключение

Shtora уже содержит два разных механизма:

1. VPS → опубликованное Grok-приложение — используется для chat runtime; есть runningOnVps() и callGrokApp(...).
2. VPS → xAI API напрямую — используется текущим Imagine/image pipeline и требует XAI_API_KEY.

Цель:

~~~text
Grok subscription/runtime → Chat + Imagine
VPS → World Engine + DB + Visual Memory + storage
~~~

## 2. Фактическая архитектура

~~~text
SHTORA
 ├─ VPS → World/DB/etc. → Grok publication → Chat
 └─ VPS → xAI API → Grok Imagine
~~~

Вторую ветку нужно заменить provider boundary, если цель — не использовать отдельное API-потребление.

## 3. Chat

Целевой поток:

~~~text
Browser
   ↓
Shtora VPS
   ├── World Engine
   ├── relationship state
   ├── memory
   ├── scene
   └── chat history
   ↓
Grok publication
   ↓
Grok model
   ↓
structured reply
   ↓
Shtora VPS
~~~

VPS остаётся владельцем состояния игры.

Прямой xAI chat route может оставаться development/emergency fallback, но не должен быть обязательным production path, если задача — использовать publication/runtime.

## 4. Imagine

Сейчас image pipeline обращается к:

~~~text
https://api.x.ai/v1/images/edits
Authorization: Bearer <XAI_API_KEY>
~~~

Chat через publication и Imagine через API — разные каналы.

Нельзя считать Grok subscription и xAI API credits автоматически взаимозаменяемыми.

## 5. Provider abstraction

Ввести:

~~~text
ImageProvider
  ├─ generate(input)
  └─ edit(input)

Implementations:
  ├─ GrokPublicationImageProvider
  └─ XaiApiImageProvider
~~~

Production target: GrokPublicationImageProvider.

Dev/fallback: XaiApiImageProvider.

World Engine и Photo pipeline не должны знать URL/API конкретного провайдера.

## 6. VPS → Grok contract

Если опубликованное Grok-приложение предоставляет server-side operation для images, Shtora должен иметь отдельный внутренний контракт, например:

~~~text
POST /api/shtora/imagine
~~~

Пример запроса:

~~~json
{
  "operation": "edit",
  "prompt": "same woman, same bathroom, turn to a side view",
  "sourceImage": "...",
  "scene": {
    "place": "bathroom",
    "clothes": "black t-shirt",
    "hair": "long dark hair"
  },
  "camera": {
    "mode": "side"
  }
}
~~~

Пример ответа:

~~~json
{
  "ok": true,
  "image": {
    "url": "...",
    "mime": "image/jpeg"
  }
}
~~~

Наличие такого endpoint в самом Grok Build необходимо подтвердить отдельно. Shtora repository подтверждает только boundary со своей стороны.

## 7. Visual Continuity

Нужен поток:

~~~text
previous image
       +
current scene
       +
character identity
       +
camera intent
       ↓
Image Provider
       ↓
next image
~~~

Для "селфи" → Image A; затем "а теперь боком" → CONTINUE + SIDE + Image A reference → Image B.

Image B.parentId = Image A.id и Image B.sceneId = Image A.sceneId.

## 8. POV

Для "покажи от первого лица":

~~~text
mode = POV
reference = world
camera = first_person
place = current place
~~~

При необходимости добавляется last_photo как environment reference.

## 9. Что должно оставаться на VPS

World Engine:
place, clothes, hair, time, activity, sceneId.

Relationship Engine:
warmth, trust, heat, irrit, guilt, spark.

Visual Memory:
imageId, imageUrl, sceneId, parentId, camera, source, worldSnapshot, createdAt.

Chat state:
messages, memory, arc, lastPhoto, unread, typing.

Storage:
generated images и metadata должны быть привязаны к Shtora storage/database.

## 10. Что не надо делать

Не следует:

1. передавать xAI API key пользователю;
2. использовать cookies/session Grok как замену API authentication;
3. эмулировать браузерную сессию ради обхода API billing;
4. строить production architecture вокруг неофициальных внутренних endpoint'ов;
5. хранить весь Visual Memory только в prompt/context модели.

Если publication предоставляет поддерживаемый backend contract — использовать его как provider. Если такого контракта нет, нужен официальный API или другой image provider.

## 11. Хранение generated images

~~~text
Grok
  ↓
image result
  ↓
Shtora VPS
  ↓
object storage
  ↓
VisualMemory DB row
~~~

Shtora не должен зависеть от короткоживущего URL генератора.

## 12. Рекомендуемая структура

~~~text
src/lib/ai/
  provider.ts
  grok-publication.ts
  xai-api.ts

src/lib/imagine/
  jobs.ts
  continuity.ts
  intent.ts

src/lib/chat/
  engine.ts
  brain.server.ts

src/lib/world/
  engine.ts
  scenes.ts

src/lib/visual/
  memory.ts
  repository.ts
~~~

Главное правило:

~~~text
World Engine
     ↓
AI Provider
~~~

а не World Engine → api.x.ai directly.

## 13. Rollout plan

Phase 1 — исследовать Grok publication contract:
URL, auth, operations, image generation/editing, references, result format, payload limits, timeout/retry behavior, publication stability.

Phase 2 — Provider abstraction.

Phase 3 — Grok publication Imagine: imagine.generate / imagine.edit.

Phase 4 — Visual Memory: sceneId, parentId, camera, worldSnapshot.

Phase 5 — Continuity: CONTINUE, NEW_SCENE, POV, MEMORY, GALLERY.

Phase 6 — production switch:

~~~text
IMAGE_PROVIDER=grok-publication
~~~

и xai-api только как fallback/dev.

## 14. Риски

- Publication API может быть нестабильным, если это не официальный публичный API.
- Нужно отдельно подтвердить server-side Imagine access именно для текущего publication/runtime.
- Reference images требуют compression и size limits.
- Browser → VPS → Grok → Imagine → VPS → Browser может быть медленнее прямого API.

Нужны job IDs, async generation, timeout, retry и status.

## 15. Итоговая архитектура

~~~text
USER
  ↓
SHTORA FRONTEND
  ↓
SHTORA VPS
  ├─ World Engine
  ├─ Chat Engine
  ├─ Visual Memory
  └─ AI Provider
       ├─ Grok Publication (production goal)
       └─ xAI API (fallback)
  ↓
Chat / Imagine
  ↓
SHTORA VPS
  ├─ Storage
  └─ Database
       ↓
   Visual Memory
~~~

## Архитектурный принцип

**Shtora owns the world. Grok provides intelligence and generation.**

VPS хранит реальность Shtora. Grok её интерпретирует и генерирует контент.
