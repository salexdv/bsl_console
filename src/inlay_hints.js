const monaco = require('./monaco');

// Инлей-хинты для Monaco 0.20: в этой версии нет InlayHintsProvider, поэтому текст подсказки
// вставляется декорацией afterContentClassName с CSS ::after — тем же механизмом, что и
// ghost-текст inline-подсказок (createInlineGhosttextRenderer в editor.js). Позиционирование
// при скролле, враппинге и правках текста выполняет сам Monaco.
//
// Исключение — наборы тултипов параметров запроса (specs/query-params-tooltips): их кладёт
// queryParamsTooltipsController с флагом queryParams (setHints), и у хинтов с полем tooltip
// при наведении показывается markdown-подсказка — штатным hover-виджетом Monaco через
// провайдера (см. ensureQueryParamsHoverProvider ниже).

const INLAY_HINT_MARKER = 'bsl-inlay-hint';
const INLAY_HINT_CLICKABLE_MARKER = 'bsl-inlay-hint-clickable';
// Маркер хинта с markdown-tooltip в наборе тултипов параметров запроса: ::after становится
// хит-тестуемым (pointer-events: auto в decorations.css), иначе у некликабельного хинта
// (pointer-events: none) событие мыши проваливается мимо span декорации — см. handleMouseMove.
const INLAY_HINT_TOOLTIP_MARKER = 'bsl-inlay-hint-with-tooltip';
const INLAY_HINT_CLASS_PREFIX = 'bsl-inlay-h-';

// Экранирует текст для использования в CSS-строке content: "...".
// Управляющие символы (в т.ч. переводы строк) заменяются пробелом — хинт однострочный.
function escapeCssString(text) {

  let result = '';

  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code < 32)
      result += ' ';
    else if (text.charAt(i) == '\\')
      result += '\\\\';
    else if (text.charAt(i) == '"')
      result += '\\"';
    else
      result += text.charAt(i);
  }

  return result;

}

// Markdown-подсказка при наведении на хинт из набора тултипов параметров запроса
// (specs/query-params-tooltips). На Monaco 0.20 нет InlayHint.tooltip (injected text
// появился позже), поэтому подсказку показывает штатный hover-виджет Monaco через
// hover-провайдера: markdown рендерит штатный рендерер с sanitize:true, command:-ссылки
// без isTrusted заблокированы, http/https — кликабельны (markdownRenderer.js).
//
// Позиция мыши над ::after-псевдоэлементом хинта разрешается Monaco в якорь хинта
// (mouseTarget.js: caretRangeFromPoint приходит в граничную колонку пустого span
// декорации), а нативный hover запускается на CONTENT_TEXT (hover.js) — провайдер
// и получает запрос с якорем. Гейты против ложных срабатываний: мышь сейчас над этим
// хинтом (DOM-детект в handleMouseMove — позиция соседнего символа тоже равна якорю)
// и позиция запроса совпадает с якорем хинта.
let hoveredHint = null;
let hoveredModel = null;

// Запоминает хинт под мышью (только с tooltip — прочие подсказки не показывают),
// null — сброс (уход мыши, смена/очистка набора).
function setHoveredHint(hint, model) {

  if (hint && hint.tooltip !== undefined) {
    hoveredHint = hint;
    hoveredModel = model;
  }
  else {
    hoveredHint = null;
    hoveredModel = null;
  }

}

function provideQueryParamsHover(model, position) {

  if (!hoveredHint || model !== hoveredModel)
    return null;

  if (position.lineNumber != hoveredHint.line || position.column != hoveredHint.column)
    return null;

  return {
    range: new monaco.Range(hoveredHint.line, hoveredHint.column, hoveredHint.line, hoveredHint.column),
    contents: [{ value: hoveredHint.tooltip }]
  };

}

let hoverProviderRegistered = false;

// Для hover-провайдеров языка запроса (bsl_language.js): возвращает markdown-подсказку
// тултипа параметра, если мышь сейчас над его хинтом и позиция — якорь хинта. Провайдеры
// языка по этому же условию подавляют штатный hover слова — иначе слово параметра
// (совпавшее со ссылкой в SELECT, см. getQueryModelSelectItemByWord) добавляет вторую
// строку в hover-виджет рядом с markdown-подсказкой.
export function queryParamsTooltipHover(model, position) {
  return provideQueryParamsHover(model, position);
}

