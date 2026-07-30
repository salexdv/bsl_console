# monaco-0.55: план реализации и решения

Транзиентный спутник [`spec.md`](spec.md). Карта дрейфа/рецепт — [`analysis.md`](analysis.md).

## 1. План реализации

Общая логика: сначала **сборочный каркас** (самый неопределённый риск — «заведётся ли вообще»),
потом язык → провайдеры → обвязка (основной объём) → кросс-платформа → отчёт. Каждый этап — гейт.
Суммарная оценка чистой работы: **~12–17 дней** (без ожиданий стендов и ответов автора).

### Заметки для старта реализации (окружение, проверено 2026-07-13)

- **База**: ветка `feature/single-file-html` закоммичена и запушена (single-file + фикс getQuery
  поверх `webpack`) — ветку спайка `feature/monaco-0.55-spike` отводить от неё. При старте
  перевести spec.md в `in-progress`.
- **Node**: под nvm-windows в неинтерактивном шелле `nvm`/`npm` НЕ в PATH — задавать `$env:NVM_HOME`
  и звать по полному пути. Установлен только Node **16.20.2** (хватало webpack4); для нового стека
  поставить **Node 20 LTS** (`nvm install 20`); `nvm use` может требовать админ-прав на симлинк —
  обходной путь: добавлять каталог версии (`$env:NVM_HOME\v20.x.x`) в PATH команды сборки напрямую.
- **Референсы**: локальный клон VAEditor; пакет monaco-editor@0.55.1 при старте просто
  ставится в node_modules (все выводы из него уже в analysis.md §6); ветка автора
  `origin/webpack-monaco-v0.47.0` — готовые правки обвязки для сверки.
- **Гейты в поле 1С**: формат согласован — работа пакетами (этап 1 → ручная проверка в 1С →
  этапы 2–3 (гейт headless) → этап 4 → проверка в 1С). Ответы владельца (2026-07-13, старт):
  - **Node/npm** — ставить: `nvm install 20` → Node **20.20.2**/npm 10.8.2 (v16.20.2 сохранён); в
    неинтерактивном шелле звать по полному пути к каталогу версии (`<nvm>\v20.20.2\{node.exe,npm.cmd}`).
  - **Стенд 1С** — вариант А (руками). Доставка гейта: single-file HTML вкладывается в **копию**
    `console-single-b.epf` (макет `single`=ДвоичныеДанные, self-inflate — механика
    single-file-работы), владелец грузит/проверяет. **Оригинал не менять.** Автозапуск `/C autotest` — опц. позже.
  - **Linux-стенд** — владелец поднимет к моменту раннего Linux-смоука (сразу после гейта этапа 1).

### Этап 0. Согласование и подготовка (0.5 дня)

- Шаги:
  1. Спека → согласование; анонс спайка мейнтейнеру (он «в раздумьях» — PoC для решения;
     тайминг конвергенции develop→webpack учитывать, но не ждать).
  2. Ветка `feature/monaco-0.55-spike` от актуальной базы (`webpack`; если single-file уже влит —
     поверх него, чтобы сразу тащить таргет `build:single`).
  3. Стенды: Windows 1С 8.3.27+ (есть), Linux-контейнер с 1С (подготовить к этапу 5),
     доступ к macOS (согласовать — можно позже, к этапу 5).
- Gate: `status: approved`; ветка создана.

### Этап 1. Сборочный каркас: «голый» Monaco 0.55.1 в поле 1С (2–3 дня)

- Шаги:
  1. `package.json`: новый стек (spec.md §2, первая строка таблицы). Зафиксировать точные версии.
  2. `webpack.config.js`: переписать по analysis.md §2.1 (alias ESM-входа, esbuild-loader es2015,
     terser 2015/quote_keys/ascii_only, globalObject self, parser.worker off).
  3. `tools/loaders/`: compile.js под webpack5 (+asyncChunks:false, +WORKER_POLYFILL),
     replaceStrings с assertApplied; патчи №1–2 из analysis.md §2.4 (флаг `d`, lookbehind).
  4. `src/polyfills.js` + `src/1c-webkit-patch.js` + `src/product-service.js` — перенос из VAEditor
     (BSD-2 атрибуция в шапках файлов).
  5. NLS: сначала официальный ESM-путь (`nls.messages.ru.js`), при недостатке — шим VAEditor.
  6. Минимальный entry (`polyfills` первым импортом!) с `editor.create()` без наших провайдеров;
     `MonacoEnvironment.globalAPI = true` + `window.monaco`.
  7. `es-check es2015` в npm-скрипты; прогон в браузере (DevTools: ноль ошибок загрузки), затем
     в поле 1С Windows.
  8. Тестовый каркас (analysis.md §4): адаптер результатов mocha (`window.mochaResults` + скрытая
     кнопка `#AutotestResult`), смоук-describe «голого» редактора, headless-раннер
     (`tools/run_tests_headless.js`, `npm run test:headless`); режим autotest в `console.epf`
     (взять из последнего релиза, добавить форму Autotest по образцу VAEditor
     `example/`) со скриптом запуска `/C autotest` → `success.txt`.
- Gate (**главный гейт спайка**): редактор открывается и печатает в поле 1С на Windows; копипаста
  работает; ошибок в консоли нет; смоук-тесты зелёные headless И внутри поля (`success.txt`).
  Провал → разбор полифиллов/патчей, дальше не идём.
- Сразу после гейта — **ранний Linux-смоук** (контейнер 1С + поле: редактор открывается/печатает),
  не дожидаясь этапа 5: Linux — главная боль автора на его заходе 0.47, снять этот риск первым.
- Примечание: `npm run debug`/тестовые страницы поднять сразу — итерации быстрее. `npm test` =
  `mocha` — нерабочий рудимент (каталога `test/` нет), заменить на `test:headless`.

### Этап 2. Язык: грамматика + темы (0.5–1 день)

- Шаги: подключить `bsl_language.js` (register + setMonarchTokensProvider + объединённый
  setLanguageConfiguration) и 6 тем; правки токенов скобок (`delimiter.square`→`delimiter.parenthesis`
  для `(` — по И4). Проверить все три языка: bsl, bsl_query, dcs_query.
- Gate: подсветка кода и запросов во всех темах эквивалентна 0.20 (визуальная сверка на эталонных
  текстах из test.html/test_query.html).

### Этап 3. Провайдеры: bsl_helper + данные (2–3 дня)

