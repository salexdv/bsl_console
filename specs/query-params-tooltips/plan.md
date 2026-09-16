# query-params-tooltips: план реализации и решения

Транзиентный спутник [`spec.md`](spec.md). Живёт до закрытия задачи; после merge либо удаляется, либо
уезжает в `specs/done/query-params-tooltips/plan.md` как архив развития. Сюда — то, что мешает читать
стабильный контракт: этапы работ, открытые вопросы, история решений.

## 1. План реализации

### Этап 1. Модуль и интеграция

- Шаги: `src/query_params_hints.js` (парсинг входа + контроллер, делегирующий отрисовку в
  `inlayHintsController`); хук контроллера в `initEditorEventListenersAndProperies`;
  `window.setQueryParamsTooltips`; пересчёт в `onDidChangeModelContent`; сброс набора в
  `setLanguageMode` / `setInlayHints` / `clearInlayHints`.
- Gate: ручная проверка в `npm run debug` (режим `bsl_query`, правки текста, клики).

### Этап 2. Тесты и доки

- Шаги: кейсы в `src/test.js` (страница `/test` — единственная, покрываемая гейтом `test:mocha`;
  `test_query.html` гейтом не прогоняется) — отрисовка, смещение при правках, клики, гейты режимов,
  сосуществование с `setInlayHints`; `docs/query_params_tooltips.md`, строка в `README.md`,
  заметка в `docs/inlay_hints.md`.
- Gate: `npm run test`, `build:test` + `test:mocha`, `escheck`, `build`, `test:headless`.

### Этап 3. Markdown-tooltip и pointer-курсор (2026-09-16)

- Контракт расширен полем `tooltip` (markdown-строка): наведение на тултип параметра
  показывает markdown-подсказку вместо нативного окна Monaco «Выполнить команду (ctrl+click)».
- Кликабельные тултипы параметров рендерятся без command-ссылки на label part (обычный клик
  остаётся, ctrl+click уходит); над хинтом с `value` — курсор pointer.
- Классический `setInlayHints` не меняется: флаг происхождения набора (`queryParams`) в
  `inlayHintsController.setHints(hints, { queryParams: true })`.
- Gate: `build:test` + `test:mocha`, `escheck`, `build`; ручная проверка hover/курсора
  в `npm run debug` (обе темы).

### Риски и снижение

- Офф-бай-один позиции хинта: колонка хинта — `range.endColumn` вхождения, что согласовано
  с докой `setInlayHints` («для конца строки — длина строки + 1»). В реализации на ветке
  `feature/inlay-hints-0.55` позиция задаётся якорной декорацией в этой колонке, рендер —
  штатный InlayHintsProvider Monaco 0.55; дополнительно проверено визуально и тестом позиции.
- Декорации-якоря и так следуют за текстом; пересчёт нужен именно для состава (переименование/
  удаление/новые вхождения) — пересчёт делегирует в `setHints`, полный ре-рендер набора.

## 2. Открытые вопросы

- Нет.

## 3. Решения

| Дата | Решение | Причина |
| --- | --- | --- |
| 2026-09-10 | Один общий набор с `setInlayHints`, без слоя слияния | Проще и предсказуемее; контракт `setInlayHints` («полностью заменяет») не меняется |
| 2026-09-10 | Вне режимов запроса — `false`, набор не хранится; смена режима из запроса очищает хинты | `&Параметр` вне языка запросов бессмыслен; строгий гейт как у compare-режима |
| 2026-09-10 | Тултип на каждом вхождении параметра | Повторные вхождения типичны (UNION, повторные секции) |
| 2026-09-10 | Очистка через `clearInlayHints` / `setQueryParamsTooltips([])`, без отдельной clear-функции | Единая точка очистки; набор общий |
| 2026-09-10 | Поиск по всему тексту, без исключения строк/комментариев | Упрощение первого этапа; отмечено вне области спеки |
| 2026-09-10 | Интеграционные тесты — в `src/test.js`, а не `src/test_query.js` | `test:mocha` прогоняет только страницу `/test`; прецедент — тесты inlay-hints живут в `src/test.js`, режим запроса включается в `beforeEach` |
| 2026-09-10 | Перенос на ветку `feature/inlay-hints-0.55`: контроллер без изменений, клик в тестах — через `handleMouseDown`/`handleMouseUp` с синтетическим событием, `getState().hints` добавлен в контроллер inlay-hints, `disposeEditorInstance` обнуляет ссылку stateless-контроллера | Контроллер завязан только на `setHints`/`clear`/`findMatches` (совместимы с 0.55); паритет с паттернами тестов и жизненным циклом inlay-hints на 0.55 |
| 2026-09-16 | У QP-хинтов убрана command-ссылка: label — строка, tooltip — штатный `InlayHint.tooltip` (IMarkdownString `{ value }`, без isTrusted), рендер и sanitize — штатный markdown-рендерер Monaco | Нативный hover «Выполнить команду» показывается только при command на label part; свой tooltip — без патчей Monaco. Без isTrusted: `http/https`-ссылки кликабельны, `command:`-ссылки заблокированы (безопасный дефолт, контент приходит из 1С) |
| 2026-09-16 | ctrl+click у QP-хинтов убран (клик — только обычный) | Прямое следствие убранной command-ссылки; обычный клик уже ловил наш контроллер (`handleMouseDown`/`handleMouseUp`), событие `EVENT_ON_INLAY_HINT_CLICK` без изменений |
| 2026-09-16 | pointer-курсор — своим `onMouseMove`/`onMouseLeave` в контроллере inlay-hints: класс `bsl-inlay-hint-pointer` на хост-контейнере редактора (`getContainerDomNode` — родитель `div.monaco-editor`; `className` самого `.monaco-editor` Monaco перезаписывает при смене темы), правило `.bsl-inlay-hint-pointer .monaco-editor .view-lines { cursor: pointer }` в decorations.css, пока мышь над QP-хинтом с `event_params`; сброс при уходе/`clear`/`dispose` | Monaco не даёт CSS-класс injected text через API; `.view-lines` носит класс `monaco-mouse-cursor-text` с `cursor: text` — наследованием с контейнера не перебить, а класс на `.monaco-editor` нестойкий (перезапись className). Правило специфичностью (0,3,0) перебивает `cursor:text`; проверяется тестом по `getComputedStyle(.view-lines).cursor`. Вариант «строчный патч Monaco» отклонён. Гейт — флаг `queryParams` записи набора, классический `setInlayHints` не задет |
| 2026-09-16 | Разделение режимов наборов — флагом `queryParams` в `setHints(value, options)` (запись в `hintsByModel`), поле `tooltip` проносится общим парсером, но у классических наборов игнорируется | `window.setInlayHints` зовёт без опций → поведение прежнее; поле входа `tooltip` у классического набора семантики не меняет (документировано только для QP) |
| 2026-09-16 | Фикс зависания тултипа при переходе мыши с одного хинта на другой — патч (8) replace-strings: `InlayHintsHoverAnchor.equals` сравнивает ещё и `part`, а не только `owner` | Баг Monaco 0.55.1: `HoverForeignElementAnchor.equals` сравнивает только owner (один экземпляр `InlayHintsHover` на редактор), поэтому `_startShowingOrUpdateHover` в contentHoverWidgetWrapper считает якоря равными и не пересчитывает hover — тултип первого параметра «висит» над вторым. Каноничного фикса в vscode main нет. Затрагивает все inlay-хинты (у классических `setInlayHints` перестаёт зависать hover «Execute Command»). Гейт — ручная проверка в `npm run debug` (переходы параметр→параметр / параметр→слово / движение внутри хинта, обе темы) |