// Регистрируется один раз лениво — при первом наборе тултипов параметров запроса
// (по образцу ensureClickCommand в реализации 0.55). Редакторов-вкладок много,
// провайдер один; гейт по модели/позиции отсекает чужие редакторы.
function ensureQueryParamsHoverProvider() {

  if (hoverProviderRegistered)
    return;

  hoverProviderRegistered = true;

  const provider = { provideHover: provideQueryParamsHover };

  monaco.languages.registerHoverProvider('bsl_query', provider);
  monaco.languages.registerHoverProvider('dcs_query', provider);

}

// Разбирает вход setInlayHints (JSON-строка или массив) и нормализует элементы.
// Возвращает { hints } либо { error } — без выбросов.
function parseInlayHints(value) {

  try {

    let parsed = typeof value == 'string' ? JSON.parse(value) : value;

    if (!Array.isArray(parsed))
      return { error: 'Ожидается массив инлей-хинтов' };

    let hints = [];

    for (let i = 0; i < parsed.length; i++) {

      let item = parsed[i];

      if (!item || typeof item != 'object')
        continue;

      let line = Number(item.line);
      let column = Number(item.column);

      if (!isFinite(line) || !isFinite(column) || line < 1 || column < 1)
        continue;

      let text = item.text == null ? '' : String(item.text);
      if (!text.length)
        continue;

      // Произвольное значение для события клика; отсутствующий или null — хинт не кликабельный.
      let eventParams = item.event_params === undefined || item.event_params === null
        ? undefined
        : item.event_params;

      // Markdown-строка всплывающей подсказки (specs/query-params-tooltips); отсутствующая
      // или null — подсказки нет. Используется только в наборах тултипов параметров запроса
      // (см. setHints), классический setInlayHints её игнорирует.
      let tooltip = item.tooltip === undefined || item.tooltip === null
        ? undefined
        : String(item.tooltip);

      hints.push({
        line: line,
        column: column,
        text: text,
        id: item.id === undefined ? null : item.id,
        eventParams: eventParams,
        tooltip: tooltip
      });

    }

    return { hints: hints };

  }
  catch (e) {
    return { error: e.message };
  }

}

