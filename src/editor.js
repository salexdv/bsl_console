//require.config( { 'vs/nls': { availableLanguages: { '*': "ru" } } } );

import "@babel/polyfill";
import languages from './bsl_language';
import { getActions, permanentActions } from './actions';
import './decorations.css'
import './tree/tree.css'
import './tree/tree.js'
import { setLocaleData } from 'monaco-editor-nls';
import ruLocale from 'monaco-editor-nls/locale/ru';
import Finder from "./finder";
import SnippetsParser from "./parsers";

const monaco = require('monaco-editor/esm/vs/editor/editor.api');

setLocaleData(ruLocale);

window.MonacoEnvironment = {
  getWorkerUrl: function (moduleId, label) {
    return require("blob-url-loader?type=application/javascript!compile-loader?target=worker&emit=false!monaco-editor/esm/vs/editor/editor.worker");
  }
};

// #region global vars 
window.languages = languages;

window.selectionText = '';
window.engLang = false;
window.contextData = new Map();
window.readOnlyMode = false;
window.queryMode = false;
window.DCSMode = false;
window.version1C = '';
window.contextActions = [];
window.customHovers = {};
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
window.snippets = {};
window.bslSnippets = {};
window.treeview = null;
// #endregion

// #region public API
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
  bslHelper.setText(txt, range, usePadding);
  
  if (window.getText())
    checkBookmarksCount();
  else
    window.removeAllBookmarks();
  
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

  eraseTextBeforeUpdate();
  
  if (clearUndoHistory)
    window.editor.setValue(txt);
  else
    window.setText(txt);

  if (window.getText())
    checkBookmarksCount();
  else
    window.removeAllBookmarks();

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

  window.editor.setValue(text)

  if (mod_event)    
    window.setOption('generateModificationEvent', true);

  if (read_only)
    window.setReadOnly(true);

}

window.eraseText = function () {
  
  window.setText('', window.editor.getModel().getFullModelRange(), false);    

}

window.getText = function(txt) {

  return getActiveEditor().getValue();

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

window.init = function(version) {

  window.version1C = version;
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

  let currentTheme = getCurrentThemeName();
  window.setTheme(currentTheme);

  initContextMenuActions();

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
  
  return window.editor.getModel().getLineCount();

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

window.getPositionOffset = function() {

  let position = window.editor.getPosition();
  let v_pos = window.editor.getScrolledVisiblePosition(position);
  let layer = window.editor.getLayoutInfo();
  let top = Math.min(v_pos.top, layer.height);
  let left = Math.min(v_pos.left, layer.width);

  return {top: top, left: left}

}

window.compare = function (text, sideBySide, highlight, markLines = true) {
  
  let language_id = window.getCurrentLanguageId();
  let currentTheme = getCurrentThemeName();
  let previous_options = getActiveEditor().getRawOptions();

  let status_bar = window.statusBarWidget ? true : false;
  let overlapScroll = true
    
  if (status_bar) {
    overlapScroll = window.statusBarWidget.overlapScroll;
    hideStatusBar();
  }

  if (text) {      
    
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
      find: {
        addExtraSpaceOnTop: false
      }
    });    
    if (highlight) {
      monaco.editor.setModelLanguage(originalModel, language_id);
      monaco.editor.setModelLanguage(modifiedModel, language_id);
    }
    window.editor.setModel({
      original: originalModel,
      modified: modifiedModel
    });
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
      setTimeout(() => {
        const modified_line = this.getPosition().lineNumber;
        const diff_info = this.getDiffLineInformationForModified(modified_line);
        const original_line = diff_info ? diff_info.equivalentLineNumber : modified_line;
        if (this.markLines) {
          this.getModifiedEditor().diffDecor.line = modified_line;
          this.getOriginalEditor().diffDecor.line = original_line;
        }
        this.diffEditorUpdateDecorations();
        window.editor.diffCount = window.editor.getLineChanges().length;
      }, 50);
    };
    window.editor.markDiffLines();
    window.editor.getModifiedEditor().onKeyDown(e => diffEditorOnKeyDown(e));
    window.editor.getOriginalEditor().onKeyDown(e => diffEditorOnKeyDown(e));
    window.editor.getModifiedEditor().onDidChangeCursorPosition(e => diffEditorOnDidChangeCursorPosition(e));
    window.editor.getOriginalEditor().onDidChangeCursorPosition(e => diffEditorOnDidChangeCursorPosition(e));
    window.editor.getModifiedEditor().onDidLayoutChange(e => diffEditorOnDidLayoutChange(e));
    window.editor.getOriginalEditor().onDidLayoutChange(e => diffEditorOnDidLayoutChange(e));
    window.setDefaultStyle();
  }
  else
  {
    disposeEditor();
    createEditor(language_id, originalText, currentTheme);
    initEditorEventListenersAndProperies();
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

}