- Шаги:
  1. Точечные правки `bsl_helper.js`/`bsl_language.js` (analysis.md §1.1: bracketPairs,
     `{suggestions}`, resolveCompletionItem, keyCode-литералы, saveref-команда, опечатка kind).
  2. Регистрация всех провайдеров (completion/hover/signature/definition/folding/formatting/
     color/codeAction/codeLens) — API совместим, проверить возвраты.
  3. `monaco.editor.tokenize`, наш Finder, сниппеты (`snippetController2` + null-чек).
  4. Адаптировать 123 существующих кейса `test.js`/`test_query.js` (сверяясь с их диффом в И4) +
     новые кейсы под точки дрейфа (analysis.md §4.4: `{suggestions}`, `resolveCompletionItem`,
     `bracketPairs`, фолдинг).
- Gate: автодополнение (вкл. метаданные через `updateMetadata`), hover, подсказки параметров,
  переход к определению, фолдинг — работают в браузере; `test:headless` зелёный (все 123+ кейса);
  контрольный прогон тех же тестов внутри поля 1С.

### Этап 4. Обвязка editor.js: мост, diff, хаки (4–6 дней — основной объём)

- Шаги (порядок — от механики к хрупкому):
  1. Механические правки: `getLanguageId`, KeyCode-переименования (и в `actions.js`), опции
     create/updateOptions (analysis.md §2.5), `getLayoutInfo().minimap.minimapWidth`.
  2. Keybindings: `changeCommandKeybinding`/`disableKeyBinding`/`enableKeyBinding` →
     `monaco.editor.addKeybindingRules` (+`command:null` для снятия).
  3. Diff/compare: `goToDiff`, реимплементация `getDiffLineInformationFor*` (перенос из И4),
     опции нового diff-виджета, ревизия diff-декораций и `markDiffLines`; inline-diff overlay.
  4. Приватные хаки — по готовым вердиктам analysis.md §6.2 (все 10 проверены по исходникам
     0.55.1): suggest — `getFocusedItem()`/события вместо DOM-скрейпинга, undo-хак —
     `popUndoStop()`-последовательность (§6.1), saveref → `registerCommand('bsl.saveref')`,
     имя темы — своя переменная, реестры — null-чеки (ленивая регистрация).
  5. MutationObserver + `querySelector` + `decorations.css` — по таблице аудита analysis.md §6.4
     (18 живы / 3 переименованы / 2 умерли); основное переписывание — группа `docs-side`/`.details`
     под новый overlay `.suggest-details`.
  6. Строковые патчи — по analysis.md §6.3 (байт-точные строки готовы): фильтр меню — рантайм-обёртка
     `MenuRegistry.getMenuItems`; parameterHints Alt→Ctrl — `addKeybindingRules`; кириллица в
     подсказках — `label: [start, end]` из провайдера; NUMPAD_DIVIDE и стрелка 0x2192 — патчи
     с assertApplied; insane/nls-патчи удалить.
  7. Сквозная проверка моста: все функции `window` из README + события `EVENT_*` (браузер-эмуляция
     `#event-button`, затем поле 1С). Дымовые mocha-кейсы моста (analysis.md §4.4) — в общий набор.
- Gate: паритет-чек-лист spec.md §5 закрыт в браузере и в поле 1С Windows 8.3.27+; полный
  тест-набор зелёный headless и в поле (`/C autotest`).

### Этап 5. Кросс-платформа и замер границы (2–3 дня + доступность стендов)

- Шаги:
  1. Windows: матрица версий платформы вниз от 8.3.27 (минимум: 8.3.18, 8.3.14 — точки VAEditor)
     до фактической границы; зафиксировать поведение ниже границы.
  2. Linux-контейнер (1С + поле): автотест `/C autotest` + смоук паритет-чек-листа.
  3. macOS: клавиатура (keyCode!), базовый смоук; результат документировать в любом исходе.
  4. Замер: размер бандла, время старта в поле, память (сравнить с 0.20).
- Gate: заполнена матрица платформ; наблюдения macOS/Linux записаны.

### Этап 6. Single-file на новом стеке + отчёт (1–2 дня)

- Шаги:
  1. Перенести `build:single` (инлайн-плагин для webpack5 вместо script-ext; codicon/иконки —
     asset/inline; воркер-чанк влить), прогнать смоук zero-external.
  2. Отчёт автору: объём диффа, карта изменений, матрица платформ, компромиссы, рекомендация;
     предложение по оформлению итога (апгрейд-билд или merge).
  3. Обновить спеку по фактам (расхождения — тем же коммитом), статус по решению.
- Gate: отчёт передан; решение автора зафиксировано в «Решениях».

### Риски и снижение

| Риск | Вероятность/вес | Снижение |
| --- | --- | --- |
| Каркас не заводится в поле 1С (этап 1) | Низкая/критично | Рецепт 1-в-1 с работающего VAEditor 0.55.1; отладка по diffу с ним (локальный клон) |
| Приватные хаки без эквивалента в 0.55 (suggest-список, undo-pop, реестры виджетов) — **подтверждено автором** по опыту его апгрейда 0.47 («с их обновлением всё непросто, особенно под Linux») | ~~Высокая~~ → **Низкая** после верификации 2026-07-13/средне | Все 10 точек проверены по исходникам 0.55.1 — тупиковых нет, у большинства замены публичным API (analysis.md §6); остаточный объём — переписывание группы `docs-side`/`.details` (§6.4); Linux-специфику ловим ранним смоуком (этап 1) |
| MutationObserver/CSS-селекторы по DOM Monaco молча перестают срабатывать | Высокая/средне | Ручной чек-лист каждого селектора; часть классов подтверждённо жива (И2); события падения — в отчёт |
| Строковые патчи дрейфуют при бампах 0.55.x | Средняя/низко | assertApplied валит сборку; версию Monaco пинить точно (0.55.1, без `^`) |
| Производительность на старом WebKit (V8WebKit Win) с данными 3.6 МБ (`bslGlobals`) | Средняя/средне | Замер на этапе 5; сравнение с 0.20; при деградации — профилирование, отчёт автору |
| macOS не чинится апгрейдом | Средняя/низко (для спайка) | Цель — задокументировать; VAEditor на маке живёт → ожидания умеренно-позитивные |
| Конвергенция автора (develop→webpack) уезжает из-под ветки | Средняя/средне | Спайк изолирован в ветке; после конвергенции — ребейз; правки src точечные, конфликтоопасен в основном editor.js |
| Раздувание объёма («заодно перепишем») | Средняя/средне | Жёсткий «Вне области» в spec.md §6; новые фичи 0.5x — только в отчёт |
| webpack5-инлайн для single-file ведёт себя иначе, чем script-ext | Низкая/низко | Проверка смоуком zero-external из single-file-спеки |
| Лицензионный след VAEditor | Низкая/низко | BSD-2 атрибуция в заголовках заимствованных файлов + упоминание в README итоговой поставки |
| Зелёный headless ≠ зелёный в поле (современный движок прощает то, что старый WebKit — нет) | Высокая/средне | Headless — только быстрый детектор API-регрессов; гейты этапов всегда включают прогон в реальном поле (T3); es-check ловит синтаксис, но не рантайм-API — их ловит только T3 |
| Платформа 1С недоступна в облачном CI (лицензии/бинарники; путь VAEditor через сторонний архив — серый) | Высокая/низко | T3 гоняем локальным скриптом на Windows-стенде; в облачном CI — только T0–T2; self-hosted runner — опция после спайка |

