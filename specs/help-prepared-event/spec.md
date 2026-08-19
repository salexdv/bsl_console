---
issue: -
title: EVENT_ON_HELP_PREPARED как ранний сигнал готовности справки
status: in-progress
owner: opencode
created: 2026-08-19
updated: 2026-08-19
area:
  - мост 1С
  - обвязка редактора
---

# help-prepared-event: EVENT_ON_HELP_PREPARED как ранний сигнал готовности справки

> Issue: нет

Стабильный контракт: что должно быть реализовано и как вызывающий код/пользователь это видит.
Переживает merge, уезжает в `specs/done/help-prepared-event/spec.md`. Транзиентное (этапы, вопросы,
решения) — в `plan.md`.

## 1. Контекст и проблема

Разбор HBK в help-worker двухфазный. На фазе `prepared` воркер уже построил оглавление и
префиксный индекс по заголовкам из TOC и опубликовал provisional-пакет в UI — вкладки «Содержание»
и «Индекс» становятся пригодны для поиска через 4-5 секунд после `parseHelp`. Затем запускается
полное извлечение и индексация всех HTML-страниц (`pooledIndex`/`localIndex`), что для больших
`shcntx_ru.hbk` занимает 20-25 секунд. Только после финального сообщения `parsed` promise
`parseHelp` резолвится и редактор отправляет `EVENT_ON_HELP_READY` (`src/editor.js`).

1С, ожидающее `EVENT_ON_HELP_READY` как单一ственный сигнал готовности, всё это время считает
справку неготовой, хотя по индексу уже можно искать. Связанные спеки: `specs/help-browser/`,
`specs/help-ready-kinds/`.

## 2. Область изменений

| Компонент | Тип | Характер изменений |
| --- | --- | --- |
| `src/help/service.js` | src | добавить параметр `onPrepared` в `parseRequest`/`parse`/`parseTransferred`; вызывать его в `progress` на фазе `prepared` |
| `src/help/index.js` | src | пробросить `onPrepared` из `helpBrowser.parse`/`helpBrowser.parseTransferred` |
| `src/editor.js` | src | в `parseHelp` отправлять `EVENT_ON_HELP_PREPARED` с payload `{kind}` через `onPrepared` |
| `tools/run_help_headless.js` | тесты | перехватывать `EVENT_ON_HELP_PREPARED`, проверять `kind`, счётчики и порядок PREPARED→READY |
| `docs/help_prepared_event.md` | доки | новый документ события |
| `docs/help_browser.md` | доки | добавить абзац про ранний сигнал |
| `README.md` | доки | строка таблицы событий |

Воркеры `src/help/help_worker.js` и `src/help/index_worker.js` не затрагиваются: сообщение
`prepared` уже отправляется воркером (`help_worker.js:197`).

## 3. Поведение

### 3.1. Основной сценарий

1. Вызывается `window.parseHelp(source)` (или порционная передача + `parseHelp()` без аргументов).
2. Worker разбирает контейнер HBK и строит ленивый кандидат (оглавление + префиксный индекс
   заголовков); шлёт `prepared` с `packageSummary(candidate)`.
3. Сервис публикует provisional-пакет (`assignPackage(result, true)`, `rebuildIndex`, `notify`) и
   вызывает `onPrepared(result.kind)`.
4. Если `result.kind` ∈ `{'context', 'query', 'dcs'}`, редактор вызывает
   `window.sendEvent('EVENT_ON_HELP_PREPARED', { kind: result.kind })`.
5. 1С ловит событие как обычно (через `ПриНажатии` скрытой кнопки `#event-button`) и
   диспетчеризует по имени; в `params` приходит объект с единственным полем `kind`.
6. После завершения полнотекстовой индексации воркер шлёт `parsed`, promise `parseHelp`
   резолвится, редактор отправляет `EVENT_ON_HELP_READY` с тем же `{kind}` (без изменений).

### 3.2. Граничные случаи

- **Повторная загрузка того же вида** отправляет `EVENT_ON_HELP_PREPARED` каждый раз — поведение
  зеркалит `EVENT_ON_HELP_READY`.
- **Пакет `shlang` (language)** событие **не** создаёт. Режимы `bsl`/`xml` используют
  `context` + `language`; ранний сигнал для `language` не нужен, готовность режима обозначается
  событиями для `context`.
- **Режим `bsl_query`**: активный вид `query`; событие приходит с `{kind:'query'}`.
- **Режим `dcs_query`**: активный вид `dcs`; событие приходит с `{kind:'dcs'}`.
- **Порядок загрузки**: пакеты можно грузить в любом порядке; каждый успешный
  `context`/`query`/`dcs` шлёт PREPARED независимо от `setLanguageMode` на момент загрузки.
