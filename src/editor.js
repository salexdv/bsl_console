// Порядок импортов критичен: ESM исполняет модули сверху вниз, каждый — ПОЛНОСТЬЮ до
// следующего, и все import-ы выполняются раньше любого top-level кода этого файла (в т.ч.
// регистрации языков/тем и createEditor ниже). Слои совместимости и публикация глобального
// monaco ДОЛЖНЫ отработать до того, как наш код (bsl_language → bsl_helper, finder, actions)
// впервые коснётся monaco:
//   1) polyfills          — рантайм-API старого WebKit ДО любого кода monaco
//   2) monaco-environment — self.MonacoEnvironment (globalAPI + blob-воркер) ДО monaco
//   3) product-service    — registerSingleton(IProductService) ДО StandaloneServices
//   4) expose-monaco      — import monaco (editor.main: API + ВСЕ контрибы) + window.monaco
import './polyfills';
import './monaco-environment';
import './product-service';
import monaco from './expose-monaco';

import { languages, setHighlightInnerQuotes} from './bsl_language';
import queryModelService from './query_model_service';
import HiddenBlocksController from './hidden_blocks';
import { getActions, permanentActions } from './actions';
import './decorations.css'
import './tingle.css'
import tingle from './tingle.js'
import './tree/tree.css'
import Treeview from './tree/tree.js'
import Finder from "./finder";
import SnippetsParser from "./parsers";
import { patchWebKit1C } from './1c-webkit-patch';
import SearchHistoryController from './search_history';
import bslHelper from './bsl_helper';
import { createHelpBrowser } from './help';
import {
  AI_INLINE_DEFAULT_OPTIONS,
  MANUAL_INLINE_PROVIDER_GROUP,
  createAIInlineProvider,
  isAIInlineOption,
  isValidAIInlineOption
} from './ai_inline_provider';

const hiddenBlocksController = new HiddenBlocksController(monaco, function () {
  return window.engLang;
});
const searchHistoryController = new SearchHistoryController(monaco);
const aiInlineProvider = createAIInlineProvider({
  getEditor: function () {
    return window.editor && !window.editor.navi ? window.editor : null;
  },
  getOption: function (name) {
    if (window.editor && typeof window.editor[name] != 'undefined')
      return window.editor[name];
    return window.editor_options[name];
  },
  sendEvent: function (name, params) { return window.sendEvent(name, params); },
  isInlineEnabled: function () {
    if (!window.editor || window.editor.navi || window.readOnlyMode)
      return false;

    let selection = window.editor.getSelection();
    if (!selection || !selection.isEmpty())
      return false;

    let inlineSuggest = window.editor.getOption(monaco.editor.EditorOption.inlineSuggest);
    return !inlineSuggest || inlineSuggest.enabled !== false;
  }
});
const helpBrowser = createHelpBrowser(function () { return window.editor; }, function (params) {
  window.sendEvent('EVENT_ON_LINK_CLICK', params);
});
// Иконки дерева переменных инлайнятся в бандл (data:-URI) через require.context, а не тянутся
// отдельными файлами — это нужно для single-file сборки. В обычной сборке результат тот же:
// url-loader инлайнит эти PNG (< 8 КБ), а копия в dist/tree/icons остаётся невостребованной.
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

// NLS: monaco-editor-nls (setLocaleData/ruLocale) удалён — несовместим с 0.55; UI monaco
// по умолчанию английский (русская локализация — отдельным шагом). MonacoEnvironment
// (blob-воркер + globalAPI) задаётся в ./monaco-environment (импортирован выше, до monaco).

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
window.customInlineSuggestion = [];
window.immediateHover = [];
window.customSignatures = {};
window.customCodeLenses = [];
window.originalText = '';
window.metadataRequests = new Map();
window.customSuggestions = [];
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
window.inlineSuggestionsChanged = new monaco.Emitter();
window.aiInlineProgrammaticChangeDepth = 0;
window.objectContext = null;
// #endregion

