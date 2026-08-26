//require.config( { 'vs/nls': { availableLanguages: { '*': "ru" } } } );

import 'core-js/stable';
import { languages, setHighlightInnerQuotes} from './bsl_language';
import queryModelService from './query_model_service';
import { getActions, permanentActions } from './actions';
import './decorations.css'
import './tingle.css'
import tingle from './tingle.js'
import './tree/tree.css'
import Treeview from './tree/tree.js'
import Finder from "./finder";
import SnippetsParser from "./parsers";
import SearchHistoryController from './search_history';
import bslHelper from './bsl_helper';
import { createHelpBrowser } from './help';
import { AI_INLINE_DEFAULT_OPTIONS, createAIInlineProvider, isAIInlineOption, isValidAIInlineOption } from './ai_inline_provider';

const monaco = require('./monaco');
const searchHistoryController = new SearchHistoryController(monaco);
const aiInlineProvider = createAIInlineProvider({
  getEditor: function () { return window.editor; },
  getOption: function (name) {
    if (window.editor && typeof window.editor[name] != 'undefined')
      return window.editor[name];
    return window.editor_options[name];
  },
  sendEvent: function (name, params) { return window.sendEvent(name, params); },
  isInlineEnabled: function () { return window.inlineSuggestEnabled === true; }
});
const helpBrowser = createHelpBrowser(function () { return window.editor; }, function (params) {
  window.sendEvent('EVENT_ON_LINK_CLICK', params);
});
// Иконки дерева переменных инлайнятся в бандл (data:-URI) через require.context, а не тянутся
// отдельными файлами — это нужно для single-file сборки. В обычной сборке результат тот же:
// asset modules инлайнят эти PNG (< 8 КБ), а копия в dist/tree/icons остаётся невостребованной.
const treeIconsContext = require.context('./tree/icons', false, /\.png$/);
const treeIcons = {};
treeIconsContext.keys().forEach(function (key) {
  const mod = treeIconsContext(key);
  treeIcons[key.replace('./', '')] = (mod && mod.default) ? mod.default : mod;
});
// Резолвер имени иконки ("int.png") в data:-URI; неизвестное имя откатывается на undefined.png.
function resolveTreeIcon(iconName) {
  return treeIcons[iconName] || treeIcons['undefined.png'] || '';
}

// #region global vars
window.languages = languages;

window.selectionText = '';
window.engLang = false;
window.contextData = new Map();
window.readOnlyMode = false;
window.queryMode = false;
window.DCSMode = false;
window.debugMode = false;
window.usingDebugger = false;
window.version1C = '';
window.userName = '';
window.contextActions = [];
window.customHovers = {};
window.immediateHover = [];
window.customSignatures = {};
window.customCodeLenses = [];
window.originalText = '';
window.metadataRequests = new Map();
window.customSuggestions = [];
window.customInlineSuggestions = [];
window.contextMenuEnabled = false;
window.err_tid = 0;
window.suggestObserver = null;
window.signatureObserver = null;
window.definitionObserver = null;
window.statusBarWidget = null;
window.ctrlPressed = false;
window.altPressed = false;
window.shiftPressed = false;  
window.signatureVisible = true;
window.currentBookmark = -1;
window.currentMarker = -1;
window.activeSuggestionAcceptors = [];
window.diffEditor = null;
window.inlineDiffEditor = null;
window.inlineDiffWidget = null;
window.inlineDiffWidgetTimer = 0;
window.inlineDiffEditorTimer = 0;
window.events_queue = [];
window.colors = {};
window.editor_options = [];
Object.keys(AI_INLINE_DEFAULT_OPTIONS).forEach(function (name) {
  window.editor_options[name] = AI_INLINE_DEFAULT_OPTIONS[name];
});
window.snippets = {};
window.bslSnippets = {};
window.treeview = null;
window.lineNumbersDedocrations = [];
window.selectedQueryDelimiters = new Map();
window.reviewWidgets = new Map();
window.currentIssue = -1;
window.hiddenBlocks = new Map();
window.inlineCompletionProviders = [];
window.inlineSuggestEnabled = true;
window.inlineCompletionProvidersInitialized = false;
window.aiInlineProgrammaticChangeDepth = 0;
window.aiInlineContentTriggerVersion = 0;
window.aiInlineContentTriggerScheduled = false;
window.objectContext = null;
// #endregion

// #region public API

/**
 * Полностью очищает справочник глобальных объектов, сохраняя его корневые разделы.
 * @returns {boolean} true, если справочник уже загружен и очищен
 */
window.clearBslGlobals = function () {
  return rebuildBslGlobals([], false);
}

/**
 * Фильтрует справочник глобальных объектов по путям раздел.Имя.
 * По умолчанию остаются только указанные объекты; при exclude=true указанные
 * объекты удаляются, а остальные сохраняются. Операция необратима до
 * перезагрузки редактора.
 * @param {string[]|string} paths массив путей или JSON-строка с таким массивом,
 * например `["globalfunctions.Base64Значение"]`
 * @param {boolean} [exclude=false] удалить указанные объекты вместо их включения
 * @returns {boolean} true, если справочник уже загружен и отфильтрован
 */
window.filterBslGlobals = function (paths, exclude = false) {
  return rebuildBslGlobals(paths, exclude);
}

/** @param {string} name диагностическое имя передаваемых данных */
window.beginBase64Transfer = function (name) {
  helpBrowser.beginTransfer(name);
}

/** @param {string} chunk фрагмент Base64 или отдельно закодированная бинарная порция */
window.pushBase64Chunk = function (chunk) {
  helpBrowser.pushTransfer(chunk);
}

/** Завершает постановку порций в очередь worker. */
window.endBase64Transfer = function () {
  helpBrowser.endTransfer();
}

/**
 * Загружает пакет справки 1С в текущую сессию.
 * Promise всегда разрешается объектом результата после готовности дерева и обоих индексов.
 * Успешно загруженный ранее пакет при ошибке не изменяется.
 * На фазе prepared (готовы оглавление и префиксный индекс заголовков, полнотекстовая
 * индексация ещё идёт) отправляет EVENT_ON_HELP_PREPARED с payload {kind}.
 * После успешной загрузки пакета вида context/query/dcs отправляет событие
 * EVENT_ON_HELP_READY с payload {kind}; shlang и ошибки ни одного события не создают.
 * PREPARED не гарантирует последующего READY: при откате provisional-кандидата или
 * ошибке полнотекстовой индексации READY не приходит.
 * @param {Blob|File|string} [source] файл shcntx_*.hbk/shlang_*.hbk/shquery_*.hbk/dcsui_*.hbk
 * или его Base64-представление;
 * без аргумента используется последняя завершённая порционная передача
 * @returns {Promise<{ok:boolean,kind:string|null,pages:number,error:string|null}>}
 */
window.parseHelp = function (source) {
  function onPrepared(kind) {
    if (kind == 'context' || kind == 'query' || kind == 'dcs')
      window.sendEvent('EVENT_ON_HELP_PREPARED', { kind: kind });
  }
  const resultPromise = arguments.length ? helpBrowser.parse(source, onPrepared) : helpBrowser.parseTransferred(onPrepared);
  return resultPromise.then(function (result) {
    if (result.ok && (result.kind == 'context' || result.kind == 'query' || result.kind == 'dcs'))
      window.sendEvent('EVENT_ON_HELP_READY', { kind: result.kind });
    return result;
  });
}

/**
 * Немедленно открывает закреплённую справа панель справки текущего режима.
 * Если передана строка поиска, поведение совпадает с CTRL+F1: панель
 * переключается на вкладку «Индекс», выполняется prefix-поиск по заголовкам
 * и открывается первая найденная статья. Пока профильная справка текущего
 * режима не готова, запрос игнорируется и панель не открывается.
 * @param {string} [query] строка поиска по индексу заголовков;
 * без аргумента панель открывается без изменения вкладки и статьи
 * @returns {void}
 */
window.showHelp = function (query) {
  if (arguments.length && query) {
    if (!helpBrowser.isReady())
      return;
    helpBrowser.showIndex(String(query));
  }
  else {
    helpBrowser.show();
  }
}

/**
 * Показывает скрытую по умолчанию панель ручного выбора файлов справки.
 * @returns {void}
 */
window.showHelpLoader = function () {
  helpBrowser.showLoader();
}

window.getHelpState = function () {
  const state = helpBrowser.getState();
  return Object.assign({ ready: state.status == 'ready' }, state);
}

window.wordWrap = function (enabled) {

  if (window.editor.navi) {
    window.editor.originalEditor.updateOptions({ wordWrap: enabled });
    window.editor.modifiedEditor.updateOptions({ wordWrap: enabled });
  }
  else {
    window.editor.updateOptions({ wordWrap: enabled })
  }

}

window.reserMark = function() {

  clearInterval(window.err_tid);
  window.editor.updateDecorations([]);

}

window.sendEvent = function(eventName, eventParams) {

  window.events_queue.push({event : eventName, params: eventParams});
  setTimeout(() => {
    document.getElementById('event-button').click();
  }, 10);  
  
}

window.fireEvent = function() {

  let button = document.getElementById('event-button');
  button.click();


}

window.setDefaultStyle = function() {

  window.setFontFamily("Courier New");
  window.setFontSize(14);
  window.setLineHeight(16);
  window.setLetterSpacing(0);

}

window.setText = function(txt, range, usePadding) {

  window.editor.pushUndoStop();
  
  window.editor.checkBookmarks = false;

  window.reserMark();

  beginAIInlineProgrammaticChange();
  try {
    bslHelper.setText(txt, range, usePadding);
  }
  finally {
    endAIInlineProgrammaticChange();
  }
  
  if (window.getText()) {
    checkBookmarksCount();
    checkBreakpointsCount();
  }
  else {
    window.removeAllBookmarks();
    window.removeAllBreakpoints();
  }
  
  window.editor.checkBookmarks = true;

}

window.updateText = function(txt, clearUndoHistory = true) {

  const read_only = window.readOnlyMode;
  const mod_event = window.getOption('generateModificationEvent');
  window.editor.checkBookmarks = false;   

  window.reserMark();  

  if (read_only)
    window.setReadOnly(false);

  if (mod_event)    
    window.setOption('generateModificationEvent', false);

  beginAIInlineProgrammaticChange();
  try {
    eraseTextBeforeUpdate();

    if (clearUndoHistory)
      window.editor.setValue(txt);
    else
      window.setText(txt);
  }
  finally {
    endAIInlineProgrammaticChange();
  }

  if (window.getText()) {
    checkBookmarksCount();
    checkBreakpointsCount();
  }
  else {
    window.removeAllBookmarks();
    window.revomeAllBreakpoints();
  }

  if (mod_event)    
    window.setOption('generateModificationEvent', true);

  if (read_only)
    window.setReadOnly(true);

  window.editor.checkBookmarks = true;

}

window.setContent = function(text) {

  const read_only = window.readOnlyMode;
  const mod_event = window.getOption('generateModificationEvent');
  
  if (read_only)
    window.setReadOnly(false);

  if (mod_event)    
    window.setOption('generateModificationEvent', false);

  beginAIInlineProgrammaticChange();
  try {
    window.editor.setValue(text)
  }
  finally {
    endAIInlineProgrammaticChange();
  }

  if (mod_event)    
    window.setOption('generateModificationEvent', true);

  if (read_only)
    window.setReadOnly(true);

}

window.eraseText = function () {
  
  window.setText('', window.editor.getModel().getFullModelRange(), false);    

  removeReviewWidgets();
  window.currentIssue = -1;

}

window.getText = function(txt) {

  return getActiveEditor().getValue();

}

window.getModuleMethods = function() {

  return JSON.stringify(bslHelper.getModuleMethods(getActiveEditor().getModel()));

}

window.saveSearchHistory = function () {

  return searchHistoryController.save();

}

window.restoreSearchHistory = function (state) {

  return searchHistoryController.restore(state);

}

window.showModuleMethods = function() {

  getActiveEditor().trigger('', 'editor.action.quickOutline');

}

window.getQuery = function () {

  let bsl = new bslHelper(window.editor.getModel(), window.editor.getPosition());		
  return bsl.getQuery();

}

window.getFormatString = function () {

  let bsl = new bslHelper(window.editor.getModel(), window.editor.getPosition());		
  return bsl.getFormatString();

}

window.updateMetadata = function (metadata, path = '') {
      
  let bsl = new bslHelper(window.editor.getModel(), window.editor.getPosition());		
  return bsl.updateMetadata(metadata, path);

}

window.setObjectContext = function (metadataName) {

  let bsl = new bslHelper(window.editor.getModel(), window.editor.getPosition());

  try {
    return bsl.setObjectContext(metadataName);
  }
  catch (e) {
    window.customHovers = {};
    return { errorDescription: e.message };
  }

}

window.clearObjectContext = function () {

  let bsl = new bslHelper(window.editor.getModel(), window.editor.getPosition());
  return bsl.clearObjectContext();

}

window.parseCommonModule = function (moduleName, moduleText, isGlobal = false) {

  return bslHelper.parseCommonModule(moduleName, moduleText, isGlobal);

}

window.parseMetadataModule = function (moduleText, path) {

  return bslHelper.parseMetadataModule(moduleText, path);

} 

window.updateSnippets = function (snips, replace = false) {
      
  return bslHelper.updateSnippets(snips, replace);    

}

window.updateCustomFunctions = function (data) {
      
  return bslHelper.updateCustomFunctions(data);

}

window.setTheme = function (theme) {

  monaco.editor.setTheme(theme);
  setThemeVariablesDisplay(theme);
  helpBrowser.setTheme(theme);

  if (window.editor && window.editor.inlineSuggestController)
    window.editor.inlineSuggestController.layout();

}

window.setReadOnly = function (readOnly) {

  window.readOnlyMode = readOnly;
  window.editor.updateOptions({ readOnly: readOnly });

  if (window.ditor.navi)
      applyDiffAllowRevertBackOptions(window.editor);

  if (window.contextMenuEnabled)
    window.editor.updateOptions({ contextmenu: !readOnly });
  
}

window.getReadOnly = function () {

  return window.readOnlyMode;

}

window.switchLang = function (language) {
    
  if (language == undefined)
    engLang = !engLang;
  else
    engLang = (language == 'en');

  return engLang ? 'en' : 'ru';
  
}

window.addComment = function () {
  
  let bsl = new bslHelper(window.editor.getModel(), window.editor.getPosition());		
  bsl.addComment();

}

window.removeComment = function () {
  
  let bsl = new bslHelper(window.editor.getModel(), window.editor.getPosition());		
  bsl.removeComment();
  
}

window.markError = function (line, column) {
  
  window.reserMark();
  window.editor.timer_count = 12;

  window.err_tid = setInterval(function () {
    
    let newDecor = [];
    
    if (window.editor.timer_count % 2 == 0) {
      newDecor.push(
        { range: new monaco.Range(line, 1, line), options: { isWholeLine: true, inlineClassName: 'error-string' } }
      );
      newDecor.push(
        { range: new monaco.Range(line, 1, line), options: { isWholeLine: true, linesDecorationsClassName: 'error-mark' } },
      );
    }

    window.editor.timer_count--;
    window.editor.updateDecorations(newDecor);

    if (window.editor.timer_count == 0) {
      clearInterval(window.err_tid);
    }

  }, 300);

  window.editor.revealLineInCenter(line);
  window.editor.setPosition(new monaco.Position(line, column));

}

window.findText = function (string) {
  let bsl = new bslHelper(window.editor.getModel(), window.editor.getPosition());
  return bsl.findText(string);
}

window.init = function(version, user = '') {

  window.version1C = version;
  window.userName = user;
  initContextMenuActions();
  window.editor.layout();

}

window.enableQuickSuggestions = function (enabled) {

  window.editor.updateOptions({ quickSuggestions: enabled });

}

window.minimap = function (enabled) {

  window.editor.updateOptions({ minimap: { enabled: enabled } });
  
}

window.addContextMenuItem = function(label, eventName) {

  let time = new Date().getTime();
  let id = time.toString() + '.' + Math.random().toString(36).substring(8);
  window.editor.addAction({
    id: id + "_bsl",
    label: label,
    contextMenuGroupId: 'navigation',
    contextMenuOrder: time,
    run: function () {     
        window.sendEvent(eventName, "");
        return null;
    }
  });

}

window.isQueryMode = function() {

  return window.getCurrentLanguageId() == 'bsl_query';

}

window.isDCSMode = function() {

  return window.getCurrentLanguageId() == 'dcs_query';

}

window.setContextMode = function(mode) {

  window.setOption('contextMode', mode);

}

window.getContextMode = function(mode) {

  return window.getOption('contextMode');

}

window.setLanguageMode = function(mode) {

  let isCompareMode = (window.editor.navi != undefined);

  window.queryMode = (mode == 'bsl_query');
  window.DCSMode = (mode == 'dcs_query');

  if (window.queryMode || window.DCSMode)
    window.editor.updateOptions({ foldingStrategy: "indentation" });
  else
    window.editor.updateOptions({ foldingStrategy: "auto" });

  if (isCompareMode) {
    monaco.editor.setModelLanguage(window.editor.getModifiedEditor().getModel(), mode);
    monaco.editor.setModelLanguage(window.editor.getOriginalEditor().getModel(), mode);
  }
  else {
    monaco.editor.setModelLanguage(window.editor.getModel(), mode);
  }

  helpBrowser.setLanguageMode(mode);

  let currentTheme = getCurrentThemeName();
  window.setTheme(currentTheme);

  initContextMenuActions();

  if (mode == 'bsl_query') {
    if (isCompareMode) {
      queryModelService.schedule(window.editor.getModifiedEditor().getModel(), 0);
      queryModelService.schedule(window.editor.getOriginalEditor().getModel(), 0);
    }
    else {
      queryModelService.schedule(window.editor.getModel(), 0);
    }
  }

}

window.setDebugMode = function(mode) {

  window.debugMode = mode;
  initContextMenuActions();

}

window.isDebugMode = function() {

  return window.debugMode;

}

window.setUsingDebugger = function(mode) {

  window.usingDebugger = mode;
  initContextMenuActions();

}

window.isUsingDebugger = function() {

  return window.usingDebugger;

}

window.getCurrentLanguageId = function() {

  let identifier = getActiveEditor().getModel().getLanguageIdentifier();
  return identifier.language;

}

window.getSelectedText = function () {

  const active_editor = getActiveEditor();
  const model = active_editor.getModel();
  const selection = active_editor.getSelection();

  return model.getValueInRange(selection);

}

window.addWordWrap = function () {
  
  let bsl = new bslHelper(window.editor.getModel(), window.editor.getPosition());		
  bsl.addWordWrap();

}

window.removeWordWrap = function () {
  
  let bsl = new bslHelper(window.editor.getModel(), window.editor.getPosition());		
  bsl.removeWordWrap();
  
}

window.setCustomHovers = function (hoversJSON) {
  
  try {
		window.customHovers = JSON.parse(hoversJSON);			
		return true;
	}
	catch (e) {
    window.customHovers = {};
		return { errorDescription: e.message };
	}

}

window.setCustomSignatures = function(sigJSON) {

  try {
		window.customSignatures = JSON.parse(sigJSON);			
		return true;
	}
	catch (e) {
    window.customSignatures = {};
		return { errorDescription: e.message };
	}    

}

window.setCustomCodeLenses = function(lensJSON) {

  try {
    if (window.editor.navi)
      window.editor.getModifiedEditor().updateOptions({ codeLens: true });
    window.customCodeLenses = JSON.parse(lensJSON);
    window.editor.updateCodeLens();
    return true;
  }
  catch (e) {
    window.customCodeLenses = [];
    return { errorDescription: e.message };
  }    

}

window.getVarsNames = function (includeLineNumber = false) {
  
  let bsl = new bslHelper(window.editor.getModel(), window.editor.getPosition());		
  return bsl.getVarsNames(0, includeLineNumber);
  
}

window.getSelection = function() {

  return window.editor.getSelection();

}

window.setSelection = function(startLineNumber, startColumn, endLineNumber, endColumn) {
  
  if (endLineNumber <= window.getLineCount()) {
    let range = new monaco.Range(startLineNumber, startColumn, endLineNumber, endColumn);
    window.editor.setSelection(range);
    window.editor.revealPositionInCenterIfOutsideViewport(range.getEndPosition());
    return true;
  }
  else
    return false;

}

window.setSelectionByLength = function(start, end) {
  
  let startPosition = window.editor.getModel().getPositionAt(start - 1);
  let endPosition = window.editor.getModel().getPositionAt(end - 1);
  let range = new monaco.Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column);    
  window.editor.setSelection(range);
  window.editor.revealPositionInCenterIfOutsideViewport(endPosition);

  return true;

}

window.selectedText = function(text = undefined, keepSelection = false) {

  if (text == undefined)
    
    return window.getSelectedText();    

  else {      
    
    if (window.getSelectedText()) {

      let selection = window.getSelection();
      let tempModel = monaco.editor.createModel(text);
      let tempRange = tempModel.getFullModelRange();

      // Модель нужна была только ради диапазона — Monaco её сам не удалит.
      tempModel.dispose();

      window.setText(text, window.getSelection(), false);

      if (keepSelection) {
        if (tempRange.startLineNumber == tempRange.endLineNumber)
          window.setSelection(selection.startLineNumber, selection.startColumn, selection.startLineNumber, selection.startColumn + tempRange.endColumn - 1);
        else
          window.setSelection(selection.startLineNumber, selection.startColumn, selection.startLineNumber + tempRange.endLineNumber - tempRange.startLineNumber, tempRange.endColumn);
      }

    }
    else
      window.setText(text, undefined, false);

  }

}

window.getLineCount = function() {
  
  return getActiveEditor().getModel().getLineCount();

}

window.getLineContent = function(lineNumber) {

  return window.editor.getModel().getLineContent(lineNumber)

}

window.getCurrentLineContent = function() {

  return window.getLineContent(window.editor.getPosition().lineNumber);

}

window.getCurrentLine = function() {

  return window.editor.getPosition().lineNumber;

}

window.getCurrentColumn = function() {

  return window.editor.getPosition().column;

}

window.getCurrentWord = function() {

  const activeEditor = getActiveEditor();
  const model = activeEditor && activeEditor.getModel();
  const position = activeEditor && activeEditor.getPosition();
  return model && position ? model.getWordAtPosition(position) : null;

}

window.setLineContent = function(lineNumber, text) {

  if (lineNumber <= window.getLineCount()) {
    let range = new monaco.Range(lineNumber, 1, lineNumber, window.editor.getModel().getLineMaxColumn(lineNumber));
    window.setText(text, range, false);
    return true;      
  }
  else {
    return false;
  }

}

window.insertLine = function(lineNumber, text) {

  let model = window.editor.getModel();
  let text_model = monaco.editor.createModel(text);
  let text_range = text_model.getFullModelRange();

  // Модель нужна была только ради диапазона — Monaco её сам не удалит.
  text_model.dispose();
  let total_lines = window.getLineCount();
  let text_lines = text_range.endLineNumber - text_range.startLineNumber;
  
  if (total_lines < lineNumber)
    lineNumber = total_lines + 1;

  if (total_lines < lineNumber && window.getText())
    text = '\n' + text;

  text_range.startLineNumber = lineNumber;
  text_range.endLineNumber = lineNumber + text_lines;

  if (lineNumber <= total_lines) {

    let next_range = new monaco.Range(lineNumber, 1, total_lines, model.getLineMaxColumn(total_lines));
    let next_text = model.getValueInRange(next_range);

    if (next_text) {
      next_range.endLineNumber += text_lines + 1;
      next_text = '\n'.repeat(text_lines + 1) + next_text;
      window.editor.executeEdits('insertLine', [{
        range: next_range,
        text: next_text,
        forceMoveMarkers: true
      }]);
    }

  }

  window.editor.executeEdits('insertLine', [{
    range: text_range,
    text: text,
    forceMoveMarkers: true
  }]);

}

window.addLine = function(text) {

  let line = window.getLineCount();

  if (window.getText()) {
    text = '\n' + text;
    line++;
  }

  window.editor.executeEdits('addLine', [{
    range: new monaco.Range(line, 1, line, 1),
    text: text,
    forceMoveMarkers: true
  }]);

}

window.deleteLine = function(lineNumber) {

  window.editor.executeEdits('addLine', [{
    range: new monaco.Range(lineNumber, 1, lineNumber + 1, 1),
    text: null      
  }]);

}

window.getPositionOffset = function() {

  let position = window.editor.getPosition();
  let v_pos = window.editor.getScrolledVisiblePosition(position);
  let layer = window.editor.getLayoutInfo();
  let top = Math.min(v_pos.top, layer.height);
  let left = Math.min(v_pos.left, layer.width);

  return {top: top, left: left}

}

window.setDiffSideBySideMode = function (sideBySide) {
  window.editor.updateOptions({
    renderSideBySide: sideBySide
  });
  return true;
}

