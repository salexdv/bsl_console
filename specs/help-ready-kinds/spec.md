---
issue: -
title: EVENT_ON_HELP_READY для shquery/dcsui с параметром kind
status: in-progress
owner: opencode
created: 2026-08-19
updated: 2026-08-19
area:
  - мост 1С
  - обвязка редактора
---

# help-ready-kinds: EVENT_ON_HELP_READY для shquery/dcsui с параметром kind

> Issue: нет

Стабильный контракт: что должно быть реализовано и как вызывающий код/пользователь это видит.
Переживает merge, уезжает в `specs/done/help-ready-kinds/spec.md`. Транзиентное (этапы, вопросы,
решения) — в `plan.md`.

## 1. Контекст и проблема

Сегодня `EVENT_ON_HELP_READY` отправляется только после успешной загрузки пакета `shcntx_*.hbk`
(см. `specs/help-browser/spec.md` и `docs/help_ready_event.md`). Режимы редактора `bsl_query` и
`dcs_query` используют профильные пакеты `shquery_*.hbk` и `dcsui_*.hbk` и не требуют `shcntx`.
1С, загрузив только `shquery`, не получает сигнала готовности справки языка запросов и не может
открыть панель / переключить UI синхронно с реальной готовностью профильного пакета.

Кроме того, событие сегодня передаётся без параметров, поэтому 1С не различает, какой именно пакет
стал готов: `context`, `query` или `dcs`. Это затрудняет раздельную обработку готовности в режимах.

Связанные спеки: `specs/help-browser/` (базовая справка и первоначальное событие).

## 2. Область изменений

| Компонент | Тип | Характер изменений |
| --- | --- | --- |
| `src/editor.js` | src | изменить условие триггера `EVENT_ON_HELP_READY` и добавить payload `{kind}` |
| `tools/run_help_headless.js` | тесты | пересчитать счётчики и проверить `params.kind` |
| `docs/help_ready_event.md` | доки | обновить назначение и параметры события |
| `docs/help_browser.md` | доки | обновить фразу про источники события |
| `README.md` | доки | обновить строку таблицы событий |
| `specs/help-browser/spec.md` | спека | уточнить §4 и §5 (стабильный контракт) |
| `specs/help-browser/plan.md` | спека | добавить запись в журнал решений |

Сервис `src/help/service.js` правок не требует: `result.kind` уже принимает значения
`'context' | 'language' | 'query' | 'dcs'` (`service.js:375`).

## 3. Поведение

### 3.1. Основной сценарий

1. Вызывается `window.parseHelp(source)` (или порционная передача + `parseHelp()` без аргументов).
2. Worker разбирает пакет и возвращает результат `{ok, kind, pages, error}`.
3. Если `result.ok === true` и `result.kind` ∈ `{'context', 'query', 'dcs'}`, редактор вызывает
   `window.sendEvent('EVENT_ON_HELP_READY', { kind: result.kind })`.
4. 1С ловит событие как обычно (через `ПриНажатии` скрытой кнопки `#event-button`) и диспетчеризует
   по имени; в `params` приходит объект с единственным полем `kind`.

### 3.2. Граничные случаи

- **Повторная загрузка того же вида** (например, повторный `shcntx` или повторный `shquery`)
  отправляет событие каждый раз — поведение сохраняется как для `context` сегодня.
- **Пакет `shlang` (language)** событие **не** создаёт. Режимы `bsl`/`xml` используют
  `context` + `language`; готовность режима уже обозначается событием для `context`, дублировать
  её через `language` не нужно.
- **Режим `bsl_query`**: активный вид `query`; событие приходит с `{kind:'query'}`.
- **Режим `dcs_query`**: активный вид `dcs`; событие приходит с `{kind:'dcs'}`.
- **Порядок загрузки**: пакеты можно грузить в любом порядке; каждый успешный `context`/`query`/`dcs`
  шлёт событие независимо от `setLanguageMode` на момент загрузки.

### 3.3. Ошибки

- Ошибка разбора пакета (`result.ok === false`) — событие **не** создаётся.
- Откат предварительного (provisional) пакета в `service.js` (rollback) — событие **не** создаётся,
  т.к. `parseHelp` резолвится с `ok:false` либо не резолвится как успех.
- Ошибка worker'а / ошибка передачи Base64 — событие **не** создаётся.

## 4. Контракты

### 4.1. Экспортные функции моста (`window` / `defaultView`)

Изменяется только поведение `window.parseHelp`; сигнатура не меняется.

```js
/**
 * Загружает пакет справки 1С в текущую сессию.
 * При успешной загрузке пакета вида context/query/dcs отправляет
 * EVENT_ON_HELP_READY с payload {kind}.
 * @param {Blob|File|string} [source] файл shcntx_*.hbk/shlang_*.hbk/shquery_*.hbk/dcsui_*.hbk
 * или его Base64-представление;
 * без аргумента используется последняя завершённая порционная передача
 * @returns {Promise<{ok:boolean,kind:string|null,pages:number,error:string|null}>}
 */
window.parseHelp = function (source) { ... }
```

### 4.2. События (`EVENT_*`) / формат обмена с 1С

| Событие / поле | Направление | Payload | Описание |
| --- | --- | --- | --- |
| `EVENT_ON_HELP_READY` | JS → 1С | `{ kind: 'context' \| 'query' \| 'dcs' }` | После каждой успешной загрузки или атомарной замены пакета `shcntx`/`shquery`/`dcsui`; `shlang` и ошибки событие не создают |

Поле `kind` принимает одно из строковых значений `'context'`, `'query'`, `'dcs'`. Другие значения
не предусмотрены. Поля кроме `kind` в payload отсутствуют.

### 4.3. Контракт сборки / доставки

Не меняется. Изменение не затрагивает форматы HBK, сборку, single-file, ES-floor и Blob-worker.

## 5. Критерии приёмки

- [x] `parseHelp` успешного `shcntx` шлёт `EVENT_ON_HELP_READY` с точным payload `{kind:'context'}`.
- [x] `parseHelp` успешного `shquery` шлёт `EVENT_ON_HELP_READY` с точным payload `{kind:'query'}`.
- [x] `parseHelp` успешного `dcsui` шлёт `EVENT_ON_HELP_READY` с точным payload `{kind:'dcs'}`.
- [x] `parseHelp` успешного `shlang` НЕ шлёт событие.
- [x] Повторная загрузка `shcntx`/`shquery`/`dcsui` шлёт событие каждый раз.
- [x] Ошибка разбора и откат provisional-кандидата НЕ шлют READY.
- [x] `tools/run_help_headless.js` покрывает виды, повторы, ошибки, точный payload и порядок событий.
- [x] `npm test`, `test:mocha`, `test:headless`, `escheck` и production-сборки зелёные.
- [x] `docs/help_ready_event.md`, `docs/help_browser.md`, `README.md`,
      `specs/help-browser/spec.md`, `specs/help-browser/plan.md` обновлены.

## 6. Вне области

- Пакет `shlang` (language) событие **не** шлёт — намеренно.
- `EVENT_ON_GET_HELP` и опция `generateGetHelpEvent` не меняются.
- Форматы HBK/сборки/single-file и ES-floor не затрагиваются.
- Сервис `src/help/service.js` правок не требует.
- Новых событий не вводится; меняется только триггер и payload существующего.
