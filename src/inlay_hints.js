import monaco from './expose-monaco';

// Инлей-хинты для Monaco 0.55 (specs/inlay-hints): в этой версии есть штатный
// registerInlayHintsProvider, поэтому хинты отдаёт провайдер, а рендер (позиционирование
// при скролле/враппинге, следование за правками, стили тем) выполняет сам Monaco.
// Прецедент трека на Monaco 0.20 (ветка webpack_0_20): декорации afterContentClassName
// + CSS ::after — здесь этот механизм не нужен.
//
// Состав хинтов передаёт 1С (setInlayHints/clearInlayHints в editor.js): редактор не
// вычисляет текст сам. Набор хранится по модели вкладки, якорь каждого хинта — невидимая
// декорация модели, поэтому при правках текста хинт следует за кодом, а состав набора
// не пересчитывается (обновление — повторный вызов setInlayHints со стороны 1С).
//
// Исключение — наборы тултипов параметров запроса (specs/query-params-tooltips): их кладёт
// queryParamsTooltipsController с флагом queryParams (setHints), такие хинты идут без штатной
// command-ссылки (нативный hover «Выполнить команду» выключен), с markdown-tooltip
// (поле tooltip входа) и pointer-курсором при наведении на кликабельный хинт.

const INLAY_HINT_CLICK_EVENT = 'EVENT_ON_INLAY_HINT_CLICK';
const INLAY_HINT_CLICK_COMMAND_ID = 'bsl-console.inlayHintClick';

// Маркер объекта InlayHint, отданного провайдером: по нему обработчик клика отличает
// наши хинты от внутренних injected-text Monaco (в т.ч. от whitespace-вставок паддинга).
const INLAY_HINT_FLAG = '__bslConsoleInlayHint';

// Хранилище наборов: модель вкладки → { hints, anchorIds }.
// hints — разобранные хинты 1:1 с входом setInlayHints; anchorIds — id якорных декораций
// модели (параллельно hints).
const hintsByModel = new Map();

const EMPTY_HINT_LIST = Object.freeze({ hints: [], dispose: function () {} });

// Минимальный IEvent для onDidChangeInlayHints: штатный Emitter Monaco не входит в
// публичный API, а контроллер InlayHintsController зовет только listener/dispose.
function createNotifier() {

  const listeners = new Set();

  return {
    event: function (listener) {
      listeners.add(listener);
      return { dispose: function () { listeners.delete(listener); } };
    },
    fire: function () {
      listeners.forEach(function (listener) { listener(); });
    }
  };

}

const inlayHintsChanged = createNotifier();

function buildClickParams(hint) {

  return {
    id: hint.id,
    line: hint.line,
    column: hint.column,
    text: hint.text,
    event_params: hint.eventParams
  };

}

// Преобразует разобранный хинт в InlayHint Monaco.
// position — ТЕКУЩАЯ позиция якоря ({ lineNumber, column }, следует за правками текста),
// не исходная из входа.
// queryParams — набор от контроллера тултипов параметров запроса (specs/query-params-tooltips):
// label всегда строка без command (иначе Monaco показывает нативный hover «Выполнить команду
// (ctrl+click)»), вместо него у хинта штатный markdown-tooltip (InlayHint.tooltip, IMarkdownString).
// isTrusted не ставим: http/https/mailto-ссылки в markdown кликабельны, command:-ссылки — нет.
function toInlayHint(hint, position, queryParams) {

  const result = {
    position: { lineNumber: position.lineNumber, column: position.column },
    // Фон со скруглением как у инлей-хинтов VS Code (паритет фона 0.20-реализации).
    paddingLeft: true,
    paddingRight: true
  };

  if (queryParams) {

    result.label = hint.text;

    if (hint.tooltip !== undefined)
      result.tooltip = { value: hint.tooltip };

  }
  else {

    // Кликабельный хинт получает command на label part: Monaco подчёркивает его при наведении
    // и исполняет команду по клику с модификатором (Ctrl/Cmd, см. ClickLinkGesture). Обычный
    // клик без модификатора обрабатывает контроллер (createInlayHintsController).
    if (hint.eventParams !== undefined)
      result.label = [{
        label: hint.text,
        command: {
          id: INLAY_HINT_CLICK_COMMAND_ID,
          title: hint.text,
          arguments: [buildClickParams(hint)]
        }
      }];
    else
      result.label = hint.text;

  }

  // Маркер для обработчика клика (attachedData внутреннего рендера ведёт на этот объект).
  result[INLAY_HINT_FLAG] = hint;

  return result;

}

