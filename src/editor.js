//require.config( { 'vs/nls': { availableLanguages: { '*': "ru" } } } );

import "@babel/polyfill";
import languages from './bsl_language';
import { getActions, permanentActions } from './actions';
import './decorations.css'
import { setLocaleData } from 'monaco-editor-nls';
import ruLocale from 'monaco-editor-nls/locale/ru';

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
window.generateModificationEvent = false;
window.readOnlyMode = false;
window.queryMode = false;
window.DCSMode = false;
window.version1C = '';
window.contextActions = [];
window.customHovers = {};
window.customSignatures = {};
window.originalText = '';
window.metadataRequests = new Map();
window.customSuggestions = [];
window.contextMenuEnabled = false;
window.err_tid = 0;
window.suggestObserver = null;
window.signatureObserver = null;
window.generateBeforeShowSuggestEvent = false;
window.generateSelectSuggestEvent = false;
window.generateBeforeHoverEvent = false;
window.generateBeforeSignatureEvent = false;
window.statusBarWidget = null;
window.ctrlPressed = false;
window.altPressed = false;
window.shiftPressed = false;  
window.signatureVisible = true;
window.currentBookmark = -1;
window.activeSuggestionAcceptors = [];
window.diffEditor = null;  
window.inlineDiffEditor = null;
window.inlineDiffWidget = null;
window.events_queue = [];
window.colors = {};
// #endregion

// #region public API
window.reserMark = function() {

  clearInterval(window.err_tid);
  window.editor.updateDecorations([]);

}

window.sendEvent = function(eventName, eventParams) {

  window.events_queue.push({event : eventName, params: eventParams});
  document.getElementById('event-button').click();
  
}

window.fireEvent = function() {

  let button = document.getElementById('event-button');
  button.click();


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

  const readOnly = window.readOnlyMode;
  const modEvent = window.generateModificationEvent;
  window.editor.checkBookmarks = false;   

  window.reserMark();  

  if (readOnly)
    window.setReadOnly(false);

  if (modEvent)    
    window.enableModificationEvent(false);

  eraseTextBeforeUpdate();
  
  if (clearUndoHistory)
    window.editor.setValue(txt);
  else
    window.setText(txt);

  if (window.getText())
    checkBookmarksCount();
  else
    window.removeAllBookmarks();

  if (modEvent)    
    window.enableModificationEvent(true);

  if (readOnly)
    window.setReadOnly(true);

  window.editor.checkBookmarks = true;

}

window.setContent = function(text) {

  const readOnly = window.readOnlyMode;
  const modEvent = window.generateModificationEvent;
  
  if (readOnly)
    window.setReadOnly(false);

  if (modEvent)    
    window.enableModificationEvent(false);

  window.editor.setValue(text)

  if (modEvent)    
    window.enableModificationEvent(true);

  if (readOnly)
    window.setReadOnly(true);

}

window.eraseText = function () {
  
  window.setText('', window.editor.getModel().getFullModelRange(), false);    

}

