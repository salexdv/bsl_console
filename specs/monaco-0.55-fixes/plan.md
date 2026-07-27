# monaco-0.55-fixes: план реализации и решения

Транзиентный спутник [`spec.md`](spec.md). Раунд ревью владельца продукта по кандидату Monaco 0.55.1
(коммиты — в PR [salexdv/bsl_console#383](https://github.com/salexdv/bsl_console/pull/383)).

## 1. План реализации

Правки независимы, сделаны одним заходом. Порядок ниже — как разбирали.

### Этап 1. Разбор и правка 6 дефектов (done)

| # | Файл | Что сделано |
| --- | --- | --- |
| 1 | `webpack.config.js` | `withTests = isTest \|\| !isProd`: dev-режим добавляет entry `test`/`test_query` и их `HtmlWebpackPlugin`; `--env test` по-прежнему без `console`/`index.html` |
| 2 | `webpack.config.js` | `devServer.static` мапит `<root>/node_modules` на `/node_modules` (`watch:false`) |
| 3 | `src/editor.js` | `let eventParams = { … }` в `generateEscapeEvent` (≈2331) и в suggest-генераторе (≈2936) |
| 4 | `src/bsl_helper.js` | `getRangesForProcedureDescription`: `model.getLineContent(range.start)` вместо `window.editor.getModel().getLineContent(…)` |
| 5 | `src/polyfills.js` | IIFE со стабами `performance.now/mark/measure/clearMarks/clearMeasures/getEntries*` (defineProperty-fallback) |
| 6 | `webpack.config.js` + `README.md` | правило `replace-strings` по `src/editor.js` (инжект `env.customOptions` в маркер `customOptions: true`); README → `--env customOptions="…"` |

- **Gate:** сборка зелёная, фиксы видны в бандле, dev-сервер отдаёт страницы. Подтверждено (см. §3).

### Этап 2. Сборка и проверка на реальной платформе 1С (следующий)

- `npm run build:single` → загрузить `dist/index.html` текстом в «Поле HTML документа» 8.3.27.1719.
- Полевой гейт для дефектов №3 (ESC), №4 (`compare`), №5 (метаданные/справочники).
- Gate: пункт `[ ]` из «Критериев приёмки» spec.md закрыт на живой платформе.

### Риски и снижение

- **Инжект `customOptions` после babel.** Правило — `enforce:'pre'`, но маркер `customOptions: true` —
  простой object-литерал и переживает babel, поэтому порядок лоадеров не критичен. Проверено: значение
  подставляется в `console.js`.
- **`replace-strings.assertApplied` на маркере customOptions.** Счётчик регистрируется только когда флаг
  передан; без флага правило не добавляется → ложных срабатываний нет.
- **`performance` как нерасширяемый host-объект.** Стабы ставятся через try→`Object.defineProperty`.

## 2. Открытые вопросы

- Разбивать ли коммит на группы (баги поля / DX-тесты / customOptions+доки) или один — на усмотрение
  владельца; влияет на читаемость PR #383.
- Нужен ли `performance`-стаб также в worker-контексте Monaco (сейчас стаб — в `polyfills.js`, грузится
  первым в главном потоке; воркер — отдельный Blob). Проверить при полевом гейте, если всплывёт.

## 3. Решения

| Дата | Решение | Причина |
| --- | --- | --- |
| 2026-07-15 | dev-сервер отдаёт тест-страницы по умолчанию (а не только доку) | Владелец: «желательно, чтобы работало по умолчанию»; на ветке `webpack` так и было — восстановление, а не новое поведение |
| 2026-07-15 | Источник `customOptions` — `--env`, а не `--customOptions` | webpack-cli 5+ жёстко отвергает неизвестный флаг (`Unknown option`); `--env` — канонический канал webpack 5. README приведён в соответствие |
| 2026-07-15 | Инжект `customOptions` через существующий `replace-strings`, а не новый `string-replace-loader` | Не тянуть зависимость; лоадер уже в дереве, `assertApplied` заодно валидирует, что маркер жив |
| 2026-07-15 | `performance`-стабы в `polyfills.js`, а не в `patchWebKit1C()` | Полифилы грузятся первыми (до кода Monaco); `performance.mark` нужен уже на раннем пути. Тот же принцип, что у `queueMicrotask`/`ResizeObserver` |
| 2026-07-15 | Фолдинг читает переданный `model`, а не активный редактор | В `compare()` `window.editor.getModel()` = diff-модель без `getLineContent`; провайдеру и так передаётся корректная `model` — правка ещё и семантически вернее |
| 2026-07-15 | Рассинхрон Monaco в `node_modules` (0.52.2) vs package.json/lock (0.55.1) — лечится `npm install`, не коммитим | Это состояние локального окружения: патчи (2)/(3) писались под 0.55.1 и на 0.52.2 не матчились → `assertApplied` падал и вешал dev-сервер. После `npm install` (синк до 0.55.1) сборка зелёная. Lock уже 0.55.1 — правок в репозиторий не требуется |
| 2026-07-15 | `performance`-полифил: минимальный User Timing, а не no-op-заглушки (коммит 3371d79) | Полевой прогон: no-op `mark`+`getEntriesByName→[]` вызывал `[0].duration` throw на каждом keyUp (Monaco input-latency measure→read). Реальный mark/measure/getEntriesByName с числовым `.duration` + безопасный фолбэк убирают throw; хранилище чистится Monaco-вызовами `clearMarks/Measures` |

### Журнал проверки (Этап 1)

- `npm run debug` (dev-сервер, monaco 0.55.1): `/`, `/test.html`, `/test_query.html`,
  `/node_modules/mocha/mocha.js`, `/node_modules/chai/chai.js` → **HTTP 200**.
- `npx webpack --mode development` и `--mode production` → **exit 0** (prod: 3 обычных warning про размер).
- `npm run escheck` → **ES9 OK** (ES-floor не понижен).
- Бандл: `let eventParams` ×2; `performance`-стаб; `model.getLineContent(range.start)`; старой строки
  `window.editor.getModel().getLineContent` нет; `--env customOptions` подставляется рядом с маркером.

### Полевой раунд 1 (Этап 2, 2026-07-15)

epf: `console-monaco-0.55.epf` (сжатый `build:pack`, 3.93 МБ).

- **№3 ESC — ✓** (владелец: ничего не упало).
- **№4 compare — ✓** (владелец: сравнение отработало; включается host-функцией `compare`, не кнопкой).
- **№5 метаданные — ЕЩЁ НЕТ.** Из поля (Console): `EVENT_GET_METADATA {metadata:"справочники"}` уходит,
  но на `onKeyUp` — `Error: undefined is not an object (evaluating 'performance.getEntriesByName(e)[0].duration')`.
  Диагноз: no-op-заглушка `performance` неполна (вторая половина бага). Фикс — минимальный User Timing
  (коммит 3371d79), epf пересобран. **Ждёт полевого ре-теста №5.**
- Побочно выяснено: в первом скрине автодополнение показывало ДЕМО-данные из `bslMetadata.js`
  («Товары»→«СтавкаНДС»), а не конфигурацию — подтверждает, что `updateMetadata` конфигурации не отрабатывал.

### Полевой раунд 2 (2026-07-15)

- **№5 метаданные — ЗАРАБОТАЛО** после User Timing (коммит 3371d79): конфигурация подтягивается.
- **UX-хвост (правка сверх 6 замечаний):** т.к. запрос асинхронный, ПЕРВЫЙ показ блока автодополнения
  неполон (владелец: сначала одна строка «ТипВсеСсылки» — менеджерное свойство из `bslMetadata.js`),
  полный список — только при ручном повторном вызове.
  - **Раунд A (f7a80e3) — НЕ помог.** `updateMetadata` после подгрузки звал `triggerSuggestions()`.
    Причина провала: на Monaco 0.55 `editor.action.triggerSuggest` при уже открытом блоке НЕ
    опрашивает провайдер заново, а перефильтровывает уже показанный набор → остаётся 1 строка.
  - **Раунд B (6c79b0c) — hide+retrigger.** Как в `checkEmptySuggestions`: `hideSuggestionsList()`
    (сброс сессии — `hideSuggestWidget`) → `setTimeout(triggerSuggestions, 10)` = чистый повторный
    опрос провайдера с уже загруженными метаданными. Гейт — `isSuggestWidgetVisible()` (читает
    `_ctxSuggestWidgetVisible`, monaco 0.55 ставит СИНХРОННО; класс `.visible` — только через +100мс,
    по DOM гейтить нельзя). Эталон: боевая 0.20 (v0.3.3) дозаполняет «мгновенно и корректно» —
    подтверждает, что фикс нужен на нашей стороне сборки. epf пересобран. **Ждёт ре-теста поля.**