export function createInlayHintsController(codeEditor) {

  let decorationIds = [];
  let currentHints = [];
  let renderedCount = 0;
  let classNameToHint = new Map();
  // Набор — тултипы параметров запроса (specs/query-params-tooltips): у хинтов с tooltip
  // включается markdown-подсказка при наведении (см. ensureQueryParamsHoverProvider).
  let queryParamsSet = false;
  let styleNode = document.createElement('style');
  let uid = Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
  let counter = 0;

  styleNode.type = 'text/css';
  document.head.appendChild(styleNode);

  function clearRendered() {

    if (decorationIds.length)
      decorationIds = codeEditor.deltaDecorations(decorationIds, []);

    styleNode.textContent = '';
    classNameToHint.clear();
    renderedCount = 0;

  }

  function render() {

    clearRendered();

    if (!currentHints.length)
      return;

    let model = codeEditor.getModel();
    if (!model)
      return;

    let lineCount = model.getLineCount();
    let decorations = [];
    let rules = [];

    for (let i = 0; i < currentHints.length; i++) {

      let hint = currentHints[i];

      if (hint.line > lineCount)
        continue;

      if (hint.column > model.getLineMaxColumn(hint.line))
        continue;

      let className = INLAY_HINT_CLASS_PREFIX + uid + '-' + counter++;

      rules.push('.' + className + '::after { content: "' + escapeCssString(hint.text) + '"; }');
      classNameToHint.set(className, hint);

      // Кликабельный — только хинт с заданным event_params (см. decorations.css).
      let classes = hint.eventParams !== undefined
        ? INLAY_HINT_MARKER + ' ' + INLAY_HINT_CLICKABLE_MARKER + ' ' + className
        : INLAY_HINT_MARKER + ' ' + className;

      // Markdown-tooltip при наведении — только в наборах тултипов параметров запроса:
      // класс включает pointer-events у ::after, без него DOM-детект в handleMouseMove
      // не опознает некликабельный хинт (см. decorations.css).
      if (queryParamsSet && hint.tooltip !== undefined)
        classes += ' ' + INLAY_HINT_TOOLTIP_MARKER;

      decorations.push({
        range: new monaco.Range(hint.line, hint.column, hint.line, hint.column),
        options: {
          afterContentClassName: classes,
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
        }
      });

    }

    if (!decorations.length)
      return;

    styleNode.textContent = rules.join('\n');
    decorationIds = codeEditor.deltaDecorations([], decorations);
    renderedCount = decorations.length;

  }

  // Достает наш хинт из DOM-элемента события мыши: ::after-псевдоэлемент рендерится
  // внутри span декорации, событие приходит на него с классами декорации (тем же
  // механизмом пользуется handleElementClick для кликов).
  function hintFromElement(element) {

    if (!element || !element.classList || !classNameToHint.size)
      return null;

    for (let i = 0; i < element.classList.length; i++) {

      let name = element.classList[i];

      if (name.lastIndexOf(INLAY_HINT_CLASS_PREFIX, 0) !== 0)
        continue;

      return classNameToHint.get(name) || null;

    }

    return null;

  }

  function handleElementClick(element) {

    let hint = hintFromElement(element);

    if (hint && hint.eventParams !== undefined) {
      let sendEvent = codeEditor.sendEvent || window.sendEvent;
      sendEvent('EVENT_ON_INLAY_HINT_CLICK', {
        id: hint.id,
        line: hint.line,
        column: hint.column,
        text: hint.text,
        event_params: hint.eventParams
      });
      return true;
    }

    return false;

  }

  // Тултипы параметров запроса: запоминаем хинт с tooltip под мышью — hover-провайдер
  // (ensureQueryParamsHoverProvider) отдаст markdown-подсказку для его якоря. Вызывается
  // реальной подпиской onMouseMove (editor.js) и напрямую из тестов; увод мыши с хинта
  // или элемент без наших классов — сброс (провайдер вернет null, hover скроется).
  function handleMouseMove(e) {

    if (!queryParamsSet) {
      setHoveredHint(null, null);
      return;
    }

    setHoveredHint(
      hintFromElement(e && e.target ? e.target.element : null),
      codeEditor.getModel()
    );

  }

  function handleMouseLeave() {
    setHoveredHint(null, null);
  }

  function dispose() {

    currentHints = [];
    setHoveredHint(null, null);
    clearRendered();

    if (styleNode.parentNode)
      styleNode.parentNode.removeChild(styleNode);

  }

  return {
    // options.queryParams — набор от контроллера тултипов параметров запроса:
    // у хинтов с tooltip включается markdown-подсказка при наведении
    // (см. ensureQueryParamsHoverProvider); window.setInlayHints зовет без опций.
    setHints: function (value, options) {

      let parsed = parseInlayHints(value);

      if (parsed.error)
        return { errorDescription: parsed.error };

      queryParamsSet = !!(options && options.queryParams);

      if (queryParamsSet)
        ensureQueryParamsHoverProvider();

      // Прежний наведенный хинт мог исчезнуть из набора — сбрасываем.
      setHoveredHint(null, null);

      currentHints = parsed.hints;
      render();

      return true;

    },
    clear: function () {

      currentHints = [];
      queryParamsSet = false;
      setHoveredHint(null, null);
      clearRendered();

    },
    handleElementClick: handleElementClick,
    handleMouseMove: handleMouseMove,
    handleMouseLeave: handleMouseLeave,
    // Для тестов: hover-объект markdown-подсказки для позиции модели — обёртка над
    // провайдером из ensureQueryParamsHoverProvider (гейты см. provideQueryParamsHover).
    hoverAt: function (model, position) {
      return provideQueryParamsHover(model, position);
    },
    dispose: dispose,
    getState: function () {

      return {
        hintsCount: currentHints.length,
        renderedCount: renderedCount,
        cssText: styleNode.textContent,
        // Копия текущего набора — позиции/тексты для тестов и отладки. tooltip включается
        // в копию только когда задан (markdown-подсказка есть не у каждого хинта).
        hints: currentHints.map(function (hint) {

          let copy = {
            line: hint.line,
            column: hint.column,
            text: hint.text,
            id: hint.id,
            eventParams: hint.eventParams
          };

          if (hint.tooltip !== undefined)
            copy.tooltip = hint.tooltip;

          return copy;

        }),
        queryParams: queryParamsSet
      };

    }
  };

}

export { parseInlayHints, escapeCssString };