window.compare = function (text="", sideBySide=true, highlight=true, markLines = true, ignoreWhitespace = true, newOriginalText = "") {
  
  let language_id = window.getCurrentLanguageId();
  let currentTheme = getCurrentThemeName();
  let previous_options = getActiveEditor().getRawOptions();

  let status_bar = window.statusBarWidget ? true : false;
  let overlapScroll = true
    
  if (status_bar) {
    overlapScroll = window.statusBarWidget.overlapScroll;
    hideStatusBar();
  }

  if (text || newOriginalText) {

    if (language_id == 'xml') {
      language_id = 'xml';
      currentTheme = 'vs';
    }
    if (newOriginalText)
        originalText = newOriginalText;
    const allowRevertBack = typeof window.getOption('allowRevertBack') == 'boolean' ? window.getOption('allowRevertBack') : false;
    let originalModel = window.originalText ? monaco.editor.createModel(window.originalText) : monaco.editor.createModel(window.editor.getModel().getValue());
    let modifiedModel = monaco.editor.createModel(text);
    window.originalText = originalModel.getValue();
    disposeEditor();
    window.editor = monaco.editor.createDiffEditor(document.getElementById("container"), {
      theme: currentTheme,
      language: language_id,
      contextmenu: false,
      automaticLayout: true,
      scrollBeyondLastLine: false,
      renderSideBySide: sideBySide,
      ignoreTrimWhitespace: ignoreWhitespace,
      find: {
        addExtraSpaceOnTop: false
      }
    });
    window.editor.countDiffEvents = 0; 
      window.editor.onDidUpdateDiff(e => {
        window.editor.countDiffEvents++;
        if (window.editor.countDiffEvents == 1 && window.getOption('generateCompareCompleteEvent'))
          window.sendEvent("EVENT_COMPARE_COMPLETE", {});
      });
    if (highlight) {
      monaco.editor.setModelLanguage(originalModel, language_id);
      monaco.editor.setModelLanguage(modifiedModel, language_id);
    }
    window.editor.setModel({
      original: originalModel,
      modified: modifiedModel
    });
    registerHelpAction(window.editor.getOriginalEditor());
    registerHelpAction(window.editor.getModifiedEditor());
    window.editor.allowRevertBack = allowRevertBack;
    window.editor.navi = monaco.editor.createDiffNavigator(editor, {
      followsCaret: true,
      ignoreCharChanges: true
    });
    window.editor.markLines = markLines;
    window.editor.getModifiedEditor().diffDecor = {
      decor: [],
      line: 0,
      position: 0
    };
    window.editor.getOriginalEditor().diffDecor = {
      decor: [],
      line: 0,
      position: 0
    };
    window.editor.diffEditorUpdateDecorations = diffEditorUpdateDecorations;
    window.editor.markDiffLines = function () {
      const diff_editor = this;
      setTimeout(() => {

        if (window.editor !== diff_editor)
          return;

        const position = diff_editor.getModifiedEditor().getPosition();
        if (!position)
          return;

        const modified_line = position.lineNumber;
        const diff_info = diff_editor.getDiffLineInformationForModified(modified_line);
        const original_line = diff_info ? diff_info.equivalentLineNumber : modified_line;
        if (diff_editor.markLines) {
          diff_editor.getModifiedEditor().diffDecor.line = modified_line;
          diff_editor.getOriginalEditor().diffDecor.line = original_line;
        }
        diff_editor.diffEditorUpdateDecorations();
        diff_editor.diffCount = (diff_editor.getLineChanges() || []).length;
      }, 50);
    };
    window.editor.markDiffLines();
    window.editor.getModifiedEditor().onKeyDown(e => diffEditorOnKeyDown(e));
    window.editor.getOriginalEditor().onKeyDown(e => diffEditorOnKeyDown(e));
    window.editor.getModifiedEditor().onDidChangeCursorPosition(e => diffEditorOnDidChangeCursorPosition(e));
    window.editor.getOriginalEditor().onDidChangeCursorPosition(e => diffEditorOnDidChangeCursorPosition(e));
    window.editor.getModifiedEditor().onDidLayoutChange(e => diffEditorOnDidLayoutChange(e));
    window.editor.getOriginalEditor().onDidLayoutChange(e => diffEditorOnDidLayoutChange(e));
    window.editor.getModifiedEditor().onMouseMove(e => {
      newReviewDecoration(e);
    });
    window.editor.getModifiedEditor().onMouseDown(e => {
      checkOnLinkClick(e.target.element, window.editor.getModifiedEditor(), e.target.position);
      if (e.target.element.classList.contains('add-review'))
        createReviewWidget(e.target.position.lineNumber);
    });
    window.editor.getOriginalEditor().onMouseDown(e => {
      checkOnLinkClick(e.target.element, window.editor.getOriginalEditor(), e.target.position);
    });
    createDiffRevertButtons(window.editor);
    applyDiffAllowRevertBackOptions(window.editor);
    window.setDefaultStyle();
  }
  else
  {
    disposeEditor();
    createEditor(language_id, originalText, currentTheme);
    window.originalText = '';
    window.editor.diffCount = 0;
  }
  
  window.editor.updateOptions({ readOnly: window.readOnlyMode });
  
  if (status_bar)
    window.showStatusBar(overlapScroll);

  let current_options = getActiveEditor().getRawOptions();
  for (const [key, value] of Object.entries(previous_options)) {
    if (!current_options.hasOwnProperty(key)) {
      let option = {};
      option[key] = value;
      window.editor.updateOptions(option);
    }
  }

  for (const [key, value] of Object.entries(editor_options)) {
    window.setOption(key, value);
  }

}

window.triggerSuggestions = function() {
  
  window.editor.trigger('', 'editor.action.triggerSuggest', {});

  setTimeout(() => {
    startStopSuggestSelectionObserver();
    decorateSuggestWidgetRows();
  }, 20);

}

window.triggerHovers = function() {
  
  window.editor.trigger('', 'editor.action.showHover', {});

}

window.showImmediateHover = function(text, title) {
    
  window.immediateHover = [
    { value: title },
    { value: text }
  ]
  window.triggerHovers();

}

window.triggerSigHelp = function() {
  
  window.editor.trigger('', 'editor.action.triggerParameterHints', {});

}

window.requestMetadata = function (metadata, trigger, data) {

  if (!trigger)
    trigger = 'suggestion';

  let metadata_name = metadata.toLowerCase();
  let request = window.metadataRequests.get(metadata_name);

  if (!request) {

    window.metadataRequests.set(metadata_name, true);

    let event_params = {
      metadata: metadata_name,
      trigger: trigger
    }

    if (data)
      event_params = Object.assign(event_params, data);

    window.sendEvent("EVENT_GET_METADATA", event_params);
  }

}

window.showCustomSuggestions = function(suggestions) {

  window.customSuggestions = [];

  try {

    let suggestObj = JSON.parse(suggestions);
    let currentPosition = window.editor.getPosition();

    for (const [key, value] of Object.entries(suggestObj)) {

      let suggestion = {
        label: value.name,
        kind: monaco.languages.CompletionItemKind[value.kind],
        insertText: value.text,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        detail: value.detail,
        documentation: value.documentation,
        filterText: value.hasOwnProperty('filter') ? value.filter : value.name,
        sortText: value.hasOwnProperty('sort') ? value.sort : value.name,
        preselect: !!value.preselect
      };

      if (value.event) {
        suggestion.insertText = '';
        suggestion.insertTextRules = undefined;
        suggestion.range = new monaco.Range(currentPosition.lineNumber, currentPosition.column, currentPosition.lineNumber, currentPosition.column);
        suggestion.eventSuggestion = true;
        suggestion.eventName = value.event;
        suggestion.codicon = value.codicon ? value.codicon : 'codicon-symbol-event';
      }

      if (!suggestion.codicon && value.codicon)
        suggestion.codicon = value.codicon;

      window.customSuggestions.push(suggestion);

    }

    window.triggerSuggestions();
    return true;

	}
	catch (e) {
		return { errorDescription: e.message };
	}

}

window.showPreviousCustomSuggestions = function () {

  if (window.editor.previousCustomSuggestions) {
    window.customSuggestions = [...window.editor.previousCustomSuggestions];
    window.triggerSuggestions();
    return true;
  }
  else {
    return false;
  }

}

window.showCustomInlineSuggestions = function (suggestions) {

  window.customInlineSuggestions = [];

  try {

    let suggestObj = JSON.parse(suggestions);

    for (const [key, value] of Object.entries(suggestObj)) {

      let item = {
        insertText: value.hasOwnProperty('text') ? value.text : value.name,
        filterText: value.hasOwnProperty('filter') ? value.filter : value.name,
        label: value.hasOwnProperty('label') ? value.label : value.name
      };

      if (value.range) {
        item.range = value.range;
      }
      else if (value.hasOwnProperty('startLineNumber')) {
        item.range = {
          startLineNumber: value.startLineNumber,
          startColumn: value.startColumn,
          endLineNumber: value.endLineNumber,
          endColumn: value.endColumn
        };
      }

      if (value.command)
        item.command = value.command;

      if (value.additionalTextEdits)
        item.additionalTextEdits = value.additionalTextEdits;

      window.customInlineSuggestions.push(item);

    }

    window.triggerInlineSuggestions();
    return true;

  }
  catch (e) {
    window.customInlineSuggestions = [];
    return { errorDescription: e.message };
  }

}

window.showInlineSuggestion = function (suggestions) {

  if (!window.editor || !window.editor.inlineSuggestController)
    return false;

  try {

    let suggestionItems = typeof suggestions == 'string' ? JSON.parse(suggestions) : suggestions;

    if (!Array.isArray(suggestionItems))
      throw new TypeError('Ожидается массив строк');

    if (!suggestionItems.length)
      return false;

    for (let suggestionIndex = 0; suggestionIndex < suggestionItems.length; suggestionIndex++) {
      if (typeof suggestionItems[suggestionIndex] != 'string')
        throw new TypeError('Элемент массива с индексом ' + suggestionIndex + ' должен быть строкой');
    }

    return window.editor.inlineSuggestController.showTexts(suggestionItems);

  }
  catch (e) {
    return { errorDescription: e.message };
  }

}

window.resolveAIInlineCompletion = function (requestId, suggestions) {
  return aiInlineProvider.resolve(requestId, suggestions);
}

window.hideInlineSuggestions = function () {

  cancelScheduledAIInlineContentTrigger();
  if (window.editor && window.editor.inlineSuggestController)
    window.editor.inlineSuggestController.hide('hidden');

}

window.triggerInlineSuggestions = function () {

  cancelScheduledAIInlineContentTrigger();
  if (window.editor && window.editor.inlineSuggestController)
    window.editor.inlineSuggestController.trigger(true, '', 'explicit', Date.now());

}

window.isInlineSuggestionsVisible = function () {

  return window.editor && window.editor.inlineSuggestController ? window.editor.inlineSuggestController.isVisible() : false;

}

window.enableInlineSuggestions = function (enabled) {

  window.inlineSuggestEnabled = enabled;

  if (!enabled) {
    cancelScheduledAIInlineContentTrigger();
    aiInlineProvider.cancel('disabled');
    if (window.editor && window.editor.inlineSuggestController)
      window.editor.inlineSuggestController.hide('disabled');
  }
  else
    window.triggerInlineSuggestions();

}

window.nextDiff = function() {

  if (window.editor.navi) {
    window.editor.navi.next();
    window.editor.markDiffLines();
  }

}

window.previousDiff = function() {

  if (window.editor.navi) {
    window.editor.navi.previous();
    window.editor.markDiffLines();
  }

}

window.disableContextMenu = function() {
  
  window.editor.updateOptions({ contextmenu: false });
  window.contextMenuEnabled = false;

}

window.scrollToTop = function () {
  
  document.body.scrollTop = 0;
  document.documentElement.scrollTop = 0;

}

window.hideLineNumbers = function() {
      
  window.editor.updateOptions({ lineNumbers: false, lineDecorationsWidth: 0 });

}

window.showLineNumbers = function() {
      
  window.editor.updateOptions({ lineNumbers: true, lineDecorationsWidth: 10 });
  
}

window.clearMetadata = function() {

  window.metadataRequests.clear();
  for (let [key, value] of Object.entries(window.bslMetadata)) {
    if (value.hasOwnProperty('items'))
      window.bslMetadata[key].items = {};
  }

}

window.hideScroll = function(type) {

  document.getElementsByTagName('body')[0].style[type] = 'hidden';
  document.getElementById('container').style[type] = 'hidden';

}

window.hideScrollX = function() {

  window.hideScroll('overflowX');

}

window.hideScrollY = function() {

  window.hideScroll('overflowY');

}

window.getTokenFromPosition = function(position) {

  let bsl = new bslHelper(window.editor.getModel(), position);
  return bsl.getLastToken();

}

window.getLastToken = function() {

  return window.getTokenFromPosition(window.editor.getPosition());

}

window.hideSuggestionsList = function() {

  editor.trigger("editor", "hideSuggestWidget");

}

window.hideSignatureList = function () {

  window.signatureVisible = false;
  let widget = document.querySelector('.parameter-hints-widget');

  if (widget)
    widget.style.display = 'none';

}

window.hideHoverList = function() {

  let hovers = document.querySelectorAll('.monaco-editor-hover .hover-row');
  hovers.forEach(function(hover){
    hover.remove();
  });

}

window.openSearchWidget = function() {
  
  getActiveEditor().trigger('', 'actions.find');
  setFindWidgetDisplay('inherit');    
  focusFindWidgetInput();

}

window.closeSearchWidget = function() {
  
  getActiveEditor().trigger('', 'closeFindWidget')
  setFindWidgetDisplay('none');

}

window.setFontSize = function(fontSize)  {
  
  window.editor.updateOptions({fontSize: fontSize});

}

window.setFontFamily = function(fontFamily)  {
  
  window.editor.updateOptions({fontFamily: fontFamily});

}

window.setFontWeight = function(fontWeight)  {

  window.editor.updateOptions({fontWeight: fontWeight});

}

window.setLineHeight = function(lineHeight) {

  window.editor.updateOptions({lineHeight: lineHeight});

}

window.setLetterSpacing = function(letterSpacing) {

  window.editor.updateOptions({letterSpacing: letterSpacing});

}

window.renderWhitespace = function(enabled) {

  let mode = enabled ? 'all' : 'none';
  window.editor.updateOptions({renderWhitespace: mode});

}

window.showStatusBar = function(overlapScroll = true) {
  
  if (!window.statusBarWidget)
    createStatusBarWidget(overlapScroll);    

}

window.hideStatusBar = function() {

  if (window.statusBarWidget) {
    if (window.editor.navi)
        window.editor.getModifiedEditor().removeOverlayWidget(window.statusBarWidget);
      else
        window.editor.removeOverlayWidget(window.statusBarWidget);
    window.statusBarWidget = null;
  }

}

window.addBookmark = function(lineNumber) {

  if (lineNumber < window.getLineCount()) {

    let bookmark = window.editor.bookmarks.get(lineNumber);

    if (!bookmark)
      window.updateBookmarks(lineNumber);

    return !bookmark ? true : false;

  }
  else {
    
    window.editor.bookmarks.delete(lineNumber);
    return false;

  }

}

window.removeBookmark = function(lineNumber) {

  if (lineNumber < window.getLineCount()) {

    let bookmark = window.editor.bookmarks.get(lineNumber);

    if (bookmark)
      window.updateBookmarks(lineNumber);    
    
    return bookmark ? true : false;

  }
  else {

    window.editor.bookmarks.delete(lineNumber);
    return false;

  }

}

window.removeAllBookmarks = function() {

  window.editor.bookmarks.clear();
  window.updateBookmarks();

}

window.getBookmarks = function () {

  let sorted_bookmarks = getSortedBookmarks();
  return Array.from(sorted_bookmarks.keys());

}

window.removeAllBreakpoints = function() {

  window.editor.breakpoints.clear();
  window.editor.updateDecorations([]);

}  

window.getBreakpoints = function () {

  let sorted_breakpoints = window.getSortedBreakpoints();
  return JSON.stringify(Array.from(sorted_breakpoints.keys()));

}

window.setCurrentDebugLine = function (line) {

  window.editor.currentDebugLine.clear();

  const debugLine = {
      range: new monaco.Range(line, 1, line),
      options: {
          isWholeLine: true,
          className: 'debug-line',
        }
  }

  const pointer = {
    range: new monaco.Range(line, 1, line),
    options: {
        isWholeLine: true,
        linesDecorationsClassName: 'debug-line-pointer',
        overviewRuler: {
            position: 1
        }
    }
  }

  const DebugLineSet = {
    line: debugLine,
    pointer: pointer
  }

  window.editor.currentDebugLine.set(line, DebugLineSet);
  window.editor.updateDecorations([]);

}

window.deleteCurrentDebugLine = function () {

  window.editor.currentDebugLine.clear();
  window.editor.updateDecorations([]);

}

window.setActiveSuggestLabel = function (label) {

  let element = document.querySelector('.monaco-list-rows .focused .monaco-icon-name-container');

  if (element)
    element.innerText = label;

}

window.setSuggestItemDetailById = function (rowId, detailInList, documentation = null) {

  let i = parseInt(rowId);
  let suggestWidget = getSuggestWidget();

  if (suggestWidget && i < suggestWidget.widget.list.view.items.length) {

    let suggest_item = suggestWidget.widget.list.view.items[i];
    suggest_item.element.completion.detail = detailInList;      
    
    if (documentation)
      suggest_item.element.completion.documentation = documentation;      
   
    let detail_element = getChildWithClass(suggest_item.row.domNode,'details-label');

    if (detail_element)
      detail_element.innerText = detailInList

  }

}

window.setActiveSuggestDetail = function (detailInList, detailInSide = null, maxSideHeightInPixels = 800) {

  let listRowDetail = document.querySelector('.monaco-list-rows .focused .details-label');

  if (listRowDetail)
    listRowDetail.innerText = detailInList;

  let sideDetailHeader = document.querySelector('.suggest-widget.docs-side .details .header');
  
  if (sideDetailHeader) {
    
    if (!detailInSide)
      detailInSide = detailInList;

    sideDetailHeader.innerText = detailInSide;
    
    let sideDetailElement = document.querySelector('.suggest-widget.docs-side .details');      
    let contentHeightInPixels = sideDetailHeader.scrollHeight;
    let viewportHeightInPixels = Math.min(maxSideHeightInPixels, contentHeightInPixels);

    sideDetailElement.style.height = viewportHeightInPixels.toString() + 'px';

  }
  
}

window.hasTextFocus = function () {

  return window.editor.hasTextFocus();

}

window.setActiveSuggestionAcceptors = function (characters) {

  window.activeSuggestionAcceptors = characters.split('|');

}

window.nextMatch = function () {

  getActiveEditor().trigger('', 'editor.action.nextMatchFindAction');

}

window.previousMatch = function () {

  getActiveEditor().trigger('', 'editor.action.previousMatchFindAction');

}

window.setOption = function (optionName, optionValue) {

  if (isAIInlineOption(optionName) && !isValidAIInlineOption(optionName, optionValue))
    return false;

  window.editor[optionName] = optionValue;
  window.editor_options[optionName] = optionValue;

  if (isAIInlineOption(optionName)) {
    aiInlineProvider.optionChanged(optionName, optionValue);

    if (optionName == 'generateAIInlineCompletionEvent' && optionValue !== true
      && window.editor.inlineSuggestController) {
      cancelScheduledAIInlineContentTrigger();
      window.editor.inlineSuggestController.hide('disabled');
    }
  }

  if (optionName == 'generateBeforeSignatureEvent')
      startStopSignatureObserver();

  if (optionName == 'generateSelectSuggestEvent')
    startStopSuggestSelectionObserver();

  if (optionName == 'disableDefinitionMessage')
    startStopDefinitionMessegeObserver();

  if (optionName == 'generateSuggestActivationEvent')
      startStopSuggestActivationObserver();

  if (optionName == 'allowRevertBack' && window.editor.navi) {
    window.editor.allowRevertBack = Boolean(optionValue);
    applyDiffAllowRevertBackOptions(window.editor);
  }

  if (optionName == 'highlightInnerQuotes' && typeof setHighlightInnerQuotes == 'function') {
    setHighlightInnerQuotes(optionValue);
    window.setTheme(getCurrentThemeFullName());
  }

  if (optionName == 'disableFolding')
    refreshFoldingState();

  // В compare-режиме создаётся новый diff-редактор без lifecycle-методов обычного редактора.
  // Опцию сохраняем, но auxiliary diff-декорации к основному diff-редактору не применяем.
  if (optionName == 'showDiffDecorations' && !window.editor.navi) {
    if (isShowDiffDecorationsEnabled() && window.editor.calculateDiff)
      calculateDiff();
    else {
      window.editor.removeDiffWidget();
      disposeDiffCalculationEditor();
      window.editor.diff_decorations = [];
      window.editor.updateDecorations([]);
    }
  }

}

window.getOption = function (optionName) {

  return typeof window.editor[optionName] == 'undefined'
    ? window.editor_options[optionName]
    : window.editor[optionName];
  
}

window.disableKeyBinding = function (keybinding) {

  const bind_str = keybinding.toString();
  const key_name = 'kbinding_' + bind_str;

  if (window.editor[key_name])
    window.editor[key_name].set(true);
  else
    window.editor[key_name] = window.editor.createContextKey(key_name, true);

  window.editor.addCommand(keybinding, function() {window.sendEvent('EVENT_KEY_BINDING_' + bind_str)}, key_name);

}

window.enableKeyBinding = function (keybinding) {

  const key_name = 'kbinding_' + keybinding;
  const context_key = window.editor[key_name];
  
  if (context_key)
    context_key.set(false);
  
}

window.jumpToBracket = function () {

  if (!jumpToIfBracket())
    window.editor.trigger('', 'editor.action.jumpToBracket');

}

window.selectToBracket = function () {

  if (!selectToIfBracket())
    window.editor.trigger('', 'editor.action.selectToBracket');

}

window.revealDefinition = function() {

  window.editor.trigger('', 'editor.action.revealDefinition');

}

window.peekDefinition = function() {

  window.editor.trigger('', 'editor.action.peekDefinition');

}

window.setOriginalText = function (originalText, setEmptyOriginalText = false) {

  window.editor.originalText = originalText;
  window.editor.calculateDiff = (originalText || setEmptyOriginalText);

  if (!window.editor.calculateDiff) {
    window.editor.diffCount = 0;
    window.editor.removeDiffWidget();
    disposeDiffCalculationEditor();
    window.editor.diff_decorations = [];
  }
  else if (isShowDiffDecorationsEnabled())
    calculateDiff();
  else {
    window.editor.removeDiffWidget();
    disposeDiffCalculationEditor();
    window.editor.diff_decorations = [];
  }

  window.editor.updateDecorations([]);

}

window.getOriginalText = function () {

  return window.editor.originalText;

}

window.revealLineInCenter = function (lineNumber) {

  let line = Math.min(lineNumber, window.getLineCount())
  window.editor.revealLineInCenter(lineNumber);    
  window.editor.setPosition(new monaco.Position(line, 1));

}

window.saveViewState = function () {

  return JSON.stringify(window.editor.saveViewState());

}

window.restoreViewState = function (state) {
  
  try {
		window.editor.restoreViewState(JSON.parse(state));
		return true;
	}
	catch (e) {      
		return { errorDescription: e.message };
	}

}

window.getDiffCount = function() {

  return window.editor.diffCount ? window.editor.diffCount : 0;

}

const bslFormatOptionNames = [
  'formatCanonicalKeywords',
  'formatCanonicalPlatformNames',
  'formatSplitStatements',
  'formatSpaceAfterComma',
  'formatAlignAssignments',
  'formatJoinThen',
  'formatBlankLinesAroundBlocks'
];

function parseBslFormatOptions(optionsJSON) {

  const result = {};
  bslFormatOptionNames.forEach(name => result[name] = true);

  if (optionsJSON === undefined)
    return result;

  if (typeof optionsJSON != 'string')
    throw new Error('Параметры форматирования должны быть JSON-строкой объекта');

  const source = JSON.parse(optionsJSON);

  if (!source || Array.isArray(source) || typeof source != 'object')
    throw new Error('Параметры форматирования должны быть JSON-объектом');

  bslFormatOptionNames.forEach(name => {
    if (!Object.prototype.hasOwnProperty.call(source, name))
      return;
    if (typeof source[name] != 'boolean')
      throw new Error('Опция ' + name + ' должна иметь тип boolean');
    result[name] = source[name];
  });

  return result;

}

window.formatDocument = function(optionsJSON) {

  let options;
  try {
    options = parseBslFormatOptions(optionsJSON);
  }
  catch (error) {
    return { errorDescription: error.message };
  }

  const selection = window.editor.getSelection();
  const action = selection && !selection.isEmpty()
    ? 'editor.action.formatSelection'
    : 'editor.action.formatDocument';
  const context = {
    model: window.editor.getModel(),
    options: options
  };

  window.editor.bslFormattingContext = context;

  const clearContext = function() {
    if (window.editor.bslFormattingContext === context)
      delete window.editor.bslFormattingContext;
  };

  try {
    // Эквивалент finally без Promise.prototype.finally для старого WebKit поля HTML-документа.
    Promise.resolve(window.editor.getAction(action).run()).then(clearContext, clearContext);
  }
  catch (error) {
    clearContext();
    throw error;
  }

}

window.isParameterHintsWidgetVisible = function () {

  let content_widget = getParameterHintsWidget();
  return content_widget ? content_widget.widget.visible : false;

}

window.isSuggestWidgetVisible = function() {

  const contentWidget = getSuggestWidget();
  return !!(contentWidget && contentWidget.widget && contentWidget.widget.suggestWidgetVisible
    && contentWidget.widget.suggestWidgetVisible.get());

}