## 2. Открытые вопросы

1. **Позиция автора по минимальной платформе**: устраивает ли граница «~8.3.14+, рекомендация
   8.3.18+» (как у VAEditor)? Это ядро его решения — задать при анонсе спайка (этап 0).
2. **Судьба 0.20-патчей поведения** (сужен 2026-07-13): технические решения для всех найдены
   (analysis.md §6.3), вопрос автору остался только о **принципиальности** — нужен ли фильтр
   контекстного меню `_bsl`, перебиндинг хинтов на Ctrl и снятие Ctrl+I как поведение, или
   что-то из этого — исторический балласт.
3. **NLS**: хватит ли официального `nls.messages.ru.js` (покрытие строк), или сразу шим VAEditor?
   Решится экспериментом на этапе 1.
4. ~~`editor.js:2361/2375` (pop undo-стека)~~ → закрыт 2026-07-13 без привлечения автора:
   фича — очистка вставляемого текста запроса с одношаговым Ctrl+Z; замена — публичные
   `popUndoStop()`/`executeEdits`/`pushUndoStop()` (analysis.md §6.1), поведение строго лучше.
5. **Оформление итога**: определяется по результатам PoC (см. «Решения», 2026-07-12) — апгрейд-билд
   или merge. Финализировать на этапе 6.
6. **macOS-стенд**: где взять к этапу 5 (свой/автора/CI недоступен для поля 1С)?
7. ~~Хост-обработка для автотеста в поле~~ → решено 2026-07-12: встраиваем режим autotest в
   `console.epf` автора (см. «Решения»). Остаточный вопрос — согласовать с автором включение
   формы Autotest в его поставку (до согласования живёт как наша модификация его .epf).
8. **Headless-раннер**: puppeteer-core + системный Chrome/Edge (лёгкая зависимость, нужен браузер
   на машине) vs playwright (тяжелее, но самодостаточен в CI). Решить на этапе 1 по факту CI.

## 3. Решения