// Провайдер для registerInlayHintsProvider: возвращает хинты модели, попавшие в запрошенный
// диапазон (контроллер Monaco запрашивает видимую область + 30 строк, и НЕ фильтрует
// результат сам — фильтровать обязан провайдер, иначе будут дубли на пересечении диапазонов).
export const inlayHintsProvider = {
  displayName: 'bsl-console',
  onDidChangeInlayHints: inlayHintsChanged.event,
  provideInlayHints: function (model, range) {

    const entry = hintsByModel.get(model);

    if (!entry || !entry.hints.length || model.isDisposed())
      return EMPTY_HINT_LIST;

    const hints = [];

    for (let i = 0; i < entry.hints.length; i++) {

      // Позиция хинта — текущая позиция якорной декорации: при правках текста Monaco
      // сдвигает ее сам, поэтому хинт следует за кодом (паритет поведения 0.20).
      const anchorRange = model.getDecorationRange(entry.anchorIds[i]);

      if (!anchorRange)
        continue;

      if (anchorRange.startLineNumber < range.startLineNumber
        || anchorRange.startLineNumber > range.endLineNumber)
        continue;

      hints.push(toInlayHint(entry.hints[i], {
        lineNumber: anchorRange.startLineNumber,
        column: anchorRange.startColumn
      }, entry.queryParams));

    }

    // Последний отданный набор — для тестов (getRenderedHints контроллера).
    entry.renderedHints = hints;

    return { hints: hints, dispose: function () {} };

  }
};

// Глобальная команда моста клика: InlayHintsController Monaco исполняет command label part
// через ICommandService; регистрируется один раз лениво (редакторов-вкладок много, команда одна).
let clickCommandDisposable = null;

function ensureClickCommand() {

  if (clickCommandDisposable)
    return;

  clickCommandDisposable = monaco.editor.addCommand({
    id: INLAY_HINT_CLICK_COMMAND_ID,
    run: function (accessor, params) {
      if (params)
        (window.sendEvent || function () {})(INLAY_HINT_CLICK_EVENT, params);
    }
  });

}