window.getText = function(txt) {

  return window.editor.getValue();

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

window.updateSnippets = function (snips, replace = false) {
      
  return bslHelper.updateSnippets(snips, replace);    

}

window.updateCustomFunctions = function (data) {
      
  return bslHelper.updateCustomFunctions(data);

}

window.setTheme = function (theme) {
      
  monaco.editor.setTheme(theme);    

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

window.switchLang = function () {
  
  window.engLang = !window.engLang;

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

}

window.enableQuickSuggestions = function (enabled) {

  window.editor.updateOptions({ quickSuggestions: enabled });

}

window.minimap = function (enabled) {

  window.editor.updateOptions({ minimap: { enabled: enabled } });
  
}

window.enableModificationEvent = function (enabled) {

  window.generateModificationEvent = enabled;

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

window.switchLanguageMode = function(mode) {
  
  let currentTheme = getCurrentThemeName();

  if (window.queryMode && mode == 'query')
    monaco.editor.setModelLanguage(window.editor.getModel(), "bsl_query");
  else if (window.DCSMode && mode == 'dcs')
    monaco.editor.setModelLanguage(window.editor.getModel(), "dcs_query");
  else if (window.queryMode)
    monaco.editor.setModelLanguage(window.editor.getModel(), "bsl_query");
  else if (window.DCSMode)
    monaco.editor.setModelLanguage(window.editor.getModel(), "dcs_query");
  else
    monaco.editor.setModelLanguage(window.editor.getModel(), "bsl");
  
  window.setTheme(currentTheme);

  initContextMenuActions();

}

window.switchQueryMode = function() {
  
  window.queryMode = !window.queryMode;
  window.switchLanguageMode('query');

}

window.switchDCSMode = function() {

  window.DCSMode = !window.DCSMode;
  window.switchLanguageMode('dcs');

}

window.switchXMLMode = function() {
  
  let identifier = window.editor.getModel().getLanguageIdentifier();
  let language_id = 'xml';

  if (identifier.language == 'xml') {
    language_id = window.queryMode ? 'bsl_query' : 'bsl';
  }

  monaco.editor.setModelLanguage(window.editor.getModel(), language_id);
    
}

window.getSelectedText = function() {

  return window.editor.getModel().getValueInRange(window.editor.getSelection());

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

window.getVarsNames = function () {
  
  let bsl = new bslHelper(window.editor.getModel(), window.editor.getPosition());		
  return bsl.getVarsNames(0);    
  
}

window.getSelection = function() {

  return window.editor.getSelection();

}

window.setSelection = function(startLineNumber, startColumn, endLineNumber, endColumn) {
  
  if (endLineNumber <= window.getLineCount()) {
    let range = new monaco.Range(startLineNumber, startColumn, endLineNumber, endColumn);
    window.editor.setSelection(range);
    window.editor.revealLineInCenterIfOutsideViewport(startLineNumber);
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
  window.editor.revealPositionInCenterIfOutsideViewport(startPosition);

  return true;

}

window.selectedText = function(text, keepSelection = false) {

  if (!text)
    
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

window.compare = function (text, sideBySide, highlight, xml = false, markLines = true) {
  
  document.getElementById("container").innerHTML = ''
  let language_id = getLangId();
  let currentTheme = getCurrentThemeName();

  let status_bar = window.statusBarWidget ? true : false;
  let overlapScroll = true
    
  if (status_bar) {
    overlapScroll = window.statusBarWidget.overlapScroll;
    hideStatusBar();
  }

  if (text) {      
    if (xml) {
      language_id = 'xml';
      currentTheme = 'vs';
    }
    let originalModel = window.originalText ? monaco.editor.createModel(window.originalText) : monaco.editor.createModel(window.editor.getModel().getValue());
    let modifiedModel = monaco.editor.createModel(text);
    window.originalText = originalModel.getValue();
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
  }
  else
  {
    createEditor(language_id, originalText, currentTheme);
    initEditorEventListenersAndProperies();
    window.originalText = '';
    window.editor.diffCount = 0;
  }
  window.editor.updateOptions({ readOnly: window.readOnlyMode });
  if (status_bar)
    window.showStatusBar(overlapScroll);
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

window.requestMetadata = function(metadata) {

  let metadata_name = metadata.toLowerCase();
  let request = window.metadataRequests.get(metadata_name);

  if (!request) {
    window.metadataRequests.set(metadata_name, true);
    window.sendEvent("EVENT_GET_METADATA", metadata_name);
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

window.enableSuggestActivationEvent = function(enabled, alwaysDisplayDetails = false) {

  window.editor.alwaysDisplaySuggestDetails = alwaysDisplayDetails;

  if (window.suggestObserver != null) {
    window.suggestObserver.disconnect();
    window.suggestObserver = null;
  }

  onSuggestListMouseOver(enabled);

  if (enabled) {

    window.suggestObserver = new MutationObserver(function (mutations) {

      mutations.forEach(function (mutation) {

        if (mutation.target.classList.contains('monaco-list-rows') && mutation.addedNodes.length) {

          let element = mutation.addedNodes[0];

          if (element.classList.contains('monaco-list-row') && element.classList.contains('focused')) {

            removeSuggestListInactiveDetails();
            window.generateEventWithSuggestData('EVENT_ON_ACTIVATE_SUGGEST_ROW', 'focus', element);

            if (window.editor.alwaysDisplaySuggestDetails) {
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

window.enableBeforeShowSuggestEvent = function(enabled) {
  
  window.generateBeforeShowSuggestEvent = enabled;

}

window.enableSelectSuggestEvent = function(enabled) {
  
  window.generateSelectSuggestEvent = enabled;

  let widget = window.editor._contentWidgets['editor.widget.suggestWidget'].widget;

  if (widget) {

    if (enabled) {
      
      if (!widget.onListMouseDownOrTapOrig)
        widget.onListMouseDownOrTapOrig = widget.onListMouseDownOrTap;
      
      widget.onListMouseDownOrTap = function(e) {          
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

window.enableBeforeHoverEvent = function(enabled) {
  
  window.generateBeforeHoverEvent = enabled;

}

window.enableBeforeSignatureEvent = function(enabled) {
  
  window.generateBeforeSignatureEvent = enabled;

  if (window.signatureObserver != null) {
    window.signatureObserver.disconnect();
    window.signatureObserver = null;
  }

  if (enabled) {

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

window.hideSuggestionsList = function() {

    let widget = document.querySelector('.suggest-widget');
    
    if (widget) {
      widget.style.display = 'hidden';
      widget.style.visibility = 'hidden';
    }

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
  let suggestWidget = window.editor._contentWidgets['editor.widget.suggestWidget'];

  if (suggestWidget && i < suggestWidget.widget.list.view.items.length) {

    let suggest_item = suggestWidget.widget.list.view.items[i];
    suggest_item.element.completion.detail = detailInList;      
    
    if (!documentation)
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

  window.editor[optionName] = optionValue;

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
  monaco.languages.registerCodeLensProvider(language.id, {
    provideCodeLenses: lang.codeLenses.provider, 
    resolveCodeLens: lang.codeLenses.resolver
  });
  monaco.languages.registerColorProvider(language.id, lang.colorProvider);

  if (lang.autoIndentation && lang.indentationRules)
    monaco.languages.setLanguageConfiguration(language.id, {indentationRules: lang.indentationRules});

  monaco.languages.setLanguageConfiguration(language.id, {brackets: lang.brackets, autoClosingPairs: lang.autoClosingPairs});

  if (!window.editor) {

    monaco.editor.onDidCreateEditor(e => {
            
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
        window.snippets = snippets;        
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

    if (window.generateModificationEvent)
      window.sendEvent('EVENT_CONTENT_CHANGED', '');

    checkBookmarksAfterRemoveLine(e);
    window.updateBookmarks(undefined);
        
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

        if (target)
          window.setSelection(position.lineNumber, target.startColumn, position.lineNumber, target.endColumn)

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
    
  });

  window.editor.onDidLayoutChange(e => {

    setTimeout(() => { resizeStatusBar(); } , 50);

  })

}
// #endregion
  
// #region non-public functions
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

  eventParams = {
    trigger: trigger,
    current_word: bsl.word,
    last_word: bsl.lastRawExpression,
    last_expression: bsl.lastExpression,                    
    rows: suggestRows.length ? suggestRows : getSuggestWidgetRows(row),
    altKey: window.altPressed,
    ctrlKey: window.ctrlPressed,
    shiftKey: window.shiftPressed,
    row_id: row ? row.getAttribute('data-index') : ""
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

// Prevent propagation of event to editor if SuggestList was closed in EVENT_ON_SELECT_SUGGEST_ROW event handler https://github.com/salexdv/bsl_console/issues/90
function stopEventIfSuggestListIsClosed(e) {

  element = document.querySelector('.monaco-list-row.focused');
  
  if (!element) {
    //   e.preventDefault() // sometimes it does not help
    e.preventDefault();
    e.stopPropagation();
  }

}

function editorOnKeyDown(e) {

  window.editor.lastKeyCode = e.keyCode;

  if (e.keyCode == 16 && window.editor.getPosition().lineNumber == 1)
    // ArrowUp
    window.scrollToTop();
  else if (e.keyCode == 3 && window.generateSelectSuggestEvent) {
    // Enter
    let element = document.querySelector('.monaco-list-row.focused');
    if (element) {
      e.preventDefault();
      e.stopPropagation();
      setTimeout(() => {
        window.generateEventWithSuggestData('EVENT_ON_SELECT_SUGGEST_ROW', 'selection', element);
      }, 10);
      // stopEventIfSuggestListIsClosed(e);
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
    if (window.generateSelectSuggestEvent) {
      let element = document.querySelector('.monaco-list-row.focused');
      if (element) {
        window.generateEventWithSuggestData('EVENT_ON_SELECT_SUGGEST_ROW', 'selection', element);
        stopEventIfSuggestListIsClosed(e);
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

  if (!window.queryMode && !window.DCSMode) {

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

  let find_widget = getActiveEditor()._overlayWidgets['editor.contrib.findWidget'];
  
  if (find_widget)
    find_widget.widget._domNode.style.display = value;

}

function setFindWidgetDisplay(value) {

  let find_widget = getActiveEditor()._overlayWidgets['editor.contrib.findWidget'];
  
  if (find_widget)
    find_widget.widget._domNode.style.display = value;

}

function focusFindWidgetInput() {

  let find_widget = getActiveEditor()._overlayWidgets['editor.contrib.findWidget'];

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

  if ((window.queryMode || window.DCSMode) && currentTheme.indexOf(queryPostfix) == -1)
    currentTheme += queryPostfix;
  else if (!window.queryMode && !window.DCSMode && currentTheme.indexOf(queryPostfix) >= 0)
    currentTheme = currentTheme.replace(queryPostfix, '');

  return currentTheme;

}

function getLangId() {

	let lang_id = '';

	if (window.queryMode)
		lang_id = 'bsl_query';
	else if (window.DCSMode)
		lang_id = 'dcs_query';
	else
		lang_id = 'bsl';

	return lang_id;

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
        this.domNode.append(pos);

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

              let language_id = getLangId();              

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

  return; // Disabled until fix https://github.com/salexdv/bsl_console/issues/190
  let widget = window.editor._contentWidgets['editor.widget.suggestWidget'].widget;

  if (activationEventEnabled) {
    
    if (!window.editor.alwaysDisplaySuggestDetails) {

      widget.listElement.onmouseoverOrig = widget.listElement.onmouseover;
      widget.listElement.onmouseover = function(e) {        
        
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

            if (typeof(widget.listElement.onmouseoverOrig) == 'function')
              widget.listElement.onmouseoverOrig(e);

          }

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

      if (window.generateSelectSuggestEvent) {
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
// #endregion