window.triggerHovers = function() {
  
  window.editor.trigger('', 'editor.action.showHover', {});

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
    
    for (const [key, value] of Object.entries(suggestObj)) {

      window.customSuggestions.push({
        label: value.name,
        kind: monaco.languages.CompletionItemKind[value.kind],
        insertText: value.text,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        detail: value.detail,
        documentation: value.documentation,
        filterText: value.hasOwnProperty('filter') ? value.filter : value.name,
        sortText: value.hasOwnProperty('sort') ? value.sort : value.name
      });

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

  setTimeout(() => {

    window.editor[optionName] = optionValue;
    window.editor_options[optionName] = optionValue;

    if (optionName == 'generateBeforeSignatureEvent')
        startStopSignatureObserver();

    if (optionName == 'generateSelectSuggestEvent')
      startStopSuggestSelectionObserver();

    if (optionName == 'disableDefinitionMessage')
      startStopDefinitionMessegeObserver();

  }, 10);

}

window.getOption = function (optionName) {

  return window.editor[optionName];
  
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

  window.editor.trigger('', 'editor.action.jumpToBracket');

}

window.selectToBracket = function () {

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
  else
    calculateDiff();

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

window.formatDocument = function() {

  window.editor.trigger('', 'editor.action.formatDocument');

}

window.isParameterHintsWidgetVisible = function () {

  let content_widget = getParameterHintsWidget();
  return content_widget ? content_widget.widget.visible : false;

}

window.isSuggestWidgetVisible = function() {
  
  return getSuggestWidget().widget.suggestWidgetVisible.get();

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
    window.treeview = new Treeview("#variables-tree", window.editor, "./tree/icons/");
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
// #endregion

// #region init editor
window.editor = undefined;

function createEditor(language_id, text, theme) {

  window.editor = monaco.editor.create(document.getElementById("container"), {
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
    customOptions: true
  });

  changeCommandKeybinding('editor.action.revealDefinition', monaco.KeyCode.F12);
  changeCommandKeybinding('editor.action.peekDefinition', monaco.KeyMod.CtrlCmd | monaco.KeyCode.F12);
  changeCommandKeybinding('editor.action.deleteLines',  monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_L);
  changeCommandKeybinding('editor.action.selectToBracket',  monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KEY_B);

  window.setDefaultStyle();

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
  monaco.languages.registerSignatureHelpProvider(language.id, lang.signatureProvider);
  monaco.languages.registerHoverProvider(language.id, lang.hoverProvider);
  monaco.languages.registerDocumentFormattingEditProvider(language.id, lang.formatProvider);
  monaco.languages.registerColorProvider(language.id, lang.colorProvider);
  monaco.languages.registerDefinitionProvider(language.id, lang.definitionProvider);

  if (lang.autoIndentation && lang.indentationRules)
    monaco.languages.setLanguageConfiguration(language.id, { indentationRules: lang.indentationRules });

  monaco.languages.setLanguageConfiguration(language.id, { brackets: lang.brackets, autoClosingPairs: lang.autoClosingPairs });

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

    window.contextMenuEnabled = window.editor.getRawOptions().contextmenu;

  }

};

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

initEditorEventListenersAndProperies();
// #endregion

// #region editor events
function initEditorEventListenersAndProperies() {

  window.editor.sendEvent = sendEvent;
  window.editor.decorations = [];
  window.editor.bookmarks = new Map();
  window.editor.checkBookmarks = true;
  window.editor.diff_decorations = [];

  window.editor.updateDecorations = function (new_decorations) {

    let permanent_decor = [];

    window.editor.bookmarks.forEach(function (value) {
      permanent_decor.push(value);
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

  window.editor.onKeyDown(e => editorOnKeyDown(e));

  window.editor.onDidChangeModelContent(e => {
    
    calculateDiff();

    if (window.getOption('generateModificationEvent'))
      window.sendEvent('EVENT_CONTENT_CHANGED', '');

    checkBookmarksAfterRemoveLine(e);
    window.updateBookmarks(undefined);

    setOption('lastContentChanges', e);
        
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
    }

    if (element.classList.contains('diff-navi')) {
      createDiffWidget(e);
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
    }

  });

  window.editor.onDidChangeCursorSelection(e => {
    
    updateStatusBar();
    onChangeSnippetSelection(e);
    
  });

  window.editor.onDidLayoutChange(e => {

    setTimeout(() => { resizeStatusBar(); } , 50);

  })

}
// #endregion
  
// #region non-public functions
function disposeEditor() {

  if (window.editor) {

    if (window.editor.navi) {
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

  let widget = getSuggestWidget().widget;

  if (widget) {

    let fire_event = window.getOption('generateSelectSuggestEvent');

    if (fire_event) {

      if (!widget.onListMouseDownOrTapOrig)
        widget.onListMouseDownOrTapOrig = widget.onListMouseDownOrTap;

      widget.onListMouseDownOrTap = function (e) {
        let element = getParentWithClass(e.browserEvent.target, 'monaco-list-row');

        if (element) {
          window.generateEventWithSuggestData('EVENT_ON_SELECT_SUGGEST_ROW', 'selection', element);
        }

        widget.onListMouseDownOrTapOrig(e);

      }

    }
    else if (widget.onListMouseDownOrTapOrig) {

      widget.onListMouseDownOrTap = widget.onListMouseDownOrTapOrig;

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

    const matches = Finder.findMatches(window.editor.getModel(), '^;\\s*');
    
    let color = '#f2f2f2';
    let class_name  = 'query-delimiter';
    
    const current_theme = getCurrentThemeName();
    const is_dark_theme = (0 <= current_theme.indexOf('dark'));

    if (is_dark_theme) {
      class_name = 'query-delimiter-dark';
      color = '#2d2d2d'
    }

    for (let idx = 0; idx < matches.length; idx++) {
      let match = matches[idx];
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

  return window.editor._contentWidgets['editor.widget.suggestWidget'];

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

  standalone_editor.diffDecor.decor = standalone_editor.deltaDecorations(standalone_editor.diffDecor.decor, decorations);

}

function diffEditorUpdateDecorations() {

  deltaDecorationsForDiffEditor(this.getModifiedEditor());
  deltaDecorationsForDiffEditor(this.getOriginalEditor());

}

function diffEditorOnDidChangeCursorPosition(e) {

  if (e.source != 'api') {

    window.editor.getModifiedEditor().diffDecor.position = 0;
    window.editor.getOriginalEditor().diffDecor.position = 0;
    getActiveDiffEditor().diffDecor.position = e.position.lineNumber;
    window.editor.diffEditorUpdateDecorations();
    window.editor.diffCount = window.editor.getLineChanges().length;

    if (editor.getModifiedEditor().getPosition().equals(e.position))
      editor.getOriginalEditor().setPosition(e.position);
    else
      editor.getModifiedEditor().setPosition(e.position);

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

function getCurrentThemeName() {

  let queryPostfix = '-query';
  let currentTheme = window.editor._themeService.getTheme().themeName;
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

  if (window.editor.calculateDiff) {

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
        onDomNodeTop: function (top) {
          if (window.inlineDiffWidget) {
            let layout = window.editor.getLayoutInfo();
            window.inlineDiffWidget.domNode.style.top = top + 'px';          
            window.inlineDiffWidget.domNode.style.width = (layout.contentWidth - layout.verticalScrollbarWidth) + 'px';
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

            this.domNode.style.left = (rect.left - 1) + 'px';
            this.domNode.style.top = rect.top + 'px';
            this.domNode.style.height = rect.height + 'px';
            this.domNode.style.width = (layout.contentWidth - layout.verticalScrollbarWidth) + 'px';

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
                renderSideBySide: false
              });

              let originalModel = monaco.editor.createModel(window.editor.originalText);
              let modifiedModel = window.editor.getModel();

              monaco.editor.setModelLanguage(originalModel, language_id);

              window.inlineDiffEditor.setModel({
                original: originalModel,
                modified: modifiedModel
              });

              window.inlineDiffEditor.navi = monaco.editor.createDiffNavigator(window.inlineDiffEditor, {
                followsCaret: true,
                ignoreCharChanges: true
              });

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

function removeSuggestListInactiveDetails() {

  document.querySelectorAll('.monaco-list-rows .details-label').forEach(function (node) {
    node.classList.remove('inactive-detail');
  });

  document.querySelectorAll('.monaco-list-rows .readMore').forEach(function (node) {
    node.classList.remove('inactive-more');
  });

}

function onSuggestListMouseOver(activationEventEnabled) {

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