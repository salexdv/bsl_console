---
issue: 18
title: Single-file сборка (один self-contained HTML, ноль внешних файлов)
status: in-progress  # draft | approved | in-progress | done | superseded
owner: Alex Aniskov
created: 2026-07-12
updated: 2026-07-12
area:
  - сборка
  - доставка
  - мост 1С
---

# single-file-build: Single-file сборка bsl_console

> Issue: [#18](https://github.com/salexdv/bsl_console/issues/18)
> База: ветка `webpack` (Monaco 0.20, webpack4). Согласовано с мейнтейнером.

Стабильный контракт: `npm run build:single` собирает **один self-contained `dist/index.html`** без единого
внешнего файла (ни `src=`/`href=`/`url(...)` на локальный ресурс), пригодный для загрузки в «Поле HTML
документа» 1С **как текст**. Обычная сборка (`npm run build`) не меняет поведение.

## 1. Контекст и проблема

Платформа 1С **8.3.27.1719+** при рендере «Поля HTML документа» выдаёт неотключаемое (для тиража)
предупреждение безопасности «ПолеHTMLДокумента пытается открыть локальный файл» на **любой** ресурс,
подгружаемый с диска (внешний `.js`, `.css`, шрифт, картинка, воркер). Единственный обход для тиражного
продукта — доставлять редактор **как текст HTML** без обращений к диску: всё инлайнится в один документ
(`data:` / `blob:` / инлайн-теги), внешних файловых ссылок — ноль.

Ветка `webpack` уже инлайнит бóльшую часть (главный бандл `console.js` → в `index.html` через
`script-ext-html-webpack-plugin`; шрифты `.ttf` → base64; Monaco-воркер → Blob-URL с `emit=false`;
шаблон `src/index.html` внешних ссылок не содержит). Но **до «ноль внешних файлов» не доходит** —
остаются отдельные файлы на диске (см. §3.1, гэпы Г1–Г4). Задача — закрыть эти гэпы отдельным
build-таргетом, не трогая обычную сборку, и оформить узкий PR (закрывает #18).

Связанное: [`specs/monaco-0.55/`](../monaco-0.55/spec.md) (будущий апгрейд редактора — **вне** этой спеки).

## 2. Область изменений

| Компонент | Тип | Характер изменений |
| --- | --- | --- |
| `webpack.config.js` | сборка | Добавить ветку single-file-таргета (`env.single`): `maxChunks=1` (+ выключить `splitChunks`), снять лимит `url-loader` (инлайн всех картинок), отключить `CopyWebpackPlugin` для `tree/icons`. Обычную ветку конфига не менять. |
| `package.json` | конфиг | Добавить скрипт `build:single` (прод-сборка с `--env single`). `build`/`debug` — без изменений. |
| `src/editor.js` | src | В точке `new Treeview(..., "./tree/icons/")` передавать резолвер иконок (карта `имя.png → data:`-URI, собранная webpack'ом через `require.context`). |
| `src/tree/tree.js` | src | Минимальная правка одного места (`src = imageBase + icon`): если `imageBase` — функция, звать её; иначе прежний концат (обратная совместимость, standalone `tree.html`). |
| `.github/workflows/*.yml` | сборка/CI | Новый экшен (workflows в репо сейчас нет): на release/tag `npm ci && npm run build:single`, приложить `dist/index.html` → `bsl_console.single.html` в Release assets. |
| `README.md` / `CHANGELOG` | доки | Как собрать и загрузить single-file в поле 1С текстом; что даёт (обход предупреждения 8.3.27+). |
| смоук-скрипт (`tools/` + npm-скрипт) | сборка | Автопроверка: `dist/` = один файл, внутри нет внешних файловых ссылок; нон-зеро exit при нарушении. |

**Не меняется (но критично сохранить):** экспортные функции моста на `window`/`defaultView`
(в `editor.js` это явные присваивания `window.init = …` и т.п. — бандлинг их не прячет, но проверяем),
обратный канал (`#event-button` + `eventData1C`), существующая транспиляция/полифиллы (ES-floor
старого WebKit-поля).

## 3. Поведение

### 3.1. Гэпы, которые закрываем (проверено по `origin/webpack`)

- **Г1 — чанки.** `optimization.splitChunks:{chunks:'all'}` + `LimitChunkCountPlugin({maxChunks:10})`
  дают несколько чанков, а `ScriptExtHtmlWebpackPlugin` инлайнит только `console.js` → вендор-чанки
  остаются файлами. → **`maxChunks=1`** (совет автора): всё сливается в entry-чанк `console.js`, он
  и инлайнится.
- **Г2 — иконки дерева.** `CopyWebpackPlugin({from:'./tree/icons'})` копирует 30 PNG (все < 512 байт,
  суммарно ~10 КБ) в `dist/tree/icons`. Реферятся **рантайм-строкой** `src = imageBase + icon`
  (`tree.js`; `imageBase="./tree/icons/"` из `editor.js:1630`), которую webpack статически не видит, —
  поэтому и копируются. → карта `require.context('./tree/icons') → data:`-URI в `editor.js`, резолвер
  в `Treeview`; `CopyWebpackPlugin` в single-режиме отключить. (CSS-ссылки `url('./icons/…')` из
  `tree/tree.css` идут через css-loader→url-loader и инлайнятся по Г3.)
- **Г3 — картинки > 8 КБ.** `url-loader?limit=8192` эмитит файлом всё, что больше лимита. Конкретно
  сейчас это `src/loading.gif` (41 КБ, реферится из `decorations.css`). → в single-режиме лимит снять
  (инлайн всегда). Примечание: на `develop` от `loading.gif` уже отказались (коммит `c992ecf`) — после
  конвергенции веток автором этот гэп может закрыться сам, но снятие лимита оставляем как гарантию.
- **Г4 — верификация фактического инлайна.** `.ttf` через `base64-inline-loader` (убедиться, что
  `limit` — no-op и шрифт реально в base64); воркер — Blob (`compile-loader?emit=false` уже удаляет
  ассет из компиляции; `RemovePlugin` подчищает `editor.worker.js`, эмитируемый MonacoWebpackPlugin, —
  убедиться, что в html нет остаточной ссылки на него).

### 3.2. Основной сценарий

1. `npm run build:single` → webpack прод-сборка с `env.single`.
2. На выходе — **ровно `dist/index.html`** и ничего больше; смоук-скрипт это подтверждает.
3. Внутри `index.html`: JS инлайн (`<script>…</script>`), CSS инлайн (`style-loader`), шрифты `data:`
   base64, картинки/иконки `data:`, воркер `blob:`. Ни одного `src=`/`href=`/`url(...)` на локальный файл.
4. Файл грузится в «Поле HTML документа» 1С как текст: редактор печатает, подсветка BSL/запросов,
   автодополнение, темы, сравнение — работают; предупреждение 8.3.27+ не возникает.

### 3.3. Граничные случаи

- **Обычная сборка не затронута.** `npm run build` (без `env.single`) даёт прежний результат;
  единственное допустимое отличие — иконки дерева начинают резолвиться через инлайн-карту (все < 8 КБ,
  url-loader инлайнит их и в обычном режиме), при этом копия в `dist/tree/icons` сохраняется как раньше.
- **Standalone `tree.html`** (демо дерева вне бандла) продолжает работать со строковым `imageBase`
  (`"./icons/"`) — правка `tree.js` обратно совместима.
- **Иконка без записи в карте** → резолвер отдаёт `undefined.png` из карты (прежняя семантика fallback
  в `tree.js` сохраняется), битого файлового `src` не возникает.

### 3.4. Ошибки

- Смоук-проверка находит внешнюю файловую ссылку или лишний файл в `dist/` → нон-зеро exit,
  сборка/CI падает с сообщением, что именно осталось внешним.

## 4. Контракты

### 4.1. Экспортные функции моста (`window` / `defaultView`) — БЕЗ ИЗМЕНЕНИЙ

Спека **не меняет** публичный контракт моста, но накладывает инвариант на способ сборки:

> Все экспортные функции редактора (`init`, `setText`, `updateText`, `setContent`, `getText`, `eraseText`,
> `setSelection`, `getSelection`, `setTheme`, `setLanguageMode`, `setReadOnly`, `updateMetadata`,
> `clearMetadata`, `compare`, `nextDiff`, `previousDiff`, `getQuery`, `revealDefinition`, `insertSnippet`,
> `enableQuickSuggestions`, `minimap`, `editor.trigger(...)` и др. — полный список в README, раздел
> «Функции для взаимодействия с 1С») ОБЯЗАНЫ остаться доступны на `window` single-file-документа.
> `maxChunks=1`/инлайн не должны спрятать их в замыкание бандла.

Обратный канал (JS→1С): событие через `eventData1C = {event, params}` + клик по `#event-button` — сохраняется.

### 4.2. События (`EVENT_*`) — БЕЗ ИЗМЕНЕНИЙ

Набор и формат событий не меняются.

### 4.3. Контракт сборки / доставки

| Артефакт | Обычная сборка (`build`) | Single (`build:single`) |
| --- | --- | --- |
| Состав `dist/` | `index.html` + чанки + `tree/icons/*` (как сейчас) | **ровно `index.html`** |
| Внешние файловые ссылки в html | допустимы | **ноль** (только `data:`/`blob:`/инлайн) |
| Точка входа моста | `window.*` | `window.*` (инвариант §4.1) |
| ES-floor | старый WebKit поля | тот же (транспиляция/полифиллы не трогаем) |
| Команда | `webpack --mode production` | `webpack --mode production --env single` |
| Release asset | — | `bsl_console.single.html` (GitHub Action) |

## 5. Критерии приёмки

- [ ] `npm run build:single` → в `dist/` **ровно один файл** `index.html`.
- [ ] Смоук-скрипт: в `dist/index.html` нет `src=`, `href=`, `url(...)`, указывающих на локальный файл
      (разрешены только `data:`, `blob:`, `#`-якоря, инлайн); нет ссылок на `editor.worker.js`,
      `tree/icons/*`, отдельные `.ttf`/`.svg`/`.png`/`.gif`.
- [ ] Иконки дерева переменных отображаются (инлайн `data:`), не битые.
- [ ] Глобалы моста (`init`, `setText`, `getText`, `compare`, `editor` …) доступны из DevTools на `window`.
- [ ] Файл грузится в «Поле HTML документа» 1С 8.3.27+ (Windows, «Защита от опасных действий» ВКЛ)
      **без** предупреждения об открытии локального файла; редактор функционален (печать, подсветка
      BSL/запросов, автодополнение, темы, сравнение).
- [ ] `npm run build` (обычная) даёт прежний результат — регресса нет (сверка состава `dist/`).
- [ ] Standalone `src/tree/tree.html` работает как раньше.
- [ ] GitHub Action на release/tag публикует `bsl_console.single.html` в Release assets.
- [ ] Диф PR минимален: single-таргет + инлайн иконок + смоук + Action + доки.

## 6. Вне области

- **Апгрейд Monaco 0.20 → современный** — отдельный спайк ([`specs/monaco-0.55/`](../monaco-0.55/spec.md)).
- Ветка `webpack-monaco-v0.47.0` — не трогаем (экспериментальная).
- **macOS keyCode** — отдельный баг клавиатуры Monaco; здесь только фиксируем наблюдения, если всплывёт.
- **Linux-хардненинг** — ветка `webpack` под Linux и так собирается; тема будущего апгрейда редактора.
- **Рефакторинг** сборки/кода сверх необходимого для single-file (в т.ч. не чиним сломанный `export
  default` в standalone `tree.html` на ветке webpack — он сломан до нас и уйдёт при конвергенции).
- Изменение публичного контракта моста и набора `EVENT_*`.