window.insertSnippet = function(snippet) {

  let controller = editor.getContribution("snippetController2");
  
  if (controller)
    controller.insert(snippet);

}

window.parseSnippets = function(stData, unionSnippets = false) {

  let parser = new SnippetsParser();
  parser.setStream(stData);
  parser.parse();
  let loaded_snippets = parser.getSnippets();

  if (loaded_snippets) {

    let snip_obj = loaded_snippets;

    if (unionSnippets)
      snippets = Object.assign(snippets, snip_obj);
    else
      snippets = snip_obj;

    return true;

  }
  
  return false;
  
}

window.setDefaultSnippets = function() {

  window.snippets = window.bslSnippets;

}

window.clearSnippets = function() {

  window.snippets = {};

}

window.updateSnippetByGUID = function (snippetGUID) {

  suggestWidget = getSuggestWidget();

  if (suggestWidget) {

    suggestWidget.widget.list.view.items.forEach((completionItem) => {

      if (completionItem.element.completion.guid == snippetGUID)
        completionItem.element.provider.resolveCompletionItem(window.editor.getModel(),
          window.editor.getPosition(),
          completionItem.element.completion
        );

    });

  }

}

window.setMarkers = function (markersJSON) {

  try {
    const markers_array = JSON.parse(markersJSON);
    const model = window.editor.navi ? window.editor.getModifiedEditor().getModel() : window.editor.getModel();
    setModelMarkers(model, markers_array)
    return true;
  }
  catch (e) {
    return { errorDescription: e.message };
  }

}

window.getMarkers = function( ) {

  return getSortedMarkers();

}

window.goNextMarker = function () {

  let sorted_markers = getSortedMarkers();

  if (sorted_markers.length - 1 <= currentMarker)
    currentMarker = -1;

  currentMarker++;
  goToCurrentMarker(sorted_markers);

}

window.goPreviousMarker = function () {

  let sorted_markers = getSortedMarkers();

  currentMarker--;

  if (currentMarker < 0)
  currentMarker = sorted_markers.length - 1;

  goToCurrentMarker(sorted_markers);

}

window.goToFuncDefinition = function (funcName) {

  if (funcName) {

    let pattern = '(процедура|procedure|функция|function)\\s*' + funcName + '\\(';
    let match = getActiveEditor().getModel().findPreviousMatch(pattern, window.editor.getPosition(), true);

    if (match) {
      window.editor.revealLineInCenter(match.range.startLineNumber);
      window.editor.setPosition(new monaco.Position(match.range.startLineNumber, match.range.startColumn));
      window.editor.focus();
      return true;
    }
  }

  return false;

}

window.fold = function() {

  window.editor.trigger('', 'editor.fold');

}

window.foldAll = function() {

  window.editor.trigger('', 'editor.foldAll');

}

window.unfold = function() {

  window.editor.trigger('', 'editor.unfold');

}

window.unfoldAll = function() {

  window.editor.trigger('', 'editor.unfoldAll');

}

window.scale = function(direction) {

  if (direction == 0)
    window.editor.trigger('', 'editor.action.fontZoomReset');
  else if (0 < direction)
    window.editor.trigger('', 'editor.action.fontZoomIn');
  else
    window.editor.trigger('', 'editor.action.fontZoomOut');

}

window.gotoLine = function() {

  window.editor.trigger('', 'editor.action.gotoLine');
  getQuickOpenWidget().widget.quickOpenWidget.inputElement.focus();

}

window.showVariablesDescription = function(variablesJSON) {    
    
  try {

    if (window.treeview != null)
      hideVariablesDisplay();

    const variables = JSON.parse(variablesJSON);
    window.treeview = new Treeview("#variables-tree", window.editor, resolveTreeIcon);
    window.treeview.replaceData(variables);
    showVariablesDisplay();

    return true;

  }
  catch (e) {
    return { errorDescription: e.message };
  }

}

window.updateVariableDescription = function(variableId, variableJSON) { 

  try {

    const variables = JSON.parse(variableJSON);
    window.treeview.replaceData(variables, variableId);
    window.treeview.open(variableId);
    return true;

  }
  catch (e) {
    return { errorDescription: e.message };
  }

}

window.setLineNumbersDecorations = function(decorations) {

  window.lineNumbersDedocrations = [];
  window.lineNumbersDedocrations.push();

  try {
    
    const decor = JSON.parse(decorations);
    let length = 0;
    decor.forEach(function (value) {
      window.lineNumbersDedocrations.push(value);
      length = Math.max(length, value.length)
    });

    const max_length = window.lineNumbersDedocrations.length.toString().length + 3
    window.editor.updateOptions({ lineNumbersMinChars: 0 });
    window.editor.updateOptions({ lineNumbersMinChars: length + max_length });
    window.editor.layout();

    return true;

  }
  catch (e) {
    return { errorDescription: e.message };
  }

}

window.getDifferences = function () {

  let diff = [];

  if (editor.navi) {

    diff = window.editor.getLineChanges();
    let original_model = window.editor.originalEditor.getModel();
    let modified_model = window.editor.modifiedEditor.getModel();

    diff.forEach(function (value) {
              
      value["originalText"] = getTextInLines(original_model, value.originalStartLineNumber, value.originalEndLineNumber);
      value["modifiedText"] = getTextInLines(modified_model, value.modifiedStartLineNumber, value.modifiedEndLineNumber);        

      if (Array.isArray(value.charChanges)) {
        
        value.charChanges.forEach(function (char) {
          char["originalText"] = getTextInRange(
            original_model,
            char.originalStartLineNumber,
            char.originalStartColumn,
            char.originalEndLineNumber,
            char.originalEndColumn
          );
          char["modifiedText"] = getTextInRange(
            modified_model,
            char.modifiedStartLineNumber,
            char.modifiedStartColumn,
            char.modifiedEndLineNumber,
            char.modifiedEndColumn
          );
        });

      }

    });

  }

  return diff;

}

window.goNextIssue = function () {

  let sortedIssues = getSortedIssues();

  if (sortedIssues.length - 1 <= window.currentIssue)
  window.currentIssue = -1;

  window.currentIssue++;
  goToCurrentIssue(sortedIssues);

}

window.goPreviousIssue = function () {

  let sortedIssues = getSortedIssues();

  window.currentIssue--;

  if (window.currentIssue < 0)
    currentIssue = sortedIssues.length - 1;

  goToCurrentIssue(sortedIssues);

}

window.getReviewIssues = function() {

  let issues = [];

  window.reviewWidgets.forEach((value, key, map) => {
    let issue = {
      startLineNumber: value.startLineNumber,
      endLineNumber: value.startLineNumber,
      date: value.date,
      author: value.author,
      severity: value.severity,       
      message: value.message
    }
    issues.push(issue);
  });

  return issues;

}

window.setReviewIssues = function(issuesJSON) {

  try {

    const issues = JSON.parse(issuesJSON);
    removeReviewWidgets();

    for (let x = 0; x < issues.length; x++) {
      let issue = issues[x];
      createReviewWidget(issue.startLineNumber, issue);
    }

    return true;

  }
  catch (e) {
    return { errorDescription: e.message };
  }

}

window.startCodeReview = function(readOnlyCodeReview = false) {

  window.setOption('reviewMode', true);
  window.setOption('readOnlyCodeReview', readOnlyCodeReview);
  window.currentIssue = -1;

}

window.stopCodeReview = function() {
  
  window.setOption('reviewMode', false);
  removeReviewWidgets();

}

// #endregion

// #region init editor
window.editor = undefined;

window.createEditor = function(language_id, text, theme) {

  const container = document.getElementById("container");

  if (!container)
    return;

  window.editor = monaco.editor.create(container, {
    theme: theme,
    value: text,
    language: language_id,
    contextmenu: true,
    wordBasedSuggestions: false,
    scrollBeyondLastLine: false,
    insertSpaces: false,
    trimAutoWhitespace: false,
    autoIndent: true,
    find: {
      addExtraSpaceOnTop: false
    },
    parameterHints: {
      cycle: true
    },    
    lineNumbers: window.getLineNumber,
    customOptions: true,
    renderValidationDecorations: "on"
  });

  registerHelpAction(window.editor);

  changeCommandKeybinding('editor.action.revealDefinition', monaco.KeyCode.F12);
  changeCommandKeybinding('editor.action.peekDefinition', monaco.KeyMod.CtrlCmd | monaco.KeyCode.F12);
  changeCommandKeybinding('editor.action.deleteLines',  monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_L);
  changeCommandKeybinding('editor.action.selectToBracket',  monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KEY_B);
  changeCommandKeybinding('editor.action.quickOutline',  monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KEY_P);

  window.lineNumbersDedocrations = [];
  window.setDefaultStyle();
  initEditorEventListenersAndProperies();

}

function registerCodeLensProviders() {

  setTimeout(() => {

    for (const [key, lang] of Object.entries(window.languages)) {
      
      let language = lang.languageDef;

      monaco.languages.registerCodeLensProvider(language.id, {
        onDidChange: lang.codeLenses.onDidChange, 
        provideCodeLenses: lang.codeLenses.provider, 
        resolveCodeLens: lang.codeLenses.resolver
      });

    }

  }, 50);

}

// Register languages
for (const [key, lang] of Object.entries(window.languages)) {

  let language = lang.languageDef;

  monaco.languages.register({ id: language.id });

  // Register a tokens provider for the language
  monaco.languages.setMonarchTokensProvider(language.id, language.rules);

  // Register providers for the new language
  monaco.languages.registerCompletionItemProvider(language.id, lang.completionProvider);
  monaco.languages.registerFoldingRangeProvider(language.id, lang.foldingProvider);
  if (lang.documentSymbolProvider)
    monaco.languages.registerDocumentSymbolProvider(language.id, lang.documentSymbolProvider);

  monaco.languages.registerSignatureHelpProvider(language.id, lang.signatureProvider);
  monaco.languages.registerHoverProvider(language.id, lang.hoverProvider);
  monaco.languages.registerDocumentFormattingEditProvider(language.id, lang.formatProvider);
  if (lang.formatProvider.provideDocumentRangeFormattingEdits)
    monaco.languages.registerDocumentRangeFormattingEditProvider(language.id, lang.formatProvider);
  monaco.languages.registerColorProvider(language.id, lang.colorProvider);
  monaco.languages.registerDefinitionProvider(language.id, lang.definitionProvider);
  monaco.languages.registerCodeActionProvider(language.id, lang.codeActionProvider);  

  if (lang.autoIndentation && lang.indentationRules)
    monaco.languages.setLanguageConfiguration(language.id, { indentationRules: lang.indentationRules });

  monaco.languages.setLanguageConfiguration(language.id, { brackets: lang.brackets, autoClosingPairs: lang.autoClosingPairs });

  if (!window.editor) {

    monaco.editor.onDidCreateEditor(e => {

      if (!window.editor) {

        import('./bslGlobals').then(({ default: bslGlobals }) => {
          window.bslGlobals = bslGlobals;
        }).catch((error) => 'An error occurred while loading the bslGlobals');

        import('./bslMetadata').then(({ default: bslMetadata }) => {
          window.bslMetadata = bslMetadata
        }).catch((error) => 'An error occurred while loading the bslMetadata');

        import('./bslQuery').then(({ default: bslQuery }) => {
          window.bslQuery = bslQuery
        }).catch((error) => 'An error occurred while loading the bslQuery');

        import('./bslDCS').then(({ default: bslDCS }) => {
          window.bslDCS = bslDCS
        }).catch((error) => 'An error occurred while loading the bslDCS');

        import('./snippets').then(({ default: snippets }) => {
          window.bslSnippets = snippets;
          window.setDefaultSnippets();
        }).catch((error) => 'An error occurred while loading the snippets');

        import('./querySnippets').then(({ default: querySnippets }) => {
          window.querySnippets = querySnippets;
        }).catch((error) => 'An error occurred while loading the querySnippets');

        import('./DCSSnippets').then(({ default: DCSSnippets }) => {
          window.DCSSnippets = DCSSnippets;
        }).catch((error) => 'An error occurred while loading the DCSSnippets');

        import('./bsl_helper').then(({ default: bslHelper }) => {
          window.bslHelper = bslHelper
        }).catch((error) => 'An error occurred while loading the bsl_helper');

        import('./colors').then(({ default: colors }) => {
          window.colors = colors
        }).catch((error) => 'An error occurred while loading the colors');

        registerCodeLensProviders();

      }

    });

    for (const [key, value] of Object.entries(language.themes)) {
      monaco.editor.defineTheme(value.name, value);
      monaco.editor.setTheme(value.name);
    }

    createEditor(language.id, getCode(), 'bsl-white');

    if (window.editor) {
      window.contextMenuEnabled = window.editor.getRawOptions().contextmenu;
      window.editor.definitionBreadcrumbs = [];
    }

  }

};

function registerHelpAction(editor) {
  if (!editor || typeof editor.addAction != 'function') return;

  editor.addAction({
    id: 'bsl.showHelp',
    label: 'Справка 1С',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.F1],
    run: function (activeEditor) {
      const model = activeEditor && activeEditor.getModel();
      const position = activeEditor && activeEditor.getPosition();
      const word = model && position ? model.getWordAtPosition(position) : null;
      if (word && word.word && window.getOption('generateGetHelpEvent')) {
        const helper = new bslHelper(model, position);
        window.sendEvent('EVENT_ON_GET_HELP', helper.getNavigationEventParams());
      }
      if (!helpBrowser.isReady())
        return;
      if (word && word.word)
        helpBrowser.showIndex(word.word, activeEditor);
      else
        window.showHelp();
    }
  });
}
for (const [action_id, action] of Object.entries(permanentActions)) {
  window.editor.addAction({
    id: action_id,
    label: action.label,
    keybindings: [action.key, action.cmd],
    precondition: null,
    keybindingContext: null,
    contextMenuGroupId: null,
    contextMenuOrder: action.order,
    run: action.callback
  });

}

// #endregion

// #region editor events
function initEditorEventListenersAndProperies() {

  window.editor.sendEvent = sendEvent;
  window.editor.decorations = [];
  window.editor.bookmarks = new Map();
  window.editor.breakpoints = new Map();
  window.editor.currentDebugLine = new Map();
  window.editor.checkBookmarks = true;
  window.editor.diff_decorations = [];
  window.editor.ifDecorations = [];
  window.editor.inlineSuggestController = createInlineSuggestController(window.editor);

  window.editor.updateDecorations = function (new_decorations) {

    let permanent_decor = [];

    window.editor.bookmarks.forEach(function (value) {
      permanent_decor.push(value);
    });

    window.editor.breakpoints.forEach(function (value) {
      permanent_decor.push(value);
    });

    window.editor.currentDebugLine.forEach(function (value) {
      permanent_decor.push(value.line);
      permanent_decor.push(value.pointer);
    });

    permanent_decor = permanent_decor.concat(window.editor.diff_decorations);

    getQueryDelimiterDecorations(permanent_decor);

    window.editor.decorations = window.editor.deltaDecorations(window.editor.decorations, permanent_decor.concat(new_decorations));
  }

  window.editor.removeDiffWidget = function () {

    const owner_editor = window.editor;
    const inline_diff_editor = window.inlineDiffEditor;
    const inline_diff_widget = window.inlineDiffWidget;

    clearInlineDiffTimers();
    window.inlineDiffEditor = null;
    window.inlineDiffWidget = null;

    if (owner_editor.diffZoneId) {

      if (inline_diff_widget)
        owner_editor.removeOverlayWidget(inline_diff_widget);

      owner_editor.changeViewZones(function (changeAccessor) {
        changeAccessor.removeZone(owner_editor.diffZoneId);
        owner_editor.diffZoneId = 0;
      });

    }

    disposeAuxiliaryDiffEditor(inline_diff_editor);

  }

  // Внутренний обработчик вынесен в свойства редактора для тестирования полного lifecycle виджета.
  window.editor.createDiffWidget = createDiffWidget;

  window.editor.onMouseMove(e => {
      
    newReviewDecoration(e);
            
  });

  window.editor.onKeyDown(e => editorOnKeyDown(e));

  window.editor.onDidChangeModelContent(e => {

    let aiTriggerSource = window.aiInlineProgrammaticChangeDepth > 0 ? 'programmatic' : 'content';
    let aiTriggeredAt = Date.now();
    
    calculateDiff();

    if (window.getOption('generateModificationEvent'))
      window.sendEvent('EVENT_CONTENT_CHANGED', '');

    checkBookmarksAfterRemoveLine(e);
    checkBreakpointsAfterRemoveLine(e);
    window.updateBookmarks(undefined);
    window.updateBreakpoints(undefined);

    window.setOption('lastContentChanges', e);
    let aiTriggerCharacter = getInlineTriggerCharacter(e);
    let aiContentTriggerVersion = ++window.aiInlineContentTriggerVersion;
    window.aiInlineContentTriggerScheduled = true;
    setTimeout(function () {
      if (aiContentTriggerVersion != window.aiInlineContentTriggerVersion)
        return;

      window.aiInlineContentTriggerScheduled = false;
      if (window.editor && window.editor.inlineSuggestController)
        window.editor.inlineSuggestController.trigger(false, aiTriggerCharacter, aiTriggerSource, aiTriggeredAt);
    }, 0);

    if (window.getCurrentLanguageId() == 'bsl_query') {
      if (window.editor.navi) {
        queryModelService.schedule(window.editor.getModifiedEditor().getModel());
        queryModelService.schedule(window.editor.getOriginalEditor().getModel());
      }
      else {
        queryModelService.schedule(window.editor.getModel());
      }
    }

  });

  window.editor.onKeyUp(e => {
    
    if (e.ctrlKey)
      window.ctrlPressed = false;

    if (e.altKey)
      window.altPressed = false;

    if (e.shiftKey)
      window.shiftPressed = false;

  });

  window.editor.onMouseDown(e => {

    if (e.event.leftButton && e.event.ctrlKey) {

      let position = e.target.position;

      if (position) {

        let target = window.editor.getModel().getWordAtPosition(position);

        if (target) {
          let current_selection = window.editor.getSelection();
          let target_selection = new monaco.Range(position.lineNumber, target.startColumn, position.lineNumber, target.endColumn);
          if (!current_selection.containsRange(target_selection))
            window.setSelection(position.lineNumber, target.startColumn, position.lineNumber, target.endColumn)
        }

      }

    }

    let element = e.target.element;
    checkOnLinkClick(element, window.editor, e.target.position);

    if (e.event.detail == 2 && element.classList.contains('line-numbers')) {
      let line = e.target.position.lineNumber;
      window.updateBookmarks(line);
      window.updateBreakpoints(line);
    }

    if (element.classList.contains('diff-navi')) {
      window.editor.createDiffWidget(e);
    }

    if (element.classList.contains('add-review')) {
      createReviewWidget(e.target.position.lineNumber);
    }

  });

  window.editor.onDidScrollChange(e => {

    if (e.scrollTop == 0) {
      window.scrollToTop();
    }

    window.editor.inlineSuggestController.layout();

  });

  window.editor.onDidType(text => {

    if (text === '\n') {
      checkNewStringLine();
      checkBookmarksAfterNewLine();
      checkBreakpointsAfterNewLine();
    }

  });

  window.editor.onDidChangeCursorSelection(e => {

    updateStatusBar();
    onChangeSnippetSelection(e);
    updateSelectedQueryDelimiters(e);
    updateIfHighlights();

    if (window.aiInlineContentTriggerScheduled)
      return;

    if (e.selection.isEmpty())
      window.editor.inlineSuggestController.trigger(false, '', 'cursor', Date.now());
    else
      window.editor.inlineSuggestController.hide('cursorChanged');

  });

  window.editor.onDidLayoutChange(e => {

    setTimeout(() => { resizeStatusBar(); } , 50);
    window.editor.inlineSuggestController.layout();

  })

  window.editor.onDidPaste(e => {
    onDidPaste(e);
  });

  setTimeout(() => {
    startStopSuggestSelectionObserver();
  }, 0);

}
// #endregion
  
// #region non-public functions
function rebuildBslGlobals(paths, exclude) {
  if (!window.bslGlobals)
    return false;

  if (typeof paths == 'string') {
    try {
      paths = JSON.parse(paths);
    }
    catch (e) {
      return false;
    }
  }

  if (!Array.isArray(paths))
    return false;

  const pathSet = new Set(paths);

  Object.keys(window.bslGlobals).forEach(function (section) {
    const sourceSection = window.bslGlobals[section];
    if (!sourceSection || typeof sourceSection !== 'object')
      return;

    Object.keys(sourceSection).forEach(function (name) {
      const included = pathSet.has(section + '.' + name);
      if (exclude ? !included : included)
        return;

      delete sourceSection[name];
    });
  });

  return true;
}

function inlineSelectorMatches(selector, languageId) {

  if (!selector)
    return false;

  if (typeof selector == 'string')
    return selector == '*' || selector == languageId;

  if (selector instanceof Array)
    return selector.some(item => inlineSelectorMatches(item, languageId));

  if (typeof selector == 'function')
    return selector({ language: languageId });

  if (selector.language)
    return selector.language == languageId;

  return false;

}

function getInlineCompletionProviders(languageId) {

  return inlineCompletionProviders
    .filter(item => inlineSelectorMatches(item.selector, languageId))
    .map(item => item.provider);

}

function isSnippetInlineCompletion(item) {

  return (typeof item.insertText == 'object' && item.insertText && item.insertText.snippet)
    || item.insertTextRules == monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;

}

function getInlineCompletionInsertText(item) {

  if (!item)
    return '';

  if (typeof item.insertText == 'string')
    return item.insertText;

  if (item.insertText && item.insertText.snippet)
    return item.insertText.snippet;

  if (typeof item.label == 'string')
    return item.label;

  if (item.label && item.label.label)
    return item.label.label;

  return '';

}

function getInlineCompletionPreviewText(item) {

  let text = getInlineCompletionInsertText(item);

  if (!text)
    return '';

  text = text.replace(/\$\{\d+:([^}]*)\}/g, '$1');
  text = text.replace(/\$\{\d+\|([^}]*)\|\}/g, '$1');
  text = text.replace(/\$\d+/g, '');
  text = text.replace(/\$\{\d+\}/g, '');

  return text;

}

function normalizeInlineCompletionRange(model, position, item) {

  if (item.range) {
    return new monaco.Range(item.range.startLineNumber, item.range.startColumn, item.range.endLineNumber, item.range.endColumn);
  }

  let word = model.getWordUntilPosition(position);
  let startColumn = word ? word.startColumn : position.column;

  return new monaco.Range(position.lineNumber, startColumn, position.lineNumber, position.column);

}

function normalizeInlineCompletionItem(model, position, item) {

  if (!item)
    return null;

  let range = normalizeInlineCompletionRange(model, position, item);

  if (range.startLineNumber != position.lineNumber || range.endLineNumber != position.lineNumber)
    return null;

  if (position.lineNumber != range.endLineNumber || position.column < range.startColumn || range.endColumn < position.column)
    return null;

  let insertText = getInlineCompletionInsertText(item);
  let previewText = getInlineCompletionPreviewText(item);
  let prefixText = model.getValueInRange(new monaco.Range(range.startLineNumber, range.startColumn, position.lineNumber, position.column));

  if (!insertText || !previewText || prefixText.length > previewText.length)
    return null;

  if (previewText.substr(0, prefixText.length).toLowerCase() != prefixText.toLowerCase())
    return null;

  let suffix = previewText.substr(prefixText.length);
  let remainder = model.getValueInRange(new monaco.Range(position.lineNumber, position.column, range.endLineNumber, range.endColumn));
  let replacedPreview = previewText.substr(prefixText.length, Math.max(0, range.endColumn - position.column));

  if (!suffix)
    return null;

  if (remainder && replacedPreview.toLowerCase() == remainder.toLowerCase() && suffix == replacedPreview)
    return null;

  return {
    item: item,
    range: range,
    insertText: insertText,
    previewText: previewText,
    suffix: suffix
  };

}

function getInlineCompletionsFromCustomSuggestions() {

  let suggestions = customInlineSuggestions.slice();
  customInlineSuggestions = [];
  return suggestions;

}

function getDefaultInlineCompletionItems(model, position, context) {

  return [];

}

function createDefaultInlineCompletionsProvider() {

  return {
    provideInlineCompletions: function (model, position, context, token) {

      let items = getInlineCompletionsFromCustomSuggestions();

      if (!items.length)
        items = getDefaultInlineCompletionItems(model, position, context);

      return { items: items };

    },
    freeInlineCompletions: function () { }
  }

}

function ensureInlineCompletionProviders() {

  if (window.inlineCompletionProvidersInitialized)
    return;

  window.activateInlineCompletionsApi();
  monaco.languages.registerInlineCompletionsProvider('*', createDefaultInlineCompletionsProvider());
  monaco.languages.registerInlineCompletionsProvider(['bsl', 'bsl_query', 'dcs_query'], aiInlineProvider.provider);
  window.inlineCompletionProvidersInitialized = true;

}

function escapeInlineCompletionText(text) {

  return text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');

}

