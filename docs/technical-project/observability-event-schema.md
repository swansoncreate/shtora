# Схема событий сквозной диагностики Shtora

Связанный документ: [Проект трассировки](./observability-tracing.md).

## 1. Обязательные поля

| Поле | Тип | Назначение |
|---|---|---|
| `schemaVersion` | integer | Версия схемы события |
| `timestamp` | ISO-8601 UTC | Время для сопоставления систем |
| `monotonicMs` | number | Время от старта процесса/операции для точных длительностей, если доступно |
| `level` | enum | `debug`, `info`, `warn`, `error` |
| `event` | string | Стабильное имя события, например `prompt.finalized` |
| `traceId` | string | Сквозной ID сценария |
| `spanId` | string | ID текущего этапа |
| `parentSpanId` | string/null | ID родительского этапа |
| `operationId` | string | ID пользовательской операции |
| `scenario` | enum | `feed`, `chat`, `imagine`, `settings`, `host` |
| `runtime` | enum | `browser`, `server`, `grok-build`, `host-probe` |
| `code.file` | string | Путь исходника относительно корня проекта |
| `code.function` | string | Имя функции или `anonymous` с пояснением |
| `code.line` | integer/null | Строка исходника для текущего build/commit |
| `build.commit` | string | Git SHA, на котором выполнялся код |
| `stage` | string | Группа этапа |
| `status` | enum | `started`, `ok`, `error`, `skipped`, `timeout`, `cancelled` |
| `durationMs` | number/null | Длительность этапа |
| `input` / `output` | object | Безопасное описание данных на границе |
| `metrics` | object | Счётчики и временные показатели |
| `error` | object/null | Тип, код, безопасное сообщение и место возникновения |

## 2. Политика описания значений

Каждое поле JSON классифицируется одним из режимов:

- `metadata_only`: только наличие, тип, длина, размер, количество элементов и хеш.
- `allowlisted_value`: разрешено записывать значение по явному allowlist (например, модель или aspect ratio).
- `redacted_preview`: ограниченный preview после редактирования, только в диагностическом режиме.
- `never_log`: секреты, токены, cookies, ключи, пароли, signed URL, бинарные данные и другие запрещённые поля.

Не разрешать значения только потому, что имя поля не совпало с blacklist. Для JSON использовать рекурсивный allowlist/классификатор с ограничением глубины, количества ключей и размера события.

### Пример описания поля

```json
{
  "name": "prompt",
  "type": "string",
  "present": true,
  "length": 524,
  "utf8Bytes": 538,
  "sha256": "hash-of-normalized-value",
  "captureMode": "redacted_preview",
  "preview": "ограниченный отредактированный фрагмент..."
}
```

В production preview может отсутствовать при выключенном режиме подробной диагностики. Хеш не заменяет проверку содержимого, но помогает сравнить этапы без повторной записи текста.

## 3. Пример начала и окончания span

```json
{"schemaVersion":1,"timestamp":"2026-10-08T12:00:00.000Z","level":"info","event":"prompt.finalized","traceId":"trace-example","spanId":"span-prompt","parentSpanId":"span-feed","operationId":"op-example","scenario":"feed","runtime":"server","code":{"file":"src/example.ts","function":"finalizePrompt","line":123},"build":{"commit":"<git-sha>"},"stage":"prompt","status":"ok","durationMs":4,"output":{"fields":{"prompt":{"type":"string","length":524,"sha256":"<hash>","captureMode":"metadata_only"},"model":{"type":"string","value":"<allowlisted-model>"}}}}
{"schemaVersion":1,"timestamp":"2026-10-08T12:00:00.100Z","level":"info","event":"upstream.request.finished","traceId":"trace-example","spanId":"span-http","parentSpanId":"span-feed","operationId":"op-example","scenario":"feed","runtime":"server","code":{"file":"src/example.ts","function":"callGenerator","line":180},"build":{"commit":"<git-sha>"},"stage":"upstream","status":"ok","durationMs":96,"network":{"method":"POST","destination":"https://host.example/api/generate","httpStatus":200,"requestBytes":1024,"responseBytes":4096},"metrics":{"attempt":1,"ttfbMs":64,"bodyReadMs":20}}
```

Примеры синтетические, не содержат реальные данные Shtora.

## 4. Каталог рекомендуемых событий

### Корреляция и вход
- `operation.started`
- `api.request.received`
- `api.request.validated`
- `api.request.rejected`

### Контекст и промпт
- `context.load.started`
- `context.load.finished`
- `prompt.draft.created`
- `prompt.finalized`
- `prompt.request_match.checked`

### JSON и транспорт
- `json.serialize.started`
- `json.serialize.finished`
- `upstream.request.started`
- `upstream.response.headers`
- `upstream.response.body`
- `json.parse.finished`
- `schema.validation.finished`

### Изображение и сохранение
- `image.result.resolved`
- `image.metadata.read`
- `post.object.created`
- `post.persist.started`
- `post.persist.finished`
- `chat.message.persist.started`
- `chat.message.persist.finished`
- `thread.update.finished`
- `result.visible`

### Ошибки и завершение
- `retry.scheduled`
- `stage.timeout`
- `stage.cancelled`
- `stage.failed`
- `operation.finished`

## 5. Счётчики и единицы измерения

- Время: миллисекунды, единый суффикс `Ms`.
- Размеры: байты, единый суффикс `Bytes`; при отображении допускается форматирование в KiB/MiB.
- Количество: целое неотрицательное число.
- Длительности считать по монотонным часам, не вычитать UTC timestamps для performance.
- HTTP status — целое число; сетевые ошибки — отдельная категория, не фиктивный HTTP-код.
- Процент успешности и percentiles рассчитывать по агрегированным данным, не по высококардинальным меткам.
- У всех агрегированных метрик должны быть окно времени и количество наблюдений.

## 6. Правила безопасности и качества

- Ограничивать глубину JSON, число полей, длину строк и общий размер одного события.
- Редактировать query параметры URL и любые заголовки, кроме allowlist.
- Нормализовать переводы строк, чтобы исключить подделку JSONL-событий.
- Не включать prompt/chat text в имена метрик, labels, event names или URL.
- Записывать хеш только для нормализованного содержимого и явно указывать алгоритм.
- В тестах проверять типовые секреты в заголовках, JSON, prompt и ошибках upstream.
- Ошибка диагностики должна быть отдельной ошибкой журналирования и не должна подменять ошибку бизнес-операции.
