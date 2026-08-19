# help-ready-kinds: план реализации и решения

Транзиентный спутник [`spec.md`](spec.md). Живёт до закрытия задачи; после merge либо удаляется,
либо уезжает в `specs/done/help-ready-kinds/plan.md` как архив развития.

## 1. План реализации

Спека невелика, кодовая правка точечная. Этапы:

### Этап 0. Спецификация

- Шаги: создать `specs/help-ready-kinds/spec.md` + `plan.md`; уточнить `specs/help-browser/spec.md`
  и `plan.md`.
- Gate: контракт одобрен явным решением пользователя; спека переведена в `in-progress` до merge.
- Оценка: малая.

### Этап 1. Код

- Шаги: в `src/editor.js:116-123` расширить условие с `result.kind == 'context'` до
  `result.kind == 'context' || result.kind == 'query' || result.kind == 'dcs'`; добавить payload
  `{ kind: result.kind }` в `window.sendEvent`.
- Gate: ручная проверка в DevTools (`window.events_queue` после `parseHelp(shqueryBase64)`).
- Оценка: малая.

### Этап 2. Тесты

- Шаги: в `tools/run_help_headless.js` пересчитать ожидаемые счётчики событий
  (`eventsAfterFirst`, `eventsAfterRepeat`, `eventsAfterFailure`, `eventsAfterRepeatedLanguage`,
  `eventsAfterRepeatedQuery`); расширить captured-объект полем `kind` и проверить последовательность
  `['context','query','dcs','context','query']` (5 событий: 2 context, 2 query, 1 dcs); повторная
  загрузка `dcsui` вынесена в отдельный evaluate-блок в конце теста (после всех UI-сценариев), т.к.
  её выполнение внутри основного блока приводило к побочному влиянию на последующий поиск по индексу
  (таймаут `waitForFunction` для «Число»); отдельный блок проверяет `{ok,kind:'dcs',kinds:['dcs']}`.
- Gate: `npm run build:headless && npm run test:headless` зелёные; `npm run build:test &&
  npm run test:mocha` зелёные.
- Оценка: средняя (точечная, но потребовала локализации побочного эффекта).

### Этап 3. Документация

- Шаги: обновить `docs/help_ready_event.md` (назначение + параметры), `docs/help_browser.md:168`,
  `README.md:312`.
- Gate: ревью формулировок.
- Оценка: малая.

### Этап 4. Финальные проверки

- Целевые проверки этой работы: `npm test`, `test:query-model-service`, `test:help`, `build:test`,
  `test:mocha`, `build`, `test:help:headless`, `test:headless`, `build:single`, `build:pack`, `escheck`
  и `git diff --check`.

### Риски и снижение

- **Изменение публичного контракта `EVENT_*`** — текущий контракт `{kind}` явно одобрен
  пользователем; до merge статус остаётся `in-progress`.
- **Двойной сигнал для режима `bsl`** при загрузке context+language — отсутствует, т.к. `language`
  исключён намеренно.
- **Регресс headless-тестов** — счётчики пересчитаны, порядок событий зафиксирован
  (context → language(нет) → query → dcs → repeatedContext → repeatedQuery → repeatedDcs).
- **Обратная совместимость 1С** — 1С-сторона, не читающая `params`, продолжает работать
  (диспетчеризация по имени события, params опционален); 1С, ожидавшая пустой params, получит
  объект `{kind}` вместо `undefined`; совместимость обработчика 1С с непустым `params` включена
  в одобренное решение.

## 2. Открытые вопросы

Нет.

## 3. Решения

| Дата | Решение | Причина |
| --- | --- | --- |
| 2026-08-19 | Расширить `EVENT_ON_HELP_READY` на `shquery` и `dcsui` | 1С не получает сигнала готовности справки в режимах `bsl_query`/`dcs_query` при загрузке только профильного пакета |
| 2026-08-19 | Payload — объект `{kind:'context'\|'query'\|'dcs'}` | Соответствует конвекции `EVENT_GET_DEFINITION`/`EVENT_ON_GET_HELP` (именованные поля) и расширяемо; 1С различает источник события |
| 2026-08-19 | `shlang` (language) НЕ шлёт событие | Режимы `bsl`/`xml` используют `context`+`language`; готовность уже обозначается событием для `context`, дублировать через `language` не нужно |
| 2026-08-19 | Событие на каждую успешную загрузку (повторную тоже) | Сохраняет текущее поведение для `context`; 1С видит каждое обновление профильного пакета |
| 2026-08-19 | Сервис `src/help/service.js` не трогать | `result.kind` уже формируется как `'context'\|'language'\|'query'\|'dcs'` в `service.js:375` |
| 2026-08-19 | Ошибки и provisional-откат событие не создают | Соответствует текущей семантике `parseHelp` (событие только при `result.ok === true`) |
| 2026-08-19 | Текущий контракт `{kind}` одобрен пользователем | Подтверждены набор видов, точная форма payload и совместимость обработчика 1С с непустым `params` |