function createInlineGhostTextRenderer(codeEditor) {

  let decorationIds = [];
  let viewZoneId = 0;
  let currentClassName = '';
  let styleNode = document.createElement('style');
  let zoneNode = document.createElement('div');
  let zoneInnerNode = document.createElement('div');
  let currentState = null;
  let currentThemeName = '';
  let currentAdditionalLinesCount = 0;

  styleNode.type = 'text/css';
  document.head.appendChild(styleNode);

  zoneNode.className = 'inline-completion-additional-lines';
  zoneInnerNode.className = 'inline-completion-additional-lines-inner';
  zoneNode.appendChild(zoneInnerNode);

  function clearDecorations() {

    if (decorationIds.length)
      decorationIds = codeEditor.deltaDecorations(decorationIds, []);

  }

  function clearViewZone() {

    if (viewZoneId) {
      codeEditor.changeViewZones(function (changeAccessor) {
        changeAccessor.removeZone(viewZoneId);
        viewZoneId = 0;
      });
    }

    zoneInnerNode.textContent = '';
    zoneNode.style.paddingLeft = '0px';
    currentAdditionalLinesCount = 0;

  }

  function updateInlineText(lineText, themeName) {

    clearDecorations();
    styleNode.textContent = '';
    currentClassName = '';

    if (!lineText)
      return;

    currentClassName = 'inline-completion-inline-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    let color = themeName && 0 <= themeName.indexOf('dark') ? 'rgba(140, 140, 140, 0.9)' : 'rgba(120, 120, 120, 0.85)';
    let content = escapeInlineCompletionText(lineText);

    styleNode.textContent = '.' + currentClassName + '::after { content: "' + content + '"; color: ' + color + '; white-space: pre; pointer-events: auto; }';

    decorationIds = codeEditor.deltaDecorations(decorationIds, [{
      range: new monaco.Range(currentState.position.lineNumber, currentState.position.column, currentState.position.lineNumber, currentState.position.column),
      options: {
        afterContentClassName: 'inline-completion-ghost-text ' + currentClassName
      }
    }]);

  }

  function updateAdditionalLinesLayout(themeName) {

    if (!currentState || !currentAdditionalLinesCount)
      return;

    let visiblePosition = codeEditor.getScrolledVisiblePosition(currentState.position);
    let left = visiblePosition ? visiblePosition.left : 0;
    let options = codeEditor.getRawOptions();

    zoneNode.className = 'inline-completion-additional-lines';
    if (themeName && 0 <= themeName.indexOf('dark'))
      zoneNode.className += ' inline-completion-additional-lines-dark';

    zoneNode.style.paddingLeft = left + 'px';
    zoneInnerNode.style.lineHeight = (options.lineHeight || 18) + 'px';
    zoneInnerNode.style.fontSize = (options.fontSize || 14) + 'px';
    zoneInnerNode.style.fontFamily = options.fontFamily || 'inherit';
    zoneInnerNode.style.fontWeight = options.fontWeight || 'normal';
  }

  function updateAdditionalLines(lines, themeName) {

    clearViewZone();

    if (!lines.length)
      return;

    let lineHeight = (codeEditor.getRawOptions().lineHeight || 18);
    currentAdditionalLinesCount = lines.length;
    zoneInnerNode.textContent = lines.join('\n');
    updateAdditionalLinesLayout(themeName);

    codeEditor.changeViewZones(function (changeAccessor) {
      viewZoneId = changeAccessor.addZone({
        afterLineNumber: currentState.position.lineNumber,
        heightInPx: lines.length * lineHeight,
        suppressMouseDown: true,
        domNode: zoneNode
      });
    });

  }

  return {
    show: function (normalizedItem, position, themeName) {

      currentState = {
        normalizedItem: normalizedItem,
        position: position
      };
      currentThemeName = themeName;

      let lines = normalizedItem.suffix.split('\n');
      let inlineText = lines.shift();
      let additionalLines = lines;

      updateInlineText(inlineText, themeName);
      updateAdditionalLines(additionalLines, themeName);

    },
    hide: function () {
      currentState = null;
      clearDecorations();
      clearViewZone();
      styleNode.textContent = '';
      currentClassName = '';
      currentThemeName = '';
    },
    layout: function (position, themeName) {
      if (currentState) {
        currentState.position = position;
        currentThemeName = themeName;
        let lines = currentState.normalizedItem.suffix.split('\n');
        updateInlineText(lines.shift(), themeName);
        updateAdditionalLinesLayout(themeName);
      }
    },
    isGhostDomTarget: function (target) {

      let editorNode = codeEditor.getDomNode();
      let node = target;

      while (node && node !== editorNode) {
        if (node.classList && (node.classList.contains('inline-completion-ghost-text')
          || node.classList.contains('inline-completion-additional-lines')))
          return true;
        node = node.parentNode;
      }

      return false;

    },
    dispose: function () {
      this.hide();
      if (styleNode.parentElement)
        styleNode.parentElement.removeChild(styleNode);
    }
  };

}

function createInlineSuggestToolbar(codeEditor, actions) {

  let visible = false;
  let position = null;
  let hideTimerId = 0;
  let rootNode = document.createElement('div');
  let toolbarNode = document.createElement('div');
  let menuNode = document.createElement('div');
  let countNode = document.createElement('span');

  rootNode.className = 'monaco-editor-hover monaco-hover fade-in inlineSuggestionsHints inline-completion-toolbar hidden';
  rootNode.setAttribute('role', 'toolbar');
  rootNode.setAttribute('aria-label', 'Управление inline-подсказкой');
  toolbarNode.className = 'inline-completion-toolbar-actions';
  menuNode.className = 'inline-completion-toolbar-menu hidden';
  menuNode.setAttribute('role', 'menu');
  countNode.className = 'inline-completion-toolbar-count';
  countNode.setAttribute('aria-live', 'polite');

  function runAction(action) {
    closeMenu();
    if (action())
      codeEditor.focus();
  }

  function createButton(className, label, title, action) {

    let button = document.createElement('button');
    button.type = 'button';
    button.className = 'inline-completion-toolbar-button ' + className;
    button.setAttribute('aria-label', label);
    button.title = title || label;
    button.textContent = label;
    button.addEventListener('mousedown', function (event) {
      event.preventDefault();
    });
    button.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      runAction(action);
    });
    return button;

  }

  function appendKeyLabel(button, parts) {
    parts.forEach(function (part, index) {
      if (index) {
        let separator = document.createElement('span');
        separator.className = 'inline-completion-toolbar-key-separator';
        separator.textContent = '+';
        button.appendChild(separator);
      }
      let key = document.createElement('span');
      key.className = 'inline-completion-toolbar-key';
      key.textContent = part;
      button.appendChild(key);
    });
  }

  let previousButton = createButton('inline-completion-toolbar-previous', '‹', 'Предыдущая подсказка (Alt+[)', actions.previous);
  let nextButton = createButton('inline-completion-toolbar-next', '›', 'Следующая подсказка (Alt+])', actions.next);
  let acceptButton = createButton('inline-completion-toolbar-accept', 'Принять', 'Принять подсказку (Tab)', actions.accept);
  let primaryModifierLabel = navigator.platform && 0 <= navigator.platform.indexOf('Mac') ? 'Cmd' : 'Ctrl';
  let acceptWordButton = createButton('inline-completion-toolbar-accept-word', 'Принять слово', 'Принять слово (' + primaryModifierLabel + '+RightArrow)', actions.acceptNextWord);
  let moreButton = createButton('inline-completion-toolbar-more', '…', 'Дополнительные действия', function () {
    toggleMenu();
    return false;
  });
  let acceptLineButton = createButton('inline-completion-toolbar-menu-item', 'Принять строку', 'Принять строку', actions.acceptNextLine);
  let hideButton = createButton('inline-completion-toolbar-menu-item', 'Скрыть подсказку', 'Скрыть подсказку (Esc)', actions.hide);

  appendKeyLabel(acceptButton, ['Tab']);
  appendKeyLabel(acceptWordButton, [primaryModifierLabel, '→']);
  moreButton.setAttribute('aria-haspopup', 'menu');
  moreButton.setAttribute('aria-expanded', 'false');
  acceptLineButton.setAttribute('role', 'menuitem');
  hideButton.setAttribute('role', 'menuitem');

  toolbarNode.appendChild(previousButton);
  toolbarNode.appendChild(countNode);
  toolbarNode.appendChild(nextButton);
  toolbarNode.appendChild(acceptButton);
  toolbarNode.appendChild(acceptWordButton);
  toolbarNode.appendChild(moreButton);
  menuNode.appendChild(acceptLineButton);
  menuNode.appendChild(hideButton);
  rootNode.appendChild(toolbarNode);
  rootNode.appendChild(menuNode);

  function closeMenu() {
    menuNode.classList.add('hidden');
    moreButton.setAttribute('aria-expanded', 'false');
  }

  function toggleMenu() {
    let willShow = menuNode.classList.contains('hidden');
    menuNode.classList.toggle('hidden', !willShow);
    moreButton.setAttribute('aria-expanded', willShow ? 'true' : 'false');
  }

  function clearHideTimer() {
    clearTimeout(hideTimerId);
    hideTimerId = 0;
  }

  function hide() {
    clearHideTimer();
    visible = false;
    closeMenu();
    rootNode.classList.add('hidden');
    codeEditor.layoutContentWidget(widget);
  }

  function scheduleHide() {
    clearHideTimer();
    hideTimerId = setTimeout(hide, 120);
  }

  function show() {
    clearHideTimer();
    if (!position)
      return;
    visible = true;
    rootNode.classList.remove('hidden');
    codeEditor.layoutContentWidget(widget);
    codeEditor.render();
  }

  function update(currentPosition, currentIndex, count) {
    position = currentPosition;
    countNode.textContent = (currentIndex + 1) + '/' + count;
    previousButton.disabled = count <= 1;
    nextButton.disabled = count <= 1;
    previousButton.setAttribute('aria-disabled', count <= 1 ? 'true' : 'false');
    nextButton.setAttribute('aria-disabled', count <= 1 ? 'true' : 'false');
    if (visible)
      codeEditor.layoutContentWidget(widget);
  }

  function contains(target) {
    return !!target && (target === rootNode || rootNode.contains(target));
  }

  function onDocumentMouseDown(event) {
    if (!contains(event.target))
      closeMenu();
  }

  rootNode.addEventListener('mouseenter', clearHideTimer);
  rootNode.addEventListener('mouseleave', scheduleHide);
  document.addEventListener('mousedown', onDocumentMouseDown);

  let widget = {
    allowEditorOverflow: true,
    suppressMouseDown: false,
    getId: function () { return 'bsl.inlineSuggestionToolbar'; },
    getDomNode: function () { return rootNode; },
    getPosition: function () {
      if (!visible || !position)
        return null;
      return {
        position: position,
        preference: [
          monaco.editor.ContentWidgetPositionPreference.ABOVE,
          monaco.editor.ContentWidgetPositionPreference.BELOW
        ]
      };
    }
  };

  codeEditor.addContentWidget(widget);

  return {
    update: update,
    show: show,
    hide: hide,
    scheduleHide: scheduleHide,
    keepVisible: clearHideTimer,
    contains: contains,
    isVisible: function () { return visible; },
    dispose: function () {
      hide();
      document.removeEventListener('mousedown', onDocumentMouseDown);
      codeEditor.removeContentWidget(widget);
    }
  };

}

function executeInlineCompletionCommand(command) {

  if (!command || !command.id)
    return;

  if (editor._commandService)
    editor._commandService.executeCommand.apply(editor._commandService, [command.id].concat(command.arguments || []));
  else
    editor.trigger('inlineSuggestion', command.id, command.arguments);

}

function applyInlineCompletion(normalizedItem) {

  if (!normalizedItem)
    return false;

  let item = normalizedItem.item;
  let edits = [];

  if (item.additionalTextEdits && item.additionalTextEdits.length)
    edits = edits.concat(item.additionalTextEdits);

  edits.push({
    range: normalizedItem.range,
    text: isSnippetInlineCompletion(item) ? normalizedItem.previewText : normalizedItem.insertText,
    forceMoveMarkers: true
  });

  editor.pushUndoStop();

  if (isSnippetInlineCompletion(item)) {
    if (edits.length > 1)
      editor.executeEdits('inlineCompletion', edits.slice(0, edits.length - 1));
    editor.setSelection(normalizedItem.range);
    insertSnippet(normalizedItem.insertText);
  }
  else {
    editor.executeEdits('inlineCompletion', edits);
  }

  editor.pushUndoStop();

  if (item.command)
    executeInlineCompletionCommand(item.command);

  return true;

}

function createInlineCompletionFromText(model, position, text) {

  if (!model || !position || typeof text != 'string')
    return null;

  let lineNumber = position.lineNumber;
  let column = position.column;

  if (lineNumber < 1 || model.getLineCount() < lineNumber)
    return null;

  let maxColumn = model.getLineMaxColumn(lineNumber);

  if (column < 1 || maxColumn < column)
    column = maxColumn;

  return {
    item: {
      insertText: text,
      range: {
        startLineNumber: lineNumber,
        startColumn: column,
        endLineNumber: lineNumber,
        endColumn: column
      }
    },
    range: new monaco.Range(lineNumber, column, lineNumber, column),
    insertText: text,
    previewText: text,
    suffix: text
  };

}

function beginAIInlineProgrammaticChange() {
  window.aiInlineProgrammaticChangeDepth++;
}

function endAIInlineProgrammaticChange() {
  window.aiInlineProgrammaticChangeDepth = Math.max(0, window.aiInlineProgrammaticChangeDepth - 1);
}

function cancelScheduledAIInlineContentTrigger() {
  window.aiInlineContentTriggerVersion++;
  window.aiInlineContentTriggerScheduled = false;
}

function createInlineCancellationTokenSource() {

  let cancelled = false;
  let reason = '';
  let listeners = [];
  let token = {
    get isCancellationRequested() { return cancelled; },
    get reason() { return reason; },
    onCancellationRequested: function (listener) {
      if (cancelled) {
        listener();
        return { dispose: function () { } };
      }

      listeners.push(listener);
      return {
        dispose: function () {
          listeners = listeners.filter(function (item) { return item !== listener; });
        }
      };
    }
  };

  return {
    token: token,
    cancel: function (cancelReason) {
      if (cancelled)
        return;

      cancelled = true;
      reason = cancelReason || 'superseded';
      let callbacks = listeners.slice();
      listeners = [];
      callbacks.forEach(function (listener) { listener(); });
    }
  };

}

function createInlineSuggestController(codeEditor) {

  let renderer = createInlineGhostTextRenderer(codeEditor);
  let activeCompletions = [];
  let activeCompletionIndex = 0;
  let visible = false;
  let timerId = 0;
  let requestId = 0;
  let requestCancellation = null;
  let editorNode = codeEditor.getDomNode();
  let toolbar = null;

  function clearPresentation() {

    activeCompletions = [];
    activeCompletionIndex = 0;
    visible = false;
    renderer.hide();
    if (toolbar)
      toolbar.hide();

  }

  function cancelRequest(reason) {

    clearTimeout(timerId);
    timerId = 0;
    requestId++;

    if (requestCancellation) {
      requestCancellation.cancel(reason || 'superseded');
      requestCancellation = null;
    }

  }

  function hide(reason = 'hidden') {
    cancelRequest(reason);
    clearPresentation();
  }

  function isSelectionValid() {

    let selection = codeEditor.getSelection();
    return selection && selection.isEmpty();

  }

  function canShowInlineSuggestions() {

    return window.inlineSuggestEnabled
      && !window.readOnlyMode
      && !codeEditor.navi
      && codeEditor.hasModel()
      && isSelectionValid()
      && !isSuggestWidgetVisible()
      && !isParameterHintsWidgetVisible();

  }

  function getActiveCompletion() {
    return activeCompletions.length ? activeCompletions[activeCompletionIndex] : null;
  }

  function renderActiveCompletion() {

    let activeCompletion = getActiveCompletion();

    if (!activeCompletion) {
      clearPresentation();
      return false;
    }

    visible = true;
    renderer.show(activeCompletion, codeEditor.getPosition(), getCurrentThemeName());
    toolbar.update(codeEditor.getPosition(), activeCompletionIndex, activeCompletions.length);
    return true;

  }

  function renderCompletions(normalizedItems, selectedIndex = 0) {

    if (!normalizedItems || !normalizedItems.length) {
      clearPresentation();
      return false;
    }

    activeCompletions = normalizedItems;
    activeCompletionIndex = Math.max(0, Math.min(selectedIndex, activeCompletions.length - 1));
    return renderActiveCompletion();

  }

  function trigger(explicit = false, triggerCharacter = '', triggerSource = '', triggeredAt = 0) {

    let cancelReason = triggerSource == 'cursor' ? 'cursorChanged' : 'superseded';
    cancelRequest(cancelReason);

    if (!monaco.languages.registerInlineCompletionsProvider)
      return;

    if (!canShowInlineSuggestions()) {
      clearPresentation();
      return;
    }

    let currentRequestId = ++requestId;
    let currentCancellation = createInlineCancellationTokenSource();
    requestCancellation = currentCancellation;

    timerId = setTimeout(function () {

      timerId = 0;

      if (!canShowInlineSuggestions()) {
        cancelRequest(cancelReason);
        clearPresentation();
        return;
      }

      let model = codeEditor.getModel();
      let position = codeEditor.getPosition();
      let providers = getInlineCompletionProviders(model.getLanguageIdentifier().language);
      let context = {
        triggerKind: explicit ? monaco.languages.InlineCompletionTriggerKind.Explicit : monaco.languages.InlineCompletionTriggerKind.Automatic,
        triggerCharacter: triggerCharacter,
        triggerSource: triggerSource || (explicit ? 'explicit' : 'content'),
        triggeredAt: triggeredAt || Date.now()
      };

      Promise.resolve().then(function () {

        function findProvided(providerIndex) {

          if (currentCancellation.token.isCancellationRequested)
            return Promise.resolve(null);

          if (providers.length <= providerIndex)
            return Promise.resolve(null);

          let provider = providers[providerIndex];

          return Promise.resolve(provider.provideInlineCompletions(model, position, context, currentCancellation.token)).then(function (result) {

            let items = result && result.items ? result.items : [];
            let normalizedItems = [];

            for (let item_idx = 0; item_idx < items.length; item_idx++) {
              let normalized = normalizeInlineCompletionItem(model, position, items[item_idx]);
              if (normalized)
                normalizedItems.push(normalized);
            }

            if (normalizedItems.length)
              return normalizedItems;

            return findProvided(providerIndex + 1);

          });

        }

        return findProvided(0).then(function (provided) {

          if (currentRequestId != requestId || !canShowInlineSuggestions())
            return;

          if (requestCancellation === currentCancellation)
            requestCancellation = null;

          if (provided)
            renderCompletions(provided);
          else
            clearPresentation();

        });

      }).catch(function () {
        if (currentRequestId == requestId) {
          if (requestCancellation === currentCancellation)
            requestCancellation = null;
          clearPresentation();
        }
      });

    }, explicit ? 0 : 60);

  }

  function positionAfterText(position, text) {

    let lines = text.split('\n');

    if (lines.length == 1)
      return { lineNumber: position.lineNumber, column: position.column + text.length };

    return {
      lineNumber: position.lineNumber + lines.length - 1,
      column: lines[lines.length - 1].length + 1
    };

  }

  function getNextWordLength(text) {

    let wordMatch = text.match(/[A-Za-zА-Яа-яЁё_][A-Za-zА-Яа-яЁё0-9_]*/);
    let acceptUntil = text.length;

    if (wordMatch && typeof wordMatch.index == 'number')
      acceptUntil = wordMatch.index == 0 ? wordMatch[0].length : wordMatch.index;

    let whitespaceMatch = /\s+/.exec(text);
    if (whitespaceMatch && typeof whitespaceMatch.index == 'number'
      && whitespaceMatch.index + whitespaceMatch[0].length < acceptUntil)
      acceptUntil = whitespaceMatch.index + whitespaceMatch[0].length;

    return acceptUntil;

  }

  function rebuildAfterPartialAccept(acceptedText, selectedCompletion, newPosition) {

    let newCompletions = [];
    let newSelectedIndex = 0;

    activeCompletions.forEach(function (completion) {

      if (isSnippetInlineCompletion(completion.item)
        || completion.suffix.substr(0, acceptedText.length) !== acceptedText)
        return;

      let remainingText = completion.suffix.substr(acceptedText.length);
      if (!remainingText)
        return;

      let rebuilt = createInlineCompletionFromText(codeEditor.getModel(), newPosition, remainingText);
      if (!rebuilt)
        return;

      if (completion.item.command)
        rebuilt.item.command = completion.item.command;
      if (completion.item.additionalTextEdits)
        rebuilt.item.additionalTextEdits = completion.item.additionalTextEdits;

      if (completion === selectedCompletion)
        newSelectedIndex = newCompletions.length;

      newCompletions.push(rebuilt);

    });

    return renderCompletions(newCompletions, newSelectedIndex);

  }

  function acceptPart(acceptLength) {

    let activeCompletion = getActiveCompletion();
    if (!activeCompletion || !activeCompletion.suffix)
      return false;

    if (isSnippetInlineCompletion(activeCompletion.item))
      return accept();

    let length = Math.max(0, Math.min(acceptLength(activeCompletion.suffix), activeCompletion.suffix.length));
    if (!length)
      return false;

    if (length == activeCompletion.suffix.length)
      return accept();

    let acceptedText = activeCompletion.suffix.substr(0, length);
    let currentPosition = codeEditor.getPosition();
    let partialRange = new monaco.Range(
      currentPosition.lineNumber,
      currentPosition.column,
      activeCompletion.range.endLineNumber,
      activeCompletion.range.endColumn
    );
    let newPosition = positionAfterText(currentPosition, acceptedText);

    beginAIInlineProgrammaticChange();
    try {
      codeEditor.pushUndoStop();
      codeEditor.executeEdits('inlineCompletionPartialAccept', [{
        range: partialRange,
        text: acceptedText,
        forceMoveMarkers: true
      }]);
      codeEditor.setPosition(newPosition);
      codeEditor.pushUndoStop();
    }
    finally {
      endAIInlineProgrammaticChange();
      cancelScheduledAIInlineContentTrigger();
    }

    return rebuildAfterPartialAccept(acceptedText, activeCompletion, newPosition);

  }

  function accept() {

    let activeCompletion = getActiveCompletion();
    if (!activeCompletion)
      return false;

    hide('superseded');
    return applyInlineCompletion(activeCompletion);

  }

  function acceptNextWord() {
    return acceptPart(getNextWordLength);
  }

  function acceptNextLine() {
    return acceptPart(function (text) {
      let lineBreak = text.indexOf('\n');
      return lineBreak < 0 ? text.length : lineBreak + 1;
    });
  }

  function moveSelection(delta) {

    if (!visible)
      return false;

    if (activeCompletions.length <= 1)
      return true;

    activeCompletionIndex = (activeCompletionIndex + delta + activeCompletions.length) % activeCompletions.length;
    return renderActiveCompletion();

  }

  toolbar = createInlineSuggestToolbar(codeEditor, {
    previous: function () { return moveSelection(-1); },
    next: function () { return moveSelection(1); },
    accept: accept,
    acceptNextWord: acceptNextWord,
    acceptNextLine: acceptNextLine,
    hide: function () {
      if (!visible)
        return false;
      hide('hidden');
      return true;
    }
  });

  function onEditorMouseOver(event) {
    if (!visible)
      return;
    if (toolbar.contains(event.target))
      toolbar.keepVisible();
    else if (renderer.isGhostDomTarget(event.target))
      toolbar.show();
  }

  function onEditorMouseOut(event) {

    if (!visible)
      return;

    let fromSuggestion = toolbar.contains(event.target) || renderer.isGhostDomTarget(event.target);
    let toSuggestion = toolbar.contains(event.relatedTarget) || renderer.isGhostDomTarget(event.relatedTarget);

    if (fromSuggestion && !toSuggestion)
      toolbar.scheduleHide();

  }

  editorNode.addEventListener('mouseover', onEditorMouseOver);
  editorNode.addEventListener('mouseout', onEditorMouseOut);

  return {
    trigger: trigger,
    hide: hide,
    showTexts: function (texts) {

      cancelRequest('superseded');

      if (!canShowInlineSuggestions())
        return false;

      let currentPosition = codeEditor.getPosition();
      let model = codeEditor.getModel();
      let normalizedItems = texts.map(function (text) {
        return createInlineCompletionFromText(model, currentPosition, text);
      }).filter(function (item) { return !!item; });

      return renderCompletions(normalizedItems);

    },
    showText: function (text) {
      return this.showTexts([text]);
    },
    isVisible: function () {
      return visible;
    },
    accept: accept,
    acceptNextWord: acceptNextWord,
    acceptNextLine: acceptNextLine,
    previous: function () { return moveSelection(-1); },
    next: function () { return moveSelection(1); },
    getState: function () {
      return {
        visible: visible,
        index: activeCompletionIndex,
        count: activeCompletions.length,
        toolbarVisible: toolbar.isVisible()
      };
    },
    layout: function () {
      if (visible && getActiveCompletion()) {
        renderer.layout(codeEditor.getPosition(), getCurrentThemeName());
        toolbar.update(codeEditor.getPosition(), activeCompletionIndex, activeCompletions.length);
      }
    },
    dispose: function () {
      cancelRequest('disposed');
      clearPresentation();
      editorNode.removeEventListener('mouseover', onEditorMouseOver);
      editorNode.removeEventListener('mouseout', onEditorMouseOut);
      toolbar.dispose();
      renderer.dispose();
    }
  };

}