- **Orphan PREPARED**: если после `prepared` полнотекстовая индексация падает (rollback/error),
  PREPARED уже отправлен, а READY **не** наступит — promise `parseHelp` резолвится с
  `ok:false` (откат provisional) либо reject'ит, и `.then`-блок READY в `editor.js` пропускается.
  1С обязан толерировать «PREPARED без READY».

### 3.3. Ошибки

- Ошибка разбора пакета до фазы `prepared` (`fail`, `error` без candidate) — событие **не**
  создаётся.
- Ошибка передачи Base64 / ошибка worker'а до `prepared` — событие **не** создаётся.
- Откат provisional-кандидата (rollback) после отправленного PREPARED — READY **не** создаётся,
  PREPARED не отзывается (см. §3.2 orphan PREPARED).

## 4. Контракты

### 4.1. Экспортные функции моста (`window` / `defaultView`)

Сигнатура `window.parseHelp` не меняется. Добавляется побочный эффект — раннее событие.

```js
/**
 * Загружает пакет справки 1С в текущую сессию.
 * На фазе prepared (готовы оглавление и префиксный индекс заголовков) отправляет
 * EVENT_ON_HELP_PREPARED с payload {kind}; после успешного завершения —
 * EVENT_ON_HELP_READY с payload {kind}. shlang и ошибки событий не создают.
 * PREPARED не гарантирует последующего READY (orphan PREPARED при откате/ошибке).
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
| `EVENT_ON_HELP_PREPARED` | JS → 1С | `{ kind: 'context' \| 'query' \| 'dcs' }` | На фазе `prepared` каждой успешной загрузки или атомарной замены пакета `shcntx`/`shquery`/`dcsui`; `shlang` и ошибки событие не создают. PREPARED предшествует READY той же операции, но не гарантирует его (orphan PREPARED при откате) |
| `EVENT_ON_HELP_READY` | JS → 1С | `{ kind: 'context' \| 'query' \| 'dcs' }` | Без изменений: после успешного завершения `parseHelp` (`parsed`); полнотекстовый индекс готов |

Поле `kind` принимает одно из строковых значений `'context'`, `'query'`, `'dcs'`. Другие значения
не предусмотрены. Полей кроме `kind` в payload нет.

### 4.3. Контракт сборки / доставки

Не меняется. Изменение не затрагивает форматы HBK, сборку, single-file, ES-floor и Blob-worker.

## 5. Критерии приёмки

- [x] `parseHelp` успешного `shcntx` шлёт `EVENT_ON_HELP_PREPARED` с точным payload `{kind:'context'}`.
- [x] `parseHelp` успешного `shquery` шлёт `EVENT_ON_HELP_PREPARED` с точным payload `{kind:'query'}`.
- [x] `parseHelp` успешного `dcsui` шлёт `EVENT_ON_HELP_PREPARED` с точным payload `{kind:'dcs'}`.
- [x] `parseHelp` успешного `shlang` НЕ шлёт событие.
- [x] Повторная загрузка `shcntx`/`shquery`/`dcsui` шлёт PREPARED каждый раз.
- [x] Для каждой операции PREPARED предшествует READY с тем же `kind` (если READY наступает).
- [x] Ошибка разбора до `prepared` НЕ шлёт PREPARED.
- [x] Orphan-PREPARED при ошибке после `prepared` покрыт: READY не создаётся.
- [x] `EVENT_ON_HELP_READY` сохраняет прежние счётчики и поведение.
- [x] `tools/run_help_headless.js` покрывает точный payload, виды, повторы, ошибки и порядок.
- [ ] Общие `npm test` и `test:mocha` не являются гейтами: известные исходные долги зафиксированы
      в `specs/help-browser/spec.md`.
- [x] `docs/help_prepared_event.md`, `docs/help_browser.md`, `README.md` обновлены.

## 6. Вне области

- `EVENT_ON_HELP_READY` не меняется (триггер, payload, счётчики — прежние).
- Пакет `shlang` (language) PREPARED **не** шлёт — намеренно.
- `EVENT_ON_GET_HELP` и опция `generateGetHelpEvent` не меняются.
- Форматы HBK/сборки/single-file и ES-floor не затрагиваются.
- Воркеры `help_worker.js`/`index_worker.js` не затрагиваются (сообщение `prepared` уже существует).
- Orphan-PREPARED-отзыв не реализуется: PREPARED не отзывается при откате; 1С толерирует.
