# help-prepared-event: план реализации и решения

Транзиентный спутник [`spec.md`](spec.md). Живёт до закрытия задачи; после merge либо удаляется,
либо уезжает в `specs/done/help-prepared-event/plan.md` как архив развития.

## 1. План реализации

### Этап 0. Спецификация

- Шаги: создать `specs/help-prepared-event/spec.md` + `plan.md`.
- Gate: согласование с мейнтейнером (salexdv) по контракту нового `EVENT_*` → статус `approved`.
- Оценка: малая.

### Этап 1. Код

- Шаги:
  - `src/help/service.js`: добавить параметр `onPrepared` в `parseRequest`, `parse`,
    `parseTransferred`; в `progress(response)` в ветке `response.type == 'prepared'`, после
    `assignPackage(result, true)`, обновления `provisionalByKind`, `parseBarriers` и финального
    `notify()` вызвать `if (onPrepared) onPrepared(result.kind);`.
  - `src/help/index.js`: `helpBrowser.parse(source, onPrepared)` и
    `helpBrowser.parseTransferred(onPrepared)` пробрасывают аргумент в `service`.
  - `src/editor.js`: в `parseHelp` собрать `onPrepared = function (kind) { ... sendEvent(...) }`
    и передать в `helpBrowser.parse`/`helpBrowser.parseTransferred`; READY-блок в `.then` без
    изменений.
- Gate: ручная проверка в DevTools (`window.sendEvent` перехват, `parseHelp(base64)`) —
  PREPARED приходит раньше READY.
- Оценка: малая.

### Этап 2. Тесты

- Шаги: в `tools/run_help_headless.js` расширить перехват `sendEvent` до
  `EVENT_ON_HELP_PREPARED`; вести единый упорядоченный лог `__helpSignals` с `seq`; в сценарии
  `dual` фиксировать `preparedAfter*` на тех же точках, что и `eventsAfter*`; проверить:
  - `preparedEvents.length == 5`, kinds `['context','query','dcs','context','query']`;
  - счётчики `preparedAfterFirst==3`, `preparedAfterRepeat==4`, `preparedAfterFailure==4`,
    `preparedAfterRepeatedLanguage==4`, `preparedAfterRepeatedQuery==5`;
  - `shlang` и `failedContext` не порождают PREPARED;
  - для каждого READY найдётся PREPARED с тем же `kind` и меньшим `seq`.
- Gate: `npm run build:headless && npm run test:headless` зелёные; `npm run build:test &&
  npm run test:mocha` зелёные.
- Оценка: средняя.

### Этап 3. Документация

- Шаги: новый `docs/help_prepared_event.md` (по образцу `help_ready_event.md`); обновить
  `docs/help_browser.md` (абзац после `:167`), `README.md` (строка таблицы после `:312`).
- Gate: ревью формулировок.
- Оценка: малая.

### Этап 4. Финальные проверки

- `npm test`, `npm run escheck`, `npm run build` — все зелёные.

### Риски и снижение

- **Новый `EVENT_*` в публичном контракте моста** — требует согласования с salexdv до `approved`
  (`CLAUDE.md:120`). До согласования код не пишем.
- **Orphan PREPARED** — 1С может получить PREPARED без READY. Снижение: явная фиксация в
  `docs/help_prepared_event.md` и `spec.md`; 1С-обработчик должен считать PREPARED «вероятной
  готовностью» и не полагаться на обязательный READY.
- **Двойной сигнал для режима `bsl`** при загрузке context+language — отсутствует, `language`
  исключён намеренно.
- **Регресс headless-тестов** — счётчики READY не меняются; добавлены параллельные инварианты
  PREPARED и проверка порядка по `seq`.
- **ES-floor ES2015** — новый код тривиален (колбэк, сравнения строк), рисков нет; проверяется
  `npm run escheck`.

## 2. Открытые вопросы

- Подтвердить у salexdv ввод нового события `EVENT_ON_HELP_PREPARED` и orphan-PREPARED семантику.

## 3. Решения

| Дата | Решение | Причина |
| --- | --- | --- |
| 2026-08-19 | Ввести отдельное событие `EVENT_ON_HELP_PREPARED` | `EVENT_ON_HELP_READY` привязан к финалу полнотекстовой индексации; ранний сигнал нужен 1С для доступа к индексу/оглавлению через 4-5 с, а не через 20-25 с |
| 2026-08-19 | Gating PREPARED зеркалит READY: только `context`/`query`/`dcs` | Единый набор kinds для обоих событий; `shlang` и ошибки не сигналят; 1С не различает «раньше/позже» по kind |
| 2026-08-19 | Проброс через `onPrepared`-колбэк, а не через `window` в сервисе | Сервис не знает про `window.sendEvent`; сохраняется разделение слоёв (как у READY) |
| 2026-08-19 | Orphan PREPARED не отзывается | Отзыв усложнил бы контракт и 1С-обработчик; проще зафиксировать «PREPARED не гарантирует READY» |
| 2026-08-19 | `EVENT_ON_HELP_READY` не трогается | Стабильный контракт `specs/help-ready-kinds/`; счётчики и порядок в headless-тесте остаются прежними |
| 2026-08-19 | Воркеры не трогаются | Сообщение `prepared` уже отправляется `help_worker.js:197` |