function getInlineTriggerCharacter(e) {

  if (!e || !e.changes || e.changes.length != 1)
    return '';

  let change = e.changes[0];

  if (!change.text || change.text.length != 1)
    return '';

  return change.text;

}

function getSuggestItemByRow(row) {

  if (!row)
    return null;

  let suggestWidget = getSuggestWidget();

  if (!suggestWidget || !suggestWidget.widget || !suggestWidget.widget.list)
    return null;

  let items = suggestWidget.widget.list.view.items;

  for (let idx = 0; idx < items.length; idx++) {
    let item = items[idx];
    if (item.row && item.row.domNode === row)
      return item;
  }

  let row_id = row.getAttribute('data-index');

  if (row_id != null && row_id < items.length)
    return items[row_id];

  return null;

}

function getFocusedSuggestRow() {

  return document.querySelector('.monaco-list-row.focused');

}

function getFocusedSuggestItem() {

  return getSuggestItemByRow(getFocusedSuggestRow());

}

function isEventSuggestItem(suggestItem) {

  return suggestItem
    && suggestItem.element
    && suggestItem.element.completion
    && suggestItem.element.completion.eventSuggestion;

}

function handleEventSuggestSelection(suggestItem) {

  if (!isEventSuggestItem(suggestItem))
    return false;

  let position = window.editor.getPosition();
  let bsl = new bslHelper(window.editor.getModel(), position);
  let completion = suggestItem.element.completion;

  const eventParams = {
    current_word: bsl.word,
    last_word: bsl.lastRawExpression,
    last_expression: bsl.lastExpression,
    position: position
  }

  window.hideSuggestionsList();
  window.sendEvent(completion.eventName, eventParams);
  setTimeout(() => {
    editor.focus();
  }, 0);
  return true;

}

function decorateSuggestWidgetRows() {

  let suggestWidget = getSuggestWidget();

  if (!suggestWidget || !suggestWidget.widget || !suggestWidget.widget.list)
    return;

  let items = suggestWidget.widget.list.view.items;

  for (let idx = 0; idx < items.length; idx++) {
    let item = items[idx];
    if (item.row && item.row.domNode) {
      let rowNode = item.row.domNode;
      let completion = item.element ? item.element.completion : null;
      let iconNode = getChildWithClass(rowNode, 'suggest-icon');

      rowNode.classList.remove('event-suggestion');

      if (iconNode) {
        if (!iconNode.bslDefaultClasses)
          iconNode.bslDefaultClasses = Array.from(iconNode.classList);

        let defaultClasses = iconNode.bslDefaultClasses.slice();
        iconNode.className = '';
        defaultClasses.forEach(function (className) {
          iconNode.classList.add(className);
        });
      }

      if (isEventSuggestItem(item))
        item.row.domNode.classList.add('event-suggestion');

      if (iconNode && completion && completion.codicon) {
        iconNode.className = '';
        iconNode.classList.add('suggest-icon');
        iconNode.classList.add(completion.codicon);
        iconNode.classList.add('codicon');
        iconNode.codiconClass = completion.codicon;
      }
    }
  }

}

function mapsAreEqual(map1, map2) {
    
  let testVal;
  
  if (map1.size !== map2.size)
    return false;
  
  for (let [key, val] of map1) {
    testVal = map2.get(key);
    if (testVal !== val || (testVal === undefined && !map2.has(key))) {
      return false;
    }
  }

  return true;

}

function getIfChainKeywordType(keyword) {

  if (!keyword)
    return null;

  switch (keyword.toLowerCase()) {
    case 'если':
    case 'if':
      return 'if';
    case 'иначеесли':
    case 'elsif':
      return 'elseif';
    case 'иначе':
    case 'else':
      return 'else';
    case 'конецесли':
    case 'endif':
      return 'endif';
  }

  return null;

}

function getIfChainKeywordInfo(model, lineNumber) {

  const lineContent = model.getLineContent(lineNumber);
  const match = lineContent.match(/^\s*(иначеесли|конецесли|если|иначе|elsif|endif|if|else)(?=[\s;]|$)/i);

  if (!match)
    return null;

  const type = getIfChainKeywordType(match[1]);

  if (!type)
    return null;

  const startColumn = match[0].length - match[1].length + 1;
  const endColumn = startColumn + match[1].length;

  return {
    type: type,
    range: new monaco.Range(lineNumber, startColumn, lineNumber, endColumn)
  };

}

function getIfChainBlock(model, activeRange) {

  const stack = [];

  for (let lineNumber = 1; lineNumber <= model.getLineCount(); lineNumber++) {
    const keywordInfo = getIfChainKeywordInfo(model, lineNumber);

    if (!keywordInfo)
      continue;

    if (keywordInfo.type == 'if') {
      stack.push({
        start: keywordInfo.range,
        elseifs: [],
        elseRange: null,
        end: null
      });
      continue;
    }

    const currentBlock = stack[stack.length - 1];

    if (!currentBlock)
      continue;

    if (keywordInfo.type == 'elseif') {
      currentBlock.elseifs.push(keywordInfo.range);
      continue;
    }

    if (keywordInfo.type == 'else') {
      currentBlock.elseRange = keywordInfo.range;
      continue;
    }

    if (keywordInfo.type == 'endif') {
      currentBlock.end = keywordInfo.range;
      stack.pop();

      const ranges = [currentBlock.start].concat(currentBlock.elseifs);

      if (currentBlock.elseRange)
        ranges.push(currentBlock.elseRange);

      ranges.push(currentBlock.end);

      if (ranges.some(range => range.equalsRange(activeRange)))
        return currentBlock;
    }
  }

  return null;

}

function positionIsBeforeOrEqual(left, right) {

  if (left.lineNumber != right.lineNumber)
    return left.lineNumber < right.lineNumber;

  return left.column <= right.column;

}

function rangeContainsPosition(range, position) {

  const start = range.getStartPosition();
  const end = range.getEndPosition();
  return positionIsBeforeOrEqual(start, position) && positionIsBeforeOrEqual(position, end);

}

function getContainingIfChainBlock(model, position) {

  const stack = [];

  for (let lineNumber = 1; lineNumber <= model.getLineCount(); lineNumber++) {
    const keywordInfo = getIfChainKeywordInfo(model, lineNumber);

    if (!keywordInfo)
      continue;

    if (keywordInfo.type == 'if') {
      stack.push({
        start: keywordInfo.range,
        elseifs: [],
        elseRange: null,
        end: null
      });
      continue;
    }

    const currentBlock = stack[stack.length - 1];

    if (!currentBlock)
      continue;

    if (keywordInfo.type == 'elseif') {
      currentBlock.elseifs.push(keywordInfo.range);
      continue;
    }

    if (keywordInfo.type == 'else') {
      currentBlock.elseRange = keywordInfo.range;
      continue;
    }

    if (keywordInfo.type == 'endif') {
      currentBlock.end = keywordInfo.range;
      stack.pop();

      const fullRange = new monaco.Range(
        currentBlock.start.startLineNumber,
        currentBlock.start.startColumn,
        currentBlock.end.endLineNumber,
        currentBlock.end.endColumn
      );

      if (rangeContainsPosition(fullRange, position))
        return currentBlock;
    }
  }

  return null;

}

function getIfChainRangesFromBlock(block) {

  if (!block || !block.end)
    return null;

  let ranges = [block.start].concat(block.elseifs);

  if (block.elseRange)
    ranges.push(block.elseRange);

  ranges.push(block.end);
  return ranges;

}

function getIfBlockContext(active_editor = getActiveEditor()) {

  if (!active_editor || !active_editor.getModel)
    return null;

  const model = active_editor.getModel();

  if (!model || model.getLanguageIdentifier().language != 'bsl')
    return null;

  const position = active_editor.getPosition();
  const keywordInfo = getIfChainKeywordInfo(model, position.lineNumber);

  if (keywordInfo && keywordInfo.range.containsPosition(position)) {
    const keywordBlock = getIfChainBlock(model, keywordInfo.range);

    if (keywordBlock && keywordBlock.end) {
      return {
        editor: active_editor,
        position: position,
        keywordInfo: keywordInfo,
        block: keywordBlock,
        ranges: getIfChainRangesFromBlock(keywordBlock),
        fromKeyword: true
      };
    }
  }

  const containingBlock = getContainingIfChainBlock(model, position);

  if (!containingBlock || !containingBlock.end)
    return null;

  return {
    editor: active_editor,
    position: position,
    keywordInfo: null,
    block: containingBlock,
    ranges: getIfChainRangesFromBlock(containingBlock),
    fromKeyword: false
  };

}

function getIfContext(active_editor = getActiveEditor()) {

  return getIfBlockContext(active_editor);

}

function jumpToIfBracket(active_editor = getActiveEditor()) {

  const context = getIfContext(active_editor);

  if (!context)
    return false;

  let target = null;

  if (context.fromKeyword) {
    target = context.keywordInfo.type == 'endif'
      ? context.block.start.getStartPosition()
      : context.block.end.getStartPosition();
  }
  else {
    const position = context.position;
    const start = context.block.start.getStartPosition();
    const end = context.block.end.getStartPosition();
    const startDistance = Math.abs(position.lineNumber - start.lineNumber) * 1000 + Math.abs(position.column - start.column);
    const endDistance = Math.abs(position.lineNumber - end.lineNumber) * 1000 + Math.abs(position.column - end.column);
    target = startDistance <= endDistance ? start : end;
  }

  context.editor.setPosition(target);
  context.editor.revealPositionInCenterIfOutsideViewport(target);
  return true;

}

function selectToIfBracket(active_editor = getActiveEditor()) {

  const context = getIfContext(active_editor);

  if (!context)
    return false;

  const range = new monaco.Range(
    context.block.start.startLineNumber,
    context.block.start.startColumn,
    context.block.end.endLineNumber,
    context.block.end.endColumn
  );

  context.editor.setSelection(range);
  context.editor.revealPositionInCenterIfOutsideViewport(range.getEndPosition());
  return true;

}

function clearIfHighlights(active_editor = getActiveEditor()) {

  if (!active_editor)
    return;

  active_editor.ifDecorations = active_editor.deltaDecorations(active_editor.ifDecorations || [], []);

}

function updateIfHighlights(active_editor = getActiveEditor()) {

  if (!active_editor || !active_editor.getModel)
    return;

  const model = active_editor.getModel();
  const selection = active_editor.getSelection();

  if (!model || !selection || !selection.isEmpty() || model.getLanguageIdentifier().language != 'bsl') {
    clearIfHighlights(active_editor);
    return;
  }

  const context = getIfBlockContext(active_editor);

  if (!context) {
    clearIfHighlights(active_editor);
    return;
  }

  const ranges = context.ranges;

  if (!ranges || ranges.length == 0) {
    clearIfHighlights(active_editor);
    return;
  }

  active_editor.ifDecorations = active_editor.deltaDecorations(
    active_editor.ifDecorations || [],
    ranges.map(range => ({
      range: range,
      options: {
        inlineClassName: 'bracket-match'
      }
    }))
  );

}

function updateSelectedQueryDelimiters(e) {

  if (window.queryMode && window.editor.renderQueryDelimiters) {
    
    let prevSelectedDelimiters = new Map(window.selectedQueryDelimiters);
    window.selectedQueryDelimiters = new Map();
    const matches = Finder.findMatches(window.editor.getModel(), '^\\s*;\\s*$', e.selection);
    
    for (let idx = 0; idx < matches.length; idx++)
      window.selectedQueryDelimiters.set(matches[idx].range.toString(), true);

    if (!mapsAreEqual(prevSelectedDelimiters, window.selectedQueryDelimiters)) {
      window.editor.updateDecorations([]);
    }

  }

}

window.generateEscapeEvent = function() {

  let position = window.editor.getPosition();
  let bsl = new bslHelper(window.editor.getModel(), position);

  const eventParams = {
    current_word: bsl.word,
    last_word: bsl.lastRawExpression,
    last_expression: bsl.lastExpression,
    altKey: altPressed,
    ctrlKey: ctrlPressed,
    shiftKey: shiftPressed,
    position: position
  }

  window.sendEvent('EVENT_ON_KEY_ESC', eventParams);

}

function getTextInLines(model, startLineNumber, endLineNumber) {

  let text = '';

  if (0 < startLineNumber && endLineNumber >= startLineNumber) {
    let range = {
      startLineNumber: startLineNumber,
      startColumn: 1,
      endLineNumber: endLineNumber,
      endColumn: model.getLineMaxColumn(endLineNumber),
    }
    text = model.getValueInRange(range);
  }

  return text;

}

function getTextInRange(model, startLineNumber, startColumn, endLineNumber, endColumn) {

  let range = {
    startLineNumber: startLineNumber,
    startColumn: startColumn,
    endLineNumber: endLineNumber,
    endColumn: endColumn,
  }
  return model.getValueInRange(range);

}

window.getLineNumber = function(originalLineNumber) {

  if (window.getOption('reviewMode')) {
    let standaloneEditor = window.editor;      
    if (window.editor.navi)
      standaloneEditor = window.editor.getModifiedEditor();
    if (standaloneEditor.mousePosition && standaloneEditor.mousePosition.lineNumber == originalLineNumber) {
      return '';
    }
    else
      return originalLineNumber;
  }
  else {
    if (originalLineNumber <= window.lineNumbersDedocrations.length) {
      let str = window.lineNumbersDedocrations[originalLineNumber - 1].replace(/ /g, String.fromCharCode(160))
      return str + getLineNumberMargin(originalLineNumber) + originalLineNumber;
    }
  }
  
  return originalLineNumber;

}

window.hideBlocks = function (blocks) {

  hideBlocksForEditor(window.editor, window.hiddenBlocks, blocks);

}

window.showHiddenBlocks = function () {

  if (window.editor.navi) {
    showHiddenBlocksForDiffEditor();
    return;
  }

  showHiddenBlocksForEditor(window.hiddenBlocks);

}

window.hideUnchangedBlocks = function (retryCount = 10) {

  if (!window.editor.navi)
    return { original: [], modified: [] };

  let lineChanges = window.editor.getLineChanges();

  if (!lineChanges) {
    if (retryCount > 0)
      setTimeout(() => window.hideUnchangedBlocks(retryCount - 1), 50);

    return { original: [], modified: [] };
  }

  if (!lineChanges.length)
    return { original: [], modified: [] };

  let originalEditor = window.editor.getOriginalEditor();
  let modifiedEditor = window.editor.getModifiedEditor();

  if (!window.editor.originalHiddenBlocks)
    window.editor.originalHiddenBlocks = new Map();

  if (!window.editor.modifiedHiddenBlocks)
    window.editor.modifiedHiddenBlocks = new Map();

  removeHiddenBlocksForEditor(originalEditor, window.editor.originalHiddenBlocks);
  removeHiddenBlocksForEditor(modifiedEditor, window.editor.modifiedHiddenBlocks);

  let blocks = getUnchangedBlockPairs(
    lineChanges,
    originalEditor.getModel().getLineCount(),
    modifiedEditor.getModel().getLineCount()
  );

  hideBlocksForEditor(
    originalEditor,
    window.editor.originalHiddenBlocks,
    blocks.original
  );
  hideBlocksForEditor(
    modifiedEditor,
    window.editor.modifiedHiddenBlocks,
    blocks.modified
  );
  linkHiddenBlockPairs(window.editor.originalHiddenBlocks, window.editor.modifiedHiddenBlocks);

  return {
    original: getHiddenBlocksResult(blocks.original),
    modified: getHiddenBlocksResult(blocks.modified)
  };

}

window.activateInlineCompletionsApi = function () {

  if (!monaco.languages.InlineCompletionTriggerKind) {
    monaco.languages.InlineCompletionTriggerKind = {
      Automatic: 0,
      Explicit: 1
    };
  }

  if (!monaco.languages.registerInlineCompletionsProvider) {
    monaco.languages.registerInlineCompletionsProvider = function (languageSelector, provider) {

      let record = {
        selector: languageSelector,
        provider: provider
      };

      window.inlineCompletionProviders.push(record);

      return {
        dispose: function () {
          window.inlineCompletionProviders = window.inlineCompletionProviders.filter(item => item !== record);
        }
      };

    }
  }

}

ensureInlineCompletionProviders();

function disposeOwnedDiffModel(diff_model) {

  if (diff_model && diff_model.original
    && (!diff_model.original.isDisposed || !diff_model.original.isDisposed()))
    diff_model.original.dispose();

}

function disposeAuxiliaryDiffEditor(diff_editor) {

  if (!diff_editor)
    return;

  let diff_model = diff_editor.getModel ? diff_editor.getModel() : null;

  try {
    if (diff_editor.navi && diff_editor.navi.dispose)
      diff_editor.navi.dispose();

    diff_editor.dispose();
  }
  finally {
    // original-модель создаёт наша обвязка; modified-модель заимствована у основного редактора.
    disposeOwnedDiffModel(diff_model);
  }

}

function disposeDiffCalculationEditor() {

  let diff_editor = window.diffEditor;
  window.diffEditor = null;
  disposeAuxiliaryDiffEditor(diff_editor);

}

function clearInlineDiffTimers() {

  if (window.inlineDiffWidgetTimer) {
    clearTimeout(window.inlineDiffWidgetTimer);
    window.inlineDiffWidgetTimer = 0;
  }

  if (window.inlineDiffEditorTimer) {
    clearTimeout(window.inlineDiffEditorTimer);
    window.inlineDiffEditorTimer = 0;
  }

}

window.disposeEditor = function() {

  if (window.editor) {

    if (window.editor.diffTimer) {
      clearTimeout(window.editor.diffTimer);
      window.editor.diffTimer = 0;
    }

    if (window.editor.removeDiffWidget)
      window.editor.removeDiffWidget();

    disposeDiffCalculationEditor();

    if (window.editor.inlineSuggestController)
      window.editor.inlineSuggestController.dispose();

    if (window.editor.diffRevertButtons)
      window.editor.diffRevertButtons.dispose();

    if (window.editor.navi) {
      if (window.editor.navi.dispose)
        window.editor.navi.dispose();
      window.editor.getOriginalEditor().getModel().dispose();
      window.editor.getOriginalEditor().dispose();
      window.editor.getModifiedEditor().getModel().dispose();
      window.editor.getModifiedEditor().dispose();
    }
    else {
      window.editor.getModel().dispose();
    }

    window.editor.dispose();

  }

}

function generateSnippetEvent(e) {

  if (e.source == 'snippet') {

    let last_changes = getOption('lastContentChanges');
    let generate = getOption('generateSnippetEvent');

    if (generate && last_changes && last_changes.versionId == e.modelVersionId && e.modelVersionId == e.oldModelVersionId) {

      if (last_changes.changes.length) {

        let changes = last_changes.changes[0];
        let change_range = changes.range;
        let content_model = monaco.editor.createModel(changes.text);
        let content_range = content_model.getFullModelRange();

        // Модель нужна была только ради диапазона — Monaco её сам не удалит.
        content_model.dispose();

        let target_range = new monaco.Range(
          change_range.startLineNumber,
          change_range.startColumn,
          change_range.startLineNumber + content_range.endLineNumber - 1,
          content_range.endColumn
        );

        let event = {
          text: changes.text,
          range: target_range,
          position: editor.getPosition(),
          selection: getSelection(),
          selected_text: getSelectedText()
        }

        window.sendEvent('EVENT_ON_INSERT_SNIPPET', event);

      }

    }

  }

}

function removeQueryStringDelimiter(string) {

  let text = string;

  while (/^\s*\|/.test(text))
    text = text.substr(1);

  return text;

}

function onDidPaste(e) {

  if (window.isQueryMode() && !window.readOnlyMode) {
    
    let text = window.editor.getModel().getValueInRange(e.range).trim();
    
    if (text.toLowerCase().indexOf('выбрать') < 0 && text.toLowerCase().indexOf('select') < 0)
        return;

    let text_changed = false;

    if (text.startsWith('"')) {
      text = text.substr(1);
      text_changed = true;
    }

    if (text.endsWith(';')) {
      text = text.substr(0, text.length - 1);
      text_changed = true;
    }

    if (text.endsWith('"')) {
      text = text.substr(0, text.length - 1);
      text_changed = true;
    }

    let strings = text.split('\n');
    let query = [];

    strings.forEach(string => {
      const formated_string = removeQueryStringDelimiter(string);
      if (formated_string != string)
        text_changed = true
      query.push(formated_string);
    });

    if (text_changed && text) {
      window.setText(query.join('\n'), e.range, true);
      window.editor._modelData.model._commandManager.currentOpenStackElement.editOperations.pop();
    }

  }

}

function onChangeSnippetSelection(e) {

  if (e.source == 'snippet' || e.source == 'api') {

    let text = window.editor.getModel().getValueInRange(e.selection);
    
    let events = new Map();
    events.set('ТекстЗапроса', 'EVENT_QUERY_CONSTRUCT');
    events.set('ФорматнаяСтрока', 'EVENT_FORMAT_CONSTRUCT');
    events.set('ВыборТипа', 'EVENT_TYPE_CONSTRUCT');
    events.set('КонструкторОписанияТипов', 'EVENT_TYPEDESCRIPTION_CONSTRUCT');

    let event = events.get(text);

    if (event) {

      let mod_event = window.getOption('generateModificationEvent');

      if (mod_event)
        window.setOption('generateModificationEvent', false);

      window.setText('', e.selection, false);
      window.sendEvent(event);

      if (mod_event)
        window.setOption('generateModificationEvent', true);

    }

  }

  generateSnippetEvent(e);

}

function goToCurrentMarker(sorted_marks) {

  let idx = 0;
  let count = window.getLineCount();
  let decorations = [];

  sorted_marks.forEach(function (value) {

    if (idx == currentMarker && value.startLineNumber <= count) {

      window.editor.revealLineInCenter(value.startLineNumber);
      window.editor.setPosition(new monaco.Position(value.startLineNumber, value.startColumn));

      let decor_class = 'code-marker';

      switch (value.severity) {
        case 8: decor_class += ' marker-error'; break;
        case 1: decor_class += ' marker-hint'; break;
        case 2: decor_class += ' marker-info'; break;
        case 4: decor_class += ' marker-warning'; break;
        default: decor_class += ' marker-error';
      }

      decorations.push({
        range: new monaco.Range(value.startLineNumber, 1, value.startLineNumber),
        options: {
          isWholeLine: true,
          linesDecorationsClassName: decor_class
        }
      });

    }

    idx++;

  });

  window.editor.updateDecorations(decorations);

}

function getSortedMarks() {

  return monaco.editor.getModelMarkers().sort((a, b) => a.startLineNumber - b.startLineNumber)

}

function setModelMarkers(model, markers_array) {
    
  let markers_data = [];
  currentMarker = -1;
  
  markers_array.forEach(marker => {
    
    let severity;

    switch (marker.severity) {
      case "Error":
        severity = monaco.MarkerSeverity.Error;
        break;
      case "Hint":
        severity = monaco.MarkerSeverity.Hint;
        break;
      case "Info":
        severity = monaco.MarkerSeverity.Info;
        break;
      case "Warning":
        severity = monaco.MarkerSeverity.Warning;
        break;
      default:
        severity = monaco.MarkerSeverity.Error;
    }

    markers_data.push({
      startLineNumber: marker.lineNumber,
      endLineNumber: marker.lineNumber,
      startColumn: marker.startColumn ? marker.startColumn : model.getLineFirstNonWhitespaceColumn(marker.lineNumber),
      endColumn: marker.endColumn ? marker.endColumn : model.getLineFirstNonWhitespaceColumn(marker.lineNumber),
      severity: severity,
      message: marker.message,
      code: marker.code ? marker.code : '',
      source: marker.source ? marker.source : ''
    });

  });

  monaco.editor.setModelMarkers(model, "markers", markers_data);

}

function startStopDefinitionMessegeObserver() {

  if (window.definitionObserver != null) {
    window.definitionObserver.disconnect();
    window.definitionObserver = null;
  }

  let disable_message = window.getOption('disableDefinitionMessage');

  if (disable_message) {

    window.definitionObserver = new MutationObserver(function (mutations) {

      mutations.forEach(function (mutation) {

        if (mutation.target.classList.contains('overflowingContentWidgets') && mutation.addedNodes.length) {
          
          let element = mutation.addedNodes[0];

          if (element.classList.contains('monaco-editor-overlaymessage') && element.classList.contains('fadeIn')) {
            element.style.display = 'none';
          }

        }

      })

    });

    window.definitionObserver.observe(document, {
      childList: true,
      subtree: true
    });

  }

}

function startStopSuggestActivationObserver() {

  if (window.suggestObserver != null) {
    window.suggestObserver.disconnect();
    window.suggestObserver = null;
  }

  let fire_event = window.getOption('generateSuggestActivationEvent');

  onSuggestListMouseOver(fire_event);

  if (fire_event) {

    window.suggestObserver = new MutationObserver(function (mutations) {

      mutations.forEach(function (mutation) {

        if (mutation.target.classList.contains('monaco-list-rows') && mutation.addedNodes.length) {
          let element = mutation.addedNodes[0];
          if (element.classList.contains('monaco-list-row') && element.classList.contains('focused')) {
            decorateSuggestWidgetRows();
            removeSuggestListInactiveDetails();
            window.generateEventWithSuggestData('EVENT_ON_ACTIVATE_SUGGEST_ROW', 'focus', element);
            let alwaysDisplaySuggestDetails = window.getOption('alwaysDisplaySuggestDetails');
            if (alwaysDisplaySuggestDetails) {
              document.querySelectorAll('.monaco-list-rows .details-label').forEach(function (node) {
                node.classList.add('inactive-detail');
              });
              document.querySelector('.monaco-list-rows .focused .details-label').classList.remove('inactive-detail');
            }
          }
        }
        else if (mutation.target.classList.contains('type') || mutation.target.classList.contains('docs')) {
          decorateSuggestWidgetRows();
          let element = document.querySelector('.monaco-list-rows .focused');
          if (element) {
            if (hasParentWithClass(mutation.target, 'details') && hasParentWithClass(mutation.target, 'suggest-widget')) {
              window.generateEventWithSuggestData('EVENT_ON_DETAIL_SUGGEST_ROW', 'focus', element);
            }
          }
        }

      })

    });

    window.suggestObserver.observe(document, {
      childList: true,
      subtree: true,
    });

  }

}

