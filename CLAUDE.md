# CLAUDE.md — bsl_console

Руководство для работы Claude Code в этом репозитории. Язык кода/комментариев/доков — **русский**.

## Что это

**bsl_console** — редактор кода 1С (встроенный язык BSL + язык запросов) на базе **Monaco Editor**.
Основной сценарий: HTML-бандл грузится в элемент **«Поле HTML документа»** (`ПолеHTMLДокумента`) на форме
1С; из BSL вызываются JS-функции редактора, обратно приходят события. Используется в консолях кода/запросов.
Автор — Александр Шкураев (salexdv), лицензия MIT.

## Направления работ

Значимые изменения ведутся через спецификации (см. раздел «Процесс разработки — SDD»). Активные треки:

1. **Single-file сборка** ([`specs/single-file-build/`](specs/single-file-build/spec.md)) — один self-contained
   HTML (ноль внешних файлов), чтобы грузить в поле 1С текстом и обойти предупреждение безопасности платформы
   **8.3.27+** «ПолеHTMLДокумента пытается открыть локальный файл». База — ветка `webpack`, `maxChunks=1` +
   инлайн иконок/картинок (issue #18).
2. **Апгрейд Monaco 0.20 → 0.55** ([`specs/monaco-0.55/`](specs/monaco-0.55/spec.md)) — спайк подъёма редактора
   на актуальный Monaco в поле 1С включая Linux (ориентир — [Pr-Mex/VAEditor](https://github.com/Pr-Mex/VAEditor),
   BSD-3, работает на 0.55). Отдельно от single-file.

## Модель веток

| Ветка | Роль |
| --- | --- |
| `develop` | Изменения приходят первыми. Сборка под **Windows**. Raw-AMD (`vs/loader.js`) + **Monaco 0.20**, без webpack. Default-ветка. |
| `webpack` | Немного отстаёт от `develop`. Сборка под **Linux**. **webpack4 + Monaco 0.20**. База single-file- и апгрейд-задач. |
| `webpack-monaco-v0.47.0` | **Экспериментальная, НЕ использовать** (заход на свежий Monaco). |
| `monaco-v0.52.0` | Апгрейд Monaco до 0.52 без webpack. Справочно. |
| `feature/inline-completion` | Свежие фичи от develop. |

Диф в PR держать минимальным — узкие ревьюибельные PR предпочтительны. `develop` и `webpack` со временем
сходятся; при работе от `webpack` учитывать возможный ребейз под конвергенцию.

## Сборка и запуск

- **`develop`**: сборки нет — открыть `src/index.html` в браузере; в 1С грузится через обработку `console.epf`
  (в релизах) или свою.
- **`webpack`**: `npm install` → сборка/дебаг через npm-скрипты из `package.json` ветки (`build` = продакшн
  в `dist/`, `debug`/`dev` = dev-server). Prod-режим уже инлайнит `console.js` в `index.html`
  (`script-ext-html-webpack-plugin`), шрифты — base64, воркер — Blob.

## Архитектура / ключевые файлы (`src/`)

- `editor.js` — точка входа (AMD `define`, `require.config` nls, `init`); настраивает Monaco, темы, события.
- `bsl_helper.js` — «мозг»: провайдеры автодополнения/hover/подсказок, разбор кода. Главный кастом.
- `bslGlobals.js` / `bslMetadata.js` / `bslQuery.js` / `bslDCS.js` — данные языка (глобальные методы,
  метаданные, язык запросов, СКД) в JSON.
- `bsl_language.js` — грамматика/токенайзер BSL и языка запросов для Monaco.
- `snippets.js`, `actions.js`, `colors.js`, `parsers.js`, `finder.js` — сниппеты, действия, темы, парсеры.
- `tree/` — дерево (поля/переменные), `vs/` — Monaco.
- На ветке `webpack` дополнительно: `webpack.config.js`, `tools/loaders/{blobUrl,compile,monacoNls}.js`,
  `src/nls*`, полифиллы.

## Контракт интеграции с 1С (НЕ ломать)

**Прямой канал (BSL → JS):** 1С берёт `Элементы.ПолеHTML.Документ.defaultView` (глобальный `window` документа)
и **напрямую зовёт экспортные функции редактора** — они ДОЛЖНЫ быть на `window`. Ключевые:
`init(версия, пользователь)`, `setText/updateText/setContent/getText/eraseText`, `setSelection/getSelection`,
`setTheme/setLanguageMode/setReadOnly`, `updateMetadata/clearMetadata`, `compare/nextDiff/previousDiff`,
`getQuery`, `revealDefinition`, `insertSnippet`, `enableQuickSuggestions`, `minimap`, `editor.trigger(...)`.
Полный список — раздел «Функции для взаимодействия с 1С» в `README.md`.

**Обратный канал (JS → BSL):** редактор сигналит событие, кладя `eventData1C = {event, params}` и «кликая»
скрытый `#event-button`; 1С ловит это как событие поля `ПриНажатии` и диспетчеризует по имени. Ключевые
константы: `EVENT_QUERY_CONSTRUCT`, `EVENT_FORMAT_CONSTRUCT`, `EVENT_GET_METADATA`, `EVENT_CONTENT_CHANGED`,
`EVENT_ON_LINK_CLICK`, `EVENT_GET_DEFINITION` и др.

⚠️ **При webpack-сборке глобалы моста легко «спрятать» в замыкание** — следить, чтобы экспортные функции
оставались доступны на `window` (проверять из DevTools). На рабочих ветках мост живой — не сломать.

## Ограничения движка поля 1С (WebKit)

«Поле HTML документа» рендерит **старый WebKit** (~Safari 11.x, ОС-зависимо; на Windows — V8WebKit):
- нет нативного `globalThis`, нет ES2020-синтаксиса (`?.`, `??`, приватные поля) → SyntaxError всего бандла;
- часть современных фич регэкспов ломается (флаг `d`/hasIndices, lookbehind `(?<=)`, возможно sticky `y`).

На `develop` это обходится тем, что код держат в ES5. На `webpack`/при апгрейде — транспиляцией (babel/esbuild
в es2015), полифиллами (globalThis→self, queueMicrotask, ResizeObserver, WeakRef/FinalizationRegistry-стабы,
ClipboardItem) и строковыми патчами Monaco (срезать флаг `d`, переписать lookbehind). Готовый рецепт —
VAEditor (см. [`specs/monaco-0.55/analysis.md`](specs/monaco-0.55/analysis.md)). Proxy движок поддерживает
нативно (полифилл не нужен).

## Тесты

- Dev-сборки/страницы: `test.html`, `test_query.html`. На ветке `webpack` — `mocha` (`npm test`).

## Процесс разработки — SDD (Specification-Driven Development)

Значимое изменение начинается со **спецификации**, а не с кода. Процесс, шаблоны и статусы —
в [`specs/README.md`](specs/README.md).

- **Спека обязательна** при: новой фиче / изменении поведения; изменении публичного контракта (экспортные
  функции моста, события `EVENT_*`, формат сборки/доставки, поддержка платформ); изменении в нескольких модулях.
- **Спека не нужна** при: опечатке, локальном багфиксе без изменения контракта, рефакторе без изменения
  поведения, бампе зависимостей.
- Активная спека — папка `specs/<id>/` (`spec.md` = стабильный контракт, `plan.md` = транзиентный план+решения).
  Шаблоны — в `specs/_template/`.
- Порядок: `draft` → согласование → `approved` → код (`in-progress`) → merge → `done` (в `specs/done/<id>/`).

## Договорённости по работе

- Не смешивать разные треки в одном PR (single-file и апгрейд Monaco 0.55 — отдельно).
- Мост на `window` и ES-floor — священны, проверять после каждого изменения сборки.
- Комментарии/доки/спеки — по-русски, в тон существующим.
- По вопросам обвязки/событий/моста и публичного контракта — согласовывать с мейнтейнером (salexdv).
