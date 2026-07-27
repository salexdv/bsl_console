# monaco-0.55: анализ (карта API-дрейфа и рецепт сборки)

Аналитический спутник [`spec.md`](spec.md) / [`plan.md`](plan.md). Долгоживущий справочник для реализации:
что именно ломается при переходе Monaco 0.20 → 0.55 в **нашем** коде и как это чинится. Составлен
2026-07-12 по четырём источникам, дальше корректируется по фактам спайка.

## 0. Источники

| # | Источник | Что дал |
| --- | --- | --- |
| И1 | Инвентаризация `src/` (ветка `webpack`, полный проход) | Полный перечень точек касания Monaco API в нашем коде, file:line |
| И2 | Официальный CHANGELOG monaco-editor + дифф `monaco.d.ts` 0.20.0 ↔ `editor.api.d.ts` 0.55.1 + грep фактических бандлов 0.55.1 | Версии и характер каждого breaking change; что реально осталось в 0.55.1 |
| И3 | [Pr-Mex/VAEditor](https://github.com/Pr-Mex/VAEditor) `c09d699` (итог PR #182/#183/#184; локальный клон), BSD-2 | Рабочий рецепт Monaco **0.55.1** в поле 1С (Win/Linux/mac, платформа 8.3.14+): полифиллы, сборка, патчи |
| И4 | Ветка автора `origin/webpack-monaco-v0.47.0` (экспериментальная) | Его собственный частичный переезд 0.20→0.47: готовые правки `editor.js`/`bsl_helper.js`/`bsl_language.js`, подтверждающие карту дрейфа на нашем коде |

Ключевые версии: последний стабильный Monaco — **0.55.1** (2025-11-20). AMD-дистрибуция с 0.53
**deprecated** (внутренние AMD-модули уже недоступны) → путь только **ESM + бандлер**. ESM-раскладка
0.55.1 — по-прежнему пофайловая (`esm/vs/**`, ~1490 файлов, читаемый код) → строковые патчи
конкретных файлов (рецепт VAEditor) работают.

## 1. Карта API-дрейфа по нашему коду

### 1.1. Жёсткие ломания (не скомпилируется / упадёт сразу)

| Что у нас | Где (webpack-ветка) | Что случилось | Замена |
| --- | --- | --- | --- |
| Глобальный `monaco` без импорта | весь `bsl_helper.js` (~8.5 т. строк), `finder.js` | ESM-сборка с 0.22 **не определяет** глобальный `monaco` | `self.MonacoEnvironment = { globalAPI: true }` до загрузки + явный `window.monaco = monaco` в `editor.js` (так у автора в 0.47) |
| `monaco.editor.createDiffNavigator(...)` | `editor.js:762, 3770` | Удалён (новый diff-виджет 0.42, старый код выпилен 0.44) | `diffEditor.goToDiff('next'/'previous')` (появился в 0.45); `editor.navi` становится булевым флагом (готово в И4) |
| `diffEditor.getDiffLineInformationForModified/Original` | `editor.js:781, 2917, 2923` | Удалены в 0.40 | Своя реимплементация поверх `getLineChanges()` — **готовая есть в И4** (функции `_getEquivalentLine*` в editor.js ветки 0.47) |
| `model.getLanguageIdentifier().language` | `editor.js:454` | Удалён в 0.30 | `model.getLanguageId()` |
| `monaco.KeyCode.KEY_L / KEY_B / KEY_C / KEY_V / KEY_D / KEY_F / US_OPEN_SQUARE_BRACKET / US_CLOSE_SQUARE_BRACKET / NUMPAD_DIVIDE` | `editor.js:1845-1848`, `actions.js:138-364` | Переименованы в 0.30 без алиасов (`KeyL`, `BracketLeft`…); у пунктуации/numpad сместились и **числовые значения** | Механическое переименование. Числовые keyCode нигде не персистить |
| `resolveCompletionItem(model, position, item)` | `bsl_language.js:652` | С 0.21 сигнатура `(item, token)` — model/position не передаются | Перестроить: у автора в И4 — временная модель из `item.insertText` (само тело `bslHelper.resolveCompletionItem` совместимо) |
| `model.findPrevBracket / matchBracket / findMatchingBracketUp` | `bsl_helper.js:5213, 6598` | Переехали в `model.bracketPairs.*` | `model.bracketPairs.findPrevBracket(...)` и т.д.; в И4 `findMatchingBracketUp('('...)` заменён на `bracketPairs.findMatchingBracketUp(')'...)` — при портировании проверить семантику аргумента |
| `provideCompletionItems` возвращает `[]` при пустом результате | `bsl_helper.js:4148, 5975, 6014` | Новый Monaco ждёт `{suggestions: [...]}` | Всегда возвращать `{ suggestions }` (готово в И4) |
| `autoIndent: true` (boolean) | `editor.js:1832` | Строковый enum (с 0.19, у нас рудимент) | `autoIndent: "advanced"` |
| `wordBasedSuggestions: false` | `editor.js:1829` | С 0.45 строковый enum | `wordBasedSuggestions: "off"` |
| ES2022 в исходниках ESM Monaco (`static {}`-блоки, `?.`) | — (тулчейн) | webpack 4 **не парсит** такие исходники вообще | webpack 5 + транспиляция `esbuild-loader target es2015` (см. §2) |

### 1.2. Приватные/внутренние API (высокий риск, ревизия по одному)

Контрибы `editor.contrib.suggestController` / `folding` / `findController` в 0.55.1 живы, но
`getContribution()` теперь возвращает `T | null` (нужны null-чеки), а внутренние формы менялись.

| Что у нас | Где | Статус в 0.55 | План |
| --- | --- | --- | --- |
| `editor._standaloneKeybindingService.addDynamicKeybinding('-cmd')` / `(cmd, kb)` | `editor.js:2661-2662` (`changeCommandKeybinding`), `disableKeyBinding`/`enableKeyBinding` | Внутренний метод ещё существует, но сигнатура менялась | Официальный API: `monaco.editor.addKeybindingRules([{command, keybinding}])` (0.34.1); снятие дефолтного биндинга — `{keybinding, command: null}`. Так у автора в И4 |
| `editor._themeService.getTheme().themeName` | `editor.js:3490` | `getTheme()` → `getColorTheme()`; поле `_themeService` живо (вариант И4 `_standaloneThemeService` в 0.55.1 неверен) | Решено (§6.2 п.6): вести имя темы своей переменной при `setTheme`; fallback — `_themeService.getColorTheme().themeName` |
| `editor._modelData.model._commandManager.currentOpenStackElement.editOperations.pop()` | `editor.js:2375` (onDidPaste) | **Умер**: `currentOpenStackElement` исчез, элемент стека хранит сжатые TextChange-буферы | **Решено (§6.1)**: публичные `popUndoStop()` → `executeEdits` → `pushUndoStop()` — одна отмена, корректные инверсии |
| `editor._contentWidgets['editor.widget.suggestWidget']`, `['editor.widget.parameterHintsWidget']`, `_overlayWidgets['editor.contrib.findWidget']` | `editor.js:2710, 2716, 2722` | Живы: карты и все три ID без изменений, но регистрация **ленивая** (до первого показа ключа нет) | Null-чеки; прямые альтернативы через контрибуции — §6.2 п.3 |
| `getSuggestWidget().widget.suggestWidgetVisible.get()` | `editor.js:1444-1446` | Проверено: `widget.value._ctxSuggestWidgetVisible.get()` (WindowIdleValue + переименование поля) | Решено (§6.2 п.1): подписка `onDidShow/onDidHide` + свой флаг, либо чтение контекст-ключа `suggestWidgetVisible` |
| `getSuggestWidget().widget.list.view.items[row].element.completion.insertText` | `editor.js:2757-2759` | Умер (`list` → `_list` + обёртка SuggestContentWidget) | Решено (§6.2 п.2): штатный `widget.value.getFocusedItem().item.completion` + события `onDidFocus/onDidSelect` |
| `editor.getContribution('snippetController2').insert(snippet)` | `editor.js:1453-1456` | Проверено: **жив как есть** (ID и `insert()` не менялись; Lazy-контриб инстанцируется самим `getContribution`) | Только null-чек (§6.2 п.4) |
| Команда `'vs.editor.ICodeEditor:1:saveref'` в CompletionItem.command | `bsl_helper.js:1037` (+`:1:requestMetadata`, ~30 мест) | Формат жив (`getId()+':'+actionId`), но `:1:` = первый созданный редактор — diff сдвигает счётчик | Решено (§6.2 п.5): `monaco.editor.registerCommand('bsl.saveref', …)` + стабильные id в items |
| `getLayoutInfo().minimapWidth` | `editor.js:4084` и др. | Поле переехало: `layout.minimap.minimapWidth` | Как в И4 |
| MutationObserver по внутренним классам DOM (`.suggest-widget`, `.monaco-list-row`, `.parameter-hints-widget`, `.monaco-editor-overlaymessage`, `overflowingContentWidgets`, `.detected-link-active`…) | `editor.js:2508-2650` + `decorations.css:83-105` + ~20 `querySelector` | Аудит выполнен (§6.4): жив — 18, переименован — 3, умер — 2; сам document-observer жизнеспособен (shadow DOM не используется) | По таблице §6.4; главное переписывание — группа `docs-side`/`.details` под новый overlay `.suggest-details`; suggest-фокус — перевести на события виджета |
| `editor.onDidType` | `editor.js:2119` | Никогда не был в публичном d.ts, но в рантайме 0.55.1 есть | Оставить с фолбэком на `onDidChangeModelContent` |

### 1.3. Тихие изменения поведения (скомпилируется, но работает иначе)

- **Unicode highlighting (0.37+):** кириллица подсвечивается как «неоднозначные символы». Обязательно
  `unicodeHighlight: { ambiguousCharacters: false, invisibleCharacters: false, nonBasicASCII: false }`
  (VAEditor; у автора в И4 — тоже).
- **Color decorators (0.55):** дефолтный color-computer содержит lookbehind-регэксп → на старом WebKit
  падает require модуля. Патч (§2.4) + `colorDecorators: false, defaultColorDecorators: 'never'`.
  У нас есть **свой** colorProvider (`editor.js:1892`) — проверить сосуществование.
- **Новый diff-виджет (0.42/0.44):** `getLineChanges()`, `onDidUpdateDiff`, `renderSideBySide`,
  `ignoreTrimWhitespace` живы; CSS-классы строк/символов живы. Но: авто-переключение в inline при
  нехватке ширины (`useInlineViewWhenSpaceIsLimited: false`, если не нужно), появились
  `renderMarginRevertIcon` (гасим), `hideUnchangedRegions` (полезно — в И4 автор включил и добавил
  `showAllUnchangedRegions`/`collapseAllUnchangedRegions` в мост), `renderGutterMenu` (0.48, гасим).
  Наши diff-декорации (`diff-mark`, `diff-changed`…) и `markDiffLines` — переверить визуально.
- **`CompletionItemKind` числа сдвигались** (0.21: +User/Issue; 0.53: +Tool, Snippet=28) — у нас
  всюду имена enum (ок), кроме опечатки `CompletionItemKind.value` (`bsl_helper.js`, ~5635) — даёт
  `undefined`, поправить заодно. `EditorOption.*` — только по именам (индексы плавают каждый релиз).
- **Сырые числовые `keyCode`**: `e.keyCode == 3` (`editor.js:3028`), `lastKeyCode == 10`
  (`bsl_helper.js:3996`), `switch(lastKeyCode)` (`bsl_helper.js:8057`) — сверить с новой нумерацией
  KeyCode (Enter=3? PauseBreak?/ KeyCode.Enter=3 в старом enum) и заменить на именованные.
- **`IPasteEvent.mode` → `languageId`** (0.30) — если используем поле события `onDidPaste`.
- **`monaco.editor.EditorOptions` (реестр) vs enum `EditorOption`**: имена разошлись
  (`unicodeHighlight` ↔ `unicodeHighlighting`) — грабля VAEditor #184 при чтении опций по ключу.
- **Токены скобок в грамматике**: в И4 автор заменил в `bsl_language.js` токен `delimiter.square` →
  `delimiter.parenthesis` для `(` — согласование с новой классификацией bracket-pair. Перенести.
- **`languages.setLanguageConfiguration`** дважды подряд (indentationRules, потом brackets) —
  в новых версиях второй вызов **замещает** конфигурацию; в И4 автор добавил `colorizedBracketPairs: []`.
  Слить в один вызов.
- **`findMatches`** — сигнатура совместима (`searchScope` расширен до `IRange[]`); наш собственный
  `Finder` (обход линукс-бага 0.20) работает поверх публичных методов модели — вероятно, без правок;
  после апгрейда проверить, не исчезла ли сама причина обхода.
- **Monarch** — breaking changes нет, грамматика BSL/запросов переносится as-is. Темы `defineTheme` —
  формат идентичен, наши ключи цветов живы.
- **Провайдеры** — сигнатуры hover/signature/definition/folding/formatting стабильны; регистрация
  теперь принимает DocumentSelector (строка languageId по-прежнему валидна).

### 1.4. Что, по данным И2, НЕ ломается (проверено по d.ts/бандлу 0.55.1)

`deltaDecorations` (deprecated, но работает; на модели — вообще не deprecated), `changeViewZones`,
`addOverlayWidget`/`addContentWidget` (у content-виджетов: `position.range` → `secondaryPosition`, 0.35 —
у нас range в позициях контент-виджетов не используется, проверить), `saveViewState/restoreViewState`,
`trigger` + все наши action id (`editor.action.triggerSuggest`, `actions.find`, `editor.fold*`…),
`monaco.editor.tokenize`, `colorizeElement`, `setModelMarkers`/`getModelMarkers` (+`removeAllMarkers`
с 0.34), `createModel`, `setModelLanguage`, `onDidCreateEditor`, `addCommand`/`addAction`/`createContextKey`,
`insertSpaces/trimAutoWhitespace/scrollBeyondLastLine/parameterHints.cycle/find.addExtraSpaceOnTop`,
`getRawOptions()`, `getScrolledVisiblePosition`, `revealLine*`, `executeEdits`, `pushUndoStop`.

## 2. Рецепт сборки и ES-floor (по VAEditor 0.55.1, перенос в наш стек)

Движок поля 1С ≈ Safari 11–13 WebKit (на Windows — V8WebKit): нет ES2020-синтаксиса, нет части API.
Monaco ≥0.31 собран esbuild'ом и зовёт современные API уже на загрузке. Рецепт из трёх слоёв:
транспиляция + рантайм-полифиллы + строковые патчи. Всё ниже — подтверждено работающим VAEditor
(платформа 8.3.14+; наши лоадеры `blobUrl/compile/monacoNls` — исторически те же файлы).

### 2.1. Тулчейн

- **webpack 5** (+ webpack-cli, dev-server 5) — webpack 4 не парсит ES2022-исходники Monaco.
- `resolve.alias`: `'monaco-editor$': 'monaco-editor/esm/vs/editor/editor.main.js'` — иначе
  commonjs-`require` через `exports` пакета утянет AMD-min, который webpack не разбирает.
- **`esbuild-loader { target: 'es2015' }`** на `node_modules/monaco-editor/esm/**/*.js` — сносит
  `?.`/class fields/static blocks. Наш код — babel `@babel/preset-env` как сейчас (или тоже esbuild).
- **terser**: `ecma: 2015`, `format: { quote_keys: true, ascii_only: true }` — иначе минификатор
  генерит `??` из `null==a?b:a` и раскавычивает не-ASCII ключи (`℘:"wp"`), движок не парсит.
- `output.globalObject: 'self'`; `module.parser.javascript.worker: false` (воркеры — только через
  наши лоадеры, не через нативный webpack5-парсинг `new Worker`).
- **Воркер**: как сейчас — `blob-url-loader!compile-loader?target=worker&emit=false!...editor.worker`,
  но `tools/loaders/compile.js` переписать под webpack5 child compilation (у VAEditor готовый:
  `WebWorkerTemplatePlugin` + `EntryPlugin` + `LimitChunkCountPlugin(1)` + **`asyncChunks: false`** —
  Monaco 0.52+ дробит воркер через `import()`, blob-воркер догрузить чанк не может) и **с префиксом
  WORKER_POLYFILL** — у воркера свой глобальный контекст, полифиллы main-бандла туда не доезжают
  (нужны: globalThis, queueMicrotask, WeakRef/FinalizationRegistry, Array.flat/flatMap/at/findLast(Index),
  Object.fromEntries/hasOwn, Promise.allSettled, String.replaceAll/at/matchAll/trim*).
- **es-check как CI-гейт**: `es-check es2015 dist/*.js` после сборки — страховка от дрейфа ES-floor
  (у VAEditor гейт es2019; берём строже, по цели транспиляции).
- postcss: autoprefixer `safari >= 11` + удаление `cursor: -webkit-image-set(...)` из CSS Monaco
  (иначе на старом WebView пропадает курсор; у VAEditor — самописный postcss-плагин).

### 2.2. Рантайм-полифиллы (первый импорт entry, ДО любого кода Monaco)

Порядок и мотивация — по `VAEditor/src/polyfills.ts` (278 строк, перенос почти дословный):

1. `globalThis` → `self` (сам полифилл не должен использовать `globalThis`-синтаксис). Monaco ≥0.45
   зовёт его при загрузке модулей.
2. Гаситель `unhandledrejection` с `reason.name/message === 'Canceled'` (capture, первым) — штатные
   отмены Monaco иначе каскадят ошибкой в форму 1С.
3. `WeakRef` — стаб с **сильной** ссылкой; `FinalizationRegistry` — no-op. Monaco ≥0.45 зовёт WeakRef
   в `_attachModel` без guard'а.
4. **`ClipboardItem` + `navigator.clipboard`** с in-memory буфером — критично: без ClipboardItem
   `editor.create()` падает (WebKit-путь `installWebKitWriteTextWorkaround` зовёт
   `clipboard.write([new ClipboardItem(...)])` при создании сервиса), а без буфера paste пустой.
   Писать в буфер из всех путей: `writeText`, `write([ClipboardItem])` (+перехват промисов внутри
   ClipboardItem), DOM `copy`/`cut`; `readText` отдаёт буфер.
5. `queueMicrotask` (зовётся при загрузке бандла, Monaco ≥0.32).
6. `ResizeObserver` (`@juggle/resize-observer`) — без него `automaticLayout: true` роняет `create()`.
7. `matchMedia`/MediaQueryList: патч **прототипа через инстанс** (глобального конструктора
   MediaQueryList в поле нет) — делегировать `addEventListener('change',…)` → `addListener`. Без
   этого падает `StandaloneServices.get()`.
8. Методы: `Array.prototype.flat/flatMap` (create() зовёт), `.at/.findLast/.findLastIndex`
   (bracket-pair colorization), `String.prototype.replaceAll` (тема/getCSS), `.at`, `.matchAll`,
   `.trimStart/trimEnd` (markdown-рендер marked), `Object.fromEntries/hasOwn`
   (`AmbiguousCharacters._getData` — путь активен на кириллице!), `Promise.allSettled`.
9. **Proxy НЕ полифиллить** (в движке есть нативно; воркер-хост 0.53+ использует Proxy).
   `structuredClone/requestIdleCallback/performance/Intl` — VAEditor'у не понадобились.

Дополнительно (из `1c-webkit-patch.js`, вызывать последним): шим `Node.prototype.isConnected`
(достаточно `get(){return true}`), удаление инжектируемого 1С стиля скроллбара
(`#1C_scrollbar_12704CA4-…`), перехват keydown по `keyCode` на document для клавиш, которые
перехватывает форма 1С (Ctrl+S/Ctrl+цифры/Esc/PgUp/PgDn) — адаптировать под наш набор событий.

Отдельно **новое требование 0.55**: standalone Monaco не регистрирует `IProductService`, а paste
(`editor.action.clipboardPasteAction`) его запрашивает → «unknown service 'productService'».
Регистрация ДО инициализации StandaloneServices:
`registerSingleton(IProductService, {...,quality:'stable'}, Delayed)` из
`monaco-editor/esm/vs/platform/instantiation/common/extensions` (см. `VAEditor/src/product-service`).

### 2.3. NLS / русская локализация

Наш `monaco-editor-nls@2` — мёртв для 0.55. Таймлайн: loader-plugin `vs/nls` жил до 0.50;
с 0.51 — `nls.messages.<lang>.js` через `globalThis._VSCODE_NLS_MESSAGES`; в ESM официальный путь —
импорт `monaco-editor/esm/nls.messages.ru.js` **до** `editor.main`. Проверить первым делом — если
официальной ru-таблицы достаточно, свой шим не нужен. Фолбэк — схема VAEditor:
`NormalModuleReplacementPlugin(/\/(vscode-)?nls\.js$/)` → свой шим (`localize/localize2`,
`getNLSLanguage()/getNLSMessages()` → undefined) + лоадер `monacoNls` (дописывает путь модуля
первым аргументом `localize2?(`, lookbehind в лоадере — он nodejs, можно) + вендоренная ru-таблица.
У автора в И4 — та же схема (`src/nls.ru.js`). Шим не гнать через esbuild (ES2015 руками).

### 2.4. Строковые патчи Monaco (replace-strings + assertApplied)

Применять **до** esbuild-loader (на сыром коде, пока константы не свёрнуты и комменты не срезаны).
Обязателен **assertApplied**: сборка падает, если патч не наложился (защита от дрейфа версии Monaco;
у VAEditor это плагин на afterEmit + счётчики в лоадере). Набор для 0.55.1:

1. `new RegExp(inputRegex, 'd')` → `new RegExp(inputRegex, '')` — флаг `d` (hasIndices, Safari 15)
   в editorOptions → «Invalid flags». Также флаг `'gdm'` в `findSectionHeaders` (0.48+, section
   headers миникарты) — либо патч, либо `minimap.showMarkSectionHeaders/showRegionSectionHeaders: false`.
2. Lookbehind-литерал `(?<=['"\s])` ×4 в `defaultDocumentColorsComputer.js` → `(?:['"\s])` —
   в ESM это **регэксп-литерал**, на WebKit без lookbehind — SyntaxError всего модуля при загрузке.
   (В `linesOperations` lookbehind обёрнут в try/catch — не трогать.) RegExp глобально НЕ оборачивать:
   реконструкция через `.source` ломает именованные группы на старом WebKit.
3. `secondary: [2048 /* KeyMod.CtrlCmd */ | 39 /* KeyCode.KeyI */],` → `secondary: null,`
   (suggestController) — у VAEditor снят Ctrl+I; для нас — решить, нужен ли (см. plan, открытые вопросы).

Наши существующие 0.20-патчи из `webpack.config.js` при этом **умирают и требуют решения заново**:
фильтр контекстного меню по `_bsl` (в И4 автор нашёл строку для 0.47:
`(this._menuItems.get(id) || []).slice(0);` + фильтр `isIMenuItem`), перебиндинг parameterHints Alt+Up/Down → Ctrl+Up/Down
(в И4 — патч по свёрнутым константам `[512 | 16]` → `[2048 | 16]`), метка NUMPAD_DIVIDE,
юникод-стрелки в подсказках, патч `parameterHintsWidget` под кириллические имена параметров.
**Решено заново для всех — байт-точные строки и официальные замены в §6.3** (проверено по
исходникам 0.55.1: два патча заменяются публичными API, два мертвы, остальным найдены строки).

### 2.5. Опции редактора для поля 1С (стартовый набор)

`unicodeHighlight: {ambiguousCharacters:false, invisibleCharacters:false, nonBasicASCII:false}`,
`colorDecorators: false` + `defaultColorDecorators: 'never'` (наш свой colorProvider — проверить),
`useShadowDOM: false`, `automaticLayout: true` (diff уже так), `wordBasedSuggestions: 'off'`,
`autoIndent: 'advanced'`; diff: `+ hideUnchangedRegions` (опция; фичу в мост — как в И4),
`renderMarginRevertIcon: false`, `renderGutterMenu: false`, `useInlineViewWhenSpaceIsLimited: false`.
Проверить `lightbulb.enabled` (теперь строковый режим) — у нас codeActionProvider есть.

## 3. Следствия для single-file сборки (связь со `specs/single-file-build`)

- VAEditor **не** single-file (dist = index.html + app.js + app.worker.js, доставка zip'ом во
  временный каталог → на 8.3.27+ у него будет то же предупреждение). Наш single-file-таргет
  придётся **переносить** на новый стек: html-webpack-plugin 5 умеет инлайн через другие плагины
  (`html-inline-script-webpack-plugin` и т.п.) — `script-ext-html-webpack-plugin` webpack5 не умеет.
- Codicon-шрифт: в ESM — обычный `.ttf`, инлайнится `asset/inline` (VAEditor так и делает). Иконки
  и картинки — `asset/inline`. Blob-воркер уже совместим. `maxChunks=1` применим (у VAEditor 3 чанка,
  но воркеры blob-инлайн; наш чанк `app.worker.js`-аналог надо тоже влить/убрать).
- Смоук `check_single` и GitHub Action переносятся без концептуальных изменений.

## 4. Автотесты и верификация

### 4.1. Что есть сейчас (ветка `webpack`)

- **123 браузерных mocha-кейса**: `src/test.js` (87 `it()`, BSL: bslHelper — автодополнение,
  подсказки, стек вызовов, фолдинг и т.д.) и `src/test_query.js` (36 `it()`, язык запросов).
  Работают только вживую: `npm run debug` → страницы `test`/`test_query` (mocha/chai цепляются
  `<script src="node_modules/...">` в шаблонах, dev-сервер их отдаёт), результат смотрят глазами.
  Тесты создают реальные модели (`monaco.editor.createModel`), зовут `window.init(...)` — т.е.
  фактически интеграционные поверх настоящего Monaco: **готовый регресс-детектор для этапа 3**.
- **`npm test` = `mocha` — нерабочий рудимент**: каталога `test/` нет, mocha падает «no files».
  В спеке/плане на него опираться нельзя (в spec.md v1 ошибочно упоминался — исправлено).
- В И4 (ветка 0.47) `src/test.js` уже частично адаптирован под новый Monaco (~185 строк диффа) —
  сверяться при портировании тестов.

### 4.2. Механика автотеста VAEditor в реальном поле 1С (эталон для уровня T3)

Проверено по клону (`test/autotest.js`, `example/.../Forms/Autotest/...`, `appveyor.yml`):

1. Тестовый вход бандла экспортирует `window.VanessaAutotest(url)`: поднимает mocha (BDD),
   `require.context('.', true, /\.test\.ts$/)` собирает все кейсы, `mocha.run()`.
2. Если передан `url` (в CI — `%APPVEYOR_API_URL%`), каждый pass/fail постится XHR'ом в
   `api/tests` (нативная отчётность AppVeyor). Локально `url` пуст — просто прогон.
3. По `runner.on('end')`: `window.mochaResults = runner.stats` + **клик по скрытой кнопке
   `#AutotestResult`** — 1С ловит его как `ПриНажатии` поля.
4. Форма `Autotest` (открывается при `/C autotest`): в обработчике клика читает
   `defaultView.mochaResults`; если `failures = 0` — пишет `success.txt` рядом с ИБ и `Exit(False)`.
5. CI: `CREATEINFOBASE` → загрузка конфигурации и .epf конфигуратором → `1cv8ct.exe ENTERPRISE …
   /Execute VAEditorSample.epf /C autotest` → **билд падает, если `success.txt` не появился**.
   Плюс отдельный гейт `es-check` на dist.
6. ⚠ Платформа 1С в облачном CI у VAEditor — из стороннего репозитория с запароленным архивом
   тонкого клиента (lintest/tools1c). Для нас юридически/практически проще: прогон в поле —
   на локальном Windows-стенде скриптом, облачному CI оставить браузерные уровни.

### 4.3. Целевая пирамида верификации спайка

| Уровень | Что проверяет | Чем | Где гоняется |
| --- | --- | --- | --- |
| **T0. Сборочные гейты** | ES-floor синтаксиса (`es-check es2015` на `dist/*.js`), наложение патчей Monaco (assertApplied), zero-external для single-file (смоук из [`specs/single-file-build`](../single-file-build/spec.md)) | скрипты сборки | локально + GitHub Actions |
| **T1. Браузерные mocha (наши 123 кейса + новые)** | Совместимость bslHelper/провайдеров с API Monaco 0.55; НЕ проверяет ES-floor (современный движок съест и ES2020) | существующие `test.js`/`test_query.js` + адаптер результатов (`window.mochaResults` + кнопка, по образцу VAEditor) | headless-браузер локально и в GitHub Actions |
| **T2. Headless-раннер для T1** | Автоматизация: поднять собранную тест-страницу, дождаться `window.mochaResults`, отчёт + нон-зеро exit при failures | небольшой скрипт `tools/run_tests_headless.js` (puppeteer-core + системный Chrome/Edge; альтернатива — playwright) | `npm run test:headless` |
| **T3. Автотест в реальном поле 1С** | То, что умеет проверить ТОЛЬКО старый WebKit: ES-floor фактический, полифиллы, clipboard, воркер, NLS, события моста | те же mocha-кейсы внутри поля + минимальная тестовая обработка `.epf` по механике VAEditor (§4.2); запуск `1cv8t ENTERPRISE /Execute … /C autotest` скриптом | локальный Windows-стенд (этапы 1/4/5); Linux-контейнер на этапе 5 |
| **T4. Ручной паритет-чек-лист** | UI-хаки, которые автотестами не взять: suggest-виджет/MutationObserver-фичи, визуал diff, статусбар, дерево, контекстное меню, клавиатура (вкл. macOS), копипаста 1С↔редактор | чек-лист spec.md §5 | браузер + поле 1С по этапам |

### 4.4. Что добавить к существующим 123 кейсам (под 0.55-специфику)

- Формат возвратов провайдеров: `provideCompletionItems` всегда `{suggestions}` (регресс И4);
  `resolveCompletionItem(item, token)` не падает и обогащает item.
- `bracketPairs.*`: `getLastSigMethod`/подсказки по скобкам (были на `findMatchingBracketUp`).
- Фолдинг: диапазоны для запросов в строках, `#Область`, процедур (регресс переписанных регэкспов).
- Мост: `sendEvent` → клик `#event-button` → форма `eventData1C = {event, params}` (эмуляция
  1С-стороны в тесте); дымовой прогон ключевых `window.*`-функций (setText/getText/setTheme/
  setLanguageMode/compare/nextDiff/getSelection…) — просто «зовётся и не бросает + возврат разумен».
- Смоук этапа 1 (отдельный маленький describe): `editor.create()` живой, печать через
  `executeEdits`, `window.monaco` определён, консоль без ошибок загрузки.
- Диагностический кейс окружения (для T3): вывести `ecmaScriptInfo`-подобную сводку движка
  (как в полифилле И4) в результаты — чтобы отчёт из поля 1С фиксировал фактическую версию движка.

## 5. Оценка объёма по нашим файлам

| Файл | Строк | Ожидаемые правки |
| --- | --- | --- |
| `webpack.config.js`, `package.json`, `tools/loaders/*` | ~300 | **Переписать**: webpack5-стек, лоадеры, патчи, полифиллы (по И3; частично готово в И4) |
| `src/polyfills.js` (новый), `src/1c-webkit-patch.js` (новый), `src/product-service.js` (новый), `src/nls*` | ~400 | Перенос из VAEditor c адаптацией (BSD-2 атрибуция) |
| `editor.js` | 4328 | Основной объём: мост/diff/keybindings/приватные хаки/MutationObserver — по И4 diff был +271/−100, у нас на 0.55 сопоставимо ×1.5–2 |
| `bsl_helper.js` | 8521 | Точечно: ~6 мест (bracketPairs, `{suggestions}`, keyCode-литералы, saveref-команда, опечатка kind) |
| `bsl_language.js` | 958 | ~4 места: resolveCompletionItem, токены скобок, setLanguageConfiguration, (+ selector'ы в конце файла) |
| `actions.js` | 372 | KeyCode-переименования, импорт monaco |
| `snippets.js`, `parsers.js`, `finder.js`, `colors.js`, `tree/*` | — | Ожидаемо без правок (проверить Finder после апгрейда) |
| данные (`bslGlobals/bslMetadata/bslQuery/bslDCS`) | — | Без правок |

Полный список функций моста (~150 на `window`) и action id для `editor.trigger` — стабильны по
контракту (см. spec.md §4); их работоспособность проверяется чек-листом паритета.

## 6. Верификация по фактическим исходникам 0.55.1 (2026-07-13)

Пакет `monaco-editor@0.55.1` распакован и прочитан (`esm/vs/**` + `monaco.d.ts`); все белые пятна
§1.2/§2.4 закрыты. Пути ниже — от `esm/vs/`. (Пакет при реализации просто ставится в node_modules.)

### 6.1. Undo-хак (`onDidPaste`, editor.js:2375) — замена спроектирована, целиком публичный API

**Что делает фича**: в режиме запросов вставленный текст-литерал 1С очищается от кавычек/`|`
(`window.setText(query, e.range)`), после чего операция очистки выталкивается из undo-стека —
чтобы Ctrl+Z одним шагом возвращал состояние до вставки, без промежуточного «сырого» текста.
У хака был латентный баг: инверсия вставки оставалась посчитанной по старым координатам (спасала
только валидация ранжей при applyEdits).

**Порт невозможен**: в 0.55 `model._commandManager` жив, но `currentOpenStackElement` исчез —
стек делегирован `IUndoRedoService` (`editStack.js:304-332`), элемент
(`SingleModelEditStackElement`) хранит сжатые `TextChange`-буферы, массива `editOperations` нет.

**Замена (строго лучше, без приватщины)** — в 0.55.1 есть публичные `editor.popUndoStop()`
(«Remove the "undo stop" in the undo-redo stack», d.ts:6248; переоткрывает последний элемент,
последующие правки приклеиваются к нему через `canAppend`) и `model.pushStackElement()/
popStackElement()` (d.ts:2336/2341):

```js
// вместо window.setText(...) + pop из undo-стека:
window.editor.popUndoStop();                       // переоткрыть элемент вставки
window.editor.executeEdits('queryPasteCleanup',
  [{ range: e.range, text: cleaned, forceMoveMarkers: true }]);  // очистка клеится к вставке
window.editor.pushUndoStop();                      // закрыть обратно
```

Вставка+очистка становятся одним элементом стека с корректными инверсиями. ⚠ Наш `window.setText`
здесь не использовать — он делает `pushUndoStop()` ДО правки (editor.js:137); нужна прямая
последовательность (+ перенести из setText бухгалтерию закладок/брейкпоинтов, если она тут нужна).
Побочно: `IPasteEvent` в 0.55 = `{range, languageId, clipboardEvent?}` — наше использование
`e.range` совместимо.

### 6.2. Приватные хаки — вердикты по исходникам (10/10 проверено)

| # | Хак (наш код) | Вердикт 0.55.1 | Замена |
| --- | --- | --- | --- |
| 1 | `suggestController.widget.suggestWidgetVisible.get()` | Переименован дважды: `widget` — `WindowIdleValue` (`.value`, метода `getValue()` нет); ключ — `_ctxSuggestWidgetVisible` (suggestWidget.js:231); имя контекст-ключа прежнее `suggestWidgetVisible` | Надёжнее всего: подписка `widget.value.onDidShow/onDidHide` (suggestWidget.js:109-114) и свой флаг; либо чтение контекст-ключа. НЕ читать через `createContextKey` (он перезапишет значение) |
| 2 | `widget.list.view.items[row].element.completion` | Умер (`list` → `_list`) | Штатный `widget.value.getFocusedItem()` → `{item, index, model}`; `item.completion.insertText`; весь список — `model.items`; события `onDidFocus/onDidSelect` (suggestWidget.js:287,355,566-579) |
| 3 | `_contentWidgets['editor.widget.suggestWidget']`, `['editor.widget.parameterHintsWidget']`, `_overlayWidgets['editor.contrib.findWidget']` | Живы: карты и все три ID без изменений (codeEditorWidget.js:213-214,1091; suggestWidget.js:835; parameterHintsWidget.js:48; findWidget.js:93). Но регистрация **ленивая** — до первого показа ключа в карте нет | Null-чеки обязательны. Прямее: suggest DOM — `widget.value.element.domNode`; hints — контриб `editor.controller.parameterHints` → `widget.rawValue?.domNodes.element`; find — контриб `editor.contrib.findController`→`._widget?.getDomNode()` |
| 4 | `getContribution('snippetController2').insert()` | **Жив как есть** (ID и `insert(template, opts)` не менялись; контриб Lazy, но `getContribution` сам инстанцирует — codeEditorContributions.js:78) | Только null-чек |
| 5 | `command: {id: 'vs.editor.ICodeEditor:1:saveref'}` (и `:1:requestMetadata`) | Формат жив: `getId()+':'+actionId`, `:1:` = первый созданный CodeEditorWidget (standaloneCodeEditor.js:118; codeEditorWidget.js:278-283,1518). Diff-редактор сдвигает счётчик — хрупко | Заменить на `monaco.editor.registerCommand('bsl.saveref', handler)` (standaloneEditor.js:354) + `command: {id:'bsl.saveref'}` во всех ~30 местах bsl_helper.js (там же сравнение id на :3198) |
| 6 | `_themeService.getTheme().themeName` | `getTheme()` → `getColorTheme()`; поле `_themeService` на редакторе и `themeName` на теме живы (standaloneThemeService.js:275; codeEditorWidget.js:208). Вариант И4 (`_standaloneThemeService`) в 0.55.1 неверен | Лучше вести имя темы своей переменной при `setTheme` (тему меняем только мы); приватная цепочка `_themeService.getColorTheme().themeName` — как fallback |
| 7 | Видимость parameter hints через `_contentWidgets[...]` | Работает (с null-чеком, п.3) | Прямее: `getContribution('editor.controller.parameterHints').widget.rawValue?.visible` (`rawValue` не форсирует создание) или контекст-ключ `parameterHintsVisible` |
| 8 | `_commandManager.currentOpenStackElement.editOperations.pop()` | **Умер** (см. §6.1) | §6.1 |
| 9 | `editor._modelData` | Жив как есть | — |
| 10 | `getRawOptions().contextmenu` | Жив, **публичный** API (d.ts:6172) | — |

### 6.3. Строковые патчи — байт-точные строки для 0.55.1

Главный сдвиг: **из шести 0.20-патчей два заменяются официальными API, два мертвы.** Обязательных
билд-патчей остаётся мало, у всех проверены точные строки (уникальность в дереве — проверена).

1. **Фильтр контекстного меню `_bsl`** — официального API нет (issue monaco#1567 открыт). Лучше
   билд-патча — **рантайм-обёртка** (точечно бьёт только по контекстному меню):

   ```js
   import { MenuRegistry, MenuId, isIMenuItem } from 'monaco-editor/esm/vs/platform/actions/common/actions.js';
   var orig = MenuRegistry.getMenuItems.bind(MenuRegistry);
   MenuRegistry.getMenuItems = function (id) {
     var items = orig(id);
     if (id === MenuId.EditorContext)
       items = items.filter(function (i) { return isIMenuItem(i) && i.command.id.indexOf('_bsl') >= 0; });
     return items;
   };
   ```

   (Если всё же патчем: `platform/actions/common/actions.js:337`, search
   `result = [...this._menuItems.get(id)];` с отступом 12 пробелов.)
2. **Ctrl+Up/Down для параметр-хинтов** — **патч не нужен**: `monaco.editor.addKeybindingRules`
   с командами `showPrevParameterHint`/`showNextParameterHint`,
   `when: 'parameterHintsVisible && parameterHintsMultipleSignatures && editorFocus'`
   (опционально — null-правила для гашения Alt-вариантов). Динамические правила перекрывают
   `scrollLineUp/Down`. (Строки для патча, если понадобится, — parameterHints.js:108-122,
   формат `secondary: [512 /* KeyMod.Alt */ | 16 /* KeyCode.UpArrow */],`; скоупить test'ом
   на `parameterHints\.js$` — те же строки есть в hoverActions.js.)
3. **Кириллица в подсветке параметра подсказки** — **патч не нужен**: в 0.55 `ParameterInformation.label`
   принимает пару индексов `[start, end]` (monaco.d.ts:7722), ветка `Array.isArray` минует regex
   вовсе → отдавать пары из нашего SignatureHelp-провайдера (правка bsl_helper.js). Текущий regex
   0.55.1 (`(\\W|^)...(?=\\W|$)`, parameterHintsWidget.js:261-280) для кириллицы всё ещё сломан.
   Fallback-патч (ES5-безопасный): `\\W` → `[^\\wа-яёА-ЯЁ]` в обеих позициях.
4. **NUMPAD_DIVIDE → `/`** — актуален, целей теперь ДВЕ: UI-подписи клавиш —
   `base/common/keyCodes.js:130` (search — строка таблицы, отступ 8 пробелов:
   `[1, 90 /* ScanCode.NumpadDivide */, 'NumpadDivide', 113 /* KeyCode.NumpadDivide */, 'NumPad_Divide', 111, 'VK_DIVIDE', empty, empty],`
   → `'NumPad_Divide'` заменить на `'/'`); reverse-lookup enum —
   `common/standalone/standaloneEnums.js:638` (`= 113] = "NumpadDivide";` → `"/"`).
   ⚠ Плюс правка нашего кода: `actions.js:176-188` использует `KeyCode.NUMPAD_DIVIDE` — в 0.55
   такого члена нет (undefined), нужно `NumpadDivide`.
5. **Стрелка табуляции 0x2192 → 0xBB** — актуален; ровно 2 вхождения кода:
   `common/viewLayout/viewLineRenderer.js:815` (`sb.appendCharCode(0x2192);`) и
   `browser/viewParts/whitespace/whitespace.js:195` (тернарник с `String.fromCharCode(0x2192)`).
   НЕ трогать литералы `'→'` в usLayoutResolvedKeybinding.js и fontMeasurements.js. При желании
   заменить и halfwidth-ветку `0xFFEB`.
6. **Мёртвые патчи** — `let __insane_func` (insane выпилен, теперь dompurify) и
   `let CURRENT_LOCALE_DATA` (пакет monaco-editor-nls уходит вместе со старой NLS) — **удалить**.

**Патчи VAEditor — все 4 цели присутствуют байт-точно** в 0.55.1:
(a) `new RegExp(inputRegex, 'd')` — `common/config/editorOptions.js:1606` (1 вхождение);
(b) lookbehind `(?<=['"\s])` — `common/languages/defaultDocumentColorsComputer.js:89` (4 вхождения
в одном литерале — роняет парсинг модуля на старом WebKit, патчить обязательно);
(c) `secondary: [2048 /* KeyMod.CtrlCmd */ | 39 /* KeyCode.KeyI */],` —
`contrib/suggest/browser/suggestController.js:675,839,859` (3 вхождения);
(d) `` new RegExp(options.markSectionHeaderRegex, `gdm${multiline ? 's' : ''}`) `` —
`common/services/findSectionHeaders.js:64`.

### 6.4. Селекторы / MutationObserver — итог аудита

Счёт: **жив — 18, переименован — 3, умер — 2**. Document-level MutationObserver остаётся
жизнеспособным: shadow DOM в standalone-виджетах 0.55.1 не используется, контейнер
`overflowingContentWidgets` жив и принимает suggest/hints/overlay message.

Живы как есть (проверено по js+css пакета): `.parameter-hints-widget`, `.monaco-editor-overlaymessage`
с `fadeIn`, `.monaco-list-rows`/`.monaco-list-row`/`.focused`, `data-index`/`aria-label`,
`.details-label`, `.readMore`, `.suggest-icon`, `.monaco-icon-name-container`, `.suggest-widget`
(корень) и `.suggest-widget .message`, `.detected-link-active`, `[monaco-view-zone]`, `line-numbers`,
`.editor-widget.find-widget` (+`.visible`/`.replaceToggled`; высоты пересмотреть — инпут теперь
textarea), ID виджетов в реестрах.

Переименованы: `.monaco-editor-hover` → **`.monaco-hover`** (`.hover-row` жив; editor.js:1052);
`codicon-close` у кнопки закрытия поиска → **`codicon-widget-close`** (editor.js:4283); внутренние
поля SuggestWidget — `list/listElement/onListMouseDownOrTap/suggestWidgetVisible` →
`_list/_listElement/_onListMouseDownOrTap/_ctxSuggestWidgetVisible`, сам виджет теперь под обёрткой:
`_contentWidgets['editor.widget.suggestWidget'].widget._widget`.

**Умерло — всё, что завязано на `docs-side`/`.details` suggest-виджета** (editor.js:1278,1287,
2576-2579,2794 — `setActiveSuggestDetail`, `sideDetailIsOpened` в `generateEventWithSuggestData`,
ветка type/docs в `startStopSuggestActivationObserver`): панель документации теперь **отдельный
overlay-виджет** `.suggest-details-container > .suggest-details` (id `'suggest.details'`,
suggestWidgetDetails.js:275-286) ВНЕ `.suggest-widget`; класс `docs-side` больше не ставится
(вместо него `shows-details` на корне); `.header` теперь содержит кнопку-codicon + `p.type`
(запись `innerText` в `.header` снесёт кнопку — писать в `.header .type`). Открытость панели:
`document.querySelector('.suggest-details-container')` или контекст-ключ
`suggestWidgetDetailsVisible`. Эту группу функций на этапе 4 переписывать под новую структуру.

Suggest-обсервер по `childList` для класса `focused` ненадёжен и в 0.20-логике (строки списка
реюзаются, фокус — attribute-мутация): при миграции заменить на публичные
`onDidFocus/onDidSelect/onDidShow/onDidHide` — это заодно уберёт override `onListMouseDownOrTap`.