function startStopSuggestSelectionObserver() {

  let suggestWidget = getSuggestWidget();

  if (!suggestWidget || !suggestWidget.widget)
    return;

  let widget = suggestWidget.widget;

  if (widget) {

    let fire_event = window.getOption('generateSelectSuggestEvent');

    if (!widget.onListMouseDownOrTapOrig)
      widget.onListMouseDownOrTapOrig = widget.onListMouseDownOrTap;

    widget.onListMouseDownOrTap = function (e) {
      let element = getParentWithClass(e.browserEvent.target, 'monaco-list-row');
      let suggestItem = getSuggestItemByRow(element);

      if (element && fire_event) {
        generateEventWithSuggestData('EVENT_ON_SELECT_SUGGEST_ROW', 'selection', element);
      }

      if (handleEventSuggestSelection(suggestItem)) {
        e.browserEvent.preventDefault();
        e.browserEvent.stopPropagation();
        return;
      }

      widget.onListMouseDownOrTapOrig(e);

    }

  }

}

function startStopSignatureObserver() {

  if (window.signatureObserver != null) {
    window.signatureObserver.disconnect();
    window.signatureObserver = null;
  }

  let fire_event = window.getOption('generateBeforeSignatureEvent');

  if (fire_event) {

    window.signatureObserver = new MutationObserver(function (mutations) {

      mutations.forEach(function (mutation) {

        if (mutation.target.classList.contains('overflowingContentWidgets') && mutation.addedNodes.length) {

          let element = mutation.addedNodes[0];

          if (element.classList.contains('parameter-hints-widget') && !window.signatureVisible) {
            element.style.display = 'none';
            window.signatureObserver.disconnect();
            window.signatureObserver = null;
          }

        }

      })

    });

    window.signatureObserver.observe(document, {
      childList: true,
      subtree: true
    });

  }

}

function changeCommandKeybinding(command, keybinding) {
  
  window.editor._standaloneKeybindingService.addDynamicKeybinding('-' + command);
  window.editor._standaloneKeybindingService.addDynamicKeybinding(command, keybinding);

}

function getQueryDelimiterDecorations(decorations) {

  if (window.queryMode && window.editor.renderQueryDelimiters) {

    const matches = Finder.findMatches(window.editor.getModel(), '^\\s*;\\s*$');
    const current_theme = getCurrentThemeName();
    const is_dark_theme = (0 <= current_theme.indexOf('dark'));
    
    for (let idx = 0; idx < matches.length; idx++) {
      
      let color = '#f2f2f2';
      let class_name  = 'query-delimiter';

      if (is_dark_theme) {
        class_name = 'query-delimiter-dark';
        color = '#2d2d2d'
      }
      
      let match = matches[idx];

      if (window.selectedQueryDelimiters.get(match.range.toString()))
        class_name += '-selected';

      decorations.push({
        range: new monaco.Range(match.range.startLineNumber, 1, match.range.startLineNumber),
        options: {
          isWholeLine: true,
          className: class_name,
          overviewRuler: {
            color: color,
            darkColor: color,
            position: 7
          }
        }
      });

    }

  }

}

function getSuggestWidget() {

  const activeEditor = getActiveEditor();
  return activeEditor && activeEditor._contentWidgets
    ? activeEditor._contentWidgets['editor.widget.suggestWidget']
    : null;

}

function getParameterHintsWidget() {

  const activeEditor = getActiveEditor();
  return activeEditor && activeEditor._contentWidgets
    ? activeEditor._contentWidgets['editor.widget.parameterHintsWidget']
    : null;

}

function getFindWidget() {
  
  return getActiveEditor()._overlayWidgets['editor.contrib.findWidget'];

}

function getSuggestWidgetRows(element) {

  let rows = [];

  if (element) {

    for (let i = 0; i < element.parentElement.childNodes.length; i++) {              
      
      let row = element.parentElement.childNodes[i];
      
      if (row.classList.contains('monaco-list-row'))
        rows.push(row.getAttribute('aria-label'));

    }

  }

  return rows;

}

window.generateEventWithSuggestData = function(eventName, trigger, row, suggestRows = []) {

  let bsl = new bslHelper(window.editor.getModel(), window.editor.getPosition());		
  let row_id = row ? row.getAttribute('data-index') : "";
  let insert_text = '';

  if (row_id) {

    let suggestWidget = getSuggestWidget();

    if (suggestWidget && row_id < suggestWidget.widget.list.view.items.length) {
      let suggest_item = suggestWidget.widget.list.view.items[row_id];
      insert_text = suggest_item.element.completion.insertText;
    }

  }

  eventParams = {
    trigger: trigger,
    current_word: bsl.word,
    last_word: bsl.lastRawExpression,
    last_expression: bsl.lastExpression,                    
    rows: suggestRows.length ? suggestRows : getSuggestWidgetRows(row),
    altKey: window.altPressed,
    ctrlKey: window.ctrlPressed,
    shiftKey: window.shiftPressed,
    row_id: row_id,
    insert_text: insert_text
  }

  if (row) {
    
    eventParams['kind'] = getChildWithClass(row, 'suggest-icon').className;
    eventParams['sideDetailIsOpened'] = (null != document.querySelector('.suggest-widget.docs-side .details .header'));

    if (eventName == 'EVENT_ON_ACTIVATE_SUGGEST_ROW' || eventName == 'EVENT_ON_DETAIL_SUGGEST_ROW')
      eventParams['focused'] = row.getAttribute('aria-label');
    else if (eventName == 'EVENT_ON_SELECT_SUGGEST_ROW')
      eventParams['selected'] = row.getAttribute('aria-label');

  }
  
  window.sendEvent(eventName, eventParams);

}

function getNativeLinkHref(element, isForwardDirection) {

  let href = '';

  if (element.classList.contains('detected-link-active')) {

    href = element.innerText;


    if (isForwardDirection && element.nextSibling || isForwardDirection == null)
      href += getNativeLinkHref(element.nextSibling, true);

    if (!isForwardDirection && element.previousSibling)
      href = getNativeLinkHref(element.previousSibling, false) + href;

  }

  return href;

}

function checkOnLinkClick(element, standaloneEditor, position) {

  if (!element)
    return;

  if (element.classList && element.classList.contains('collapse-hidden-block') && position) {
    let expandedBlock = getExpandedBlockByLineNumber(standaloneEditor, position.lineNumber);
    collapseExpandedBlockWithPair(expandedBlock);
    return;
  }

  let expandWidgetElement = null;

  if (element.classList && element.classList.contains('expand-widget'))
    expandWidgetElement = element;
  else if (element.parentElement && element.parentElement.classList.contains('expand-widget'))
    expandWidgetElement = element.parentElement;

  if (expandWidgetElement) {
    let hiddenArea = getHiddenAreaByDomNode(expandWidgetElement);
    if (!hiddenArea)
      return;

    removeHiddenAreaWithPair(hiddenArea);
    return;
  }

  if (element.tagName && element.tagName.toLowerCase() == 'a') {

    window.sendEvent("EVENT_ON_LINK_CLICK", { label: element.innerText, href: element.dataset.href });
    setTimeout(() => {
      window.editor.focus();
    }, 100);

  }
  else if (element.classList.contains('detected-link-active')) {

    let href = getNativeLinkHref(element, null);

    if (href) {
      window.sendEvent("EVENT_ON_LINK_CLICK", { label: href, href: href });
      setTimeout(() => {
        window.editor.focus();
      }, 100);
    }

  }

}

function createExpandContentWidget(standaloneEditor, startLineNumber, lineNumber, domNode) {

  let widgetId = 'bsl.expand.widget.' + startLineNumber;
  domNode.setAttribute('hidden-start-line', startLineNumber);
  domNode.style.width = standaloneEditor.getLayoutInfo().contentWidth + 'px';

  return {
    getId: function () {
      return widgetId;
    },
    getDomNode: function () {
      return domNode;
    },
    getPosition: function () {
      return {
        position: {
          lineNumber: lineNumber,
          column: 1
        },
        preference: [monaco.editor.ContentWidgetPositionPreference.EXACT]
      };
    }
  };

}

function setHiddenAreasForEditor(standaloneEditor, hiddenBlocks) {

  let hiddenAreas = [];
  hiddenBlocks.forEach((value, key, map) => {
    hiddenAreas.push(value.block);
  });
  standaloneEditor.setHiddenAreas(hiddenAreas);

}

function getExpandedHiddenBlocksForEditor(standaloneEditor) {

  if (!standaloneEditor.expandedHiddenBlocks)
    standaloneEditor.expandedHiddenBlocks = new Map();

  return standaloneEditor.expandedHiddenBlocks;

}

function createCollapseDecoration(expandedBlock) {

  let range = new monaco.Range(expandedBlock.block.startLineNumber, 1, expandedBlock.block.startLineNumber, 1);
  let decoration = {
    range: range,
    options: {
      isWholeLine: true,
      glyphMarginClassName: 'collapse-hidden-block'
    }
  };

  expandedBlock.editor.updateOptions({ glyphMargin: true });
  expandedBlock.decorationIds = expandedBlock.editor.deltaDecorations(expandedBlock.decorationIds || [], [decoration]);

}

function removeExpandedBlockDecoration(expandedBlock) {

  expandedBlock.editor.deltaDecorations(expandedBlock.decorationIds || [], []);
  expandedBlock.decorationIds = [];

}

function removeExpandedBlock(expandedBlock) {

  if (!expandedBlock)
    return;

  removeExpandedBlockDecoration(expandedBlock);
  expandedBlock.expandedBlocks.delete(expandedBlock.block.startLineNumber);

}

function removeExpandedBlockForEditor(standaloneEditor, startLineNumber) {

  removeExpandedBlock(getExpandedHiddenBlocksForEditor(standaloneEditor).get(startLineNumber));

}

function removeExpandedBlocksForEditor(standaloneEditor) {

  let expandedBlocks = getExpandedHiddenBlocksForEditor(standaloneEditor);

  expandedBlocks.forEach((value, key, map) => {
    removeExpandedBlockDecoration(value);
  });

  expandedBlocks.clear();

}

function createExpandedBlockFromHiddenArea(hiddenArea) {

  let expandedBlocks = getExpandedHiddenBlocksForEditor(hiddenArea.editor);
  removeExpandedBlock(expandedBlocks.get(hiddenArea.block.startLineNumber));

  let expandedBlock = {
    editor: hiddenArea.editor,
    hiddenBlocks: hiddenArea.hiddenBlocks,
    expandedBlocks: expandedBlocks,
    block: hiddenArea.block,
    pairId: hiddenArea.pairId,
    decorationIds: []
  };

  expandedBlocks.set(hiddenArea.block.startLineNumber, expandedBlock);
  createCollapseDecoration(expandedBlock);

  return expandedBlock;

}

function getExpandedBlockByLineNumber(standaloneEditor, lineNumber) {

  let expandedBlocks = getExpandedHiddenBlocksForEditor(standaloneEditor);
  let result = null;

  expandedBlocks.forEach((value, key, map) => {
    if (!result && value.block.startLineNumber == lineNumber)
      result = value;
  });

  return result;

}

function getHiddenLinesLabel(startLineNumber, endLineNumber) {

  let hiddenLinesCount = endLineNumber - startLineNumber + 1;

  if (engLang)
    return hiddenLinesCount + (hiddenLinesCount == 1 ? ' hidden line' : ' hidden lines');

  let lastDigit = hiddenLinesCount % 10;
  let lastTwoDigits = hiddenLinesCount % 100;

  if (lastDigit == 1 && lastTwoDigits != 11)
    return hiddenLinesCount + ' скрытая строка';

  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14))
    return hiddenLinesCount + ' скрытые строки';

  return hiddenLinesCount + ' скрытых строк';

}

function getEditorLineHeight(standaloneEditor) {

  if (monaco.editor.EditorOption && monaco.editor.EditorOption.lineHeight !== undefined)
    return standaloneEditor.getOption(monaco.editor.EditorOption.lineHeight);

  return standaloneEditor.getRawOptions().lineHeight || 19;

}

function createExpandWidgetDomNode(standaloneEditor, startLineNumber, endLineNumber) {

  let domNode = document.createElement("div");
  let iconNode = document.createElement("a");
  let labelNode = document.createElement("span");
  let lineHeight = getEditorLineHeight(standaloneEditor);

  labelNode.classList.add('expand-widget-label');
  labelNode.textContent = getHiddenLinesLabel(startLineNumber, endLineNumber);

  domNode.appendChild(iconNode);
  domNode.appendChild(labelNode);
  domNode.classList.add('expand-widget');
  domNode.setAttribute('hidden-start-line', startLineNumber);
  domNode.style.height = lineHeight + 'px';
  domNode.style.lineHeight = lineHeight + 'px';
  domNode.style.width = standaloneEditor.getLayoutInfo().contentWidth + 'px';

  return domNode;

}

function hideBlocksForEditor(standaloneEditor, hiddenBlocks, blocks) {

  let model = standaloneEditor.getModel();
  let lineCount = model.getLineCount();
  let hiddenAreasChanged = false;

  standaloneEditor.changeViewZones(function (changeAccessor) {

    blocks.forEach(function (block) {

      let startLineNumber = Math.max(1, block.startLineNumber);
      let endLineNumber = Math.min(lineCount, block.endLineNumber);

      if (startLineNumber > lineCount || endLineNumber < startLineNumber)
        return;

      if (!hiddenBlocks.get(startLineNumber)) {
        removeExpandedBlockForEditor(standaloneEditor, startLineNumber);
        let hiddenBlock = new monaco.Range(startLineNumber, 1, endLineNumber, 1);
        let afterLineNumber = startLineNumber - 1;
        let domNode = createExpandWidgetDomNode(standaloneEditor, startLineNumber, endLineNumber);
        let hiddenArea = {
          editor: standaloneEditor,
          hiddenBlocks: hiddenBlocks,
          block: hiddenBlock,
          pairId: block.pairId
        };
        domNode.hiddenArea = hiddenArea;

        if (afterLineNumber > 0 && model.getLineMaxColumn(afterLineNumber) == 1) {
          let widget = createExpandContentWidget(standaloneEditor, startLineNumber, afterLineNumber, domNode);
          standaloneEditor.addContentWidget(widget);
          hiddenArea.widget = widget;
          hiddenBlocks.set(startLineNumber, hiddenArea);
        }
        else {
          let viewZone = {
            afterLineNumber: afterLineNumber,
            heightInLines: 1,
            domNode: domNode,
          };

          if (afterLineNumber > 0)
            viewZone.afterColumn = 1;

          let viewZoneId = changeAccessor.addZone(viewZone);
          hiddenArea.zoneId = viewZoneId;
          hiddenBlocks.set(startLineNumber, hiddenArea);
        }

        hiddenAreasChanged = true;
      }

    });

  });

  if (hiddenAreasChanged)
    setHiddenAreasForEditor(standaloneEditor, hiddenBlocks);

}

function removeHiddenBlocksForEditor(standaloneEditor, hiddenBlocks) {

  removeExpandedBlocksForEditor(standaloneEditor);

  standaloneEditor.changeViewZones(function (changeAccessor) {

    hiddenBlocks.forEach((value, key, map) => {
      if (value.zoneId)
        changeAccessor.removeZone(value.zoneId);
      else if (value.widget)
        standaloneEditor.removeContentWidget(value.widget);
    });

  });

  hiddenBlocks.clear();
  setHiddenAreasForEditor(standaloneEditor, hiddenBlocks);

}

function showHiddenBlocksForEditor(hiddenBlocks) {

  let hiddenAreas = [];

  hiddenBlocks.forEach((value, key, map) => {
    hiddenAreas.push(value);
  });

  hiddenAreas.forEach(function (hiddenArea) {
    if (hiddenBlocks.get(hiddenArea.block.startLineNumber)) {
      if (hiddenArea.pairedHiddenArea)
        removeHiddenAreaWithPair(hiddenArea);
      else
        removeHiddenArea(hiddenArea);
    }
  });

}

function showHiddenBlocksForDiffEditor() {

  if (editor.originalHiddenBlocks)
    showHiddenBlocksForEditor(editor.originalHiddenBlocks);

  if (editor.modifiedHiddenBlocks)
    showHiddenBlocksForEditor(editor.modifiedHiddenBlocks);

}

function removeHiddenArea(hiddenArea) {

  hiddenArea.editor.changeViewZones(function (changeAccessor) {
    if (hiddenArea.zoneId)
      changeAccessor.removeZone(hiddenArea.zoneId);
    else if (hiddenArea.widget)
      hiddenArea.editor.removeContentWidget(hiddenArea.widget);
  });

  hiddenArea.hiddenBlocks.delete(hiddenArea.block.startLineNumber);
  setHiddenAreasForEditor(hiddenArea.editor, hiddenArea.hiddenBlocks);

  return createExpandedBlockFromHiddenArea(hiddenArea);

}

function removeHiddenAreaWithPair(hiddenArea) {

  let pairedHiddenArea = hiddenArea.pairedHiddenArea;

  let expandedBlock = removeHiddenArea(hiddenArea);

  if (pairedHiddenArea) {
    let pairedExpandedBlock = removeHiddenArea(pairedHiddenArea);
    expandedBlock.pairedExpandedBlock = pairedExpandedBlock;
    pairedExpandedBlock.pairedExpandedBlock = expandedBlock;
  }

}

function collapseExpandedBlock(expandedBlock) {

  if (!expandedBlock)
    return null;

  let block = {
    startLineNumber: expandedBlock.block.startLineNumber,
    endLineNumber: expandedBlock.block.endLineNumber,
    pairId: expandedBlock.pairId
  };

  removeExpandedBlock(expandedBlock);
  hideBlocksForEditor(expandedBlock.editor, expandedBlock.hiddenBlocks, [block]);

  return expandedBlock.hiddenBlocks.get(block.startLineNumber);

}

function collapseExpandedBlockWithPair(expandedBlock) {

  if (!expandedBlock)
    return;

  let pairedExpandedBlock = expandedBlock.pairedExpandedBlock;
  let hiddenArea = collapseExpandedBlock(expandedBlock);

  if (pairedExpandedBlock) {
    let pairedHiddenArea = collapseExpandedBlock(pairedExpandedBlock);

    if (hiddenArea && pairedHiddenArea) {
      hiddenArea.pairedHiddenArea = pairedHiddenArea;
      pairedHiddenArea.pairedHiddenArea = hiddenArea;
    }
  }

}

function getHiddenAreaByDomNode(domNode) {

  if (domNode.hiddenArea)
    return domNode.hiddenArea;

  let startLineNumber = Number(domNode.getAttribute('hidden-start-line'));

  if (hiddenBlocks.get(startLineNumber))
    return hiddenBlocks.get(startLineNumber);

  if (editor.originalHiddenBlocks && editor.originalHiddenBlocks.get(startLineNumber))
    return editor.originalHiddenBlocks.get(startLineNumber);

  if (editor.modifiedHiddenBlocks && editor.modifiedHiddenBlocks.get(startLineNumber))
    return editor.modifiedHiddenBlocks.get(startLineNumber);

}

function getUnchangedBlockEndLineNumber(startLineNumber, endLineNumber) {

  return endLineNumber === 0 ? startLineNumber : startLineNumber - 1;

}

function getNextLineNumberAfterChange(startLineNumber, endLineNumber) {

  return endLineNumber === 0 ? startLineNumber + 1 : endLineNumber + 1;

}

function pushUnchangedBlock(blocks, pairId, startLineNumber, endLineNumber) {

  let hiddenStartLineNumber = startLineNumber + 1;
  let hiddenEndLineNumber = endLineNumber - 1;

  if (hiddenStartLineNumber <= hiddenEndLineNumber) {
    blocks.push({
      pairId: pairId,
      startLineNumber: hiddenStartLineNumber,
      endLineNumber: hiddenEndLineNumber
    });
  }

}

function getUnchangedBlockPairs(lineChanges, originalLineCount, modifiedLineCount) {

  let originalBlocks = [];
  let modifiedBlocks = [];
  let nextOriginalLineNumber = 1;
  let nextModifiedLineNumber = 1;
  let pairId = 0;

  lineChanges.forEach(function (change) {

    pairId++;
    pushUnchangedBlock(
      originalBlocks,
      pairId,
      nextOriginalLineNumber,
      getUnchangedBlockEndLineNumber(change.originalStartLineNumber, change.originalEndLineNumber)
    );
    pushUnchangedBlock(
      modifiedBlocks,
      pairId,
      nextModifiedLineNumber,
      getUnchangedBlockEndLineNumber(change.modifiedStartLineNumber, change.modifiedEndLineNumber)
    );
    nextOriginalLineNumber = Math.max(
      nextOriginalLineNumber,
      getNextLineNumberAfterChange(change.originalStartLineNumber, change.originalEndLineNumber)
    );
    nextModifiedLineNumber = Math.max(
      nextModifiedLineNumber,
      getNextLineNumberAfterChange(change.modifiedStartLineNumber, change.modifiedEndLineNumber)
    );

  });

  pairId++;
  pushUnchangedBlock(originalBlocks, pairId, nextOriginalLineNumber, originalLineCount);
  pushUnchangedBlock(modifiedBlocks, pairId, nextModifiedLineNumber, modifiedLineCount);

  return {
    original: originalBlocks,
    modified: modifiedBlocks
  };

}

function linkHiddenBlockPairs(originalHiddenBlocks, modifiedHiddenBlocks) {

  let pairs = new Map();

  originalHiddenBlocks.forEach((value, key, map) => {
    if (value.pairId)
      pairs.set(value.pairId, value);
  });

  modifiedHiddenBlocks.forEach((value, key, map) => {
    let originalHiddenArea = pairs.get(value.pairId);
    if (originalHiddenArea) {
      originalHiddenArea.pairedHiddenArea = value;
      value.pairedHiddenArea = originalHiddenArea;
    }
  });

}

function getHiddenBlocksResult(blocks) {

  return blocks.map(function (block) {
    return {
      startLineNumber: block.startLineNumber,
      endLineNumber: block.endLineNumber
    };
  });

}

function setHiddenAreas() {

  setHiddenAreasForEditor(editor, hiddenBlocks);

}

function deltaDecorationsForDiffEditor(standalone_editor) {

  let diffDecor = standalone_editor.diffDecor;
  let decorations = [];

  if (diffDecor.line)
    decorations.push({ range: new monaco.Range(diffDecor.line, 1, diffDecor.line), options: { isWholeLine: true, linesDecorationsClassName: 'diff-mark' } });

  if (diffDecor.position)
    decorations.push({ range: new monaco.Range(diffDecor.position, 1, diffDecor.position), options: { isWholeLine: true, linesDecorationsClassName: 'diff-editor-position' } });

  if (standalone_editor.reviewDecorations)
    decorations = decorations.concat(standalone_editor.reviewDecorations);

  standalone_editor.diffDecor.decor = standalone_editor.deltaDecorations(standalone_editor.diffDecor.decor, decorations);

}

function getDiffAllowRevertBack(diff_editor) {

  if (!diff_editor || !diff_editor.navi)
    return false;

  if (typeof diff_editor.allowRevertBack == 'boolean')
    return diff_editor.allowRevertBack;

  if (diff_editor.getRawOptions) {
    const raw_options = diff_editor.getRawOptions();
    if (raw_options && typeof raw_options.allowRevertBack != 'undefined')
      return Boolean(raw_options.allowRevertBack);
  }

  return false;

}

function applyDiffAllowRevertBackOptions(diff_editor) {

  if (!diff_editor || !diff_editor.navi)
    return;

  const original_editable = getDiffAllowRevertBack(diff_editor);
  const modified_editor = diff_editor.getModifiedEditor();
  const original_editor = diff_editor.getOriginalEditor();
  const context_menu = window.contextMenuEnabled && !window.readOnlyMode;

  modified_editor.updateOptions({
    readOnly: window.readOnlyMode,
    contextmenu: context_menu
  });

  original_editor.updateOptions({
    readOnly: window.readOnlyMode || !original_editable,
    contextmenu: context_menu && original_editable
  });

  if (diff_editor.updateDiffRevertButtons)
    diff_editor.updateDiffRevertButtons();

}

function getDiffRevertLineTargets(diff_editor, line_change) {

  const modified_model = diff_editor.getModifiedEditor().getModel();

  if (!modified_model)
    return [];

  if (line_change.modifiedEndLineNumber === 0) {
    const line_number = Math.max(1, Math.min(line_change.modifiedStartLineNumber, modified_model.getLineCount()));
    return [line_number];
  }

  let targets = [];
  const start = Math.max(1, line_change.modifiedStartLineNumber);
  const end = Math.max(start, line_change.modifiedEndLineNumber || start);

  for (let line_number = start; line_number <= end; line_number++)
    targets.push(line_number);

  return targets;

}