| Дата | Решение | Причина |
| --- | --- | --- |
| 2026-07-12 | Целевая версия — Monaco **0.55.1**, пиновать точно | Последний стабильный; ровно на ней работает VAEditor (готовые патчи/полифиллы под неё); assertApplied-патчи чувствительны к версии |
| 2026-07-12 | Путь загрузки — только ESM + webpack 5 | AMD с 0.53 deprecated, внутренние AMD-модули недоступны; webpack 4 не парсит ES2022-исходники Monaco |
| 2026-07-12 | Не использовать monaco-editor-webpack-plugin | На 0.53+ известные проблемы (issue #5063); plain-рецепт (integrate-esm.md) + наши лоадеры blobUrl/compile дают полный контроль (нужен для blob-воркера и single-file) |
| 2026-07-12 | Основа слоя совместимости — рецепт VAEditor (BSD-2, с атрибуцией) | Единственный проверенный в бою Monaco 0.55.1 в поле 1С на всех ОС; наши лоадеры исторически те же файлы |
| 2026-07-12 | Ветка автора `webpack-monaco-v0.47.0` — референс правок обвязки, не база | Экспериментальная (прямое указание автора); но её diff editor.js/bsl_helper.js — готовая половина миграции обвязки, сверяться при этапах 3–4 |
| 2026-07-12 | Глобальный `monaco` сохраняем (`globalAPI` + `window.monaco`), bsl_helper не рефакторим на импорты | Минимальный дифф; bsl_helper 8.5 т. строк использует bare-глобал — рефакторинг вне области спайка |
| 2026-07-12 | ES-floor: транспиляция Monaco в es2015 + гейт `es-check es2015` | Строже, чем у VAEditor (es2019) — запас на самые старые движки поля; наш код и так ES5/бабель |
| 2026-07-12 | Строковые патчи Monaco — только с assertApplied; RegExp глобально не оборачивать | Молчаливо не наложившийся патч ловится только в реальной 1С; обёртка RegExp ломает именованные группы на старом WebKit (опыт VAEditor) |
| 2026-07-12 | Спайк ведётся в отдельной ветке `feature/monaco-0.55-spike`, спека — в этой папке на любой ветке | Код спайка не должен мешать single-file-PR |
| 2026-07-12 | Основной регресс-набор — существующие 123 браузерных mocha-кейса, не переписывать, а адаптировать | Уже покрывают bslHelper (главный объём логики) интеграционно поверх реального Monaco; в И4 адаптация наполовину сделана |
| 2026-07-12 | Автотест в реальном поле 1С — по механике VAEditor (`mochaResults` → скрытая кнопка → `success.txt`), запуск локальным скриптом | Единственный уровень, проверяющий старый WebKit (ES-floor/полифиллы/clipboard/воркер); механика проверена в бою; облачный CI с платформой 1С — лицензионно серо (путь lintest/tools1c не берём) |
| 2026-07-12 | `npm test` (= `mocha`, нерабочий) заменяется на `test:headless`; headless — обязательный гейт этапов 3–4, но не замена прогону в поле | Каталога `test/` нет — скрипт мёртв; headless проверяет только API-совместимость, старый WebKit — только T3 |
| 2026-07-12 | Хост автотеста в поле — режим autotest в `console.epf` (форма Autotest по образцу VAEditor), не отдельная `.epf` | Тест гоняется в той же обвязке, в которой редактор реально живёт у пользователей (реальный мост/события, а не синтетический хост); заодно готовый кандидат в постоянный актив. `console.epf` берём из релиза (в репо его нет); включение формы в поставку согласовать с мейнтейнером. Запасной план, если .epf окажется неудобен для модификации, — минимальная своя обработка |
| 2026-07-13 | Спека переведена в **approved**; старт реализации отложен до завершения работ по single-file на текущей ветке. Ветку спайка (`feature/monaco-0.55-spike`) создавать от базы, уже содержащей single-file-таргет | Спайк изолирован в своей ветке и работам single-file не мешает |
| 2026-07-13 | Верификация по фактическим исходникам 0.55.1 выполнена (analysis.md §6): undo-хак → публичные `popUndoStop()`/`executeEdits`/`pushUndoStop`; suggest-скрейпинг → `getFocusedItem()`+события; saveref → `registerCommand`; патчи хинтов (клавиши, кириллица) → официальные API (`addKeybindingRules`, `label:[start,end]`); фильтр меню → рантайм-обёртка `MenuRegistry.getMenuItems`; байт-точные строки оставшихся патчей зафиксированы | Пакет 0.55.1 прочитан напрямую; риск «приватные хаки без эквивалента» существенно снижен — из 10 точек ни одной тупиковой, самое крупное переписывание — группа `docs-side`/`.details` suggest-виджета (§6.4) |
| 2026-07-12 | **Позиция мейнтейнера**: переход на 0.55 он «не форсировал бы» — много низкоуровневых твиков, по опыту апгрейда до 0.47 их перенос «непросто, особенно под Linux». Следствие: спайк — это данные для решения; оформление итога (апгрейд-билд или merge) определяется по результатам PoC | Подтверждает оценку главного риска (analysis.md §1.2 — приватные твики) боевым опытом; Linux-боль была на стеке 0.47 (babel/core-js), рецепт VAEditor (esbuild + полный слой полифиллов) Linux как раз закрывает — проверяем это ранним Linux-смоуком (этап 1) |
| 2026-07-13 | **ES-floor гейт es2015 → es2018.** esbuild понижает СИНТАКСИС (`?.`/class fields/static blocks) до es2015, но НЕ переписывает regex-литералы; monaco (`marked.js`) содержит unicode property escapes `[\p{L}\p{N}]` (ES2018), которые движок поля (Safari 11.1+) поддерживает — ровно поэтому VAEditor флорит на es2019. es2018 — минимальный флор, пропускающий property escapes, и на notch строже VAEditor. Единственная es2018-фича, которой движок лишён (lookbehind, Safari 16.4), закрыта отдельным патчем (§6.3) + assertApplied — es-check её ловить не обязан | Эмпирика сборки: es2015 недостижим без ручного патча каждого `\p{}`-regex в monaco (нецелесообразно для спайка); es2018 достижим и безопасен для цели. Спеку §4.3 (строки про es2015) поправить на Этапе 6 |
| 2026-07-13 | **Атрибуция VAEditor — BSD-3-Clause** (LICENSE: (c) 2020 Pautov Leonid), не BSD-2 как в spec/analysis. Заголовки заимствованных файлов ссылаются на BSD-3 | Прочитан фактический `LICENSE` VAEditor. Расхождение «BSD-2» в spec §2/§4.3 и analysis §0 поправить на Этапе 6 |
| 2026-07-13 | **NLS ru отложена.** monaco 0.55 esm из коробки работает на английском (vs/nls отдаёт дефолты), каркас зелёный без NLS-замены. Официальный `nls.messages.ru.js`/шим — отдельным шагом (после языка/провайдеров) | Меньше движущихся частей на главном гейте «заведётся ли»; решение «официальный vs шим» — экспериментом на реальных строках UI (открытый вопрос №3) |
| 2026-07-13 | **Headless T2 — puppeteer-core + системный Chrome** (на машине есть Chrome и Edge). `tools/run_tests_headless.js`: свой статик-сервер `dist/` + печать-смоук + ловля console.error/pageerror/requestfailed; forward-compatible с `window.mochaResults` (этап 3) | Лёгкая зависимость (без скачивания Chromium); закрывает открытый вопрос №8 в пользу puppeteer-core |
| 2026-07-13 | **.epf-доставка гейта автоматизирована** (`tools/make_epf.ps1`: конфигуратор Dump/Load). Макет `single`=RAW UTF-8 HTML (не сжат). Запуск конфигуратора — только `Start-Process -Wait` (GUI-exe, `&`/`Start` без `-Wait` детачится → пустой результат) и с отключённым sandbox; в тексте команды избегать `Remove-Item` рядом с `C:\Program` (guard среды блокирует) | Выяснено разбором `console-single-b.epf`. Реюзабельно для полевых гейтов этапов 3/4/5. «self-inflate» из памяти — миф (жмёт V8-контейнер) |

## 4. Журнал реализации (спайк)

- **2026-07-13 — Этап 1 (браузерная часть) ПРОЙДЕН.** Ветка `feature/monaco-0.55-spike` от
  `feature/single-file-html`. Каркас (webpack5 + Monaco 0.55.1 + полифилы + 3 строковых патча +
  blob-воркер + product-service) **собирается**: `dist/console.js` 5.09 МБ (один чанк), воркер —
  blob 298 КБ (WORKER_POLYFILL + esbuild es2015), ttf/svg → `data:`. `assertApplied` зелёный (все 3
  патча наложились). `es-check es2018` зелёный. **Headless-смоук зелёный**: `editor.create()` ок,
  `window.monaco` определён, печать кириллицы (insert+readback) ок, ноль console-ошибок/битых запросов.
  Новые файлы: `src/{polyfills,product-service,monaco-environment,1c-webkit-patch,boot}.js`,
  `tools/loaders/{compile,blobUrl,monacoNls,replaceStrings}.js` (webpack5), `tools/run_tests_headless.js`,
  переписаны `package.json`/`webpack.config.js`/`postcss.config.js`. Установлен Node 20.20.2, puppeteer-core.
  - **Остаток гейта этапа 1:** ручная проверка `.epf` в поле 1С (Windows 8.3.27+) + ранний Linux-смоук.
- **2026-07-13 — Полевой артефакт готов.** single-file HTML (5.09 МБ, `npm run build:single` →
  `make_single.js` инлайнит console.js) вложен в новый `.epf`. **Механика .epf выяснена** (разбор
  `console-single-b.epf` конфигуратором 8.3.27.2214): форма читает макет `single` (тип BinaryData,
  **RAW UTF-8 HTML, БЕЗ сжатия** — «self-inflate» из брифа оказался мифом, V8-контейнер жмёт сам) в
  `ЭтотОбъект.HTML`. Макет `src` (PK-zip) — старый dev/file-режим, не на активном пути 8.3.27.
  Пересборка: конфигуратор Dump (иерархич.) → замена `Templates/single/Ext/Template.bin` на новый HTML
  → Load из **корневого xml** (не каталога). Автоматизировано в **`tools/make_epf.ps1`**. Доставлено:
  `console-single-b-monaco055.epf` (3.77 МБ), оригинал не тронут. Ждёт ручной проверки в поле + Linux.
- **2026-07-13 — Этап 2 (язык + темы) зелёный в браузере.** Каркас переключён с plaintext на BSL:
  `expose-monaco.js` (window.monaco ДО bsl_language); `boot.js` регистрирует 3 языка
  (bsl/bsl_query/dcs_query) — register + setMonarchTokensProvider + **СЛИТЫЙ** setLanguageConfiguration
  (indentationRules + brackets + autoClosingPairs + `colorizedBracketPairs:[]`, по analysis §1.3) — и 6 тем
  (defineTheme). Правка `bsl_language.js`: 3× токен `(` `delimiter.square`→`delimiter.parenthesis` (по И4).
  Build ✅ (console.js 5.24 МБ), es-check es2018 ✅, headless ✅ (расширен языковым гейтом): 3 языка
  зарегистрированы, BSL-ключевые слова токенизируются, ноль console-ошибок. Остаток Этапа 2 — визуальная
  сверка 6 тем и подсветки запросов глазами (браузер/поле). Провайдеры не регистрировались — Этап 3.
- **2026-07-13 — ГЛАВНЫЙ ГЕЙТ (поле 1С Windows) ПРОЙДЕН.** Владелец загрузил
  `console-single-b-monaco055.epf` в поле 1С 8.3.27 на Windows — редактор открывается и печатает,
  «в винде все ок». Т.е. весь низкоуровневый рецепт (полифилы/патчи/blob-воркер/ES-floor/clipboard/NLS)
  работает в реальном WebKit поля — ключевой риск спайка (analysis §1.2) снят на Windows. Linux-стенда
  пока нет («негде тестить») → Linux-смоук отложен до Этапа 5 (не блокирует). `.epf` пересобран до Этапа 2
  (подсветка BSL) для визуальной сверки в поле.
- **2026-07-13 — Этап 3 начат: recon drift-points `bsl_helper.js` (строки подтверждены грепом, сдвинулись от analysis §1.1):**
  - **saveref-команда** `'vs.editor.ICodeEditor:1:saveref'` — **~24 вхождения** (1037,1206,1232,1308,1346,1381,1415,
    1449,1487,1852,1887,1939,1994,2058,2093,2320,2457,2491,2570,2811,2862,3929,4773,4831) + сравнение id на **3198**.
    `'…:1:requestMetadata'` — 1 (**5492**). План (§6.2 п.5): `monaco.editor.registerCommand('bsl.saveref', handler)` +
    `'bsl.requestMetadata'`, заменить строки на `bsl.saveref`/`bsl.requestMetadata`. Хендлеры saveref/requestMetadata
    зарегистрированы в editor.js через `editor.addAction({id:…})` (найти при реализации; `window.requestMetadata` — editor.js:877).
  - **bracketPairs** (переехали в `model.bracketPairs.*`): **5216** `findPrevBracket`, **5220** `matchBracket`
    (на `editor.getModel()`), **6607** `findMatchingBracketUp('(', pos)` — по И4 арг `'('`→`')'` (проверить сигнатуру/подсказки).
  - **keyCode-литералы** (→ именованные `monaco.KeyCode.*`): **3996** `lastKeyCode == 10` (Space, Ctrl+Space-триггер);
    **8074** `switch(lastKeyCode)`: `case 1`→Backspace, `case 10`→Space. (Проверить, что `window.editor.lastKeyCode` = monaco KeyCode.)
  - **Опечатка kind**: **4877** `CompletionItemKind.value` → `.Value` (иначе undefined).
  - **`{suggestions}`-возвраты** (0.55 ждёт `{suggestions:[…]}`, не `[]`): проверить getCompletion и ветки (analysis §1.1: ~4148/5975/6014).
  - **resolveCompletionItem** (`bsl_language.js:652`): сейчас сигнатура `(model,position,item)` и **возвращает `model`** (баг) —
    перестроить под `(item, token)` (analysis §1.1: временная модель из `item.insertText`), вернуть `item`.
  - Далее Этап 3b: регистрация всех провайдеров + tokenize/Finder/snippets(null-check) в boot.js; Этап 3c: адаптация 123 mocha + mocha-адаптер.
- **2026-07-13 — Этап 3a (точечные правки `bsl_helper`) СДЕЛАНЫ, компилируются.** Применено: saveref/requestMetadata
  command-id `vs.editor.ICodeEditor:1:*` → `bsl.saveref`/`bsl.requestMetadata` (все ~25 мест, вкл. сравнение 3198);
  `CompletionItemKind.value`→`.Value` (4877); bracketPairs — `findPrevBracket`/`matchBracket`→`bracketPairs.*` (5216/5220),
  `findMatchingBracketUp('(')`→`bracketPairs.findMatchingBracketUp(')')` (6607, арг по И4); пустые возвраты автодополнения
  `return []`→`{suggestions:[]}` (×3: getCompletion/getQueryCompletion/getDCSCompletion); resolveCompletionItem-обёртка
  `(model,position,item)`→`(item,token)` с временной моделью из insertText + `return item` (bsl_language.js:652); keyCode
  `lastKeyCode==10`→`monaco.KeyCode.Space` (3996). Switch на 8074 оставлен числовым — Space=10/Backspace=1 в 0.55 **стабильны**
  (проверено: сдвигались только пунктуация/numpad). Хендлеры saveref/requestMetadata найдены — `actions.js` `permanentActions.{saveref,requestMetadata}.callback(e,obj)`.
  Build ✅ (console.js 5.24 МБ) + es-check es2018 ✅ (правки синтаксически чисты; поведение — на 3c-тестах).
- **2026-07-13 — ВАЖНО, сиквенсинг 3b/3c/4: провайдеры и тесты завязаны на `editor.js`/`window.init`.**
  `test.js:1` `import bslHelper`, `:13` `window.init('8.3.18.1')` в setup, дальше `new bslHelper(model,position)`/`window.updateMetadata`.
  Т.е. **123 mocha-кейса требуют рабочего `window.init`** (editor.js). Провайдеры (штатный цикл регистрации editor.js:1891-1913)
  тоже нужны рантайм-globals editor.js (window.bslGlobals/bslMetadata/bslQuery/bslDCS, contextData, getOption, engLang,
  isSuggestWidgetVisible, sendEvent…). **Вывод:** отдельная регистрация провайдеров в boot.js (3b) избыточна — правильный путь:
  переключить **entry на реальный `editor.js`** (обёрнутый polyfills/monaco-environment/product-service/expose-monaco) и сделать
  Этап-4 точечные drift-fixes editor.js (KeyCode-переименования KEY_*/US_*, `changeCommandKeybinding`→`monaco.editor.addKeybindingRules`,
  `createDiffNavigator`→`goToDiff`, `getLanguageIdentifier().language`→`getLanguageId()`, saveref/requestMetadata→`monaco.editor.registerCommand`
  из `actions.permanentActions`, приватные хаки §6.2, опции create §2.5), чтобы `window.init` собрался и заработал. Тогда провайдеры
  регистрируются штатным циклом (закрывает 3b), а mocha-тесты получают `window.init` (открывает 3c). **План на следующую сессию:**
  entry→editor.js → Этап-4 drift-fixes → build/headless → адаптация 123 тестов + mocha-адаптер. boot.js остаётся для смоука Этапов 1-2.
- **2026-07-13 — Этап 4 (миграция обвязки editor.js) СДЕЛАН; build + es-check(es2018) + headless(bridge) зелёные. Коммит `3b7a426`.**
  Пивот entry `./boot`→`./editor` (webpack.config.js): editor.js обёрнут polyfills/monaco-environment/product-service/
  expose-monaco; убраны мёртвые `@babel/polyfill`+`monaco-editor-nls`+инлайн-MonacoEnvironment; `require('editor.api')`
  → `import monaco from './expose-monaco'` (editor.main = API+контрибы). `isConnected`-гвард перенесён в polyfills.js
  (нужен ДО top-level create; boot.js так же грузил, но гвард после create — латентно), в 1c-webkit-patch осталась
  DOM-уборка; `patchWebKit1C()` в конце файла. **Пивот вскрыл 2 латентных дефекта нового стека** (boot.js их не
  задевал): (1) нет PNG-лоадера для `require.context('./tree/icons')` → добавлен `png|gif` в asset/inline;
  (2) 0.55 `addAction` не терпит null/undefined в keybindings (initContextMenuActions + permanentActions-цикл) →
  фильтр `[action.key, action.cmd].filter(k=>k)`.
  Drift-fixes — все прошли воркфлоу-верификацию по ФАКТИЧЕСКИМ исходникам 0.55.1 + VAEditor (9 тем, 63 находки:
  58 CONFIRMED / 4 NEEDS_REVISION / 1 REFUTED; взяты corrected-версии). Ключевое, что уточнил воркфлоу поверх analysis.md:
  (а) getEquivalentDiffLine — recon-версия (аккумулятор) НЕВЕРНА для строки внутри multi-line change → взят ТОЧНЫЙ порт
  `_getEquivalentLineFor*` (бинарный поиск at-or-before + интерполяция); (б) `.originalEditor/.modifiedEditor` УДАЛЕНЫ
  в 0.55 → get*Editor() (пропущено в analysis, ловит и editor.js:93-94 wordWrap, и getDifferences:1707); (в) changeCommandKeybinding —
  analysis §1 `{command:null}` НЕ снимает дефолт; правильно `{keybinding:0, command:'-'+cmd}`; (г) autoIndent true→'full'
  (не 'advanced'); (д) colorDecorators:false УБИЛ БЫ наш colorProvider → только defaultColorDecorators:'never'.
  Список тем: KeyCode-переименования; keyCode 83→Minus/87→BracketLeft (сдвиг +5 после F20-F24); getLanguageId;
  addKeybindingRules; diff (navi-флаг+goToDiff+реимпл+опции); paste-undo→popUndoStop; saveref/requestMetadata→registerCommand;
  theme getColorTheme; minimap.minimapWidth; suggest getSuggestWidget→getContribution (сам виджет|null) + согласованный
  набор (_list/_completionModel/_ctxSuggestWidgetVisible/_onListMouseDownOrTap); DOM (monaco-hover/codicon-widget-close/
  suggest-details overlay); опции create. onSuggestListMouseOver (мёртв, issue#190) НЕ трогали.
  **Сборка 14.6 МБ** (было 5.24 у boot: +9 = данные bsl* 3.6 МБ + провайдеры/сниппеты/дерево). Узкий entry (только нужные
  контрибы, как VAEditor) — отложен на Этап 6; замер размера/памяти — Этап 5.
  Headless расширен bridge-смоуком (`tools/run_tests_headless.js`): при наличии `window.init` — вызов init + прогон
  setText/getText/getCurrentLanguageId/setTheme/setLanguageMode(bsl_query↔bsl)/isSuggestWidgetVisible/isParameterHintsWidgetVisible;
  все шаги ok, lang=bsl, консоль чистая. Провайдеры регистрируются штатным циклом editor.js → **3b закрыт**.
  **НЕ покрыто load-смоуком** (нужен 3c mocha / поле 1С): completion/hover/signature-возвраты, diff/compare
  (goToDiff+getEquivalentDiffLine), suggest-внутренности при ПОКАЗАННОМ списке, saveref-команда из подсказки, paste-очистка запроса.
  Артефакты верификации: воркфлоу `editor-js-drift-verify` (run wf_c74b53be-b41), worklist — локально.
  **План:** Этап 3c — адаптировать 123 mocha (`test.js`/`test_query.js`, зовут window.init) + mocha-адаптер
  (`window.mochaResults` + скрытая кнопка) → headless-гейт (раннер уже ловит mochaResults); затем полевой гейт .epf (make_epf.ps1).
- **2026-07-13 — Этап 3c (headless-гейт mocha) СДЕЛАН: 123/123 зелёные на 0.55.1. Коммит `bcd192b`.**
  Адаптер (`test.js`/`test_query.js`): `mocha.run()` → `window.mochaResults`(runner.stats) + `window.mochaFailures` +
  клик `#AutotestResult` (для будущего T3-автотеста в поле). Тест-сборка `npm run build:test` (webpack `--env test`:
  entry `test`/`test_query` = `['./editor', './test*']`; mocha/chai — скрипт-тегами из node_modules, НЕ бандлятся,
  избегаем mocha-в-бандлере; HtmlWebpackPlugin на src/test*.html). Раннер `tools/run_mocha_headless.js`
  (`npm run test:mocha`): puppeteer + системный Chrome, свой статик-сервер (dist/ + отдача node_modules/mocha,chai),
  грузит обе страницы, ждёт mochaResults, печатает провалы, нон-зеро exit. **Первый прогон 121/123** — 2 провала
  в test_query (стейл-ассерты пустых возвратов getQueryCompletion: `expect(x).to.be.an('array')` вместо
  `x.suggestions` — последствие 3a `return []`→`{suggestions:[]}`); 3 строки (357/362/455) → `.suggestions`.
  **Второй прогон 123/123.** test.js (87) правок не потребовал (уже адаптирован ранее). Провайдеры (completion/
  stack/queryFields/signature/folding/metadata/DCS/версионные подсказки) работают на 0.55. Осталось T3/T4 —
  полевой гейт поля 1С (Windows 8.3.27+): пересобрать .epf с editor.js-сборкой (build:single + make_epf.ps1), владелец проверяет.
- **2026-07-13 — Полевой гейт T3/T4 (владелец, поле 1С Windows 8.3.27): .epf доставлен, найдено 4 дефекта, 1 исправлен. Коммит `99c79d6`.**
  Доставлено `console-single-b-monaco055-e4.epf` (5.76 МБ). Владелец: (1) скобки методов «радуга»; (2) режим запроса «как
  будто не сработал, остались подсказки по синтаксису языка»; (3) панель параметров зависла пустой (единожды); (4) очень долгая загрузка.
  - **#1 (скобки) — ИСПРАВЛЕНО.** editor.js:1970-73 делал ДВА setLanguageConfiguration подряд (0.55: второй ЗАМЕЩАЕТ первый) →
    терялись indentationRules И не гасилась bracket-pair colorization 0.55 → скобки методов красились «радугой» по вложенности.
    Слил в ОДИН вызов + colorizedBracketPairs:[] (как boot.js) + editor-опция bracketPairColorization:{enabled:false}. Тот же
    баг §1.3, что boot.js уже чинил; в editor.js остался (цикл — это «3b», а mocha скобки/отступы не проверяет) → поймало ТОЛЬКО поле (T4 работает).
  - **#4 (загрузка) — ЧАСТИЧНО.** Узкий entry edcore.main вместо editor.main (алиас bare 'monaco-editor' → edcore.main): без
    ~80 basic-languages и css/html/json/ts-сервисов (регистрируем bsl/bsl_query/dcs сами); XML возвращён точечно (нужен в compare()).
    Но всего −0.6 МБ (14.6→14.0): тяжёлый ts-worker и так не бандлился (getWorkerUrl только editor.worker). Основной вес —
    monaco-ядро (~8 МБ) + данные bsl* (3.6 МБ), для single-file инлайнятся → реальная оптимизация старта = профиль/сжатие данных (Этап 5).
  - **#2 (режим запроса) — НЕ воспроизведён.** Puppeteer-проба (probe.js): setLanguageMode('bsl_query') → getLanguageId=bsl_query,
    queryMode=true, автодополнение = ключевые слова запроса (ВЫРАЗИТЬ), КАК подсвечен. Routing/токенайзер/подсказки переключаются корректно.
    Гипотеза: специфика потока 1С-консоли ИЛИ тема не переключилась визуально. Нужны шаги воспроизведения от владельца.
  - **#3 (param hints пустая висит) — НЕ воспроизведён** (интермиттентно, «как-то раз»): в пробе виджет для Сообщить( вообще не всплыл.
  Доставлено исправленное `console-single-b-monaco055-e4fix.epf` (5.5 МБ). Оригинал `console-single-b.epf` не тронут. Диагностика
  визуала — puppeteer-проба со скриншотами (A_brackets/B_query/C_param_hints.png). **Дальше:** ждём ре-тест поля (#1) +
  шаги воспроизведения #2/#3; затем Этап 5 (кросс-платформа + профиль старта) / Этап 6 (single-file/отчёт).
- **2026-07-14 — Полевой фидбек раунд 2: #3 воспроизведён и исправлен + сжатый single-file (идея владельца). Коммиты `c05faf6`, `c50d144`.**
  **#3 (пустой висящий блок)** — владелец уточнил: после `А = ` + пробел. Пуппетир-проба (probe.js, сценарий D)
  воспроизвела: getCompletion для пустой правой части присваивания отдаёт `{suggestions:[]}`, а 0.55 на пустом результате
  рисует висящий «No suggestions» (на авто-триггере наш checkEmptySuggestions повторно не срабатывает). Корень — правка 3a
  `return []`→`{suggestions:[]}` (нужна была для 0.55). Фикс (bsl_language.js): 3 провайдера (bsl/query/dcs) возвращают
  undefined, когда предлагать нечего → виджет не всплывает (как в 0.20 при return []); хелпер по-прежнему `{suggestions:[]}`
  → 123 mocha целы. Проверено пробой: печать пробела после `А =` → suggest без класса visible, «No suggestions» нет.
  **#2 (режим запроса) — в браузере полностью корректен** (проба: getLanguageId=bsl_query, тема bsl-white-query,
  автодополнение = ключевые слова запроса ВЫРАЗИТЬ). НЕ воспроизводится; владелец переключает кнопкой на форме 1С —
  вероятно, тайминг поля под нагрузкой (клик до готовности) ИЛИ поток консоли. Ждём ре-тест e4fix/pack + шаги.
  **Сжатый single-file** (`npm run build:pack`, `tools/make_pack.js`, devDep pako): gzip(console.js)+base64 в HTML +
  inline pako-инфлейтер (ES5, Safari 11+) → распаковка+eval в поле. HTML **14.0→2.56 МБ**, .epf **5.5→3.92 МБ**; поле
  маршалит в WebKit ~2.6 МБ вместо 14 (парсинг 14 МБ после распаковки ТОТ ЖЕ — выигрыш на чтении/маршалинге строки и
  размере .epf; помогает ли старту — покажет поле). Headless: сжатый single-file распаковывается и грузится, bridge зелёный.
  Доставлено `console-single-b-monaco055-pack.epf` (3.92 МБ, со ВСЕМИ фиксами #1/#3/узкий-entry) — владельцу сравнить старт с e4fix.
  **Дальше:** ре-тест поля (#1 скобки, #3 пустой блок, #2 шаги, pack время старта); затем Этап 5 (профиль старта — parse vs
  marshal; при parse-боттлнеке — данные bsl* на JSON.parse) / кросс-платформа.
- **2026-07-28 — Выявлено ограничение `build:pack` в 1С под Linux.**
  `build:single` работает штатно, а в полной `build:pack` выполняется JavaScript-обработчик
  `document.onclick`, но 1С не генерирует событие `ПолеHTMLПриНажатии`. Изолированные проверки
  `appendChild`, наличия `pako` и полной цепочки gzip/base64 → `pako.ungzip` → `appendChild` проходят,
  вынос `window.sendEvent` и `document.onclick` в `index.html` результатов не дал,
  поэтому конкретная причина не установлена. Решение до дальнейшего расследования: считать
  `build:pack` на Linux экспериментальной и использовать `npm run build:single`.
- **2026-07-14 — Полевой фидбек раунд 3 (ДИАГНОСТИЧЕСКАЯ СБОРКА окупилась): #2 работает, #3 добит, #5 найден. Коммиты `2d39624`, `b373ce8`.**
  Владелец предложил гонять диагностику в поле → собрана `npm run build:diag` (--env diag, `src/diag.js` + `diag-entry.js`):
  экранный оверлей (pointer-events:none), оборачивает функции моста (init/setLanguageMode/setText/setOption/updateMetadata/
  showStatusBar/…) с аргументами + состояние (язык/queryMode/тема) + пуллинг смены языка модели + монитор виджетов
  (suggest _list/_completionModel, param-hints, hover, строка состояния). Владелец прогнал в поле, вернул скриншоты:
  - **#2 (режим запроса) по факту РАБОТАЕТ** — запрос подсвечен как запрос, владелец подтвердил «запросы работают». Раньше
    не переключалось → почти наверняка тайминг клика до готовности редактора под 14 МБ; сжатие/узкий entry подлечили. Наблюдаем.
  - **#3 (пустой блок) — ТОЧНАЯ ПРИЧИНА из диага:** `SUGGEST[DOM-строк=0 msg="No suggestions." _list=0 model=-1]` ПОСЛЕ
    `> updateMetadata(...) → > triggerSuggestions()` (поток догрузки метаданных консоли: набор `Т.` → запрос метаданных →
    updateMetadata → пере-триггер, пустой). Прежний фикс (провайдер→undefined) НЕ гасит ЯВНЫЙ triggerSuggest — Monaco сам
    рисует «No suggestions» (suggestController.js:238 showSuggestions зовётся даже на пустой completionModel). Guard
    (editor.js, конец initEditorEventListenersAndProperies): `suggestCtrl.model.onDidSuggest` + `model.cancel()` при пустой
    completionModel. Обработчики Emitter синхронны → show+cancel до отрисовки, блок не мелькает. Проверено пробой (явный
    триггер на пустом `А =` → suggest-widget без класса visible).
  - **#5 (строка состояния пустая):** updateStatusBar ставил текст через `innerText` (зависит от лейаута, в старом WebKit
    поля не проставлялся) → `textContent`. CSS `.statusbar-widget` (bg #028fef / white) — не при чём. В браузере #3 и #5 НЕ
    воспроизводились — обе поймала диагностика поля (важный урок: T4-баги старого WebKit/потока консоли берёт только поле+диаг).
  123/123 mocha. Доставлены обновлённые `console-single-b-monaco055-diag.epf` (3.93 МБ, фиксы+оверлей) и `-pack.epf` (3.92 МБ, чистый).
  **Дальше:** ре-тест diag.epf (в логе suggest больше НЕ пустой, STATUSBAR с текстом); #2 наблюдаем; затем Этап 5.
- **2026-07-14 — #3 (пустой блок) ДОБИТ ПО КОРНЮ: GPU-слой suggest-списка в старом WebKit. Воркфлоу `wanytb6y3` + коммит `f45cf42`.**
  Полевой diag показал: бокс = suggest с 68 элементами (`SUGGEST[432x194 строк=12 model=68 видно="Новый…" data="Новый, Function"]`
  после `А = ` + пробел — все глобалы без фильтра), строки в DOM С ТЕКСТОМ, бокс нужного размера, но визуально ПУСТО; печать
  (фильтрация → пере-splice) прорисовывает. Т.е. НЕ пустой список (guard ни при чём) и НЕ битые данные — баг перерисовки.
  Воркфлоу (3 агента по исходникам monaco 0.55.1 + VAEditor + WebKit-research, все HIGH, сошлись): контейнер `.monaco-list-rows`
  при transformOptimization (дефолт true, listView.js:47) получает СТАТИЧНЫЙ inline `transform:translate3d(0,0,0)`
  (listView.js:212) → отдельный GPU-композиторный слой; в старом WebKit (Safari 11-13) backing-store слоя НЕ инвалидируется
  при первой синхронной вставке большого списка (splice) → слой остаётся белым. Проверено по исходнику: скролл идёт через
  `style.top` контейнера (:548) и строк (:621), НЕ через transform → снятие статичного translate3d безопасно (не ломает скролл).
  Фикс (`src/decorations.css`): `.suggest-widget .monaco-list-rows {transform/will-change/contain: none !important}` — снимаем
  принудительный слой, строки рисуются на основном paint-слое сразу. Проверено пробой: computed transform `.monaco-list-rows`=none
  (перебивает inline translate3d), suggest в браузере рендерится, скролл цел. VAEditor этот кейс НЕ патчит (grep пусто — у них
  иной сценарий больших авто-списков). Полевая проверка — за владельцем (в браузере баг не воспроизводится; T4-класс). diag.epf/pack.epf с фиксом доставлены.
  **ИТОГ ФИДБЕКА ПОЛЯ (раунды 1-3): #1 скобки ✓ · #2 режим запроса ✓ (был тайминг) · #5 строка состояния ✓ (textContent) ·
  #3 пустой блок ✓ (GPU-слой, на полевой проверке) · #4 загрузка — сжатие 14→2.6 МБ, глубокий профиль старта = Этап 5.**
