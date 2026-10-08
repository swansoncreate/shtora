# Текущая реализация Shtora: Grok Build, Chat и Imagine

> Зафиксировано в \`main\` по состоянию на текущую реализацию проекта и по полному архиву рабочего пространства, скачанному из Grok Build.
>
> Этот документ **только описывает текущую архитектуру**. Он не меняет Chat, Imagine, VPS bridge или UI.

## 1. Краткий вывод

Сейчас Shtora использует не браузерную сессию пользователя Grok и не передаёт в клиент секретный ключ.

В Grok Build платформа предоставляет серверному приложению переменную окружения:

\`XAI_API_KEY\`

Документация внутри самого Build workspace прямо говорит:

- \`XAI_API_KEY\` injected by the platform;
- переменная доступна и в preview, и после Publish;
- ключ server-only;
- вызовы через этот ключ расходуют quota/credits владельца приложения;
- тот же доступ используется для Chat/LLM, Imagine image/video и Voice.

В скачанном workspace файл \`.env\` содержит только:

- \`SHTORA_RPC_KEY\`
- \`SHTORA_VPS_ORIGIN\`

Сам \`XAI_API_KEY\` в проектный \`.env\` не записан.

Рабочая схема Grok Build:

~~~text
Пользователь
    ↓
Опубликованное Shtora / Grok Build
    ↓
серверный код Shtora
    ↓
process.env.XAI_API_KEY
    ↓
https://api.x.ai/v1
    ├── Chat / LLM
    ├── Imagine image
    └── Imagine video
~~~

Это отличается от схемы «Shtora использует cookie/браузерную сессию сайта grok.com».

---

## 2. Откуда берётся XAI_API_KEY

В скачанном Grok Build workspace находится:

\`/.grok/skills/xai-api/SKILL.md\`

В нём описано:

~~~text
XAI_API_KEY — Injected by the platform (preview and deploy)
~~~

и указано, что приложение должно читать его только на сервере через:

~~~ts
process.env.XAI_API_KEY
~~~

Сам ключ нельзя писать в исходники, запрашивать у пользователя или отдавать браузеру.

В \`AGENTS.md\` того же workspace дополнительно указано, что \`XAI_API_KEY\` — это реальный server-only xAI access, расходы которого относятся к quota владельца приложения.

Это наиболее прямое подтверждение механизма доступа, которое сейчас есть в самом Build workspace.

### Важное уточнение

Из этих файлов нельзя определить внутреннюю коммерческую механику Grok/xAI на уровне тарифа (например, какая именно часть лимита подписки отображается как quota). Но технически установлено:

**Shtora не получает ключ из репозитория и не использует отдельный ключ, сохранённый нами в .env; ключ инжектируется платформой Grok Build.**

---

## 3. Текущий Chat

Основной код характера и состояния диалога:

\`src/lib/chat/brain.server.ts\`

\`CharacterBrain.reply()\`:

1. получает историю лички;
2. учитывает состояние связи персонажа;
3. определяет контекст, одежду, место, настроение и запрос на фото;
4. формирует system prompt;
5. добавляет историю сообщений;
6. вызывает \`completeChat()\`;
7. получает JSON-ответ;
8. разбирает \`bubbles/photo/scene/place/clothes/hair/mood/mem/heart\`;
9. обновляет состояние диалога.

Для Grok создаётся маршрут:

~~~text
URL:
https://api.x.ai/v1/chat/completions

Authorization:
Bearer <XAI_API_KEY>

Models:
grok-4-fast-non-reasoning
grok-4.6
grok-4.5
grok-3
~~~

Ключ читается из:

~~~ts
process.env.XAI_API_KEY
~~~

Код также умеет работать с OpenRouter при наличии пользовательского \`chatApiKey\`. При обычном режиме без OpenRouter key Grok является основным маршрутом; при \`chatEngine === "grok"\` Grok ставится первым.

---

## 4. HTTP-маршрут Chat

Точка:

\`src/routes/api/grok-chat.ts\`

Операции:

- \`reply\`
- \`ping\`

Путь:

~~~text
/api/grok-chat
      ↓
src/lib/dm/chat
      ↓
replyDm / pingDm
      ↓
Chat brain
      ↓
xAI API
~~~

Для legacy-пользователей сохраняется старый путь через \`src/lib/chat/brain.server.ts\`.

Маршрут проверяет RPC-доступ через серверные helpers из \`src/lib/server/remote\`. Этот RPC key не является xAI API key.

---

## 5. Текущий Imagine — изображения

Основной код:

\`src/lib/imagine/functions.ts\`

Ключ:

~~~ts
const apiKey = process.env.XAI_API_KEY;
~~~

Если ключ отсутствует, Imagine возвращает состояние недоступности.

### Image Edit

Основной endpoint:

~~~text
POST https://api.x.ai/v1/images/edits
~~~

Модель:

~~~text
grok-imagine-image-2.0
~~~

Поддерживаются:

- исходное изображение;
- дополнительные reference images;
- режим identity;
- режим compose;
- aspect ratio \`1:1\` или \`9:16\`;
- текстовый prompt.

В identity/compose режиме код может передавать до трёх изображений.

### Контроль частоты

Внутри Imagine есть:

- последовательная очередь запросов;
- cooldown после HTTP 429;
- ограничение размера data URL;
- повтор запроса;
- понятные ошибки для quota/credits/rate limit/moderation.

---

## 6. Сохранение результата Imagine

После успешного ответа xAI:

1. Shtora получает URL/base64 результата;
2. сохраняет remote image через \`persistRemoteImage()\`;
3. приводит результат к browser media URL;
4. сохраняет элемент в Imagine Studio;
5. возвращает URL/id клиенту.

xAI отвечает за генерацию, Shtora — за хранение результата и историю Studio.

---

## 7. Imagine Video

Файл:

\`src/lib/imagine/video.ts\`

Ключ также:

~~~ts
process.env.XAI_API_KEY
~~~

Используются:

~~~text
POST /v1/videos/generations
POST /v1/videos/edits
POST /v1/videos/extensions
GET  /v1/videos/:requestId
~~~

Основные модели:

~~~text
grok-imagine-video-1.5
grok-imagine-video
~~~

Схема:

~~~text
start generation
      ↓
requestId
      ↓
poll /v1/videos/:requestId
      ↓
video URL
      ↓
persist result
~~~

---

## 8. Что происходит на VPS сейчас

Это принципиально важно.

В текущем \`main\` VPS **не получает XAI_API_KEY автоматически** от Grok Build.

### Chat

\`src/lib/server/grok-app.ts\` умеет отправлять RPC на опубликованный Grok Build:

~~~text
VPS
 ↓
configured Grok origin
 ↓
https://<publication>.grok.me/api/grok-chat
 ↓
XAI_API_KEY внутри Grok Build
 ↓
xAI
~~~

Но в текущем \`main\` \`callGrokApp()\` поддерживает только:

- \`reply\`
- \`ping\`

То есть bridge — для Chat.

### Imagine

В текущем \`main\` при запуске Imagine на VPS код не выполняет локальный xAI вызов. Вместо этого возвращается сообщение:

~~~text
Imagine считается на публикации Grok, не на VPS.
~~~

Следовательно, **полноценного Imagine RPC bridge в текущем main ещё нет.**

---

## 9. Что уже есть для Grok → VPS bridge

В \`src/lib/server/grok-app.ts\` есть:

- хранение Grok publication origin;
- чтение \`SHTORA_GROK_ORIGIN\`;
- fallback через \`grok-origin.txt\`;
- RPC key;
- POST на \`/api/grok-chat\`;
- timeout 90 секунд;
- обработка ошибок.

Текущий контракт:

~~~ts
callGrokApp<T>(op: "reply" | "ping", data: unknown)
~~~

Это нужно сохранять при дальнейших изменениях.

---

## 10. Что было сделано на experimental branch

На ветке:

\`test/vps-grok-imagine\`

ранее была добавлена попытка расширить bridge операцией:

~~~text
op = "imagine"
~~~

и направлять Imagine через опубликованный Grok Build.

Это эксперимент, а не часть текущего \`main\`.

Сам факт наличия такого bridge **не доказывает**, что опубликованный Grok Build разрешает внешнему VPS использовать его platform-injected xAI access. Это требует end-to-end проверки.

---

## 11. Что доказано сейчас

### Доказано Build workspace

- \`XAI_API_KEY\` приходит от Grok Build platform.
- Он server-only.
- Он доступен в preview/deploy.
- Он используется для xAI API.
- Он покрывает Chat/LLM, Imagine image/video и Voice.
- Проектный \`.env\` не содержит этот ключ.
- Проект не должен самостоятельно создавать или хранить этот ключ.

### Доказано работой приложения

В опубликованном Shtora реально работают:

- Chat;
- Imagine.

Это соответствует описанной Build-схеме.

### Пока НЕ доказано

Не доказано, что:

- VPS может напрямую получить injected key;
- опубликованный Build разрешает внешнему VPS использовать его xAI access для произвольного RPC;
- внешний RPC автоматически имеет тот же контекст, что обычный вызов внутри опубликованного приложения;
- consumer web session/cookies Grok могут или должны использоваться вместо API access.

Поэтому cookies/session пользователя на VPS переносить не следует.

---

## 12. Архитектурный вывод

Рабочую Build-схему сейчас менять не нужно.

~~~text
                         ┌─────────────────────┐
                         │     Grok Build      │
                         │                     │
                         │ injected XAI key    │
                         │         ↓           │
                         │      xAI API        │
                         └─────────┬───────────┘
                                   │
                         Chat / Imagine
                                   │
                                   ▼
                              Shtora app


                         ┌─────────────────────┐
                         │        VPS          │
                         │                     │
                         │ storage / Dropbox   │
                         │ app data / routing  │
                         └─────────┬───────────┘
                                   │
                         secure RPC to publication
                                   │
                                   ▼
                         ┌─────────────────────┐
                         │     Grok Build      │
                         │     RPC endpoint    │
                         └─────────────────────┘
~~~

Build остаётся местом, где находится platform-injected xAI access.

---

## 13. Что НЕ следует делать

1. Не добавлять \`XAI_API_KEY\` в Git.
2. Не переносить ключ в клиент.
3. Не просить пользователя прислать ключ.
4. Не копировать cookies/session Grok на VPS.
5. Не заменять рабочий Build Chat/Imagine отдельным API без необходимости.
6. Не ломать существующий VPS bridge ради эксперимента.
7. Не считать experimental \`test/vps-grok-imagine\` доказанно рабочим до end-to-end проверки.

---

## 14. Следующий технический шаг

Перед изменениями в \`main\` нужно отдельно проверить experimental bridge:

~~~text
VPS
  ↓
POST /api/grok-chat
  ↓
published Grok Build
  ↓
op = imagine
  ↓
process.env.XAI_API_KEY
  ↓
api.x.ai
  ↓
image
~~~

Нужно подтвердить не только HTTP 200, но и фактическое получение изображения.

Только после этого можно решать, переносить ли Imagine bridge в \`main\`.

---

## Источники реализации

Build workspace:

- \`.grok/skills/xai-api/SKILL.md\`
- \`.grok/references/deploy-target.md\`
- \`AGENTS.md\`
- \`.env\`

Shtora:

- \`src/lib/chat/brain.server.ts\`
- \`src/lib/chat/functions.ts\`
- \`src/lib/imagine/functions.ts\`
- \`src/lib/imagine/video.ts\`
- \`src/lib/imagine/persist.server.ts\`
- \`src/lib/server/grok-app.ts\`
- \`src/routes/api/grok-chat.ts\`

**Статус: описание текущей реализации, не план будущей архитектуры.**