function getDiffRevertTextModelLines(model, startLineNumber, endLineNumber) {

  if (!model || !startLineNumber || !endLineNumber || endLineNumber < startLineNumber)
    return [];

  return model.getLinesContent().slice(startLineNumber - 1, endLineNumber);

}

function getDiffRevertSpliceData(line_change, modified_model) {

  const modified_line_count = modified_model ? modified_model.getLineCount() : 0;

  if (line_change.modifiedEndLineNumber === 0) {
    const start_index = Math.max(0, Math.min(line_change.modifiedStartLineNumber, modified_line_count));
    const target_line = Math.max(1, Math.min(start_index + 1, modified_line_count + 1));

    return {
      startIndex: start_index,
      deleteCount: 0,
      targetLine: target_line
    };
  }

  const start_index = Math.max(0, line_change.modifiedStartLineNumber - 1);
  const delete_count = line_change.modifiedEndLineNumber >= line_change.modifiedStartLineNumber
    ? line_change.modifiedEndLineNumber - line_change.modifiedStartLineNumber + 1
    : 0;
  const target_line = Math.max(1, Math.min(line_change.modifiedStartLineNumber, modified_line_count));

  return {
    startIndex: start_index,
    deleteCount: delete_count,
    targetLine: target_line
  };

}

function revertDiffChange(diff_editor, change_index) {

  const line_changes = diff_editor.getLineChanges();

  if (!Array.isArray(line_changes) || !line_changes[change_index])
    return;

  const line_change = line_changes[change_index];
  const modified_editor = diff_editor.getModifiedEditor();
  const modified_model = modified_editor.getModel();
  const original_model = diff_editor.getOriginalEditor().getModel();

  if (!modified_model || !original_model)
    return;

  const modified_lines = modified_model.getLinesContent().slice();
  const replacement_lines = getDiffRevertTextModelLines(original_model, line_change.originalStartLineNumber, line_change.originalEndLineNumber);
  const splice_data = getDiffRevertSpliceData(line_change, modified_model);

  modified_lines.splice(splice_data.startIndex, splice_data.deleteCount, ...replacement_lines);

  modified_editor.pushUndoStop();
  modified_editor.executeEdits('diff-revert', [{
    range: modified_model.getFullModelRange(),
    text: modified_lines.length ? modified_lines.join(modified_model.getEOL()) : '',
    forceMoveMarkers: true
  }]);
  modified_editor.pushUndoStop();

  const target_line = Math.max(1, Math.min(splice_data.targetLine, modified_editor.getModel().getLineCount()));
  modified_editor.setPosition({ lineNumber: target_line, column: 1 });
  modified_editor.revealLineInCenter(target_line);
  modified_editor.focus();

  editor.diffCount--;

}

function createDiffRevertButtons(diff_editor) {

  if (!diff_editor || !diff_editor.navi || diff_editor.diffRevertButtons)
    return;

  const diff_dom_node = diff_editor.getDomNode();
  const button_layer = document.createElement('div');
  let layout_timer = 0;

  button_layer.className = 'diff-revert-layer';
  diff_dom_node.appendChild(button_layer);

  function getSeparatorLeft() {

    const diff_rect = diff_dom_node.getBoundingClientRect();
    const original_rect = diff_editor.getOriginalEditor().getDomNode().getBoundingClientRect();
    const modified_rect = diff_editor.getModifiedEditor().getDomNode().getBoundingClientRect();
    const side_by_side = diff_editor.getRawOptions && diff_editor.getRawOptions().renderSideBySide !== false;

    if (side_by_side)
      return Math.round(((original_rect.right - diff_rect.left) + (modified_rect.left - diff_rect.left)) / 2);

    return Math.round(modified_rect.left - diff_rect.left + 6);

  }

  function renderButtons() {

    button_layer.innerHTML = '';

    if (!getDiffAllowRevertBack(diff_editor) || window.readOnlyMode)
      return;

    const line_changes = diff_editor.getLineChanges();

    if (!Array.isArray(line_changes) || !line_changes.length)
      return;

    const diff_rect = diff_dom_node.getBoundingClientRect();
    const modified_editor = diff_editor.getModifiedEditor();
    const modified_rect = modified_editor.getDomNode().getBoundingClientRect();
    const separator_left = getSeparatorLeft();

    line_changes.forEach((line_change, change_index) => {
      const line_numbers = getDiffRevertLineTargets(diff_editor, line_change);
      let last_line = -1;

      line_numbers.forEach(line_number => {
        const top = modified_rect.top - diff_rect.top + modified_editor.getTopForLineNumber(line_number) - modified_editor.getScrollTop();

        if (last_line + 1 == line_number) {
          last_line = line_number;
          return;
        }

        last_line = line_number;

        if (top < -20 || diff_dom_node.clientHeight < top)
          return;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'diff-revert-button';
        button.title = engLang ? 'Revert change' : 'Откатить изменение';
        button.style.left = separator_left + 'px';
        button.style.top = top + 'px';
        button.onclick = function (event) {
          event.preventDefault();
          event.stopPropagation();
          revertDiffChange(diff_editor, change_index);
        };
        button_layer.appendChild(button);
      });
    });

  }

  function scheduleRenderButtons() {

    clearTimeout(layout_timer);
    layout_timer = setTimeout(renderButtons, 10);

  }

  diff_editor.diffRevertButtons = {
    buttonLayer: button_layer,
    dispose: function () {
      clearTimeout(layout_timer);
      if (button_layer.parentElement)
        button_layer.parentElement.removeChild(button_layer);
    }
  };

  diff_editor.updateDiffRevertButtons = scheduleRenderButtons;

  diff_editor.onDidUpdateDiff(() => scheduleRenderButtons());
  diff_editor.getModifiedEditor().onDidScrollChange(() => scheduleRenderButtons());
  diff_editor.getOriginalEditor().onDidScrollChange(() => scheduleRenderButtons());
  diff_editor.getModifiedEditor().onDidLayoutChange(() => scheduleRenderButtons());
  diff_editor.getOriginalEditor().onDidLayoutChange(() => scheduleRenderButtons());

  scheduleRenderButtons();

}

function diffEditorUpdateDecorations() {

  deltaDecorationsForDiffEditor(this.getModifiedEditor());
  deltaDecorationsForDiffEditor(this.getOriginalEditor());

}

function newReviewDecoration(e) {

  if (window.getOption('reviewMode') && !window.getOption("readOnlyCodeReview") && e.target.position) {

    let standaloneEditor = window.editor;
    
    if (window.editor.navi)
      standaloneEditor = window.editor.getModifiedEditor();

    standaloneEditor.reviewDecorations = [];
    standaloneEditor.mousePosition = e.target.position;
    standaloneEditor.updateOptions({ lineNumbers: undefined });
    standaloneEditor.updateOptions({ lineNumbers: getLineNumber });

    let range = new monaco.Range(e.target.position.lineNumber, 1, e.target.position.lineNumber, 1);
        
    standaloneEditor.reviewDecorations.push({
      range: range,
      options: {
        isWholeLine: true,
        linesDecorationsClassName: 'add-review',
      }
    });
    
    if (window.editor.navi)
      window.editor.diffEditorUpdateDecorations();
    else
      window.editor.updateDecorations(standaloneEditor.reviewDecorations);
    
    setTimeout(() => {
      let lineElement = document.querySelector('.add-review');
      if (lineElement) {
        lineElement.parentElement.style.backgroundColor = '#ddd';
      }
    }, 5);

  }

}

function diffEditorOnDidChangeCursorPosition(e) {

  if (e.source != 'api') {

    window.editor.getModifiedEditor().diffDecor.position = 0;
    window.editor.getOriginalEditor().diffDecor.position = 0;
    getActiveDiffEditor().diffDecor.position = e.position.lineNumber;
    window.editor.diffEditorUpdateDecorations();
    window.editor.diffCount = window.editor.getLineChanges().length;
    const line_number = e.position.lineNumber;

    if (window.editor.getModifiedEditor().getPosition().equals(e.position)) {
      window.editor.getOriginalEditor().setPosition({
        lineNumber: window.editor.getDiffLineInformationForModified(line_number).equivalentLineNumber,
        column: 1
      });
    }
    else {
      window.editor.getModifiedEditor().setPosition({
        lineNumber: window.editor.getDiffLineInformationForOriginal(line_number).equivalentLineNumber,
        column: 1
      });
    }

    updateIfHighlights(getActiveDiffEditor());
    updateStatusBar();

  }

}

function diffEditorOnDidLayoutChange(e) {

  setTimeout(() => { resizeStatusBar(); } , 50);

}

function getActiveDiffEditor() {

  let active_editor = null;

  if (window.editor.getModifiedEditor().diffDecor.position)
    active_editor = window.editor.getModifiedEditor();
  else if (window.editor.getOriginalEditor().diffDecor.position)
    active_editor = window.editor.getOriginalEditor();
  else
    active_editor = window.editor.getModifiedEditor().hasTextFocus() ? window.editor.getModifiedEditor() : window.editor.getOriginalEditor();

  return active_editor;

}

function getActiveEditor() {

  return window.editor.navi ? getActiveDiffEditor() : window.editor;

}

function diffEditorOnKeyDown(e) {

  if (e.ctrlKey && (e.keyCode == 36 || e.keyCode == 38)) {
    // Ctrl+F or Ctrl+H
    setFindWidgetDisplay('inherit');
  }
  else if (e.keyCode == 9) {
    // Esc
    window.generateEscapeEvent();
    window.closeSearchWidget();      
  }
  else if (e.keyCode == 61) {
    // F3
    let standalone_editor = getActiveDiffEditor();
    if (!e.altKey && !e.shiftKey) {
      if (e.ctrlKey) {
        standalone_editor.trigger('', 'actions.find');
        standalone_editor.focus();
        window.previousMatch();
      }
      else
        standalone_editor.trigger('', 'editor.action.findWithSelection');
      setFindWidgetDisplay('inherit');
      standalone_editor.focus();
      focusFindWidgetInput();
    }
  }

}

function generateOnKeyDownEvent(e) {

  let fire_event = window.getOption('generateOnKeyDownEvent');
  let filter = window.getOption('onKeyDownFilter');
  let filter_list = filter ? filter.split(',') : [];
  fire_event = fire_event && (!filter || 0 <= filter_list.indexOf(e.keyCode.toString()));

  if (fire_event) {

    let find_widget = getFindWidget();

    let event_params = {
      keyCode: e.keyCode,
      suggestWidgetVisible: window.isSuggestWidgetVisible(),
      parameterHintsWidgetVisible: window.isParameterHintsWidgetVisible(),
      findWidgetVisible: (find_widget && find_widget.position) ? true : false,
      ctrlPressed: e.ctrlKey,
      altPressed: e.altKey,
      shiftPressed: e.shiftKey,
      position: window.editor.getPosition()
    }

    window.sendEvent('EVENT_ON_KEY_DOWN', event_params);

  }

}

