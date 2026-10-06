
# ТП: Visual Continuity & World Engine

## 1. Цель

Добавить в Shtora слой визуальной непрерывности, благодаря которому фотографии персонажа становятся частью одного непрерывного мира.

> Фото — это наблюдение за состоянием персонажа и мира, а не независимая генерация.

## 2. Проблема

В проекте уже есть lastPhotoUrl, place, clothes, hair, camera modes, image generation, persona/context и media messages.

Но photo intent, routing и generation слишком тесно связаны. Это усложняет:

~~~text
селфи
→ повернись боком
→ теперь со спины
~~~

и:

~~~text
Я сейчас лежу в ванной.
→ Скинь фотку.
~~~

## 3. Сущности

- PhotoIntent — что хочет пользователь.
- VisualContext — актуальный визуальный контекст.
- VisualMemory — сохранённая фотография и metadata.
- Scene — группа фотографий одного визуального состояния.

## 4. PhotoIntent

~~~text
mode:
  continue | new_scene | pov | memory | gallery | none

reference:
  last_photo | identity | world | visual_memory

camera:
  selfie | mirror | side | back | full | pov | candid | gallery

changes?: string[]
scene?: string
clothes?: string
memoryQuery?: string
~~~

## 5. Scene lifecycle

Сохраняем sceneId при изменении только:

- ракурса;
- camera;
- количества фотографий;
- selfie/side/back/full/POV в рамках текущего состояния.

Создаём новый sceneId при явном изменении:

- места;
- одежды;
- активности;
- существенного временного контекста.

## 6. Intent Resolver

Новый модуль: src/lib/chat/photo-intent.ts

Layer 1 — deterministic:
- селфи;
- боком;
- со спины;
- во весь рост;
- в зеркало;
- от первого лица.

Layer 2 — structured LLM:
- "покажи, как ты сейчас лежишь";
- "сделай ещё одну как ту";
- "сфоткайся в зеркале";
- "покажи ноги".

LLM возвращает только structured intent. Side effects выполняет приложение.

## 7. Reference policy

CONTINUE:
previous photo + identity + current scene/world.

NEW_SCENE:
identity + new world/scene.

POV:
world + optional previous photo.

MEMORY:
visual memory search + selected memory.

GALLERY:
возвращает найденные VisualMemory без обязательной генерации.

## 8. Parent chain

Для A → B → C:

~~~text
B.parentId = A.id
C.parentId = B.id
~~~

Это позволяет восстанавливать визуальную цепочку.

## 9. Generation flow

~~~text
message
  ↓
intent resolver
  ↓
scene/world resolution
  ↓
reference selection
  ↓
source selection
  ↓
prompt compiler
  ↓
image provider
  ↓
persist
  ↓
VisualMemory
~~~

Ordinary chat должен завершаться до этого pipeline.

## 10. Anti-repeat

Хранить минимум:

- source path;
- outfit description;
- place;
- sceneId;
- camera;
- createdAt.

При выборе source:

~~~text
eligible sources
  − recently used sources
  − invalid media
  ↓
candidate pool
~~~

Не полагаться только на seed/random.

## 11. Failure handling

Generation failure не должен:

- создавать fake VisualMemory;
- менять world state;
- считать source успешно использованным;
- менять relationship state.

Retryable errors сохраняют тот же jobId.

## 12. MVP

Поддержать:

1. sequential camera changes;
2. scene lifecycle;
3. VisualMemory persistence;
4. deterministic intent resolver;
5. POV;
6. anti-repeat source selection;
7. safe generation failure.

Structured semantic resolver and rich memory search can follow after deterministic path is stable.
