# Shtora — Grok Build release branch

Ветка: `release/grok-build-functional`

Это production-кандидат для публикации через Grok Build.

## Что входит

- VPS → опубликованный Grok Build routing для Chat.
- VPS → опубликованный Grok Build routing для Imagine.
- RPC-аутентификация между VPS и публикацией.
- Visual/Scene engine: продолжение кадров, новые сцены, POV, visual memory и generation jobs.
- История источников для снижения повторов Dropbox-кадров.
- Планирование реалистичных сцен: место, время, погода, одежда и поза без намеренного повторения.
- Сохранение/восстановление состояния Chat, Imagine и visual data.
- Существующие Instagram, личка, Dropbox, Imagine и Settings.
- Улучшения viewer/media flow из функциональной ветки.

## Что специально убрано

- GitHub Pages showroom/preview.
- Static preview seed data.
- Preview-only navigation/search/welcome screens.
- Отдельный Pages workflow.

## Важно

Публиковать именно эту ветку целиком. Не переносить в неё обратно preview/showroom-компоненты.

VPS должен иметь свои серверные переменные `SHTORA_GROK_ORIGIN` и `SHTORA_RPC_KEY`. Секреты в клиентский код не выносятся.

Для Imagine на VPS цепочка такая:

`Shtora VPS → /api/grok-chat на опубликованном Grok Build → Imagine → VPS → Shtora`.

Никакие пользовательские cookies/сессии браузера Grok на VPS не копируются.