function editorOnKeyDown(e) {

  generateOnKeyDownEvent(e);

  window.editor.lastKeyCode = e.keyCode;

  if (window.editor.inlineSuggestController && window.editor.inlineSuggestController.isVisible()) {
    if ((e.ctrlKey || e.metaKey) && e.keyCode == 17
      && window.editor.inlineSuggestController.acceptNextWord()) {
      // Ctrl/Cmd+RightArrow
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.altKey && e.keyCode == 87 && window.editor.inlineSuggestController.previous()) {
      // Alt+[
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.altKey && e.keyCode == 89 && window.editor.inlineSuggestController.next()) {
      // Alt+]
      e.preventDefault();
      e.stopPropagation();
      return;
    }
  }

  if ((e.keyCode == 3 || e.keyCode == 2) && isSuggestWidgetVisible()) {
    let eventSuggestItem = getFocusedSuggestItem();
    if (handleEventSuggestSelection(eventSuggestItem)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
  }

  if (e.keyCode == 16 && window.editor.getPosition().lineNumber == 1)
    // ArrowUp
    window.scrollToTop();
  else if (e.keyCode == 3 && window.getOption('generateSelectSuggestEvent')) {
    // Enter
    let element = document.querySelector('.monaco-list-row.focused');
    if (element) {
      e.preventDefault();
      e.stopPropagation();
      setTimeout(() => {
        window.generateEventWithSuggestData('EVENT_ON_SELECT_SUGGEST_ROW', 'selection', element);
      }, 10);
    }
  }  
  else if (e.ctrlKey && (e.keyCode == 36 || e.keyCode == 38)) {
    // Ctrl+F or Ctrl+H
    setFindWidgetDisplay('inherit');
  }
  else if (e.keyCode == 9) {
    // Esc
    window.generateEscapeEvent();
    setFindWidgetDisplay('none');
    window.hideSuggestionsList();
    window.hideInlineSuggestions();
  }
  else if (e.keyCode == 61) {
    // F3
    if (!e.altKey && !e.shiftKey) {
      if (e.ctrlKey) {
        window.editor.trigger('', 'actions.find');
        window.previousMatch();
      }
      else
        window.editor.trigger('', 'editor.action.findWithSelection');
      setFindWidgetDisplay('inherit');
      window.editor.focus();
      focusFindWidgetInput();
    }
  }
  else if (e.keyCode == 2) {
    // Tab
    if (window.editor.inlineSuggestController && window.editor.inlineSuggestController.accept()) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    let fire_event = window.getOption('generateSelectSuggestEvent');
    if (fire_event) {
      let element = document.querySelector('.monaco-list-row.focused');
      if (element) {
        window.generateEventWithSuggestData('EVENT_ON_SELECT_SUGGEST_ROW', 'selection', element);
      }
    }
  }

  if (e.ctrlKey && e.keyCode == 83) {
    e.preventDefault();    
    if (window.editor.definitionBreadcrumbs.length) {
      let position  = window.editor.definitionBreadcrumbs.pop();
      window.editor.revealLineInCenter(position.lineNumber);
      window.editor.setPosition(position);
    }
  }

  if (e.altKey && e.keyCode == 87) {
    // fix https://github.com/salexdv/bsl_console/issues/147
    e.preventDefault();
    window.setText('[');
  }

  if (e.ctrlKey)
    window.ctrlPressed = true;

  if (e.altKey)
    window.altPressed = true;

  if (e.shiftKey)
    window.shiftPressed = true;

  checkEmptySuggestions();

}

function  initContextMenuActions() {

  window.contextActions.forEach(action => {
    action.dispose();
  });

  const actions = getActions(window.version1C);

  for (const [action_id, action] of Object.entries(actions)) {
    
    let menuAction = window.editor.addAction({
      id: action_id,
      label: action.label,
      keybindings: [action.key, action.cmd],
      precondition: null,
      keybindingContext: null,
      contextMenuGroupId: 'navigation',
      contextMenuOrder: action.order,
      run: action.callback
    });      

    window.contextActions.push(menuAction)
  }

}

function checkNewStringLine() {

  if (window.getCurrentLanguageId() == 'bsl') {

    const model = window.editor.getModel();
    const position = window.editor.getPosition();
    const line = position.lineNumber;
    const length = model.getLineLength(line);
    const expression = model.getValueInRange(new monaco.Range(line, position.column, line, length + 1));
    const column = model.getLineLastNonWhitespaceColumn(line - 1);
    const char = model.getValueInRange(new monaco.Range(line - 1, column - 1, line - 1, column));
    const token = window.getTokenFromPosition(new monaco.Position(line - 1, column));

    if (token == 'stringbsl' ||0 <= token.indexOf('string.invalid') || 0 <= token.indexOf('query') || char == '|') {

      if (token != 'query.quotebsl' || char == '|') {

        const range = new monaco.Range(line, position.column, line, length + 2);

        let operation = {
          range: range,
          text: '|' + expression,
          forceMoveMarkers: true
        };

        window.editor.executeEdits('nql', [operation]);
        window.editor.setPosition(new monaco.Position(line, position.column + 1));

      }

    }

  }

}

function hasParentWithClass(element, className) {

  if (0 <= element.className.split(' ').indexOf(className))
    return true;

  return element.parentNode && hasParentWithClass(element.parentNode, className);

}

function getParentWithClass(element, className) {

  if (element.className && 0 <= element.className.split(' ').indexOf(className))
    return element;

  if (element.parentNode)    
    return getParentWithClass(element.parentNode, className);
  else
    return null;

}

function getChildWithClass(element, className) {

  for (var i = 0; i < element.childNodes.length; i++) {
    
    let child = element.childNodes[i];

    if (child.className && 0 <= child.className.split(' ').indexOf(className))
      return child
    else if (child.childNodes.length) {
      child = getChildWithClass(child, className);
      if (child)
        return child;
    }

  }

  return null;

}

setFindWidgetDisplay = function(value) {

  let find_widget = getFindWidget();
  
  if (find_widget)
    find_widget.widget._domNode.style.display = value;

}

function setFindWidgetDisplay(value) {

  let find_widget = getFindWidget();
  
  if (find_widget)
    find_widget.widget._domNode.style.display = value;

}

function focusFindWidgetInput() {

  let find_widget = getFindWidget();

  if (find_widget)
    find_widget.widget.focusFindInput();

}  

function updateStatusBar() {
  
  if (window.statusBarWidget) {
    
    let status = '';

    if (window.editor.navi) {
      let standalone_editor = getActiveDiffEditor();
      status = 'Ln ' + standalone_editor.getPosition().lineNumber;
      status += ', Col ' + standalone_editor.getPosition().column;
    }
    else {
      status = 'Ln ' + window.getCurrentLine();
      status += ', Col ' + window.getCurrentColumn();
    }

    if (!window.engLang)
      status = status.replace('Ln', 'Стр').replace('Col', 'Кол');

    window.statusBarWidget.domNode.firstElementChild.innerText = status;
  }

}

function resizeStatusBar() {

  if (window.statusBarWidget) {

    let element = window.statusBarWidget.domNode;

    if (window.statusBarWidget.overlapScroll) {
      element.style.top = window.editor.getDomNode().clientHeight - 20 + 'px';
    }
    else {
      let layout = getActiveEditor().getLayoutInfo();      
      element.style.top = (window.editor.getDomNode().offsetHeight - 20 - layout.horizontalScrollbarHeight) + 'px';
    }

  }

}

function checkBookmarksAfterNewLine() {

  let line = window.getCurrentLine();
  let content = window.getLineContent(line);

  if (content)
    line--;

  let line_check = window.getLineCount();

  while (line <= line_check) {

    let bookmark = window.editor.bookmarks.get(line_check);

    if (bookmark) {
      bookmark.range.startLineNumber = line_check + 1;
      bookmark.range.endLineNumber = line_check + 1;
      window.editor.bookmarks.set(line_check + 1, bookmark);
      window.editor.bookmarks.delete(line_check);
    }

    line_check--;

  }

  window.updateBookmarks(undefined);

}

function checkBreakpointsAfterNewLine() {

  let line = window.getCurrentLine();
  let content = window.getLineContent(line);

  if (content)
    line--;

  let line_check = window.getLineCount();

  while (line <= line_check) {

    let breakpoint = window.editor.breakpoints.get(line_check);

    if (breakpoint) {
      breakpoint.range.startLineNumber = line_check + 1;
      breakpoint.range.endLineNumber = line_check + 1;
      window.editor.breakpoints.set(line_check + 1, breakpoint);
      window.editor.breakpoints.delete(line_check);
    }

    line_check--;

  }

  window.updateBreakpoints(undefined);

}

function checkBookmarksAfterRemoveLine(contentChangeEvent) {

  if (contentChangeEvent.changes.length && window.editor.checkBookmarks) {

    let changes = contentChangeEvent.changes[0];
    let range = changes.range;

    if (!changes.text && range.startLineNumber != range.endLineNumber) {

      let line = range.startLineNumber;
      let prev_bookmark = window.editor.bookmarks.get(range.endLineNumber);

      if (prev_bookmark) {

        for (let l = line; l <= range.endLineNumber; l++) {
          window.editor.bookmarks.delete(l);
        }

        prev_bookmark.range.startLineNumber = line;
        prev_bookmark.range.endLineNumber = line;
        window.editor.bookmarks.set(line, prev_bookmark);

      }

      for (let l = line + 1; l <= range.endLineNumber; l++) {
        window.editor.bookmarks.delete(l);
      }

      let line_check = range.endLineNumber;
      let diff = range.endLineNumber - line;

      while (line_check < window.getLineCount()) {

        let bookmark = window.editor.bookmarks.get(line_check);

        if (bookmark) {
          bookmark.range.startLineNumber = line_check - diff;
          bookmark.range.endLineNumber = line_check - diff;
          window.editor.bookmarks.set(line_check - diff, bookmark);
          window.editor.bookmarks.delete(line_check);
        }

        line_check++;

      }

    }

  }

}

function checkBreakpointsAfterRemoveLine(contentChangeEvent) {

  if (contentChangeEvent.changes.length && window.editor.checkBookmarks) {

    let changes = contentChangeEvent.changes[0];
    let range = changes.range;

    if (!changes.text && range.startLineNumber != range.endLineNumber) {

      let line = range.startLineNumber;
      let prev_breakpoint = window.editor.breakpoints.get(range.endLineNumber);

      if (prev_breakpoint) {

        for (let l = line; l <= range.endLineNumber; l++) {
          window.editor.breakpoints.delete(l);
        }

        prev_breakpoint.range.startLineNumber = line;
        prev_breakpoint.range.endLineNumber = line;
        window.editor.breakpoints.set(line, prev_breakpoint);

      }

      for (let l = line + 1; l <= range.endLineNumber; l++) {
        window.editor.breakpoints.delete(l);
      }

      let line_check = range.endLineNumber;
      let diff = range.endLineNumber - line;

      while (line_check < window.getLineCount()) {

        let breakpoint = window.editor.breakpoints.get(line_check);

        if (breakpoint) {
          breakpoint.range.startLineNumber = line_check - diff;
          breakpoint.range.endLineNumber = line_check - diff;
          window.editor.breakpoints.set(line_check - diff, breakpoint);
          window.editor.breakpoints.delete(line_check);
        }

        line_check++;

      }

    }

  }

}

function checkBookmarksCount() {

  let count = window.getLineCount();
  let keys = [];

  window.editor.bookmarks.forEach(function (value, key) {
    if (count < key)
      keys.push(key);
  });

  keys.forEach(function (key) {
    window.editor.bookmarks.delete(key);
  });

}

function checkBreakpointsCount() {

  let count = window.getLineCount();
  let keys = [];

  window.editor.breakpoints.forEach(function (value, key) {
    if (count < key)
      keys.push(key);
  });

  keys.forEach(function (key) {
    window.editor.breakpoints.delete(key);
  });

}

function checkEmptySuggestions() {

  let msg_element = document.querySelector('.suggest-widget .message');

  if (msg_element && msg_element.innerText && !msg_element.style.display) {

    let word = window.editor.getModel().getWordAtPosition(window.editor.getPosition());

    if (!word) {
      window.hideSuggestionsList();
      setTimeout(() => {
        window.triggerSuggestions();
      }, 10);
    }

  }

}

function getCurrentThemeFullName() {

  return window.editor._themeService.getTheme().themeName;

}

function getCurrentThemeName() {

  let queryPostfix = '-query';
  let currentTheme = getCurrentThemeFullName();
  let is_query = (queryMode || DCSMode);

  if (is_query && currentTheme.indexOf(queryPostfix) == -1)
    currentTheme += queryPostfix;
  else if (!is_query && currentTheme.indexOf(queryPostfix) >= 0)
    currentTheme = currentTheme.replace(queryPostfix, '');

  return currentTheme;

}

function isDiffEditorHasChanges() {
    
  return window.diffEditor.getOriginalEditor().getValue() != diffEditor.getModifiedEditor().getValue();

}

function getDiffChanges() {

  if (!isShowDiffDecorationsEnabled()) {
    window.editor.removeDiffWidget();
    disposeDiffCalculationEditor();
    window.editor.diff_decorations = [];
    window.editor.updateDecorations([]);
    return;
  }

  const changes = window.diffEditor.getLineChanges();

  if (Array.isArray(changes)) {

    window.editor.diffCount = changes.length;
    window.editor.diff_decorations = [];

    if (isDiffEditorHasChanges()) {

      changes.forEach(function (e) {

        const startLineNumber = e.modifiedStartLineNumber;
        const endLineNumber = e.modifiedEndLineNumber || startLineNumber;

        let color = '#f8a62b';
        let class_name = 'diff-changed';
        let range = new monaco.Range(startLineNumber, 1, endLineNumber, 1);

        if (e.originalEndLineNumber === 0) {
          color = '#10aa00';
          class_name = 'diff-new';
        } else if (e.modifiedEndLineNumber === 0) {
          color = '#dd0000';
          class_name = 'diff-removed';
          range = new monaco.Range(startLineNumber, Number.MAX_VALUE, startLineNumber, Number.MAX_VALUE);
        }

        window.editor.diff_decorations.push({
          range: range,
          options: {
            isWholeLine: true,
            linesDecorationsClassName: 'diff-navi ' + class_name,
            overviewRuler: {
              color: color,
              darkColor: color,
              position: 4
            }
          }
        });

      });

    }

    window.editor.updateDecorations([]);
    window.editor.diffTimer = 0;

  }

}

function calculateDiff() {

  if (window.editor.calculateDiff && isShowDiffDecorationsEnabled()) {

    const owner_editor = window.editor;

    if (owner_editor.diffTimer)
      clearTimeout(owner_editor.diffTimer);

    owner_editor.diffTimer = setTimeout(() => {

      owner_editor.diffTimer = 0;

      if (window.editor !== owner_editor || !owner_editor.calculateDiff
        || !isShowDiffDecorationsEnabled())
        return;

      if (!window.diffEditor) {
        window.diffEditor = monaco.editor.createDiffEditor(document.createElement("div"));
        window.diffEditor.onDidUpdateDiff(() => {
          getDiffChanges();
        });
      }

      // Сюда приходим на каждое изменение текста. Пересоздавать original-модель каждый раз
      // нельзя: это полная копия оригинала, а Monaco модели сам не диспозит. Если оригинал
      // и модель редактора не менялись, diff пересчитается сам по изменению modified-модели.
      let previous = window.diffEditor.getModel();

      let reusable = previous
        && previous.original && !previous.original.isDisposed()
        && previous.modified === owner_editor.getModel()
        && window.diffEditor.originalTextRef === owner_editor.originalText;

      if (!reusable) {

        const original_model = monaco.editor.createModel(owner_editor.originalText);
        let model_installed = false;

        try {
          window.diffEditor.setModel({
            original: original_model,
            modified: owner_editor.getModel()
          });
          model_installed = true;
          window.diffEditor.originalTextRef = owner_editor.originalText;
        }
        finally {
          if (!model_installed)
            original_model.dispose();
        }

        if (previous && previous.original && !previous.original.isDisposed())
          previous.original.dispose();

      }

    }, 50);

  }

}

function isShowDiffDecorationsEnabled() {

  return window.getOption('showDiffDecorations') !== false;

}

function refreshFoldingState() {

  const folding_enabled = !window.getOption('disableFolding');
  const editors = window.editor.navi ? [window.editor.getModifiedEditor(), window.editor.getOriginalEditor()] : [window.editor];

  editors.forEach((standalone_editor) => {
    standalone_editor.updateOptions({ folding: folding_enabled });
    standalone_editor.trigger('', 'editor.unfoldAll');
  });

}

function createStatusBarWidget(overlapScroll) {

  window.statusBarWidget = {
    domNode: null,
    overlapScroll: overlapScroll,
    getId: function () {
      return 'bsl.statusbar.widget';
    },
    getDomNode: function () {

      if (!this.domNode) {

        this.domNode = document.createElement('div');
        this.domNode.classList.add('statusbar-widget');
        if (this.overlapScroll) {
          this.domNode.style.right = '0';
          this.domNode.style.top = window.editor.getDomNode().offsetHeight - 20 + 'px';
        }
        else {
          let layout = getActiveEditor().getLayoutInfo();
          this.domNode.style.right = layout.verticalScrollbarWidth + 'px';
          this.domNode.style.top = (window.editor.getDomNode().offsetHeight - 20 - layout.horizontalScrollbarHeight) + 'px';
        }
        this.domNode.style.height = '20px';
        this.domNode.style.minWidth = '125px';
        this.domNode.style.textAlign = 'center';
        this.domNode.style.zIndex = 1;
        this.domNode.style.fontSize = '12px';

        let pos = document.createElement('div');
        pos.style.margin = 'auto 10px';
        this.domNode.appendChild(pos);

      }

      return this.domNode;

    },
    getPosition: function () {
      return null;
    }
  };

  if (window.editor.navi)
    window.editor.getModifiedEditor().addOverlayWidget(window.statusBarWidget);
  else
    window.editor.addOverlayWidget(window.statusBarWidget);

  updateStatusBar();

}

function createDiffWidget(e) {

  if (window.inlineDiffWidget || window.inlineDiffWidgetTimer || window.editor.diffZoneId) {
    
    window.editor.removeDiffWidget();

  }
  else {

    const owner_editor = window.editor;
    let element = e.target.element;
    let line_number = e.target.position.lineNumber;
    
    let reveal_line = false;
    
    if (line_number == window.getLineCount()) {
      line_number--;
      reveal_line = true;
    }

    let class_name = 'new-block';

    if (element.classList.contains('diff-changed'))
      class_name = 'changed-block';
    else if (element.classList.contains('diff-removed'))
      class_name = 'removed-block';

    owner_editor.changeViewZones(function (changeAccessor) {

      let domNode = document.getElementById('diff-zone');

      if (!domNode) {
        domNode = document.createElement('div');
        domNode.setAttribute('id', 'diff-zone');
      }

      owner_editor.diffZoneId = changeAccessor.addZone({
        afterLineNumber: line_number,
        afterColumn: 1,
        heightInLines: 10,
        domNode: domNode,
        onComputedHeight: function(height) {
          if (window.editor === owner_editor && window.inlineDiffWidget) {
            if (height == 0)
              window.inlineDiffWidget.domNode.classList.add('invisible');
            else
              window.inlineDiffWidget.domNode.classList.remove('invisible');
          }
        },
        onDomNodeTop: function (top) {
          if (window.editor === owner_editor && window.inlineDiffWidget) {
            let layout = owner_editor.getLayoutInfo();
            const width = (layout.contentWidth + layout.decorationsWidth + layout.lineNumbersWidth - layout.verticalScrollbarWidth);
            window.inlineDiffWidget.domNode.style.top = top + 'px';
            window.inlineDiffWidget.domNode.style.width = width + 'px';
          }
        }
      });

    });

    window.inlineDiffWidgetTimer = setTimeout(() => {

      window.inlineDiffWidgetTimer = 0;

      if (window.editor !== owner_editor || !owner_editor.diffZoneId)
        return;

      window.inlineDiffWidget = {
        domNode: null,
        getId: function () {
          return 'bsl.diff.widget';
        },
        getDomNode: function () {

          if (!this.domNode) {

            this.domNode = document.createElement('div');
            this.domNode.setAttribute("id", "diff-widget");

            let layout = owner_editor.getLayoutInfo();
            let diff_zone = document.getElementById('diff-zone');
            let rect = diff_zone.getBoundingClientRect();
            const width = (layout.contentWidth + layout.decorationsWidth + layout.lineNumbersWidth - layout.verticalScrollbarWidth);

            this.domNode.style.top = rect.top + 'px';
            this.domNode.style.height = rect.height + 'px';
            this.domNode.style.width = width + 'px';

            let currentTheme = getCurrentThemeName();

            let header = document.createElement('div');
            header.classList.add('diff-header');
            header.classList.add(class_name);

            if (0 <= currentTheme.indexOf('dark'))
              header.classList.add('dark');

            header.innerText = window.engLang ? 'changes': 'изменения';

            let close_button = document.createElement('div');
            close_button.classList.add('diff-close');
            close_button.onclick = owner_editor.removeDiffWidget;
            header.appendChild(close_button);

            this.domNode.appendChild(header);

            let body = document.createElement('div');
            body.classList.add('diff-body');
            body.classList.add(class_name);            
            this.domNode.appendChild(body);

            window.inlineDiffEditorTimer = setTimeout(() => {

              window.inlineDiffEditorTimer = 0;

              if (window.editor !== owner_editor || window.inlineDiffWidget !== this
                || !owner_editor.diffZoneId)
                return;

              let language_id = owner_editor.getModel().getModeId();

              const inline_diff_editor = monaco.editor.createDiffEditor(body, {
                theme: currentTheme,
                language: language_id,
                contextmenu: false,
                automaticLayout: true,
                renderSideBySide: false
              });

              let originalModel = monaco.editor.createModel(owner_editor.originalText);
              let modifiedModel = owner_editor.getModel();
              let model_installed = false;

              try {
                monaco.editor.setModelLanguage(originalModel, language_id);

                inline_diff_editor.setModel({
                  original: originalModel,
                  modified: modifiedModel
                });

                inline_diff_editor.navi = monaco.editor.createDiffNavigator(inline_diff_editor, {
                  followsCaret: true,
                  ignoreCharChanges: true
                });
                window.inlineDiffEditor = inline_diff_editor;
                model_installed = true;
              }
              finally {
                if (!model_installed) {
                  if (inline_diff_editor.navi)
                    inline_diff_editor.navi.dispose();
                  inline_diff_editor.dispose();
                  originalModel.dispose();
                }
              }

              setTimeout(() => {
                if (window.inlineDiffEditor === inline_diff_editor)
                  inline_diff_editor.revealLineInCenter(line_number);
              }, 10);

              if (reveal_line)
                owner_editor.revealLine(line_number + 1);

            }, 10);

          }

          return this.domNode;

        },
        getPosition: function () {
          return null;
        }
      };

      owner_editor.addOverlayWidget(window.inlineDiffWidget);

    }, 50);

  }

}

function createReviewWidget(lineNumber, issue = null) {

  let startLineNumber = lineNumber;
  let widgetId = 'bsl.review.widget.' + startLineNumber;

  if (window.reviewWidgets.get(widgetId))
    return;

  let standaloneEditor = window.editor.navi ? window.editor.getModifiedEditor() : window.editor;

  let reviewWidget = {
    widgetId: widgetId,
    domNode: null,
    getId: function () {
      return widgetId;
    },
    removeSeverity() {
      this.domNode.classList.remove('review-error');
      this.domNode.classList.remove('review-warning');
      this.domNode.classList.remove('review-info');
      this.domNode.classList.remove('review-hint');
    },
    close: function () {
      let height = standaloneEditor.getOption(monaco.editor.EditorOption.lineHeight) * 4 + 'px'
      let widget = window.reviewWidgets.get(this.widgetId);
      this.domNode.classList.add('close');
      this.domNode.getElementsByClassName("review-header")[0].style.display = 'flex';
      this.domNode.getElementsByClassName("review-text")[0].style.display = 'block';
      this.domNode.getElementsByClassName("review-edit")[0].style.display = 'none'
      this.domNode.style.height = height;
      document.querySelector('[monaco-view-zone="' + widget.zone + '"]').style.height = height;
      standaloneEditor.changeViewZones(function (changeAccessor) {
        changeAccessor.layoutZone(widget.zone);
      });
    },
    save: function () {
      let textarea = this.domNode.getElementsByTagName('textarea')[0];
      if (textarea.value) {
        let widget = window.reviewWidgets.get(this.widgetId);
        let reviewText = this.domNode.getElementsByClassName("review-text")[0];
        reviewText.textContent = textarea.value;
        let reviewTitle = this.domNode.getElementsByClassName("review-title")[0];
        let date = new Date(Date.now());
        function addZero(num) {
            return ("0" + num).slice(-2)
        }
        let year = date.getFullYear(),
            month = addZero(date.getMonth() + 1),
            day = addZero(date.getDate()),
            hours = addZero(date.getHours()),
            minutes = addZero(date.getMinutes());
        let issueDate = `${day}.${month}.${year} ${hours}:${minutes}`;
        if (!reviewTitle.textContent) {
          reviewTitle.textContent = issueDate;
          if (userName)
            reviewTitle.textContent += ' @' + userName;
        }
        widget.date = issueDate;
        widget.author = userName;
        widget.message = textarea.value;
        widget.severity = this.domNode.querySelector('input:checked').nextSibling.className;
        this.removeSeverity();
        this.domNode.classList.add("review-" + widget.severity);
        this.close();
        window.sendEvent("EVENT_ON_REVIEW_CHANGED", "");
      }
      else {
        textarea.classList.add('required');
      }
    },
    delete: function (generateEvent = true) {
      let widget = window.reviewWidgets.get(this.widgetId);
      standaloneEditor.removeOverlayWidget(widget.widget);
      standaloneEditor.changeViewZones(function (changeAccessor) {
        changeAccessor.removeZone(widget.zone);
      });
      window.reviewWidgets.delete(this.widgetId);
      if (generateEvent)
        window.sendEvent("EVENT_ON_REVIEW_CHANGED", "");
    },
    cancel: function () {
      let widget = window.reviewWidgets.get(this.widgetId);
      if (widget.message)
        this.close();
      else
        this.delete();
    },
    edit: function () {
      let widget = window.reviewWidgets.get(this.widgetId);
      let height = standaloneEditor.getOption(monaco.editor.EditorOption.lineHeight) * 10 + 'px'
      this.domNode.classList.remove('close');
      this.domNode.getElementsByClassName("review-header")[0].style.display = 'none';
      this.domNode.getElementsByClassName("review-text")[0].style.display = 'none';
      this.domNode.getElementsByClassName("review-edit")[0].style.display = 'block';
      this.domNode.style.height = height;
      document.querySelector('[monaco-view-zone="' + widget.zone + '"]').style.height = height;
      standaloneEditor.changeViewZones(function (changeAccessor) {
        changeAccessor.layoutZone(widget.zone);
      });
    },
    load(issue) {
      if (issue) {
          this.domNode.classList.add('review-' + issue.severity);
          let title = this.domNode.getElementsByClassName("review-title")[0];
          title.textContent = issue.date;
          if (issue.author)
            title.textContent += ' @' + issue.author;
          this.domNode.getElementsByClassName('review-text')[0].textContent = issue.message;
          this.domNode.getElementsByTagName('textarea')[0].value = issue.message;
          this.domNode.querySelector('.severity label .' + issue.severity).previousSibling.checked = true;
          let widget = window.reviewWidgets.get(this.widgetId);
          widget.date = issue.date;
          widget.author = issue.author;
          widget.message = issue.message;
          widget.severity = issue.severity;
          this.close();
      }
    },
    createSeverityButton(className, title, lineNumber, group) {
      let label = document.createElement('label');
      let input = document.createElement('input');
      input.setAttribute('name', 'radio.' + lineNumber);
      input.setAttribute('type', 'radio');
      if (!group.hasChildNodes())
        input.setAttribute('checked', '');
      label.appendChild(input);
      let span = document.createElement('span');          
      span.classList.add(className);
      span.innerHTML = title;
      span.onclick = function() {
        let inputs = this.parentElement.parentElement.querySelectorAll('input');
        for (let x = 0; x < inputs.length; x++) {
          inputs[x].checked = false;
        }
        this.parentElement.querySelector('input').checked = true;          
      }
      label.appendChild(span);
      group.appendChild(label);
    },
    getDomNode: function () {

      if (!this.domNode) {
        
        this.domNode = document.createElement('div');
        this.domNode.classList.add('review-body');
      
        let header = document.createElement('div');
        header.classList.add('review-header');
        if (issue)
          header.style.display = 'flex';
        else
          header.style.display = 'none';

        let buttons = document.createElement('div');
        buttons.classList.add('review-buttons');
        header.appendChild(buttons);

        let title = document.createElement('div');
        title.classList.add('review-title');
        header.appendChild(title);

        let button = document.createElement('div');
        button.classList.add('review-image');
        buttons.appendChild(button);

        button = document.createElement('div');
        button.classList.add('review-modify');
        button.setAttribute('widgetid', widgetId);
        button.onclick = function() {
          reviewWidgets.get(this.getAttribute("widgetid")).widget.edit();
        }
        buttons.appendChild(button);

        if (getOption('reviewMode') && !getOption('readOnlyCodeReview')) {
          button = document.createElement('div');
          button.classList.add('review-delete');
          button.setAttribute('widgetid', widgetId);
          button.onclick = function () {
            let modal = new tingle.modal({
              footer: true,
              stickyFooter: false,
              closeMethods: [],
              widgetid: this.getAttribute("widgetid")
            });              
            modal.setContent('<h3>Удалить замечание?</h3>');
            modal.addFooterBtn('Да', 'tingle-btn tingle-btn--primary', function () {
              reviewWidgets.get(modal.opts.widgetid).widget.delete();
              modal.close();
            });
            modal.addFooterBtn('Нет', 'tingle-btn tingle-btn--danger', function () {
              modal.close();
            });
            modal.open();
          }
          buttons.appendChild(button);
        }
        this.domNode.appendChild(header);

        let text = document.createElement('div');
        text.classList.add('review-text');
        this.domNode.appendChild(text);
        
        if (issue)
          text.style.display = 'block';
        else
          text.style.display = 'none';

        let editGroup = document.createElement('div');
        editGroup.classList.add('review-edit');
        if (issue)
          editGroup.style.display = 'none';

        let div = document.createElement('div');
        div.classList.add('severity');

        let group = document.createElement('div');
        div.appendChild(group)
        this.createSeverityButton('error', 'Ошибка', lineNumber, group);
        this.createSeverityButton('warning', 'Предупреждение', lineNumber, group);
        this.createSeverityButton('info', 'Информация', lineNumber, group);
        this.createSeverityButton('hint', 'Подсказка', lineNumber, group);
        editGroup.appendChild(div);
        
        let textarea = document.createElement('textarea');
        textarea.oninput = function() {
          this.classList.remove('required');
        }
        textarea.classList.add('review-message');
        editGroup.appendChild(textarea);

        if (getOption('reviewMode') && !getOption('readOnlyCodeReview')) {
          button = document.createElement('button');
          button.setAttribute('widgetid', widgetId);
          button.classList.add('review-save');
          button.innerHTML = "Сохранить"
          button.onclick = function() {
            window.reviewWidgets.get(this.getAttribute("widgetid")).widget.save();
          }
          editGroup.appendChild(button);
        }
        
        button = document.createElement('button');
        button.setAttribute('widgetid', widgetId);
        button.classList.add('review-cancel');
        button.innerHTML = "Отмена"
        button.onclick = function() {
          window.reviewWidgets.get(this.getAttribute("widgetid")).widget.cancel();
        }
        editGroup.appendChild(button);
        this.domNode.appendChild(editGroup);

      }
      return this.domNode;
    },
    getPosition: function () {
      return null;
    }
  };    

  standaloneEditor.changeViewZones(function (changeAccessor) {

    let domNode = document.createElement("div");
    window.editor.domNode = domNode;
    domNode.classList.add('review-zone');

    let zone_id = changeAccessor.addZone({
      afterLineNumber: startLineNumber,
      afterColumn: 1,
      heightInLines: 10,
      domNode: domNode,
      widget: reviewWidget,
      showInHiddenAreas: false,
      onComputedHeight: function(height) {
        if (this.widget.domNode) {
          if (height == 0)
            this.widget.domNode.classList.add('invisible');
          else
            this.widget.domNode.classList.remove('invisible');
        }
      },
      onDomNodeTop: function (top) {
        if (this.widget.domNode) {
          let layout = standaloneEditor.getLayoutInfo();
          let scrollWidth = window.editor.navi ? layout.verticalScrollbarWidth * 2 : layout.verticalScrollbarWidth;
          let width = layout.width - scrollWidth - layout.minimapWidth;
          this.widget.domNode.style.top = top + 'px';
          this.widget.domNode.style.width = width + 'px';
        }
      },
      get heightInPx() {
        if (this.widget.domNode)
          return this.widget.domNode.offsetHeight;
      }
    });

    window.reviewWidgets.set(widgetId, {
      zone: zone_id,
      startLineNumber: startLineNumber,
      widget: reviewWidget
    });

    standaloneEditor.layout();
    setTimeout(() => {reviewWidget.load(issue)}, 10);

  }); 

  standaloneEditor.addOverlayWidget(reviewWidget);    

}

function removeReviewWidgets() {

  window.reviewWidgets.forEach((value, key, map) => {
    value.widget.delete(false);
  });

  let standaloneEditor = window.editor.navi ? window.editor.getModifiedEditor() : window.editor;
  standaloneEditor.reviewDecorations = [];
      
  if (window.editor.navi)
    window.editor.diffEditorUpdateDecorations();
  else
    window.editor.updateDecorations(standaloneEditor.reviewDecorations);

}

function goToCurrentIssue(sortedIssues) {

  if (sortedIssues.length <= window.currentIssue)
    return;

  let standaloneEditor = window.editor.navi ? window.editor.getModifiedEditor() : window.editor;
  let lineCount = standaloneEditor.getModel().getLineCount();
  let issueLine = sortedIssues[window.currentIssue];

  if (issueLine <= lineCount) {
    
    let smoothScrolling = standaloneEditor.getOption(monaco.editor.EditorOption.smoothScrolling);
    standaloneEditor.updateOptions({ smoothScrolling: true });
    standaloneEditor.revealRangeAtTop(new monaco.Range(issueLine, 1, issueLine, 1), 0);      
    setTimeout(() => {      
      standaloneEditor.setPosition(new monaco.Position(issueLine, 1));      
      standaloneEditor.updateOptions({ smoothScrolling: smoothScrolling });
    }, 50);
  }

}

function getSortedIssues() {

  let sortedIssues = [];
  const sortedWidgets = new Map([...window.reviewWidgets].sort());

  sortedWidgets.forEach((value, key, map) => {
    sortedIssues.push(value.startLineNumber);
  });

  return sortedIssues;

}

function removeSuggestListInactiveDetails() {

  document.querySelectorAll('.monaco-list-rows .details-label').forEach(function (node) {
    node.classList.remove('inactive-detail');
  });

  document.querySelectorAll('.monaco-list-rows .readMore').forEach(function (node) {
    node.classList.remove('inactive-more');
  });

}

function onSuggestListMouseOver(activationEventEnabled) {

  return; // Disabled until fix https://github.com/salexdv/bsl_console/issues/190

  let widget = getSuggestWidget().widget;

  if (activationEventEnabled) {

    widget.listElement.onmouseoverOrig = widget.listElement.onmouseover;
    widget.listElement.onmouseover = function (e) {

      removeSuggestListInactiveDetails();

      let parent_row = getParentWithClass(e.target, 'monaco-list-row');

      if (parent_row) {

        if (!parent_row.classList.contains('focused')) {

          let details = getChildWithClass(parent_row, 'details-label');

          if (details) {
            details.classList.add('inactive-detail');
            window.generateEventWithSuggestData('EVENT_ON_ACTIVATE_SUGGEST_ROW', 'hover', parent_row);
          }

          let read_more = getChildWithClass(parent_row, 'readMore');

          if (read_more)
            read_more.classList.add('inactive-more');

          if (typeof (widget.listElement.onmouseoverOrig) == 'function')
            widget.listElement.onmouseoverOrig(e);

        }

      }

    }

  }
  else {

    if (widget.listElement.onmouseoverOrig)
      widget.listElement.onmouseover = suggestWidget.widget.listElement.onmouseoverOrig;

  }

}

function eraseTextBeforeUpdate() {

  window.editor.checkBookmarks = false;
  bslHelper.setText('', window.editor.getModel().getFullModelRange(), false);
  window.editor.checkBookmarks = true;

}

function showVariablesDisplay() {

  let container = document.getElementById("container");
  if (typeof container.heightBeforeVariablesDisplay == 'undefined')
    container.heightBeforeVariablesDisplay = container.style.height;
  container.style.height = "70%";
  getActiveEditor().layout();
  document.getElementById("display-title").innerHTML = window.engLang ? "Variables" : "Просмотр значений переменных:"
  let element = document.getElementById("display");
  element.style.height = "30%";
  element.style.display = "block";

}

function hideVariablesDisplay() {

  let container = document.getElementById("container");
  container.style.height = typeof container.heightBeforeVariablesDisplay == 'undefined'
    ? "100%"
    : container.heightBeforeVariablesDisplay;
  delete container.heightBeforeVariablesDisplay;
  getActiveEditor().layout();
  let element = document.getElementById("display");
  element.style.height = "0";
  element.style.display = "none";
  window.treeview.dispose();
  window.treeview = null;

}

function setThemeVariablesDisplay(theme) {

  if (0 < theme.indexOf('dark')) {
    document.getElementById("display").classList.add('dark');
    document.getElementById("container").classList.add('dark');
  }
  else {
    document.getElementById("display").classList.remove('dark');
    document.getElementById("container").classList.remove('dark');
  }

}
// #endregion

// #region browser events
document.onclick = function (e) {
    
  if (e.target.classList.contains('codicon-close')) {

    if (hasParentWithClass(e.target, 'find-widget'))
      setFindWidgetDisplay('none');

  }
  else if (e.target.id == 'event-button' && events_queue.length) {
    let eventData1C = events_queue.shift();
    e.eventData1C = eventData1C;
    console.debug(eventData1C.event, eventData1C.params);

  }

}

document.onkeypress = function (e) {

  window.editor.lastKeyCode = e.keyCode;

  let char = String.fromCharCode(e.keyCode);

  if (Array.isArray(window.activeSuggestionAcceptors) && 0 <= window.activeSuggestionAcceptors.indexOf(char.toLowerCase())) {

    let element = document.querySelector('.monaco-list-row.focused');

    if (element) {

      let suggestItem = getSuggestItemByRow(element);

      if (handleEventSuggestSelection(suggestItem))
        return false;

      let fire_event = window.getOption('generateSelectSuggestEvent');

      if (fire_event) {
        window.generateEventWithSuggestData('EVENT_ON_SELECT_SUGGEST_ROW', 'force-selection-' + char, element);
      }

      if (!window.editor.skipAcceptionSelectedSuggestion)
        window.editor.trigger('', 'acceptSelectedSuggestion');

      return window.editor.skipInsertSuggestionAcceptor ? false : true;

    }

  }

};

window.addEventListener('resize', function(event) {
  
  if (window.editor.autoResizeEditorLayout)
    window.editor.layout();
  else
    resizeStatusBar();    

  resizeStatusBar();
  
}, true);

document.getElementById("display-close").addEventListener("click", (event) => {    
    
  hideVariablesDisplay();

});
// #endregion
