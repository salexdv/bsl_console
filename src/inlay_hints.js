const monaco = require('./monaco');

// Инлей-хинты для Monaco 0.20: в этой версии нет InlayHintsProvider, поэтому текст подсказки
// вставляется декорацией afterContentClassName с CSS ::after — тем же механизмом, что и
// ghost-текст inline-подсказок (createInlineGhosttextRenderer в editor.js). Позиционирование
// при скролле, враппинге и правках текста выполняет сам Monaco.

const INLAY_HINT_MARKER = 'bsl-inlay-hint';
const INLAY_HINT_CLICKABLE_MARKER = 'bsl-inlay-hint-clickable';
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

      hints.push({
        line: line,
        column: column,
        text: text,
        id: item.id === undefined ? null : item.id,
        eventParams: eventParams
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

  function handleElementClick(element) {

    if (!element || !element.classList || !classNameToHint.size)
      return false;

    for (let i = 0; i < element.classList.length; i++) {

      let name = element.classList[i];

      if (name.lastIndexOf(INLAY_HINT_CLASS_PREFIX, 0) !== 0)
        continue;

      let hint = classNameToHint.get(name);

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

    }

    return false;

  }

  function dispose() {

    currentHints = [];
    clearRendered();

    if (styleNode.parentNode)
      styleNode.parentNode.removeChild(styleNode);

  }

  return {
    setHints: function (value) {

      let parsed = parseInlayHints(value);

      if (parsed.error)
        return { errorDescription: parsed.error };

      currentHints = parsed.hints;
      render();

      return true;

    },
    clear: function () {

      currentHints = [];
      clearRendered();

    },
    handleElementClick: handleElementClick,
    dispose: dispose,
    getState: function () {

      return {
        hintsCount: currentHints.length,
        renderedCount: renderedCount,
        cssText: styleNode.textContent,
        // Копия текущего набора — позиции/тексты для тестов и отладки.
        hints: currentHints.map(function (hint) {
          return {
            line: hint.line,
            column: hint.column,
            text: hint.text,
            id: hint.id,
            eventParams: hint.eventParams
          };
        })
      };

    }
  };

}

export { parseInlayHints, escapeCssString };
