---
issue: "-"
title: Фиксы по ревью владельца — кандидат Monaco 0.55.1 (dev-тесты, поле 1С, customOptions)
status: in-progress  # draft | approved | in-progress | done | superseded
owner: Alex Aniskov
created: 2026-07-15
updated: 2026-07-15
area:
  - сборка
  - обвязка редактора
  - мост 1С
  - доки
---

# monaco-0.55-fixes: фиксы по ревью владельца продукта

> Issue: нет (внутренний раунд ревью кандидата Monaco 0.55.1). Родительский трек — [`../monaco-0.55/`](../monaco-0.55/spec.md).
> Ветка: `feature/monaco-0.55-fixes`. PR с коммитами: [salexdv/bsl_console#383](https://github.com/salexdv/bsl_console/pull/383).

Пакет из 6 точечных дефектов, найденных владельцем продукта при обкатке сборки на Monaco 0.55.1.
Спека оформлена **задним числом** (ретро-покрытие уже сделанных правок): фиксирует ожидаемое
поведение как контракт и критерии приёмки. Два из шести — боевые баги «Поля HTML документа» 1С,
остальные — про запуск тестов в dev-сервере и потерянную опцию сборки.

## 1. Контекст и проблема

При переносе редактора на Monaco 0.55.1 (webpack5-ветка, слои совместимости со старым WebKit поля
1С — см. [`../monaco-0.55/spec.md`](../monaco-0.55/spec.md)) владелец продукта выдал 6 замечаний:

1. **`npm run debug` не отдаёт тест-страницы.** `http://localhost:9000/test.html` и `test_query.html`
   работают только при `npm run debug -- --env test`. На ветке `webpack` dev-режим подключал их по
   умолчанию — регресс DX.
2. **`describe is not defined`.** Тест-страницы грузят `mocha`/`chai` тегами `<script src="node_modules/…">`,
   а dev-сервер отдаёт из памяти только собранные ассеты, реальный `node_modules` с диска — нет → 404 → тест
   не стартует.
3. **ESC в редакторе → `ReferenceError: eventParams is not defined`** (`window.generateEscapeEvent`).
   Присваивание необъявленной переменной; сборка через babel/ESM = strict mode, где неявный глобал
   запрещён (на raw-AMD ветке `develop` создавался молча). **Баг проявляется и в поле 1С, не только в тестах.**
4. **`compare('123', true, true)` → `getModel(...).getLineContent is not a function`**
   (`bslHelper.getRangesForProcedureDescription`). Фолдинг-провайдер читал строки через
   `window.editor.getModel()`, который в режиме сравнения возвращает diff-модель (`{ original, modified }`)
   без метода `getLineContent`, вместо переданного в провайдер `model`.
5. **`performance.mark is not a function`** в поле 1С (платформа 8.3.27.1719). Встроенный WebKit «Поля
   HTML документа» имеет `performance.now()`, но не `mark/measure/getEntries*` (User Timing). Monaco 0.55
   зовёт `performance.mark(...)` на «горячем» пути → `TypeError` обрывает поток **до запроса метаданных**:
   в консоли кода не показываются справочники/документы конфигурации. **Боевой баг, ломает основной сценарий.**
6. **Опция сборки `--customOptions` из README не работает.** Механизм (инжект доп. опций в `editor.create()`)
   был на ветке `webpack` через `string-replace-loader` + `argv.customOptions`; при переписи `webpack.config.js`
   под 0.55 его потеряли. Вдобавок webpack-cli 5+ вообще не принимает произвольный флаг `--customOptions`
   (`Unknown option`).

## 2. Область изменений

| Компонент | Тип | Характер изменений |
| --- | --- | --- |
| `webpack.config.js` | сборка / конфиг | dev по умолчанию собирает `test`/`test_query`; `devServer.static` → `node_modules`; правило инжекта `customOptions` из `--env` |
| `src/editor.js` | src (обвязка) | `let eventParams` в `generateEscapeEvent` и в генераторе suggest-события (объявление вместо неявного глобала) |
| `src/bsl_helper.js` | src (обвязка) | фолдинг описаний процедур читает строки через переданный `model`, а не `window.editor.getModel()` |
| `src/polyfills.js` | src (совместимость) | no-op стабы `performance.mark/measure/clearMarks/clearMeasures/getEntries*` (+ `now` при отсутствии) |
| `README.md` | доки | команда `customOptions` через `--env`; примечание про тест-страницы в dev-сервере |

## 3. Поведение

### 3.1. Основной сценарий

- `npm run debug` (без флагов) поднимает dev-сервер, где доступны **и** редактор (`/`), **и** страницы
  тестов (`/test.html`, `/test_query.html`); `mocha`/`chai` подгружаются с `/node_modules/**` → тесты
  стартуют и проходят.
- В поле 1С 8.3.27+ редактор инициализируется, доходит до `updateMetadata` и показывает справочники/
  документы конфигурации в автодополнении; ESC и `compare()` не бросают исключений.
- `npm run build -- --env customOptions="automaticLayout: false, fixedOverflowWidgets: true"` подставляет
  переданные опции в вызов `editor.create()`.

### 3.2. Граничные случаи

- **Чистый тест-таргет** `--env test` (headless-гейт) по-прежнему собирает **только** страницы тестов,
  без `index.html`.
- Прод-сборка (`npm run build` / `build:single`) не тянет тест-страницы и `node_modules`-статику.
- `customOptions` не передан → правило инжекта не добавляется, маркер `customOptions: true` в
  `editor.create()` остаётся как есть (нейтрален).

### 3.3. Ошибки

- Ни один из шести сценариев не должен приводить к `ReferenceError`/`TypeError` в консоли поля 1С или
  dev-сервера.
- `performance`-стабы устойчивы к нерасширяемому host-объекту (fallback на `Object.defineProperty`).

## 4. Контракты

### 4.1. Экспортные функции моста (`window` / `defaultView`)

Публичная сигнатура **не меняется**. Затронуты внутренности `window.generateEscapeEvent` (объявление
`eventParams`) и `compare()`-пути (фолдинг). Поведение моста наружу прежнее.

### 4.2. События (`EVENT_*`) / формат обмена с 1С

Без изменений. `EVENT_ON_KEY_ESC` и suggest-события шлют тот же payload; правка лишь устраняет падение
до отправки события.

### 4.3. Контракт сборки / доставки

- Новый источник опций редактора — `--env customOptions="<js-фрагмент свойств>"` (не `--customOptions`).
- `dist/` для прод-сборки не меняется (по-прежнему один `index.html` в single-file).
- ES-floor не понижается: `npm run escheck` (ES2018) проходит; `performance`-стабы — ES5.

## 5. Критерии приёмки

- [x] `npm run debug`: `/test.html`, `/test_query.html`, `/node_modules/mocha/mocha.js`,
      `/node_modules/chai/chai.js`, `/` → HTTP 200 (проверено curl).
- [x] `--env test` собирает только тест-страницы; прод-сборка — без них.
- [x] `let eventParams` в бандле (2 места); старой строки `window.editor.getModel().getLineContent` нет.
- [x] `performance`-стабы в бандле; dev- и prod-сборки — exit 0; `escheck` — ES9 OK.
- [x] `--env customOptions="…"` подставляет опции рядом с маркером `customOptions: true` в `console.js`.
- [x] **Поле 1С 8.3.27.1719 — №3 ESC:** не бросает (владелец подтвердил).
- [x] **Поле 1С 8.3.27.1719 — №4 compare:** режим сравнения отрабатывает (владелец подтвердил).
- [x] **Поле 1С 8.3.27.1719 — №5 метаданные:** автодополнение показывает справочники/документы
      конфигурации (владелец: «всё отлично»). Потребовалось два фикса: (1) минимальный User Timing
      вместо no-op (коммит 3371d79) — `getEntriesByName(name)[0].duration` бросал на пустом `[]`;
      (2) дозаполнение блока после асинхронного ответа 1С через hide+retrigger (коммит 6c79b0c) —
      просто `triggerSuggest` на 0.55 перефильтровывает кэш, а не опрашивает провайдер заново.

## 6. Вне области

- Апгрейд/патчи самого Monaco 0.55 (грамматика рендера, replace-strings-патчи) — родительский трек
  [`../monaco-0.55/`](../monaco-0.55/).
- Синхронизация версии Monaco в `node_modules` (0.52.2 → 0.55.1) — это состояние локального окружения,
  не изменение кода (см. `plan.md`, раздел «Решения»).
- Рефакторинг обвязки событий/фолдинга за пределами устранения падений.
