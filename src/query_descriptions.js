// Примечания подзапросов в режимах bsl_query / dcs_query (specs/query-descriptions).
// Индекс элемента входного массива равен индексу подзапроса; якоря вычисляются по строкам-
// разделителям «;» (как у опции renderQueryDelimiters) и пересчитываются при каждом изменении
// текста. Подпись рисуется не после позиции, а у правого края строки: whole-line декорация
// в слое overlays + CSS ::after с position:absolute; right:0. Слой overlays не участвует
// в замере ширины строк Monaco и не искажает горизонтальный скролл (см. plan.md, риски).

import { escapeCssString } from './inlay_hints';

const monaco = require('./monaco');

const QUERY_DESCRIPTION_MARKER = 'bsl-query-desc';
const QUERY_DESCRIPTION_CLASS_PREFIX = 'bsl-query-d-';

// Отступ текста подписи от края области кода (или левого края минимальной карты)
const QUERY_DESCRIPTION_RIGHT_PADDING = 8;

// zIndex декорации: выше whole-line подсветки разделителей query-delimiter (zIndex 0) —
// в DecorationsOverlay Monaco 0.20 порядок в строке определяется сортировкой по zIndex,
// иначе сплошной фон подсветки перекрывает текст подписи.
const QUERY_DESCRIPTION_Z_INDEX = 100;

// Разбирает вход setQueryDescription (JSON-строка или массив строк) и нормализует элементы.
// null/undefined — очистка (пустой набор). Числа/булевы приводятся к строке; прочие типы —
// пустая строка (подзапрос без подписи, индекс при этом не сдвигается).
// Возвращает { descriptions } либо { error } — без выбросов.
function parseQueryDescriptions(value) {

  if (value === null || value === undefined)
    return { descriptions: [] };

  try {

    let parsed = typeof value == 'string' ? JSON.parse(value) : value;

    if (!Array.isArray(parsed))
      return { error: 'Ожидается массив примечаний' };

    let descriptions = [];

    for (let i = 0; i < parsed.length; i++) {

      let item = parsed[i];

      if (typeof item == 'string')
        descriptions.push(item);
      else if (typeof item == 'number' || typeof item == 'boolean')
        descriptions.push(String(item));
      else
        descriptions.push('');

    }

    return { descriptions: descriptions };

  }
  catch (e) {
    return { error: e.message };
  }

}

// Вычисляет якоря подписей: индекс i < N — строка разделителя i; индекс N — последняя
// непустая строка модели, но только если после последнего разделителя есть текст запроса
// (текст не кончается разделителем). Возвращает массив { line, text } — по одному на
// рисуемую подпись; подписи без текста и с индексами за пределами числа подзапросов
// пропускаются.
function computeDescriptionAnchors(descriptions, model) {

  let anchors = [];

  if (!model || !descriptions.length)
    return anchors;

  // Разделители подзапросов — как у опции renderQueryDelimiters: строки из одного «;»
  // с окружающими пробелами.
  let matches = model.findMatches('^\\s*;\\s*$', false, true, false, null, false);
  let delimiterLines = [];

  for (let i = 0; i < matches.length; i++)
    delimiterLines.push(matches[i].range.startLineNumber);

  // Последняя непустая строка модели — якорь подписи последнего подзапроса
  let lastLine = 0;

  for (let line = model.getLineCount(); line >= 1; line--) {
    if (model.getLineContent(line).trim().length) {
      lastLine = line;
      break;
    }
  }

  // Текст кончается разделителем — подзапроса с индексом N нет
  let lastDelimiterLine = delimiterLines.length ? delimiterLines[delimiterLines.length - 1] : 0;
  let hasTailQuery = lastLine > 0 && lastLine != lastDelimiterLine;

  for (let i = 0; i < descriptions.length; i++) {

    let text = descriptions[i];

    if (!text.length)
      continue;

    let line = 0;

    if (i < delimiterLines.length)
      line = delimiterLines[i];
    else if (i == delimiterLines.length && hasTailQuery)
      line = lastLine;

    if (line)
      anchors.push({ line: line, text: text });

  }

  return anchors;

}