// Разбирает вход setInlayHints (JSON-строка или массив) и нормализует элементы.
// Возвращает { hints } либо { error } — без выбросов.
export function parseInlayHints(value) {

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

// Контроллер на редактор-вкладку: хранит набор хинтов модели, дергает событие обновления
// провайдера и ловит обычный (без модификатора) клик по кликабельному хинту.
export function createInlayHintsController(codeEditor) {

  let disposed = false;
  let mouseDownHint = null;

  ensureClickCommand();

  function sendClickEvent(params) {
    const sendEvent = codeEditor.sendEvent || window.sendEvent;
    if (sendEvent)
      sendEvent(INLAY_HINT_CLICK_EVENT, params);
  }

  // Достает наш хинт из события мыши: клики по injected text дают target CONTENT_TEXT с
  // detail.injectedText; attachedData внутреннего рендера (RenderedInlayHintLabelPart)
  // ведет на объект InlayHint, отданный провайдером, — опознаем его по маркеру.
  // Чтение с защитными проверками: структура внутренняя, привязана к Monaco 0.55.
  function hintFromMouseTarget(e) {

    if (!e.target || e.target.type !== monaco.editor.MouseTargetType.CONTENT_TEXT)
      return null;

    const detail = e.target.detail;
    const injectedText = detail ? detail.injectedText : null;
    const attachedData = injectedText && injectedText.options ? injectedText.options.attachedData : null;
    const hint = attachedData && attachedData.item ? attachedData.item.hint : null;

    return hint && hint[INLAY_HINT_FLAG] ? hint[INLAY_HINT_FLAG] : null;

  }

  function hasClickModifier(e) {
    return !!(e.event && (e.event.ctrlKey || e.event.altKey || e.event.metaKey));
  }

  // Обычный клик (паритет с реализацией на Monaco 0.20): mousedown+mouseup на одном хинте,
  // без модификаторов (с модификатором срабатывает штатный command label part). Клики по
  // некликабельным хинтам проходят в редактор как обычно.
  function handleMouseDown(e) {
    mouseDownHint = e.event && e.event.leftButton && !hasClickModifier(e)
      ? hintFromMouseTarget(e)
      : null;
  }

  function handleMouseUp(e) {

    const hint = hasClickModifier(e) ? null : hintFromMouseTarget(e);

    if (hint && hint === mouseDownHint && hint.eventParams !== undefined)
      sendClickEvent(buildClickParams(hint));

    mouseDownHint = null;

  }

  // Тултипы параметров запроса (specs/query-params-tooltips): хинт с event_params кликабельный
  // обычным кликом (без штатной command-ссылки), поэтому курсор pointer при наведении ставим
  // сами — Monaco даёт pointer только на активной ссылке с модификатором. Monaco не позволяет
  // передать CSS-класс injected text, а сам .view-lines носит класс monaco-mouse-cursor-text
  // с cursor:text (viewLines.js/mouseCursor.css) — наследованием с контейнера его не перебить.
  // Поэтому вешаем класс на хост-контейнер редактора (getContainerDomNode — родитель
  // div.monaco-editor; className самого .monaco-editor Monaco перезаписывает при смене темы),
  // правило в decorations.css специфичнее cursor:text, пока мышь над хинтом (уходит — сброс).
  const POINTER_CLASS = 'bsl-inlay-hint-pointer';
  let pointerCursor = false;

  function setPointerCursor(enabled) {

    if (pointerCursor === enabled)
      return;

    pointerCursor = enabled;
    codeEditor.getContainerDomNode().classList.toggle(POINTER_CLASS, enabled);

  }

  function queryParamsEntry() {
    const model = codeEditor.getModel();
    const entry = model ? hintsByModel.get(model) : null;
    return entry && entry.queryParams ? entry : null;
  }

  function handleMouseMove(e) {

    const entry = queryParamsEntry();

    if (!entry) {
      setPointerCursor(false);
      return;
    }

    const hint = hintFromMouseTarget(e);

    setPointerCursor(!!(hint && hint.eventParams !== undefined));

  }

  function handleMouseLeave() {
    setPointerCursor(false);
  }

  const mouseDownListener = codeEditor.onMouseDown(handleMouseDown);
  const mouseUpListener = codeEditor.onMouseUp(handleMouseUp);
  const mouseMoveListener = codeEditor.onMouseMove(handleMouseMove);
  const mouseLeaveListener = codeEditor.onMouseLeave(handleMouseLeave);

  // Записывает набор хинтов в хранилище и пересоздает якорные декорации модели.
  // Позиции вне модели (строка/колонка за пределами текста) пропускаются — как и в
  // реализации 0.20, рисовались только хинты с валидной позицией.
  // queryParams — набор от контроллера тултипов параметров запроса: хинты без штатной
  // command-ссылки, с markdown-tooltip и pointer-курсором (см. toInlayHint/handleMouseMove).
  function setModelHints(hints, queryParams) {

    const model = codeEditor.getModel();
    const previous = hintsByModel.get(model);

    if (previous && previous.anchorIds.length)
      model.deltaDecorations(previous.anchorIds, []);

    setPointerCursor(false);

    if (!hints.length) {
      hintsByModel.delete(model);
      return;
    }

    const parsedCount = hints.length;
    const lineCount = model.getLineCount();
    const decorations = [];
    const anchoredHints = [];

    for (let i = 0; i < hints.length; i++) {

      const hint = hints[i];

      if (hint.line > lineCount || hint.column > model.getLineMaxColumn(hint.line))
        continue;

      decorations.push({
        range: new monaco.Range(hint.line, hint.column, hint.line, hint.column),
        options: {
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
        }
      });

      anchoredHints.push(hint);

    }

    hintsByModel.set(model, {
      hints: anchoredHints,
      anchorIds: model.deltaDecorations([], decorations),
      parsedCount: parsedCount,
      queryParams: !!queryParams
    });

  }

  function modelAlive() {
    const model = codeEditor.getModel();
    return model && (!model.isDisposed || !model.isDisposed()) ? model : null;
  }

  return {
    // options.queryParams — набор от контроллера тултипов параметров запроса
    // (см. setModelHints); window.setInlayHints зовет без опций — классическое поведение.
    setHints: function (value, options) {

      const parsed = parseInlayHints(value);

      if (parsed.error)
        return { errorDescription: parsed.error };

      const model = modelAlive();

      if (!model)
        return false;

      setModelHints(parsed.hints, options && options.queryParams);
      inlayHintsChanged.fire();

      return true;

    },
    clear: function () {

      if (modelAlive()) {
        setModelHints([]);
        inlayHintsChanged.fire();
      }
      else
        setPointerCursor(false);

    },
    // Для тестов: число хинтов в принятом наборе, включая позиции вне модели
    // (паритет семантики hintsCount реализации 0.20).
    getState: function () {

      const model = codeEditor.getModel();
      const entry = model ? hintsByModel.get(model) : null;

      return {
        hintsCount: entry ? entry.parsedCount : 0,
        // Копия текущего набора — позиции/тексты для тестов и отладки. tooltip включается
        // в копию только когда задан (markdown-подсказка есть не у каждого хинта).
        hints: (entry ? entry.hints : []).map(function (hint) {

          const copy = {
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
        queryParams: !!(entry && entry.queryParams)
      };

    },
    // Для тестов: обработчики события мыши (см. hintFromMouseTarget) — вызываются
    // реальными подписками onMouseDown/onMouseUp/onMouseMove и напрямую из тестов
    // с синтетическим событием (по образцу handleElementClick в реализации 0.20).
    handleMouseDown: handleMouseDown,
    handleMouseUp: handleMouseUp,
    handleMouseMove: handleMouseMove,
    handleMouseLeave: handleMouseLeave,
    // Для тестов: объекты InlayHint, отданные провайдером при последнем запросе рендера.
    getRenderedHints: function () {

      const model = codeEditor.getModel();
      const entry = model ? hintsByModel.get(model) : null;

      return entry && entry.renderedHints ? entry.renderedHints.slice() : [];

    },
    dispose: function () {

      if (disposed)
        return;

      disposed = true;

      if (modelAlive())
        setModelHints([]);
      else
        setPointerCursor(false);

      mouseDownListener.dispose();
      mouseUpListener.dispose();
      mouseMoveListener.dispose();
      mouseLeaveListener.dispose();

    }
  };

}
