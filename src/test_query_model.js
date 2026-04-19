import './editor';
import queryModel from './query_model';
import { jsonDefaults } from 'monaco-editor/esm/vs/language/json/monaco.contribution';

jsonDefaults.setDiagnosticsOptions({
  validate: false,
  allowComments: false,
  schemas: [],
  enableSchemaRequest: false
});
jsonDefaults.setModeConfiguration({
  tokens: true,
  colors: false,
  completionItems: false,
  hovers: false,
  documentSymbols: false,
  diagnostics: false,
  documentFormattingEdits: false,
  documentRangeFormattingEdits: false,
  foldingRanges: false,
  selectionRanges: false
});

window.init('8.3.18.1');

  if (typeof setLanguageMode == 'function')
    setLanguageMode('bsl_query');
  else if (typeof monaco != 'undefined' && editor)
    monaco.editor.setModelLanguage(editor.getModel(), 'bsl_query');

  monaco.editor.setModelLanguage(editor.getModel(), 'bsl_query');
  editor.updateOptions({
    renderLineHighlight: 'all'
  });

  const statusElement = document.getElementById('status');
  const modelContainer = document.getElementById('model-container');
  let parsedDocument = null;
  let parseTimer = null;
  let jsonDecorations = [];
  let queryDecorations = [];
  let jsonLineRanges = [];
  let modelEditor = null;
  let syncingFromQuery = false;
  let syncingFromJson = false;

  function createModelEditor() {
    modelEditor = monaco.editor.create(modelContainer, {
      theme: 'bsl-white-query',
      value: '',
      language: 'json',
      readOnly: true,
      automaticLayout: true,
      scrollBeyondLastLine: false,
      renderLineHighlight: 'all',
      cursorStyle: 'line',
      glyphMargin: true,
      minimap: {
        enabled: true
      },
      folding: true,
      lineNumbers: 'on',
      renderValidationDecorations: 'off'
    });

    monaco.editor.setModelLanguage(modelEditor.getModel(), 'json');
  }

  function compactRange(node) {
    if (!node || !node.range)
      return null;

    return [
      node.range.startLineNumber,
      node.range.startColumn,
      node.range.endLineNumber,
      node.range.endColumn
    ].join(':');
  }

  function branchIndex(statement, branch) {
    if (!statement || !statement.branches || !branch)
      return -1;

    return statement.branches.indexOf(branch);
  }

  function activeRoles(value, context) {
    let roles = [];

    if (!value || !context)
      return roles;

    if (value === context.statement)
      roles.push('statement');

    if (value === context.branch)
      roles.push('branch');

    if (value === context.clause)
      roles.push('clause');

    if (value === context.node)
      roles.push('node');

    return roles;
  }

  function indexSummary(index) {
    if (!index)
      return [];

    return Object.keys(index).sort();
  }

  function sanitize(value, context, seen) {
    if (value === null || value === undefined)
      return value;

    if (typeof value != 'object')
      return value;

    if (typeof value == 'function')
      return undefined;

    if (!seen)
      seen = new WeakSet();

    if (seen.has(value)) {
      return {
        __ref: value.kind || 'object',
        range: compactRange(value)
      };
    }

    seen.add(value);

    if (Array.isArray(value))
      return value.map(item => sanitize(item, context, seen));

    let result = {};
    let roles = activeRoles(value, context);

    if (roles.length) {
      result.__active = true;
      result.__activeRole = roles.join(',');
    }

    Object.keys(value).forEach(key => {
      if (typeof value[key] == 'function')
        return;

      if (key == 'sourceIndex') {
        result.sourceIndexKeys = indexSummary(value[key]);
        return;
      }

      if (key == 'selectIndex') {
        result.selectIndexKeys = indexSummary(value[key]);
        return;
      }

      result[key] = sanitize(value[key], context, seen);
    });

    return result;
  }

  function registerRangeLines(value, lineRanges) {
    let json = JSON.stringify(value, null, 2);
    let lines = json.split('\n');
    let stack = [];

    lines.forEach((line, index) => {
      let lineNumber = index + 1;
      let rangeStart = line.match(/^(\s*)"range"\s*:\s*\{\s*$/);

      if (rangeStart) {
        stack.push({
          depth: rangeStart[1].length,
          startLine: lineNumber,
          range: {}
        });
      }

      let current = stack.length ? stack[stack.length - 1] : null;

      if (!current)
        return;

      ['startLineNumber', 'startColumn', 'endLineNumber', 'endColumn'].forEach(key => {
        let match = line.match(new RegExp('^\\s*"' + key + '"\\s*:\\s*(\\d+)'));
        if (match)
          current.range[key] = parseInt(match[1], 10);
      });

      let closeMatch = line.match(/^(\s*)\},?\s*$/);

      if (closeMatch && closeMatch[1].length == current.depth) {
        if (current.range.startLineNumber &&
          current.range.startColumn &&
          current.range.endLineNumber &&
          current.range.endColumn) {
          let range = new monaco.Range(
            current.range.startLineNumber,
            current.range.startColumn,
            current.range.endLineNumber,
            current.range.endColumn
          );

          for (let targetLine = current.startLine; targetLine <= lineNumber; targetLine++)
            lineRanges[targetLine] = range;
        }

        stack.pop();
      }
    });

    return json;
  }

  function contextSummary(context) {
    if (!context)
      return null;

    return {
      offset: context.offset,
      statementKind: context.statement ? context.statement.kind : null,
      branchIndex: branchIndex(context.statement, context.branch),
      clauseKind: context.clause ? context.clause.kind : null,
      nodeKind: context.node ? context.node.kind : null,
      statementRange: compactRange(context.statement),
      branchRange: compactRange(context.branch),
      clauseRange: compactRange(context.clause),
      nodeRange: compactRange(context.node)
    };
  }

  function visualModel(document, context) {
    if (!document) {
      return {
        context: null,
        document: null
      };
    }

    return {
      context: contextSummary(context),
      performance: document.performance || null,
      errors: document.errors || [],
      document: sanitize(document, context)
    };
  }

  function updateStatus(context) {
    if (!statusElement || !parsedDocument)
      return;

    let perf = parsedDocument.performance || {};
    let branch = context ? branchIndex(context.statement, context.branch) : -1;
    let clause = context && context.clause ? context.clause.kind : 'none';
    let node = context && context.node ? context.node.kind : 'none';
    let errors = parsedDocument.errors ? parsedDocument.errors.length : 0;

    statusElement.textContent = [
      'branch: ' + branch,
      'clause: ' + clause,
      'node: ' + node,
      'errors: ' + errors,
      'parse: ' + (perf.totalMs != null ? perf.totalMs.toFixed(2) : '?') + ' ms'
    ].join(' | ');
  }

  function revealActiveLine() {
    let model = modelEditor.getModel();
    let lineCount = model.getLineCount();
    let activeLine = 1;

    for (let line = 1; line <= lineCount; line++) {
      let text = model.getLineContent(line);
      if (text.indexOf('"__activeRole":') != -1 && text.indexOf('node') != -1) {
        activeLine = line;
        break;
      }

      if (text.indexOf('"__active": true') != -1 && activeLine == 1)
        activeLine = line;
    }

    modelEditor.revealLineInCenter(activeLine);
    modelEditor.setPosition({
      lineNumber: activeLine,
      column: 1
    });
    modelEditor.setSelection(new monaco.Range(
      activeLine,
      1,
      activeLine,
      model.getLineMaxColumn(activeLine)
    ));
    jsonDecorations = modelEditor.deltaDecorations(jsonDecorations, [{
      range: new monaco.Range(activeLine, 1, activeLine, 1),
      options: {
        isWholeLine: true,
        className: 'query-model-active-line',
        glyphMarginClassName: 'query-model-active-glyph'
      }
    }]);
  }

  function findRangeNearJsonLine(lineNumber) {
    if (jsonLineRanges[lineNumber])
      return jsonLineRanges[lineNumber];

    for (let line = lineNumber; 1 <= line; line--) {
      if (jsonLineRanges[line])
        return jsonLineRanges[line];
    }

    return null;
  }

  function activateQueryRange(range) {
    if (!range)
      return;

    syncingFromJson = true;
    editor.setSelection(range);
    editor.revealRangeInCenter(range);
    editor.focus();

    queryDecorations = editor.deltaDecorations(queryDecorations, [{
      range: range,
      options: {
        isWholeLine: range.startLineNumber != range.endLineNumber,
        className: 'query-model-linked-query-range',
        glyphMarginClassName: 'query-model-active-glyph'
      }
    }]);

    setTimeout(() => {
      syncingFromJson = false;
    }, 0);
  }

  function updateInspector(position) {
    if (syncingFromJson)
      return;

    syncingFromQuery = true;

    if (!parsedDocument)
      parsedDocument = queryModel.parse(editor.getValue());

    let context = parsedDocument.getContextAt(position.lineNumber, position.column);
    jsonLineRanges = [];
    let text = registerRangeLines(visualModel(parsedDocument, context), jsonLineRanges);

    modelEditor.setValue(text);
    updateStatus(context);
    revealActiveLine();

    setTimeout(() => {
      syncingFromQuery = false;
    }, 0);
  }

  function reparseAndUpdate() {
    parsedDocument = queryModel.parse(editor.getValue());
    updateInspector(editor.getPosition());
  }

  function startInspector() {
    createModelEditor();

    editor.onDidChangeCursorPosition(event => {
      updateInspector(event.position);
    });

    editor.onDidChangeModelContent(() => {
      parsedDocument = null;

      if (parseTimer)
        clearTimeout(parseTimer);

      parseTimer = setTimeout(reparseAndUpdate, 250);
    });

    reparseAndUpdate();

    modelEditor.onDidChangeCursorPosition(event => {
      if (syncingFromQuery)
        return;

      activateQueryRange(findRangeNearJsonLine(event.position.lineNumber));
    });

    modelEditor.onMouseDown(event => {
      if (syncingFromQuery || !event.target || !event.target.position)
        return;

      activateQueryRange(findRangeNearJsonLine(event.target.position.lineNumber));
    });
  }

startInspector();
