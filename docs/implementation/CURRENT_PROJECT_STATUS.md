# Shtora — текущий статус проекта

> Живой handoff-документ для плавного продолжения работы между чатами.
> Правило: при каждом существенном изменении проекта дописывать сюда текущий статус, решения, изменения и следующие шаги.

## Дата последнего обновления

2026-10-08

## Текущая рабочая ветка

**release/grok-build-functional**

Это подготовленная ветка релиза для передачи в Grok Build.
main не изменяется. Исходная экспериментальная ветка test/vps-grok-imagine также не изменяется.

## Цель

Получить рабочую ветку Shtora, которую можно передать в Grok Build для публикации:

- Instagram-подобная лента + общение с персонажем;
- личный чат;
- Imagine Studio;
- Dropbox/хранилище;
- существующие Settings;
- существующий просмотр фото;
- новые полезные функции и инфраструктура без лишнего showroom/preview-кода и без ненужного редизайна;
- VPS → опубликованный Grok Build для Chat/Imagine, где это предусмотрено архитектурой.

## Что уже сделано в release/grok-build-functional

### Очищено от preview/showroom

Удалены экспериментальные элементы GitHub Pages/showroom:

- .github/workflows/preview-pages.yml
- preview/index.html
- src/components/preview-home.tsx
- src/components/search-sheet.tsx
- src/components/welcome-screen.tsx
- src/lib/static-preview.ts
- docs/implementation/UI_PREVIEW.md

Восстановлены из main:

- src/routes/index.tsx
- src/styles.css
- vite.config.ts
- package.json

### UI очищен от дублирования

Для релизной версии оставлены существующие рабочие компоненты из main:

- src/components/post-viewer.tsx — основной просмотрщик фото;
- src/components/settings-sheet.tsx — существующие настройки.

Удалён экспериментальный дубликат:

- src/components/shtora-media-viewer.tsx

Принцип: не заменять рабочие текущие экраны экспериментальными компонентами без отдельной проверки.

### VPS / Grok / Imagine

В ветке сохранена архитектура:

**Телефон → Shtora VPS → опубликованный Grok Build → xAI через серверный доступ Grok Build**

Для VPS Imagine:

1. VPS определяет, что приложение работает на VPS.
2. Imagine gateway вызывает callGrokApp("imagine", ...).
3. VPS отправляет запрос на опубликованный grok.me origin.
4. Передаётся серверный X-Shtora-Key.
5. Published Build обрабатывает op: "imagine".
6. На стороне Published Build runningOnVps() === false, поэтому используется доступный там XAI_API_KEY.
7. Результат изображения возвращается обратно через VPS.

Важно: архитектурный контракт реализован, но реальный end-to-end вызов опубликованного Build с Imagine ещё нельзя считать подтверждённым только по коду.

### Chat

На VPS Chat также должен идти через опубликованный Grok Build. На стороне публикации запрос проходит через существующий chat backend.

### Persistence / state

Сохранены полезные серверные слои:

- persistent chat threads;
- visual memory;
- generation jobs;
- world state/events;
- snapshots;
- VPS/local routing;
- atomic writes;
- queued writes;
- message deduplication;
- миграция старого world state.

## Что важно не сломать

1. Не менять main без отдельной необходимости.
2. Не возвращать preview/showroom UI в релиз.
3. Не добавлять второй photo/media viewer поверх существующего post-viewer.tsx.
4. Не добавлять новую Settings-страницу вместо существующего settings-sheet.tsx.
5. Не переносить пользовательские Grok cookies/session на VPS.
6. Не просить и не коммитить XAI_API_KEY.
7. Не считать VPS → Build → Imagine подтверждённым end-to-end без фактического теста.
8. Не делать новый дизайн/новые экраны, если задача не поставлена явно.

## Текущая проверка

Quality workflow был настроен так, чтобы запускаться для release/** и выполнять:

- npm ci
- npm run typecheck
- npm run lint
- npm test

Commit с этим изменением: 3e7622f.

На момент последней проверки GitHub Actions не показал ни одного workflow run для release-ветки, поэтому утверждать, что тесты прошли, нельзя.

Локальный clone для запуска тестов также не удалось выполнить из-за отсутствия сетевого доступа к GitHub в рабочей среде.

## Последний известный HEAD

Последний известный HEAD перед созданием этого документа:

3e7622fee2f55057eefe47f983ed9da04ac32179

## Следующие шаги

### Приоритет 1 — реальная проверка

Проверить:

- typecheck;
- lint;
- unit/script tests;
- build;
- запуск приложения;
- VPS → Published Grok Build Chat;
- VPS → Published Grok Build Imagine.

### Приоритет 2 — state consistency

Проверить, что:

- chat thread;
- world state;
- visual memory;
- generation jobs;
- snapshots;
- Dropbox/файлы

не расходятся после генерации, перезапуска и повторного открытия приложения.

### Приоритет 3 — финальная архитектурная ревизия

Перед публикацией убедиться, что в release нет случайно оставшихся экспериментальных UI/preview-компонентов и что все новые функциональные изменения действительно нужны приложению.

---

# Журнал изменений

## 2026-10-08

- Создан этот persistent handoff-документ для продолжения работы в новых чатах.
- Зафиксирована рабочая ветка release/grok-build-functional.
- Зафиксировано, что main и test/vps-grok-imagine не должны изменяться без отдельного решения.
- Зафиксировано состояние после очистки preview/showroom и удаления дублирующего media viewer.
- Зафиксирован текущий статус VPS/Grok/Imagine: архитектура собрана, end-to-end ещё требует фактического теста.
- Зафиксировано состояние GitHub Actions: workflow для release/** существует, но фактических runs пока нет.
- Зафиксированы ближайшие проверки: quality, build, E2E VPS/Grok/Imagine и consistency состояния.