// #region public API
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
    // 0.55: свойства .originalEditor/.modifiedEditor удалены — только методы get*Editor().
    window.editor.getOriginalEditor().updateOptions({ wordWrap: enabled });
    window.editor.getModifiedEditor().updateOptions({ wordWrap: enabled });
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
    window.removeAllBreakpoints();
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

  // В режиме запроса весь текст редактора и ЕСТЬ запрос — строкового литерала BSL тут нет, поэтому
  // bslHelper.getQuery() (ищет строку-запрос в BSL-коде) вернул бы null, и кнопка «Конструктор
  // запроса» не получала бы текст. Отдаём его в ТОМ ЖЕ виде {text, range}, что и запрос, вырезанный
  // из BSL: text экранируем как тело BSL-литерала (кавычки удвоены), чтобы потребитель снял
  // экранирование (ПодготовитьТекстЗапроса в консоли) и получил исходный запрос. Симметрично записи
  // результата (ПриЗакрытииКонструктораЗапросов пишет в режиме запроса СЫРОЙ текст). range — весь
  // документ: конструктор пишет результат обратно в него.
  if (window.isQueryMode()) {
    let model = window.editor.getModel();
    return { text: model.getValue().replace(/"/g, '""'), range: model.getFullModelRange() };
  }

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

}

window.setReadOnly = function (readOnly) {

  window.readOnlyMode = readOnly;
  window.editor.updateOptions({ readOnly: readOnly });

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

  // 0.55 (breaking 0.30): model.getLanguageIdentifier() удалён — getLanguageId() отдаёт строку.
  return getActiveEditor().getModel().getLanguageId();

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
  editor.updateOptions({
    renderSideBySide: sideBySide
  });
  return true;
}

window.hideUnchangedBlocks = function () {

  if (window.editor.navi)
    window.setOption('hideUnchangedRegions', true);

}

window.showUnchangedBlocks = function () {

  if (window.editor.navi)
    window.setOption('hideUnchangedRegions', false);

}

function getDiffEditorOption(optionName) {

  const optionValue = window.editor_options[optionName];
  return optionValue === undefined ? false : optionValue;

}

function updateDiffEditorOption(optionName, optionValue) {

  let option = {};
  option[optionName] = optionName == 'hideUnchangedRegions'
    ? { enabled: optionValue }
    : optionValue;

  if (window.editor.navi)
    window.editor.updateOptions(option);

  if (window.inlineDiffEditor)
    window.inlineDiffEditor.updateOptions(option);

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
      useInlineViewWhenSpaceIsLimited: false,
      renderMarginRevertIcon: getDiffEditorOption('renderMarginRevertIcon'),
      renderGutterMenu: false,
      hideUnchangedRegions: { enabled: getDiffEditorOption('hideUnchangedRegions') },
      // 0.55: гасим встроенный '*'-color-provider (worker-регэксп с lookbehind несовместим с
      // WebKit поля 1С) и подсветку «неоднозначных»/невидимых символов (кириллица). Наш
      // registerColorProvider при defaultColorDecorators:'never' продолжает работать.
      defaultColorDecorators: 'never',
      unicodeHighlight: {
        ambiguousCharacters: false,
        invisibleCharacters: false,
        nonBasicASCII: false
      },
      useShadowDOM: false,
      find: {
        addExtraSpaceOnTop: false
      },
      stickyScroll: {
        enabled: false
      }
    });
    window.editor.countDiffEvents = 0;
    window.editor.initialDiffCount = 0;
    window.editor.onDidUpdateDiff(e => {
      if (window.getOption('generateCompareCompleteEvent')) {
        const diffCount = (window.editor.getLineChanges() || []).length;
        if (window.editor.initialDiffCount == 0) {
          sendEvent("EVENT_COMPARE_COMPLETE", {});
          window.editor.initialDiffCount = diffCount;
        }
        if (diffCount < window.editor.initialDiffCount)
          sendEvent("EVENT_COMPARE_COMPLETE", {});
      }
      if (window.getOption('generateModificationEvent'))
        sendEvent('EVENT_CONTENT_CHANGED', '');
    });
    if (highlight) {
      monaco.editor.setModelLanguage(originalModel, language_id);
      monaco.editor.setModelLanguage(modifiedModel, language_id);
    }
    window.editor.setModel({
      original: originalModel,
      modified: modifiedModel
    });
    // Monaco 0.45: createDiffNavigator/IDiffNavigator удалены; navi — булев флаг diff-режима
    // (читается как флаг в ~20 местах). Навигация теперь через diffEditor.goToDiff();
    // getDiffLineInformationFor* (удалены в 0.40) реимплементированы поверх getLineChanges().
    window.editor.navi = true;
    window.editor.getDiffLineInformationForModified = function (lineNumber) {
      return { equivalentLineNumber: getEquivalentDiffLine(this.getLineChanges(), lineNumber, true) };
    };
    window.editor.getDiffLineInformationForOriginal = function (lineNumber) {
      return { equivalentLineNumber: getEquivalentDiffLine(this.getLineChanges(), lineNumber, false) };
    };
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
      setTimeout(() => {
        const modified_line = this.getPosition().lineNumber;
        const diff_info = this.getDiffLineInformationForModified(modified_line);
        const original_line = diff_info ? diff_info.equivalentLineNumber : modified_line;
        if (this.markLines) {
          this.getModifiedEditor().diffDecor.line = modified_line;
          this.getOriginalEditor().diffDecor.line = original_line;
        }
        this.diffEditorUpdateDecorations();
        // 0.55: getLineChanges() отдаёт null пока дифф не посчитан (async) → guard || [].
        window.editor.diffCount = (window.editor.getLineChanges() || []).length;
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
      if (e.target.element.classList.contains('add-review'))
        createReviewWidget(e.target.position.lineNumber);
    });
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

  window.hideSuggestionsList();
  window.editor.trigger('', 'editor.action.triggerSuggest', {});

  setTimeout(() => {
    startStopSuggestSelectionObserver();
    startStopSuggestActivationObserver();
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
        suggestion.range = new monaco.Range(
          currentPosition.lineNumber,
          currentPosition.column,
          currentPosition.lineNumber,
          currentPosition.column
        );
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

window.showInlineSuggestion = function(suggestions) {

  window.customInlineSuggestion = [];

  try {

    window.customInlineSuggestion = JSON.parse(suggestions);

    // В Monaco 0.55 смена provider event обновляет уже активную сессию, но не обязана
    // создавать её. Явная штатная команда гарантирует показ переданной из 1С подсказки.
    if (window.editor && !window.editor.navi && !window.readOnlyMode
      && window.editor.getSelection().isEmpty()) {
      window.editor.trigger('bsl-console-inline', 'editor.action.inlineSuggest.trigger', { explicit: true });
    }

    return true;

	}
	catch (e) {
		return { errorDescription: e.message };
	}

}

window.resolveAIInlineCompletion = function (requestId, suggestions) {
  return aiInlineProvider.resolve(requestId, suggestions);
}

window.triggerInlineSuggestions = function () {

  if (!window.editor || window.editor.navi || window.readOnlyMode
    || !window.editor.getSelection().isEmpty())
    return false;

  window.editor.trigger('bsl-console-ai-inline', 'editor.action.inlineSuggest.trigger', { explicit: true });
  return true;

}

window.nextDiff = function() {

  if (window.editor.navi) {
    window.editor.goToDiff('next');
    window.editor.markDiffLines();
  }

}

window.previousDiff = function() {

  if (window.editor.navi) {
    window.editor.goToDiff('previous');
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

  // 0.55: контейнер hover-виджета '.monaco-editor-hover' → '.monaco-hover' ('.hover-row' жив).
  let hovers = document.querySelectorAll('.monaco-hover .hover-row');
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
    let dom = window.statusBarWidget.domNode;
    if (dom && dom.parentNode)
      dom.parentNode.removeChild(dom);
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
  let widget = getSuggestWidget();

  // 0.55: widget.list → widget._list; элемент по индексу — публичный List.element(i);
  // DOM-строку берём по data-index (list.view.items[i].row умер).
  if (widget && i < widget._list.length) {

    let item = widget._list.element(i);

    if (item) {

      item.completion.detail = detailInList;

      if (documentation)
        item.completion.documentation = documentation;

    }

    let row = document.querySelector('.monaco-list-rows .monaco-list-row[data-index="' + i + '"]');
    let detail_element = row ? getChildWithClass(row, 'details-label') : null;

    if (detail_element)
      detail_element.innerText = detailInList;

  }

}

window.setActiveSuggestDetail = function (detailInList, detailInSide = null, maxSideHeightInPixels = 800) {

  let listRowDetail = document.querySelector('.monaco-list-rows .focused .details-label');

  if (listRowDetail)
    listRowDetail.innerText = detailInList;

  // 0.55: панель доков — отдельный overlay .suggest-details-container > .suggest-details (не
  // .suggest-widget.docs-side .details). Пишем в p.type ('.header .type'), а не в .header целиком
  // (иначе снесём codicon-кнопку закрытия). [T4: высоту, возможно, перебивает ResizableHTMLElement —
  // при мигании переключить на '.suggest-details-container'.]
  let sideDetailType = document.querySelector('.suggest-details .header .type');

  if (sideDetailType) {

    if (!detailInSide)
      detailInSide = detailInList;

    sideDetailType.innerText = detailInSide;

    let sideDetailElement = document.querySelector('.suggest-details');
    let contentHeightInPixels = sideDetailType.scrollHeight;
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
      && window.editor && !window.editor.navi) {
      window.editor.trigger('bsl-console-ai-inline', 'editor.action.inlineSuggest.hide');
    }
  }

  if (optionName == 'renderMarginRevertIcon' || optionName == 'hideUnchangedRegions')
    updateDiffEditorOption(optionName, optionValue);

  if (optionName == 'generateBeforeSignatureEvent')
      startStopSignatureObserver();

  if (optionName == 'generateSelectSuggestEvent')
    startStopSuggestSelectionObserver();

  if (optionName == 'disableDefinitionMessage')
    startStopDefinitionMessegeObserver();

  if (optionName == 'highlightInnerQuotes' && typeof setHighlightInnerQuotes == 'function') {
    setHighlightInnerQuotes(optionValue);
    window.setTheme(getCurrentThemeFullName());
  }

  if (optionName == 'disableFolding')
    refreshFoldingState();

  if (optionName == 'showDiffDecorations') {
    if (isShowDiffDecorationsEnabled() && window.editor.calculateDiff)
      calculateDiff();
    else {
      window.editor.removeDiffWidget();
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
    if (!jumpToKeywordBracket())
      window.editor.trigger('', 'editor.action.jumpToBracket');

}

window.selectToBracket = function () {

  if (!selectToIfBracket())
    if (!selectToKeywordBracket())
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
    window.editor.diff_decorations = [];
  }
  else if (isShowDiffDecorationsEnabled())
    calculateDiff();
  else {
    window.editor.removeDiffWidget();
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

  // 0.55: поле suggestWidgetVisible → _ctxSuggestWidgetVisible; getSuggestWidget() = сам виджет|null.
  let widget = getSuggestWidget();
  return widget ? widget._ctxSuggestWidgetVisible.get() === true : false;

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

  let widget = getSuggestWidget();

  // 0.55: list.view.items → полный список _completionModel.items (все элементы, не только
  // отрисованные — для поиска по GUID корректнее); .element.completion/.provider → item.completion/
  // item.provider; resolveCompletionItem теперь (item, token) (bsl_language.js мигрирован).
  if (widget && widget._completionModel) {

    widget._completionModel.items.forEach((item) => {

      if (item.completion.guid == snippetGUID)
        item.provider.resolveCompletionItem(item.completion, null);

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

    // 0.55: getLineChanges() null пока дифф async; .originalEditor/.modifiedEditor удалены → get*.
    diff = window.editor.getLineChanges() || [];
    let original_model = window.editor.getOriginalEditor().getModel();
    let modified_model = window.editor.getModifiedEditor().getModel();

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

window.hideBlocks = function (blocks) {

  if (!window.editor || window.editor.navi)
    return;

  hiddenBlocksController.hideBlocks(window.editor, blocks);

}

window.showHiddenBlocks = function () {

  if (!window.editor || window.editor.navi)
    return;

  hiddenBlocksController.showEditor(window.editor);

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
    // КРИТИЧНО для «Поля HTML документа» 1С (старый WebKit-webview красит по событию ВВОДА, не
    // постоянно). Monaco вставляет строки suggest АСИНХРОННО (rAF, suggestWidget.js). Без
    // automaticLayout наш ResizeObserver-полифил @juggle не стартует → нет «насоса» перерисовки
    // (body-MutationObserver → rAF → чтение clientWidth = форс-reflow), и асинхронно вставленные
    // строки автодополнения висят НЕНАРИСОВАННЫМИ до следующего ввода = пустой блок suggest.
    // boot.js (смоук Этапов 1-2, где suggest работал) и diff-редакторы его держат; при переходе
    // entry на editor.js он потерялся. VAEditor держит automaticLayout:true — паритет с рабочим
    // референсом (у него нет программного triggerSuggest, поэтому там баг и не всплывал).
    automaticLayout: true,
    // fixedOverflowWidgets: overflow-виджеты (suggest/hover/param-hints) в fixed-контейнере на
    // document.body. Наследие экспериментов по #3 (пустой блок автодополнения в поле 1С); НЕ является
    // фиксом — реальная причина была в per-call записи в стиль виджета из провайдера автодополнения
    // (см. resetSuggestWidgetDisplay в bsl_language.js). Оставлено как рабочая опция; кандидат на ревизию.
    fixedOverflowWidgets: true,
    // 0.55: wordBasedSuggestions boolean → строковый enum; false === 'off'.
    wordBasedSuggestions: 'off',
    scrollBeyondLastLine: false,
    insertSpaces: false,
    trimAutoWhitespace: false,
    // 0.55: autoIndent boolean → EditorAutoIndentStrategy; прежнее true === 'full'
    // (migrateOptions true→'full'), сохраняет учёт наших indentationRules. НЕ 'advanced'.
    autoIndent: 'full',
    // 0.55: не подсвечивать «неоднозначные»/невидимые/не-ASCII символы — иначе кириллица
    // трактуется как двойники латиницы (а/a, е/e, о/o) и зашумляет весь BSL-код.
    unicodeHighlight: {
      ambiguousCharacters: false,
      invisibleCharacters: false,
      nonBasicASCII: false
    },
    // 0.55: гасим ТОЛЬКО встроенный '*'-color-provider (worker-регэксп с lookbehind (?<=['"\s])
    // падает на WebKit поля 1С). Наш registerColorProvider продолжает работать. colorDecorators
    // НЕ трогаем: false выключил бы и наши цвета (colorDetector читает именно эту опцию).
    defaultColorDecorators: 'never',
    // Поле 1С: без Shadow DOM — стабильнее измерения/стили в старом WebKit.
    useShadowDOM: false,
    // 0.55: bracket-pair colorization (радуга скобок по вложенности) — выключить глобально;
    // в 0.20 её не было, наши токены скобок задают цвет сами (дубль к colorizedBracketPairs:[]).
    bracketPairColorization: { enabled: false },
    find: {
      addExtraSpaceOnTop: false
    },
    parameterHints: {
      cycle: true
    },
    lineNumbers: window.getLineNumber,
    customOptions: true,
    renderValidationDecorations: "on",
    stickyScroll: {
      enabled: false
    }
  });

  changeCommandKeybinding('editor.action.revealDefinition', monaco.KeyCode.F12);
  changeCommandKeybinding('editor.action.peekDefinition', monaco.KeyMod.CtrlCmd | monaco.KeyCode.F12);
  changeCommandKeybinding('editor.action.deleteLines',  monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyL);
  changeCommandKeybinding('editor.action.selectToBracket',  monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyB);
  changeCommandKeybinding('editor.action.quickOutline',  monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyP);

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
  
  lang.inlineCompletionProvider.groupId = MANUAL_INLINE_PROVIDER_GROUP;
  lang.inlineCompletionProvider.onDidChangeInlineCompletions  = window.inlineSuggestionsChanged.event;
  monaco.languages.registerInlineCompletionsProvider(language.id, lang.inlineCompletionProvider);

  // 0.55: два setLanguageConfiguration подряд — второй ЗАМЕЩАЕТ первый (не мержит), поэтому
  // indentationRules + brackets/autoClosingPairs сливаем в ОДИН вызов (иначе теряются отступы).
  // colorizedBracketPairs:[] гасит bracket-pair colorization 0.55: у нас свои токены скобок, иначе
  // скобки методов красятся «радугой» по уровню вложенности (в 0.20 такого не было).
  var langCfg = { brackets: lang.brackets, autoClosingPairs: lang.autoClosingPairs, colorizedBracketPairs: [] };
  if (lang.autoIndentation && lang.indentationRules)
    langCfg.indentationRules = lang.indentationRules;
  monaco.languages.setLanguageConfiguration(language.id, langCfg);

  if (!window.editor) {

    monaco.editor.onDidCreateEditor(e => {

      if (!window.editor) {

        import('./bslGlobals').then(({ default: bslGlobals }) => {
          window.bslGlobals = bslGlobals
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

monaco.languages.registerInlineCompletionsProvider(
  ['bsl', 'bsl_query', 'dcs_query'],
  aiInlineProvider.provider
);

const commandOnlyActions = ['saveref', 'requestMetadata'];

monaco.editor.addEditorAction({
  id: 'bsl.showHelp',
  label: 'Справка 1С',
  keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.F1],
  run: function (activeEditor) {
    if (window.editor && window.editor.navi && activeEditor && activeEditor.hasTextFocus
      && !activeEditor.hasTextFocus())
      return;
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

for (const [action_id, action] of Object.entries(permanentActions)) {

  if (commandOnlyActions.indexOf(action_id) != -1) {
    // 0.55: служебные действия, вызываемые из команд элементов автодополнения
    // (CompletionItem.command = {id:'bsl.saveref'|'bsl.requestMetadata'}), нельзя регистрировать
    // через addAction (тот вешает id 'editorId:saveref') — только глобальной командой.
    // handler(accessor, ...args); callback(e, obj) читает только obj → e=accessor, obj=args[0].
    monaco.editor.registerCommand('bsl.' + action_id, action.callback);
    continue;
  }

  window.editor.addAction({
    id: action_id,
    label: action.label,
    // 0.55: addAction не терпит null/undefined в keybindings (0.20 их игнорил) — фильтруем
    // (действия без горячей клавиши: key/cmd = null/undefined → [] → пункт только в контекстном меню).
    keybindings: [action.key, action.cmd].filter(function (k) { return k; }),
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

    if (window.editor.diffZoneId) {

      window.editor.removeOverlayWidget(window.inlineDiffWidget);
      window.inlineDiffWidget = null;
      window.inlineDiffEditor = null;

      window.editor.changeViewZones(function (changeAccessor) {
        changeAccessor.removeZone(window.editor.diffZoneId);
        window.editor.diffZoneId = 0;
      });

    }

  }

  window.editor.onMouseMove(e => {
      
    newReviewDecoration(e);
            
  });

  window.editor.onKeyDown(e => editorOnKeyDown(e));

  window.editor.onDidChangeModelContent(e => {

    aiInlineProvider.recordContentChange(
      window.editor.getModel(),
      e,
      window.aiInlineProgrammaticChangeDepth > 0
    );

    calculateDiff();

    if (window.getOption('generateModificationEvent'))
      window.sendEvent('EVENT_CONTENT_CHANGED', '');

    checkBookmarksAfterRemoveLine(e);
    checkBreakpointsAfterRemoveLine(e);
    window.updateBookmarks(undefined);
    window.updateBreakpoints(undefined);

    setOption('lastContentChanges', e);

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
    checkOnLinkClick(element);    

    if (e.event.detail == 2 && element.classList.contains('line-numbers')) {
      let line = e.target.position.lineNumber;
      window.updateBookmarks(line);
      window.updateBreakpoints(line);
    }

    if (element.classList.contains('diff-navi')) {
      createDiffWidget(e);
    }

    if (element.classList.contains('add-review')) {
      createReviewWidget(e.target.position.lineNumber);
    }

  });

  window.editor.onDidScrollChange(e => {
        
    if (e.scrollTop == 0) {
      window.scrollToTop();
    }

  });

  window.editor.onDidType(text => {

    if (text === '\n') {
      checkNewStringLine();
      checkBookmarksAfterNewLine();
      checkBreakpointsAfterNewLine();
    }

  });

  window.editor.onDidChangeCursorSelection(e => {

    aiInlineProvider.cursorChanged();

    updateStatusBar();
    onChangeSnippetSelection(e);
    updateSelectedQueryDelimiters(e);
    updateBlockHighlights();
    
  });

  window.editor.onDidLayoutChange(e => {

    setTimeout(() => { resizeStatusBar(); } , 50);

  })

  window.editor.onDidPaste(e => {
    onDidPaste(e);
  });

  // 0.55: гасим пустой suggest-виджет («No suggestions»). При ПЕРЕ-триггере автодополнения
  // (после updateMetadata в потоке метаданных консоли, или командой suggest_type у элемента)
  // явный editor.action.triggerSuggest с пустым результатом показывал висящий пустой блок.
  // Ловим onDidSuggest модели с пустой completionModel и отменяем: обработчики Emitter
  // выполняются синхронно, поэтому show+cancel проходят ДО отрисовки — блок не мелькает.
  // (Наш провайдер уже возвращает undefined на пусто, но это не гасит ЯВНЫЙ триггер.)
  try {
    let suggestCtrl = window.editor.getContribution('editor.contrib.suggestController');
    if (suggestCtrl && suggestCtrl.model && typeof suggestCtrl.model.onDidSuggest === 'function') {
      suggestCtrl.model.onDidSuggest(function (e) {
        try {
          if (e && !e.triggerOptions.shy && e.completionModel && e.completionModel.items.length === 0)
            suggestCtrl.model.cancel();
        } catch (err) { /* ignore */ }
      });
    }
  } catch (e) { /* ignore */ }

}
// #endregion
  
// #region non-public functions
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

  if (!model || model.getLanguageId() != 'bsl')
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

function getKeywordBracketInfo(model, lineNumber) {

  const lineContent = model.getLineContent(lineNumber);
  const match = lineContent.match(languages.bsl.keywordBracketRegExp);

  if (!match)
    return null;

  const word = match[1].toLowerCase();
  const startColumn = match[0].length - match[1].length + 1;
  const endColumn = startColumn + match[1].length;
  const range = new monaco.Range(lineNumber, startColumn, lineNumber, endColumn);

  for (const group of languages.bsl.keywordBracketGroups)
    if (group.open.some(w => w === word))
      return { type: group.type, isClose: false, range: range };

  for (const group of languages.bsl.keywordBracketGroups)
    if (group.close.some(w => w === word))
      return { type: group.type, isClose: true, range: range };

  return null;

}

function getKeywordBlock(model, activeRange) {

  const stack = [];

  for (let lineNumber = 1; lineNumber <= model.getLineCount(); lineNumber++) {
    const info = getKeywordBracketInfo(model, lineNumber);

    if (!info)
      continue;

    if (!info.isClose) {
      stack.push({ type: info.type, start: info.range });
      continue;
    }

    const openBlock = stack.pop();

    if (!openBlock || openBlock.type != info.type)
      continue;

    if (openBlock.start.equalsRange(activeRange) || info.range.equalsRange(activeRange))
      return { type: openBlock.type, start: openBlock.start, end: info.range };
  }

  return null;

}

function getContainingKeywordBlock(model, position) {

  const stack = [];
  let result = null;

  for (let lineNumber = 1; lineNumber <= model.getLineCount(); lineNumber++) {
    const info = getKeywordBracketInfo(model, lineNumber);

    if (!info)
      continue;

    if (!info.isClose) {
      stack.push({ type: info.type, start: info.range });
      continue;
    }

    const openBlock = stack.pop();

    if (!openBlock || openBlock.type != info.type)
      continue;

    const fullRange = new monaco.Range(
      openBlock.start.startLineNumber,
      openBlock.start.startColumn,
      info.range.endLineNumber,
      info.range.endColumn
    );

    if (rangeContainsPosition(fullRange, position))
      result = { type: openBlock.type, start: openBlock.start, end: info.range };
  }

  return result;

}

function getKeywordBlockContext(active_editor = getActiveEditor()) {

  if (!active_editor || !active_editor.getModel)
    return null;

  const model = active_editor.getModel();

  if (!model || model.getLanguageId() != 'bsl')
    return null;

  const position = active_editor.getPosition();
  const keywordInfo = getKeywordBracketInfo(model, position.lineNumber);

  if (keywordInfo && keywordInfo.range.containsPosition(position)) {
    const block = getKeywordBlock(model, keywordInfo.range);

    if (block)
      return {
        editor: active_editor,
        position: position,
        keywordInfo: keywordInfo,
        block: block,
        fromKeyword: true
      };
  }

  const containingBlock = getContainingKeywordBlock(model, position);

  if (!containingBlock)
    return null;

  return {
    editor: active_editor,
    position: position,
    keywordInfo: null,
    block: containingBlock,
    fromKeyword: false
  };

}

function jumpToKeywordBracket(active_editor = getActiveEditor()) {

  const context = getKeywordBlockContext(active_editor);

  if (!context)
    return false;

  let target = null;

  if (context.fromKeyword) {
    target = context.keywordInfo.isClose
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

function selectToKeywordBracket(active_editor = getActiveEditor()) {

  const context = getKeywordBlockContext(active_editor);

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

function updateBlockHighlights(active_editor = getActiveEditor()) {

  if (!active_editor || !active_editor.getModel)
    return;

  const model = active_editor.getModel();
  const selection = active_editor.getSelection();

  if (!model || !selection || !selection.isEmpty() || model.getLanguageId() != 'bsl') {
    clearIfHighlights(active_editor);
    return;
  }

  const ranges = [];

  const ifContext = getIfBlockContext(active_editor);

  if (ifContext && ifContext.ranges && ifContext.ranges.length)
    ranges.push(...ifContext.ranges);

  const keywordContext = getKeywordBlockContext(active_editor);

  if (keywordContext)
    ranges.push(keywordContext.block.start, keywordContext.block.end);

  if (ranges.length == 0) {
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

window.generateEscapeEvent = function() {

  let position = getActiveEditor().getPosition();
  let bsl = new bslHelper(getActiveEditor().getModel(), position);

  let eventParams = {
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

  if (endLineNumber >= startLineNumber) {
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

window.disposeEditor = function() {

  if (window.editor) {

    aiInlineProvider.dispose();

    if (window.editor.navi) {
      // 0.55: НЕ диспозим суб-редакторы вручную — их владелец diff-редактор снимет сам при своём
      // dispose(). Модели original/modified создавали мы (createModel в compare()), поэтому снимаем
      // их отдельно, взяв с diff-редактора getModel() → {original, modified} ДО его dispose().
      // Прежний ручной обход `getOriginalEditor().getModel().dispose()` на 0.55 падал: getModel()
      // суб-редактора мог вернуть null → TypeError в compare() при ВЫХОДЕ, и режим сравнения не
      // закрывался (сначала здесь, ранее — в getCurrentThemeName).
      let diff_model = window.editor.getModel();
      window.editor.dispose();
      if (diff_model) {
        if (diff_model.original) diff_model.original.dispose();
        if (diff_model.modified) diff_model.modified.dispose();
      }
    }
    else {
      hiddenBlocksController.disposeEditor(window.editor);
      window.editor.getModel().dispose();
      window.editor.dispose();
    }

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

        sendEvent('EVENT_ON_INSERT_SNIPPET', event);

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
      // 0.55: _modelData.model._commandManager.currentOpenStackElement умер (undo перестроен).
      // Сшиваем очистку с элементом undo вставки: popUndoStop() переоткрывает элемент вставки,
      // bslHelper.setText → executeEdits добавляет очистку в него, pushUndoStop() закрывает —
      // один Ctrl+Z откатывает вставку+очистку. window.setText НЕЛЬЗЯ: он делает pushUndoStop ДО
      // правки, и очистка ушла бы в отдельный шаг отмены.
      window.editor.popUndoStop();
      bslHelper.setText(query.join('\n'), e.range, true);
      window.editor.pushUndoStop();
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

  window.suggestObserver = new MutationObserver(function (mutations) {

    mutations.forEach(function (mutation) {

      decorateSuggestWidgetRows();

      if (fire_event && mutation.target.classList
        && mutation.target.classList.contains('monaco-list-rows')
        && mutation.addedNodes.length) {
        let element = mutation.addedNodes[0];
        if (element.classList.contains('monaco-list-row') && element.classList.contains('focused')) {
          removeSuggestListInactiveDetails();
          window.generateEventWithSuggestData('EVENT_ON_ACTIVATE_SUGGEST_ROW', 'focus', element);
          let alwaysDisplaySuggestDetails = window.getOption('alwaysDisplaySuggestDetails');
          if (alwaysDisplaySuggestDetails) {
            document.querySelectorAll('.monaco-list-rows .details-label').forEach(function (node) {
              node.classList.add('inactive-detail');
            });
            let focusedDetails = document.querySelector('.monaco-list-rows .focused .details-label');
            if (focusedDetails)
              focusedDetails.classList.remove('inactive-detail');
          }
        }
      }
      else if (fire_event && mutation.target.classList
        && (mutation.target.classList.contains('type') || mutation.target.classList.contains('docs'))) {
        let element = document.querySelector('.monaco-list-rows .focused');
        if (element) {
          // 0.55: p.type/p.docs теперь внутри overlay .suggest-details (не .details в .suggest-widget).
          if (hasParentWithClass(mutation.target, 'suggest-details')) {
            window.generateEventWithSuggestData('EVENT_ON_DETAIL_SUGGEST_ROW', 'focus', element);
          }
        }
      }

    });

  });

  window.suggestObserver.observe(document, {
    childList: true,
    subtree: true,
  });

}
function startStopSuggestSelectionObserver() {

  // 0.55: getSuggestWidget() = сам виджет (не .widget); метод onListMouseDownOrTap →
  // _onListMouseDownOrTap. Override инстанс-свойства работает: список зовёт
  // this._onListMouseDownOrTap(e) с динамическим резолвом в момент вызова.
  let widget = getSuggestWidget();

  if (widget) {

    let fire_event = window.getOption('generateSelectSuggestEvent');

    if (!widget.onListMouseDownOrTapOrig)
      widget.onListMouseDownOrTapOrig = widget._onListMouseDownOrTap;

    widget._onListMouseDownOrTap = function (e) {
      let element = getParentWithClass(e.browserEvent.target, 'monaco-list-row');
      let suggestItem = getSuggestItemByRow(element);

      if (element && fire_event)
        window.generateEventWithSuggestData('EVENT_ON_SELECT_SUGGEST_ROW', 'selection', element);

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

  // 0.55: приватный _standaloneKeybindingService.addDynamicKeybinding сменил сигнатуру и
  // безусловно регистрирует команду (при handler===undefined бросает Error). Публичный путь —
  // monaco.editor.addKeybindingRules: правило {keybinding:0, command:'-'+cmd} снимает дефолтную
  // привязку команды при любом ключе, второе правило вешает новый ключ (ПЕРЕбиндинг как в 0.20).
  monaco.editor.addKeybindingRules([
    { keybinding: 0, command: '-' + command },
    { keybinding: keybinding, command: command }
  ]);

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

  // 0.55.1: реальный SuggestWidget живёт в контрибуции suggestController (WindowIdleValue.value);
  // _contentWidgets хранит лишь SuggestContentWidget-обёртку. Возвращаем сам виджет (или null) —
  // поэтому вызывающие используют getSuggestWidget() напрямую, без .widget. isInitialized не
  // форсирует создание (до первого показа подсказок вернём null).
  let controller = window.editor.getContribution('editor.contrib.suggestController');

  if (controller && controller.widget && controller.widget.isInitialized)
    return controller.widget.value;

  return null;

}

function getSuggestItemByRow(row) {

  if (!row)
    return null;

  let widget = getSuggestWidget();

  if (!widget || !widget._list)
    return null;

  let rowId = parseInt(row.getAttribute('data-index'), 10);

  if (isNaN(rowId) || rowId < 0 || rowId >= widget._list.length)
    return null;

  return widget._list.element(rowId);

}

function getFocusedSuggestItem() {

  return getSuggestItemByRow(document.querySelector('.suggest-widget .monaco-list-row.focused'));

}

function isEventSuggestItem(suggestItem) {

  return suggestItem
    && suggestItem.completion
    && suggestItem.completion.eventSuggestion;

}

function handleEventSuggestSelection(suggestItem) {

  if (!isEventSuggestItem(suggestItem))
    return false;

  let position = window.editor.getPosition();
  let bsl = new bslHelper(window.editor.getModel(), position);
  let completion = suggestItem.completion;
  let eventParams = {
    current_word: bsl.word,
    last_word: bsl.lastRawExpression,
    last_expression: bsl.lastExpression,
    position: position
  };

  window.hideSuggestionsList();
  window.sendEvent(completion.eventName, eventParams);

  setTimeout(() => {
    window.editor.focus();
  }, 0);

  return true;

}

function decorateSuggestWidgetRows() {

  let rows = document.querySelectorAll('.suggest-widget .monaco-list-row');

  rows.forEach(function (rowNode) {
    let suggestItem = getSuggestItemByRow(rowNode);
    let completion = suggestItem ? suggestItem.completion : null;
    let iconNode = getChildWithClass(rowNode, 'suggest-icon');

    rowNode.classList.remove('event-suggestion');

    if (iconNode && iconNode.bslCustomCodicon) {
      if (iconNode.classList.contains(iconNode.bslCustomCodicon)) {
        iconNode.className = '';
        iconNode.bslDefaultClasses.forEach(function (className) {
          iconNode.classList.add(className);
        });
      }

      iconNode.bslCustomCodicon = null;
      iconNode.bslDefaultClasses = null;
    }

    if (isEventSuggestItem(suggestItem))
      rowNode.classList.add('event-suggestion');

    if (iconNode && completion && completion.codicon) {
      iconNode.bslDefaultClasses = Array.from(iconNode.classList);
      iconNode.bslCustomCodicon = completion.codicon;
      iconNode.className = '';
      iconNode.classList.add('suggest-icon');
      iconNode.classList.add('codicon');
      iconNode.classList.add(completion.codicon);
    }
  });

}

function getParameterHintsWidget() {

  return editor._contentWidgets['editor.widget.parameterHintsWidget'];

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

    let widget = getSuggestWidget();

    if (widget) {

      // 0.55: widget.list → widget._list; элемент по индексу — List.element(idx). row_id —
      // строка из data-index, приводим к числу.
      let idx = parseInt(row_id);

      if (idx < widget._list.length) {
        let item = widget._list.element(idx);
        if (item)
          insert_text = item.completion.insertText;
      }

    }

  }

  let eventParams = {
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
    // 0.55: панель доков — overlay .suggest-details-container (docs-side/.details мертвы);
    // её наличие в DOM = открыта (add/removeOverlayWidget при show/hide).
    eventParams['sideDetailIsOpened'] = (null != document.querySelector('.suggest-details-container'));

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

function checkOnLinkClick(element) {

  if (element.tagName.toLowerCase() == 'a') {

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
    window.editor.diffCount = (window.editor.getLineChanges() || []).length;
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

    updateBlockHighlights(getActiveDiffEditor());
    updateStatusBar();

  }

}

function diffEditorOnDidLayoutChange(e) {

  setTimeout(() => { resizeStatusBar(); } , 50);

}

// Monaco 0.40: IDiffEditor.getDiffLineInformationForModified/Original удалены. Точный порт
// DiffEditorWidget._getEquivalentLineFor*LineNumber из Monaco 0.20 (бинарный поиск изменения
// at-or-before + интерполяция внутри блока) поверх getLineChanges(). forModified=true: строка
// modified-редактора → эквивалент в original (и наоборот). Хелпер НИКОГДА не возвращает null
// (getLineChanges() в 0.55 отдаёт null до конца async-вычисления — вызывающие берут результат
// без null-check), поэтому пустой lineChanges → тождественный номер строки.
function getLineChangeAtOrBefore(lineChanges, lineNumber, startExtractor) {
  if (lineChanges.length === 0 || lineNumber < startExtractor(lineChanges[0]))
    return null;
  let min = 0, max = lineChanges.length - 1;
  while (min < max) {
    let mid = Math.floor((min + max) / 2);
    let midStart = startExtractor(lineChanges[mid]);
    let midEnd = (mid + 1 <= max) ? startExtractor(lineChanges[mid + 1]) : 1073741824;
    if (lineNumber < midStart) max = mid - 1;
    else if (lineNumber >= midEnd) min = mid + 1;
    else { min = mid; max = mid; }
  }
  return lineChanges[min];
}

function getEquivalentDiffLine(lineChanges, lineNumber, forModified) {
  if (!lineChanges || lineChanges.length === 0)
    return lineNumber;
  let lineChange = getLineChangeAtOrBefore(
    lineChanges, lineNumber,
    forModified
      ? function (c) { return c.modifiedStartLineNumber; }
      : function (c) { return c.originalStartLineNumber; }
  );
  if (!lineChange)
    return lineNumber;
  let originalEquivalent = lineChange.originalStartLineNumber + (lineChange.originalEndLineNumber > 0 ? -1 : 0);
  let modifiedEquivalent = lineChange.modifiedStartLineNumber + (lineChange.modifiedEndLineNumber > 0 ? -1 : 0);
  let originalLength = (lineChange.originalEndLineNumber > 0 ? (lineChange.originalEndLineNumber - lineChange.originalStartLineNumber + 1) : 0);
  let modifiedLength = (lineChange.modifiedEndLineNumber > 0 ? (lineChange.modifiedEndLineNumber - lineChange.modifiedStartLineNumber + 1) : 0);
  let sourceEquivalent = forModified ? modifiedEquivalent : originalEquivalent;
  let targetEquivalent = forModified ? originalEquivalent : modifiedEquivalent;
  let sourceLength = forModified ? modifiedLength : originalLength;
  let targetLength = forModified ? originalLength : modifiedLength;
  let delta = lineNumber - sourceEquivalent;
  return (delta <= sourceLength)
    ? targetEquivalent + Math.min(delta, targetLength)
    : targetEquivalent + targetLength - sourceLength + delta;
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

  if ((e.keyCode == 3 || e.keyCode == 2) && window.isSuggestWidgetVisible()) {
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
    aiInlineProvider.cancel('hidden');
    window.generateEscapeEvent();
    setFindWidgetDisplay('none');
    window.hideSuggestionsList();
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
      // 0.55: addAction не терпит null/undefined в keybindings (0.20 их игнорил) — фильтруем
      // (действия без горячей клавиши: key/cmd = null/undefined → [] → пункт только в контекстном меню).
      keybindings: [action.key, action.cmd].filter(function (k) { return k; }),
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

    let dom = window.statusBarWidget.domNode;
    if (!dom) return;

    // Структурная причина пустого статус-бара в поле 1С устранена в createStatusBarWidget (увод из
    // 0-высотного overlay-контейнера Monaco в корень редактора). Здесь — дополнительно: на смену
    // статуса ПЕРЕСОЗДАЁМ дочерний узел, а не мутируем textContent существующего — зеркалим то, что
    // рисует suggest (виртуализированные строки Monaco пересоздаёт), т.к. в старом WebKit смена
    // textContent у постоянного узла может не пере-растеризоваться.
    let child = dom.firstElementChild;
    if (child && child.textContent === status)
      return; // без изменений — лишний churn не нужен

    let fresh = document.createElement('div');
    fresh.style.margin = 'auto 10px';
    fresh.textContent = status;
    if (child)
      dom.replaceChild(fresh, child);
    else
      dom.appendChild(fresh);
  }

}

function resizeStatusBar() {

  if (window.statusBarWidget) {

    let element = window.statusBarWidget.domNode;
    if (!element) return;

    // Позиционируем через bottom/right (плашка — absolute-ребёнок корня редактора, полная высота):
    // при overlapScroll (дефолт) bottom/right='0', иначе с отступом под скроллбары.
    let newBottom, newRight;
    if (window.statusBarWidget.overlapScroll) {
      newBottom = '0';
      newRight = '0';
    }
    else {
      let layout = getActiveEditor().getLayoutInfo();
      newBottom = layout.horizontalScrollbarHeight + 'px';
      newRight = layout.verticalScrollbarWidth + 'px';
    }

    // Поле 1С (старый WebKit): лишняя запись стиля КОНТЕЙНЕРА статус-бара рвёт растеризацию его
    // текста (тот же класс, что resetSuggestWidgetDisplay у suggest). Пишем ТОЛЬКО при реальном
    // изменении — при overlapScroll bottom/right не меняются, поэтому обычно не пишем вовсе.
    if (element.style.bottom !== newBottom)
      element.style.bottom = newBottom;
    if (element.style.right !== newRight)
      element.style.right = newRight;

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

  return getActiveEditor()._themeService.getColorTheme().themeName;

}

function getCurrentThemeName() {

  let queryPostfix = '-query';
  // 0.55: StandaloneThemeService.getTheme() → getColorTheme(); поле _themeService и .themeName живы.
  // ВАЖНО: в режиме сравнения window.editor — это diff-редактор, у которого _themeService НЕТ
  // (он есть только у код-редакторов). getActiveEditor() отдаёт код-редактор в обоих режимах (в
  // diff — модифицированный/исходный суб-редактор), поэтому тема читается и при ВЫХОДЕ из сравнения.
  // Иначе compare() (выключение) падал здесь ещё до disposeEditor() и режим сравнения не закрывался.
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

    if (window.editor.diffTimer)
      clearTimeout(window.editor.diffTimer);

    window.editor.diffTimer = setTimeout(() => {
              
      if (!window.diffEditor) {
        window.diffEditor = monaco.editor.createDiffEditor(document.createElement("div"));
        window.diffEditor.onDidUpdateDiff(() => {
          getDiffChanges();
        });
      }

      window.diffEditor.setModel({
        original: monaco.editor.createModel(window.editor.originalText),
        modified: window.editor.getModel()
      });

    }, 50);

  }

}

function refreshFoldingState() {

  const folding_enabled = !window.getOption('disableFolding');
  const editors = window.editor.navi
    ? [window.editor.getModifiedEditor(), window.editor.getOriginalEditor()]
    : [window.editor];

  editors.forEach((standalone_editor) => {
    standalone_editor.updateOptions({ folding: folding_enabled });
    standalone_editor.trigger('', 'editor.unfoldAll');
  });

}

function isShowDiffDecorationsEnabled() {

  return window.getOption('showDiffDecorations') !== false;

}

function createStatusBarWidget(overlapScroll) {

  // В «Поле HTML документа» 1С (старый WebKit ~Safari 11) статус-бар как overlay-виджет Monaco
  // оставался ПУСТЫМ: контейнер .overlayWidgets имеет height:0 (Monaco задаёт ему в render()
  // только width), и поле не композитит содержимое, вылезающее за 0-высотный контейнер через
  // absolute-позиционирование. (suggest в поле рисуется, т.к. с fixedOverflowWidgets живёт в
  // ДРУГОМ, полноразмерном контейнере overflowing-виджетов — вот почему прошлые фиксы, оставлявшие
  // бар в .overlayWidgets, не помогали.) Поэтому вешаем плашку СВОИМ absolute-элементом прямо в
  // корневой DOM редактора (.monaco-editor, position:relative, полная высота) и позиционируем
  // через bottom — авто-следование за ресайзом, без записи top на каждый layout (та запись рвала
  // растеризацию текста, тот же класс бага, что resetSuggestWidgetDisplay у suggest).
  let host = window.editor.navi
    ? window.editor.getModifiedEditor().getDomNode()
    : window.editor.getDomNode();

  let dom = document.createElement('div');
  dom.classList.add('statusbar-widget');
  dom.style.position = 'absolute';
  dom.style.height = '20px';
  dom.style.minWidth = '125px';
  dom.style.textAlign = 'center';
  dom.style.zIndex = '35';
  dom.style.fontSize = '12px';
  dom.style.pointerEvents = 'none'; // не перехватывать клики/скролл редактора

  window.statusBarWidget = { domNode: dom, overlapScroll: overlapScroll };

  host.appendChild(dom);
  resizeStatusBar(); // выставить bottom/right под overlapScroll
  updateStatusBar(); // создать дочерний узел с текстом (свежий узел красится в поле)

}

function createDiffWidget(e) {

  if (window.inlineDiffWidget) {
    
    window.editor.removeDiffWidget();

  }
  else {

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

    window.editor.changeViewZones(function (changeAccessor) {

      let domNode = document.getElementById('diff-zone');

      if (!domNode) {
        domNode = document.createElement('div');
        domNode.setAttribute('id', 'diff-zone');
      }

      window.editor.removeDiffWidget();

      window.editor.diffZoneId = changeAccessor.addZone({
        afterLineNumber: line_number,
        afterColumn: 1,
        heightInLines: 10,
        domNode: domNode,
        onComputedHeight: function(height) {
          if (window.inlineDiffWidget) {
            if (height == 0)
              window.inlineDiffWidget.domNode.classList.add('invisible');
            else
              window.inlineDiffWidget.domNode.classList.remove('invisible');
          }
        },
        onDomNodeTop: function (top) {
          if (window.inlineDiffWidget) {
            let layout = window.editor.getLayoutInfo();
            const width = (layout.contentWidth + layout.decorationsWidth + layout.lineNumbersWidth - layout.verticalScrollbarWidth);
            window.inlineDiffWidget.domNode.style.top = top + 'px';
            window.inlineDiffWidget.domNode.style.width = width + 'px';
          }
        }
      });

    });

    setTimeout(() => {

      window.inlineDiffWidget = {
        domNode: null,
        getId: function () {
          return 'bsl.diff.widget';
        },
        getDomNode: function () {

          if (!this.domNode) {

            this.domNode = document.createElement('div');
            this.domNode.setAttribute("id", "diff-widget");

            let layout = window.editor.getLayoutInfo();
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
            close_button.onclick = window.editor.removeDiffWidget;
            header.appendChild(close_button);

            this.domNode.appendChild(header);

            let body = document.createElement('div');
            body.classList.add('diff-body');
            body.classList.add(class_name);            
            this.domNode.appendChild(body);

            setTimeout(() => {

              let language_id = window.getCurrentLanguageId();

              window.inlineDiffEditor = monaco.editor.createDiffEditor(body, {
                theme: currentTheme,
                language: language_id,
                contextmenu: false,
                automaticLayout: true,
                renderSideBySide: false,
                useInlineViewWhenSpaceIsLimited: false,
                renderMarginRevertIcon: getDiffEditorOption('renderMarginRevertIcon'),
                renderGutterMenu: false,
                hideUnchangedRegions: { enabled: getDiffEditorOption('hideUnchangedRegions') },
                defaultColorDecorators: 'never',
                unicodeHighlight: {
                  ambiguousCharacters: false,
                  invisibleCharacters: false,
                  nonBasicASCII: false
                },
                useShadowDOM: false,
                stickyScroll: {
                  enabled: false
                }
              });

              let originalModel = monaco.editor.createModel(window.editor.originalText);
              let modifiedModel = window.editor.getModel();

              monaco.editor.setModelLanguage(originalModel, language_id);

              window.inlineDiffEditor.setModel({
                original: originalModel,
                modified: modifiedModel
              });

              // Monaco 0.45: createDiffNavigator удалён; navi — булев флаг diff-режима.
              window.inlineDiffEditor.navi = true;

              setTimeout(() => {
                window.inlineDiffEditor.revealLineInCenter(line_number);
              }, 10);

              if (reveal_line)
                editor.revealLine(line_number + 1);

            }, 10);

          }

          return this.domNode;

        },
        getPosition: function () {
          return null;
        }
      };

      window.editor.addOverlayWidget(window.inlineDiffWidget);

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
        sendEvent("EVENT_ON_REVIEW_CHANGED", "");
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
        sendEvent("EVENT_ON_REVIEW_CHANGED", "");
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
          let width = layout.width - scrollWidth - layout.minimap.minimapWidth;
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

function beginAIInlineProgrammaticChange() {
  window.aiInlineProgrammaticChangeDepth++;
}

function endAIInlineProgrammaticChange() {
  window.aiInlineProgrammaticChangeDepth = Math.max(0, window.aiInlineProgrammaticChangeDepth - 1);
}

function eraseTextBeforeUpdate() {

  window.editor.checkBookmarks = false;
  bslHelper.setText('', window.editor.getModel().getFullModelRange(), false);
  window.editor.checkBookmarks = true;

}

function showVariablesDisplay() {

  document.getElementById("container").style.height = "70%";
  getActiveEditor().layout();
  document.getElementById("display-title").innerHTML = window.engLang ? "Variables" : "Просмотр значений переменных:"
  let element = document.getElementById("display");
  element.style.height = "30%";
  element.style.display = "block";

}

function hideVariablesDisplay() {
  
  document.getElementById("container").style.height = "100%";
  getActiveEditor().layout();
  let element = document.getElementById("display");
  element.style.height = "0";
  element.style.display = "none";
  window.treeview.dispose();
  window.treeview = null;

}

function setThemeVariablesDisplay(theme) {

  if (0 < theme.indexOf('dark'))
    document.getElementById("display").classList.add('dark');
  else
    document.getElementById("display").classList.remove('dark');

}
// #endregion

// #region browser events
document.onclick = function (e) {

  // 0.55: иконка закрытия find-виджета — codicon 'widget-close' ('codicon-close' у кнопки
  // закрытия панели доков подсказок, но её отсекает guard hasParentWithClass('find-widget')).
  if (e.target.classList.contains('codicon-widget-close')) {

    if (hasParentWithClass(e.target, 'find-widget'))
      setFindWidgetDisplay('none');

  }
  else if (e.target.id == 'event-button' && window.events_queue.length) {
    let eventData1C = window.events_queue.shift();
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

// Точечные патчи DOM/поведения под встроенный WebKit «Поля HTML документа» 1С (снять
// 1С-скроллбар, отключить автоскролл средней кнопкой). isConnected-гвард вынесен в
// polyfills.js (нужен ДО top-level createEditor). Вызывать в конце — после создания редактора.
patchWebKit1C();