export function createQueryDescriptionsController(codeEditor) {

  let currentDescriptions = [];
  let lastAnchors = [];
  let lastModelText = '';
  let decorationIds = [];
  let renderedCount = 0;
  let styleNode = document.createElement('style');
  let uid = Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
  let counter = 0;

  styleNode.type = 'text/css';
  document.head.appendChild(styleNode);

  // Отступ подписи от правого края области кода: вертикальный скроллбар рендерится поверх
  // правого края контента (Monaco 0.20 не вычитает его из contentWidth), а включённый
  // минимап прижат влево от скроллбара — поэтому ширину скроллбара вычитаем всегда,
  // при любом состоянии минимапа. Плюс постоянный отступ QUERY_DESCRIPTION_RIGHT_PADDING.
  function rightOffset() {

    try {
      let layout = codeEditor.getLayoutInfo();
      return layout.verticalScrollbarWidth + QUERY_DESCRIPTION_RIGHT_PADDING;
    }
    catch (e) {
      return QUERY_DESCRIPTION_RIGHT_PADDING;
    }

  }

  // Переключение минимапа и ресайз меняют отступ от правого края — перепозиционируем
  // активный набор (контроллер живёт вместе с редактором, подписка не хранится).
  codeEditor.onDidLayoutChange(function () {
    if (currentDescriptions.length)
      render();
  });

  function clearRendered() {

    // Идентификаторы декораций могут быть «мёртвыми» после полной замены текста модели
    // (Monaco уничтожает декорации при flush) — deltaDecorations это переживает.
    if (decorationIds.length)
      decorationIds = codeEditor.deltaDecorations(decorationIds, []);

    styleNode.textContent = '';
    renderedCount = 0;
    lastAnchors = [];

  }

  function render() {

    clearRendered();

    let model = codeEditor.getModel();

    if (!model)
      return;

    // Снимок текста: для распознавания полной замены на побайтово тот же текст
    lastModelText = model.getValue();

    let anchors = computeDescriptionAnchors(currentDescriptions, model);

    if (!anchors.length)
      return;

    let decorations = [];
    let rules = [];
    let right = rightOffset() + 'px';

    for (let i = 0; i < anchors.length; i++) {

      let className = QUERY_DESCRIPTION_CLASS_PREFIX + uid + '-' + counter++;

      // Селектор с двумя классами — специфичнее статического right:0 в decorations.css
      // (порядок инжекта style-loader и styleNode не гарантирован)
      rules.push('.' + QUERY_DESCRIPTION_MARKER + '.' + className + '::after { content: "' + escapeCssString(anchors[i].text) + '"; right: ' + right + '; top: -2px}');

      decorations.push({
        range: new monaco.Range(anchors[i].line, 1, anchors[i].line, 1),
        options: {
          isWholeLine: true,
          zIndex: QUERY_DESCRIPTION_Z_INDEX,
          className: QUERY_DESCRIPTION_MARKER + ' ' + className
        }
      });

    }

    styleNode.textContent = rules.join('\n');
    decorationIds = codeEditor.deltaDecorations([], decorations);
    renderedCount = decorations.length;
    lastAnchors = anchors;

  }

  // Полная замена текста модели: setValue/flush (setContent, updateText) или единственная
  // правка, покрывающая весь документ (eraseText, выделение всего + вставка).
  function isFullReplace(e, model) {

    if (e.isFlush)
      return true;

    if (!e.changes || e.changes.length != 1)
      return false;

    let change = e.changes[0];

    if (change.rangeOffset != 0)
      return false;

    // Длина текста до правки: новая длина минус вставленное плюс удалённое
    let oldLength = model.getValueLength() - change.text.length + change.rangeLength;

    return change.rangeLength == oldLength;

  }

  // Пересчёт при изменении текста модели: якоря следуют за разделителями; при полной
  // замене набор забывается, побайтово тот же текст (например, повторный setContent) —
  // набор сохраняется и перерисовывается (flush уничтожил декорации).
  function handleContentChanged(e) {

    let model = codeEditor.getModel();

    if (!model || !currentDescriptions.length)
      return true;

    if (isFullReplace(e, model)) {

      if (e.isFlush && e.changes && e.changes.length == 1 && e.changes[0].text === lastModelText) {
        render();
        return true;
      }

      clear();
      return true;

    }

    render();

    return true;

  }

  function refresh() {

    if (!currentDescriptions.length)
      return true;

    render();

    return true;

  }

  // Забывает набор и убирает отрисованные подписи.
  function clear() {
    currentDescriptions = [];
    clearRendered();
  }

  function dispose() {

    currentDescriptions = [];
    clearRendered();

    if (styleNode.parentNode)
      styleNode.parentNode.removeChild(styleNode);

  }

  return {
    setDescriptions: function (value) {

      let parsed = parseQueryDescriptions(value);

      if (parsed.error)
        return { errorDescription: parsed.error };

      currentDescriptions = parsed.descriptions;

      if (!currentDescriptions.length) {
        clearRendered();
        return true;
      }

      render();

      return true;

    },
    refresh: refresh,
    handleContentChanged: handleContentChanged,
    clear: clear,
    dispose: dispose,
    getState: function () {

      return {
        descriptionsCount: currentDescriptions.length,
        renderedCount: renderedCount,
        cssText: styleNode.textContent,
        // Копия текущего набора — для тестов и отладки.
        descriptions: currentDescriptions.slice(),
        // Якоря последнего рендера — для тестов и отладки.
        anchors: lastAnchors.map(function (anchor) {
          return { line: anchor.line, text: anchor.text };
        })
      };

    }

  };

}

export { parseQueryDescriptions, computeDescriptionAnchors };
