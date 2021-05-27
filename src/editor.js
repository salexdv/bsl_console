require.config( { 'vs/nls': { availableLanguages: { '*': "ru" } } } );

define(['bslGlobals', 'bslMetadata', 'snippets', 'bsl_language', 'vs/editor/editor.main', 'actions', 'bslQuery', 'bslDCS'], function () {

  selectionText = '';
  engLang = false;
  contextData = new Map();
  generateModificationEvent = false;
  readOnlyMode = false;
  queryMode = false;
  DCSMode = false;
  version1C = '';
  contextActions = [];
  customHovers = {};
  customSignatures = {};
  originalText = '';
  metadataRequests = new Map();
  customSuggestions = [];
  contextMenuEnabled = false;
  err_tid = 0;
  suggestObserver = null;
  signatureObserver = null;
  generateBeforeShowSuggestEvent = false;
  generateSelectSuggestEvent = false;
  generateBeforeHoverEvent = false;
  generateBeforeSignatureEvent = false;
  statusBarWidget = null;
  ctrlPressed = false;
  altPressed = false;
  shiftPressed = false;  
  signatureVisible = true;
  currentBookmark = -1;
  activeSuggestionAcceptors = [];
  diffEditor = null;  
  inlineDiffEditor = null;
  inlineDiffWidget = null;

  reserMark = function() {

    clearInterval(err_tid);
    editor.updateDecorations([]);

  }

  sendEvent = function(eventName, eventParams) {

    let lastEvent = new MouseEvent('click');
    lastEvent.eventData1C = {event : eventName, params: eventParams};
    return dispatchEvent(lastEvent);
    
  }

  setText = function(txt, range, usePadding) {
    
    editor.checkBookmarks = false;

    reserMark();    
    bslHelper.setText(txt, range, usePadding);
    
    if (getText())
      checkBookmarksCount();
    else
      removeAllBookmarks();
    
    editor.checkBookmarks = true;

  }

  updateText = function(txt, range, usePadding) {

    readOnly = readOnlyMode;
    modEvent = generateModificationEvent;
    
    if (readOnly)
      setReadOnly(false);

    if (modEvent)    
      enableModificationEvent(false);

    eraseTextBeforeUpdate();
    setText(txt, range, usePadding);

    if (modEvent)    
      enableModificationEvent(true);

    if (readOnly)
      setReadOnly(true);

    editor.pushUndoStop();

  }

  eraseText = function () {
    
    setText('', editor.getModel().getFullModelRange(), false);    

  }

  getText = function(txt) {

    return editor.getValue();

  }

  getQuery = function () {

    let bsl = new bslHelper(editor.getModel(), editor.getPosition());		
    return bsl.getQuery();

  }

  getFormatString = function () {

    let bsl = new bslHelper(editor.getModel(), editor.getPosition());		
    return bsl.getFormatString();

  }

  updateMetadata = function (metadata, path = '') {
        
    let bsl = new bslHelper(editor.getModel(), editor.getPosition());		
    return bsl.updateMetadata(metadata, path);

  }

  updateSnippets = function (snips, replace = false) {
        
    return bslHelper.updateSnippets(snips, replace);    

  }

  updateCustomFunctions = function (data) {
        
    return bslHelper.updateCustomFunctions(data);

  }

  setTheme = function (theme) {
        
    monaco.editor.setTheme(theme);    

  }

  setReadOnly = function (readOnly) {

    readOnlyMode = readOnly;
    editor.updateOptions({ readOnly: readOnly });

    if (contextMenuEnabled)
      editor.updateOptions({ contextmenu: !readOnly });
    
  }

  getReadOnly = function () {

    return readOnlyMode;

  }

  switchLang = function () {
    engLang = !engLang;
  }

  addComment = function () {
    
    let bsl = new bslHelper(editor.getModel(), editor.getPosition());		
    bsl.addComment();

  }

  removeComment = function () {
    
    let bsl = new bslHelper(editor.getModel(), editor.getPosition());		
    bsl.removeComment();
    
  }

  markError = function (line, column) {
    reserMark();
    editor.timer_count = 12;
    err_tid = setInterval(function () {
      let newDecor = [];
      if (editor.timer_count % 2 == 0) {
        newDecor.push(
          { range: new monaco.Range(line, 1, line), options: { isWholeLine: true, inlineClassName: 'error-string' } }
        );
        newDecor.push(
          { range: new monaco.Range(line, 1, line), options: { isWholeLine: true, linesDecorationsClassName: 'error-mark' } },
        );
      }
      editor.timer_count--;
      editor.updateDecorations(newDecor);
      if (editor.timer_count == 0) {
        clearInterval(err_tid);
      }
    }, 300);
    editor.revealLineInCenter(line);
    editor.setPosition(new monaco.Position(line, column));
  }

  findText = function (string) {
    let bsl = new bslHelper(editor.getModel(), editor.getPosition());
    return bsl.findText(string);
  }

  initContextMenuActions = function() {

    contextActions.forEach(action => {
      action.dispose();
    });

    const actions = getActions(version1C);

    for (const [action_id, action] of Object.entries(actions)) {
      
      let menuAction = editor.addAction({
        id: action_id,
        label: action.label,
        keybindings: [action.key, action.cmd],
        precondition: null,
        keybindingContext: null,
        contextMenuGroupId: 'navigation',
        contextMenuOrder: action.order,
        run: action.callback
      });      

      contextActions.push(menuAction)
    }

  }

  init = function(version) {

    version1C = version;
    initContextMenuActions();

  }

  enableQuickSuggestions = function (enabled) {

    editor.updateOptions({ quickSuggestions: enabled });

  }

  minimap = function (enabled) {

    editor.updateOptions({ minimap: { enabled: enabled } });
    
  }

  enableModificationEvent = function (enabled) {

    generateModificationEvent = enabled;

  }

  addContextMenuItem = function(label, eventName) {

    let time = new Date().getTime();
    let id = time.toString() + '.' + Math.random().toString(36).substring(8);
    editor.addAction({
      id: id + "_bsl",
      label: label,
      contextMenuGroupId: 'navigation',
      contextMenuOrder: time,
      run: function () {     
          sendEvent(eventName, "");
          return null;
      }
    });

  }

  switchLanguageMode = function(mode) {
    
    let currentTheme = getCurrentThemeName();

    if (queryMode && mode == 'query')
      monaco.editor.setModelLanguage(editor.getModel(), "bsl_query");
    else if (DCSMode && mode == 'dcs')
      monaco.editor.setModelLanguage(editor.getModel(), "dcs_query");
    else if (queryMode)
      monaco.editor.setModelLanguage(editor.getModel(), "bsl_query");
    else if (DCSMode)
      monaco.editor.setModelLanguage(editor.getModel(), "dcs_query");
    else
      monaco.editor.setModelLanguage(editor.getModel(), "bsl");
    
    setTheme(currentTheme);

    initContextMenuActions();

  }

  switchQueryMode = function() {
    
    queryMode = !queryMode;
    switchLanguageMode('query');

  }

  switchDCSMode = function() {

    DCSMode = !DCSMode;
    switchLanguageMode('dcs');

  }

  switchXMLMode = function() {
    
    let identifier = editor.getModel().getLanguageIdentifier();
    let language_id = 'xml';

    if (identifier.language == 'xml') {
      language_id = queryMode ? 'bsl_query' : 'bsl';
    }

    monaco.editor.setModelLanguage(editor.getModel(), language_id);
      
  }

  getSelectedText = function() {

    return editor.getModel().getValueInRange(editor.getSelection());

  }

  addWordWrap = function () {
    
    let bsl = new bslHelper(editor.getModel(), editor.getPosition());		
    bsl.addWordWrap();

  }

  removeWordWrap = function () {
    
    let bsl = new bslHelper(editor.getModel(), editor.getPosition());		
    bsl.removeWordWrap();
    
  }

  setCustomHovers = function (hoversJSON) {
    
    try {
			customHovers = JSON.parse(hoversJSON);			
			return true;
		}
		catch (e) {
      customHovers = {};
			return { errorDescription: e.message };
		}

  }

  setCustomSignatures = function(sigJSON) {

    try {
			customSignatures = JSON.parse(sigJSON);			
			return true;
		}
		catch (e) {
      customSignatures = {};
			return { errorDescription: e.message };
		}    

  }

  getVarsNames = function () {
    
    let bsl = new bslHelper(editor.getModel(), editor.getPosition());		
    return bsl.getVarsNames(0);    
    
  }

  getSelection = function() {

    return editor.getSelection();

  }

  setSelection = function(startLineNumber, startColumn, endLineNumber, endColumn) {
    
    if (endLineNumber <= getLineCount()) {
      let range = new monaco.Range(startLineNumber, startColumn, endLineNumber, endColumn);
      editor.setSelection(range);
      editor.revealLineInCenterIfOutsideViewport(startLineNumber);
      return true;
    }
    else
      return false;

  }

  setSelectionByLength = function(start, end) {
    
    let startPosition = editor.getModel().getPositionAt(start - 1);
    let endPosition = editor.getModel().getPositionAt(end - 1);
    let range = new monaco.Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column);    
    editor.setSelection(range);
    return true;

  }

  selectedText = function(text, keepSelection = false) {

    if (!text)
      
      return getSelectedText();    

    else {      
      
      if (getSelectedText()) {

        let selection = getSelection();
        let tempModel = monaco.editor.createModel(text);
        let tempRange = tempModel.getFullModelRange();
        
        setText(text, getSelection(), false);

        if (keepSelection) {
          if (tempRange.startLineNumber == tempRange.endLineNumber)
            setSelection(selection.startLineNumber, selection.startColumn, selection.startLineNumber, selection.startColumn + tempRange.endColumn - 1);
          else
            setSelection(selection.startLineNumber, selection.startColumn, selection.startLineNumber + tempRange.endLineNumber - tempRange.startLineNumber, tempRange.endColumn);
        }

      }
      else
        setText(text, undefined, false);

    }

  }

  getLineCount = function() {
    
    return editor.getModel().getLineCount();

  }

  getLineContent = function(lineNumber) {

    return editor.getModel().getLineContent(lineNumber)

  }

  getCurrentLineContent = function() {

    return getLineContent(editor.getPosition().lineNumber);

  }

  getCurrentLine = function() {

    return editor.getPosition().lineNumber;

  }

  getCurrentColumn = function() {

    return editor.getPosition().column;

  }

  setLineContent = function(lineNumber, text) {

    if (lineNumber <= getLineCount()) {
      let range = new monaco.Range(lineNumber, 1, lineNumber, editor.getModel().getLineMaxColumn(lineNumber));
      setText(text, range, false);
      return true;      
    }
    else {
      return false;
    }

  }

  insertLine = function(lineNumber, text) {

    let model = editor.getModel();
    let text_model = monaco.editor.createModel(text);
    let text_range = text_model.getFullModelRange();
    let total_lines = getLineCount();
    let text_lines = text_range.endLineNumber - text_range.startLineNumber;
    
    if (total_lines < lineNumber)
      lineNumber = total_lines + 1;

    if (total_lines < lineNumber && getText())
      text = '\n' + text;

    text_range.startLineNumber = lineNumber;
    text_range.endLineNumber = lineNumber + text_lines;

    if (lineNumber <= total_lines) {

      let next_range = new monaco.Range(lineNumber, 1, total_lines, model.getLineMaxColumn(total_lines));
      let next_text = model.getValueInRange(next_range);

      if (next_text) {
        next_range.endLineNumber += text_lines + 1;
        next_text = '\n'.repeat(text_lines + 1) + next_text;
        editor.executeEdits('insertLine', [{
          range: next_range,
          text: next_text,
          forceMoveMarkers: true
        }]);
      }

    }

    editor.executeEdits('insertLine', [{
      range: text_range,
      text: text,
      forceMoveMarkers: true
    }]);

  }

  addLine = function(text) {

    let line = getLineCount();

    if (getText()) {
      text = '\n' + text;
      line++;
    }

    editor.executeEdits('addLine', [{
      range: new monaco.Range(line, 1, line, 1),
      text: text,
      forceMoveMarkers: true
    }]);

  }

  getPositionOffset = function() {

    let position = editor.getPosition();
    let v_pos = editor.getScrolledVisiblePosition(position);
    let layer = editor.getLayoutInfo();
    let top = Math.min(v_pos.top, layer.height);
    let left = Math.min(v_pos.left, layer.width);

    return {top: top, left: left}

  }

  compare = function (text, sideBySide, highlight, xml = false) {
    
    document.getElementById("container").innerHTML = ''
    let language_id = getLangId();
    let currentTheme = getCurrentThemeName();
  
    if (text) {      
      if (xml) {
        language_id = 'xml';
        currentTheme = 'vs';
      }
      let originalModel = originalText ? monaco.editor.createModel(originalText) : monaco.editor.createModel(editor.getModel().getValue());
      let modifiedModel = monaco.editor.createModel(text);
      originalText = originalModel.getValue();
      editor = monaco.editor.createDiffEditor(document.getElementById("container"), {
        theme: currentTheme,
        language: language_id,
        contextmenu: false,
        automaticLayout: true,
        renderSideBySide: sideBySide        
      });    
      if (highlight) {
        monaco.editor.setModelLanguage(originalModel, language_id);
        monaco.editor.setModelLanguage(modifiedModel, language_id);
      }
      editor.setModel({
        original: originalModel,
        modified: modifiedModel
      });
      editor.navi = monaco.editor.createDiffNavigator(editor, {
        followsCaret: true,
        ignoreCharChanges: true
      });
    }
    else
    {
      editor = monaco.editor.create(document.getElementById("container"), {
        theme: currentTheme,
        value: originalText,
        language: language_id,
        contextmenu: contextMenuEnabled,
        automaticLayout: true
      });
      originalText = '';
    }
    editor.updateOptions({ readOnly: readOnlyMode });
  }

  triggerSuggestions = function() {
    
    editor.trigger('', 'editor.action.triggerSuggest', {});

  }

  triggerHovers = function() {
    
    editor.trigger('', 'editor.action.showHover', {});

  }

  triggerSigHelp = function() {
    
    editor.trigger('', 'editor.action.triggerParameterHints', {});

  }

  requestMetadata = function(metadata) {

    let metadata_name = metadata.toLowerCase();
    let request = metadataRequests.get(metadata_name);

    if (!request) {
      metadataRequests.set(metadata_name, true);
      sendEvent("EVENT_GET_METADATA", metadata_name);
    }

  }

  showCustomSuggestions = function(suggestions) {
    
    customSuggestions = [];
    
    try {
            
      let suggestObj = JSON.parse(suggestions);
      
      for (const [key, value] of Object.entries(suggestObj)) {

        customSuggestions.push({
          label: value.name,
          kind: monaco.languages.CompletionItemKind[value.kind],
          insertText: value.text,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: value.detail,
          documentation: value.documentation
        });

      }

      triggerSuggestions();
      return true;
      
		}
		catch (e) {
			return { errorDescription: e.message };
		}

  }

  nextDiff = function() {

    if (editor.navi)
      editor.navi.next();

  }

  previousDiff = function() {

    if (editor.navi)
      editor.navi.previous();

  }

  disableContextMenu = function() {
    
    editor.updateOptions({ contextmenu: false });
    contextMenuEnabled = false;

  }

  scrollToTop = function () {
    
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;

  }

  hideLineNumbers = function() {
        
    editor.updateOptions({ lineNumbers: false, lineDecorationsWidth: 0 });

  }

  showLineNumbers = function() {
        
    editor.updateOptions({ lineNumbers: true, lineDecorationsWidth: 10 });
    
  }

  clearMetadata = function() {

    metadataRequests.clear();
    for (let [key, value] of Object.entries(bslMetadata)) {
      if (value.hasOwnProperty('items'))
        bslMetadata[key].items = {};
    }

  }

  hideScroll = function(type) {

    document.getElementsByTagName('body')[0].style[type] = 'hidden';
    document.getElementById('container').style[type] = 'hidden';

  }

  hideScrollX = function() {

    hideScroll('overflowX');

  }

  hideScrollY = function() {

    hideScroll('overflowY');

  }

  getTokenFromPosition = function(position) {

    let bsl = new bslHelper(editor.getModel(), position);
    return bsl.getLastToken();

  }

  getLastToken = function() {

    return getTokenFromPosition(editor.getPosition());

  }

  checkNewStringLine = function () {

    if (!queryMode && !DCSMode) {

      const model = editor.getModel();
      const position = editor.getPosition();
      const line = position.lineNumber;
      const length = model.getLineLength(line);
      const expression = model.getValueInRange(new monaco.Range(line, position.column, line, length + 1));
      const column = model.getLineLastNonWhitespaceColumn(line - 1);
      const char = model.getValueInRange(new monaco.Range(line - 1, column - 1, line - 1, column));
      const token = getTokenFromPosition(new monaco.Position(line - 1, column));

      if (token == 'stringbsl' ||0 <= token.indexOf('string.invalid') || 0 <= token.indexOf('query') || char == '|') {

        if (token != 'query.quotebsl' || char == '|') {

          const range = new monaco.Range(line, position.column, line, length + 2);

          let operation = {
            range: range,
            text: '|' + expression,
            forceMoveMarkers: true
          };

          editor.executeEdits('nql', [operation]);
          editor.setPosition(new monaco.Position(line, position.column + 1));

        }

      }

    }

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

  genarateEventWithSuggestData = function(eventName, trigger, row, suggestRows = []) {

    let bsl = new bslHelper(editor.getModel(), editor.getPosition());		

    eventParams = {
      trigger: trigger,
      current_word: bsl.word,
      last_word: bsl.lastRawExpression,
      last_expression: bsl.lastExpression,                    
      rows: suggestRows.length ? suggestRows : getSuggestWidgetRows(row),
      altKey: altPressed,
			ctrlKey: ctrlPressed,
			shiftKey: shiftPressed,
      row_id: row ? row.getAttribute('data-index') : ""
    }

    if (row) {

      if (eventName == 'EVENT_ON_ACTIVATE_SUGGEST_ROW')
        eventParams['focused'] = row.getAttribute('aria-label');
      else if (eventName == 'EVENT_ON_SELECT_SUGGEST_ROW')
        eventParams['selected'] = row.getAttribute('aria-label');

    }
    
    sendEvent(eventName, eventParams);

  }

  enableSuggestActivationEvent = function(enabled, alwaysDisplayDetails = false) {

    editor.alwaysDisplaySuggestDetails = alwaysDisplayDetails;

    if (suggestObserver != null) {
      suggestObserver.disconnect();
      suggestObserver = null;
    }

    onSuggestListMouseOver(enabled);

    if (enabled) {

      suggestObserver = new MutationObserver(function (mutations) {

        mutations.forEach(function (mutation) {

          if (mutation.target.classList.contains('monaco-list-rows') && mutation.addedNodes.length) {

            let element = mutation.addedNodes[0];

            if (element.classList.contains('monaco-list-row') && element.classList.contains('focused')) {

              genarateEventWithSuggestData('EVENT_ON_ACTIVATE_SUGGEST_ROW', 'focus', element);

              if (editor.alwaysDisplaySuggestDetails) {
                document.querySelectorAll('.monaco-list-rows .details-label').forEach(function (node) {
                  node.classList.add('inactive-detail');
                });
                document.querySelector('.monaco-list-rows .focused .details-label').classList.remove('inactive-detail');
              }

            }

          }
          else if (mutation.target.classList.contains('type')) {

            let element = document.querySelector('.monaco-list-rows .focused');

            if (element) {

              if (hasParentWithClass(mutation.target, 'details') && hasParentWithClass(mutation.target, 'suggest-widget')) {
                genarateEventWithSuggestData('EVENT_ON_DETAIL_SUGGEST_ROW', 'focus', element);
              }

            }

          }

        })

      });

      suggestObserver.observe(document, {
        childList: true,
        subtree: true,
      });

    }

  }

  enableBeforeShowSuggestEvent = function(enabled) {
    
    generateBeforeShowSuggestEvent = enabled;

  }

  enableSelectSuggestEvent = function(enabled) {
    
    generateSelectSuggestEvent = enabled;

    let widget = editor._contentWidgets['editor.widget.suggestWidget'].widget;

    if (widget) {

      if (enabled) {
        
        if (!widget.onListMouseDownOrTapOrig)
          widget.onListMouseDownOrTapOrig = widget.onListMouseDownOrTap;
        
        widget.onListMouseDownOrTap = function(e) {          
          let element = getParentWithClass(e.browserEvent.target, 'monaco-list-row');
        
          if (element) {
            genarateEventWithSuggestData('EVENT_ON_SELECT_SUGGEST_ROW', 'selection', element);
          }          

          widget.onListMouseDownOrTapOrig(e);

        }

      }
      else if (widget.onListMouseDownOrTapOrig) {
        
        widget.onListMouseDownOrTap = widget.onListMouseDownOrTapOrig;
        
      }

    }    

  }

  enableBeforeHoverEvent = function(enabled) {
    
    generateBeforeHoverEvent = enabled;

  }

  enableBeforeSignatureEvent = function(enabled) {
    
    generateBeforeSignatureEvent = enabled;

    if (signatureObserver != null) {
      signatureObserver.disconnect();
      signatureObserver = null;
    }

    if (enabled) {

      signatureObserver = new MutationObserver(function (mutations) {

        mutations.forEach(function (mutation) {

          if (mutation.target.classList.contains('overflowingContentWidgets') && mutation.addedNodes.length) {

            let element = mutation.addedNodes[0];

            if (element.classList.contains('parameter-hints-widget') && !signatureVisible) {
              element.style.display = 'none';
              signatureObserver.disconnect();
              signatureObserver = null;
            }

          }

        })

      });

      signatureObserver.observe(document, {
        childList: true,
        subtree: true
      });

    }

  }

  hideSuggestionsList = function() {

      let widget = document.querySelector('.suggest-widget');
      
      if (widget) {
        widget.style.display = 'hidden';
        widget.style.visibility = 'hidden';
      }

  }

  hideSignatureList = function () {

    signatureVisible = false;
    let widget = document.querySelector('.parameter-hints-widget');

    if (widget)
      widget.style.display = 'none';

  }

  hideHoverList = function() {

    let hovers = document.querySelectorAll('.monaco-editor-hover .hover-row');
    hovers.forEach(function(hover){
      hover.remove();
    });

  }

  openSearchWidget = function() {
    
    editor.trigger('', 'actions.find');
    setFindWidgetDisplay('inherit');    
    document.querySelector('.find-widget .input').focus();

  }

  closeSearchWidget = function() {
    
    editor.trigger('', 'closeFindWidget')
    setFindWidgetDisplay('none');

  }

  setFontSize = function(fontSize)  {
    
    editor.updateOptions({fontSize: fontSize});

  }

  setFontFamily = function(fontFamily)  {
    
    editor.updateOptions({fontFamily: fontFamily});

  }

  renderWhitespace = function(enabled) {

    let mode = enabled ? 'all' : 'none';
    editor.updateOptions({renderWhitespace: mode});

  }

  showStatusBar = function(overlapScroll = true) {
    
    if (!statusBarWidget) {

      statusBarWidget = {
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
              this.domNode.style.top = editor.getDomNode().offsetHeight - 20 + 'px';
            }            
            else {
              let layout = editor.getLayoutInfo();
              this.domNode.style.right = layout.verticalScrollbarWidth + 'px';
              this.domNode.style.top = (editor.getDomNode().offsetHeight - 20 - layout.horizontalScrollbarHeight) + 'px';
            }
            this.domNode.style.height = '20px';
            this.domNode.style.minWidth = '120px';                        
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

      editor.addOverlayWidget(statusBarWidget);
      upateStatusBar();

    }

  }

  hideStatusBar = function() {

    if (statusBarWidget) {
      editor.removeOverlayWidget(statusBarWidget);
      statusBarWidget = null;
    }

  }

  addBookmark = function(lineNumber) {

    if (lineNumber < getLineCount()) {

      let bookmark = editor.bookmarks.get(lineNumber);

      if (!bookmark)
        updateBookmarks(lineNumber);

      return !bookmark ? true : false;

    }
    else {
      
      editor.bookmarks.delete(lineNumber);
      return false;

    }

  }

  removeBookmark = function(lineNumber) {

    if (lineNumber < getLineCount()) {

      let bookmark = editor.bookmarks.get(lineNumber);

      if (bookmark)
        updateBookmarks(lineNumber);    
      
      return bookmark ? true : false;

    }
    else {

      editor.bookmarks.delete(lineNumber);
      return false;

    }

  }

  removeAllBookmarks = function() {

    editor.bookmarks.clear();
    updateBookmarks();

  }

  getBookmarks = function () {

    let sorted_bookmarks = getSortedBookmarks();
    return Array.from(sorted_bookmarks.keys());

  }

  setActiveSuggestLabel = function (label) {

    let element = document.querySelector('.monaco-list-rows .focused .monaco-icon-name-container');

    if (element)
      element.innerText = label;

  }

  setSuggestItemDetailById = function (rowId, detail) {

    let i = parseInt(rowId);
    let suggestWidget = editor._contentWidgets['editor.widget.suggestWidget'];

    if (suggestWidget && i < suggestWidget.widget.list.view.items.length) {

      let suggest_item = suggestWidget.widget.list.view.items[i];
      suggest_item.element.completion.detail = detail;      
      
      let detail_element = getChildtWithClass(suggest_item.row.domNode,'details-label');

      if (detail_element) {
        detail_element.innerText = detail
      }

    }

  }

  setActiveSuggestDetail = function (detail) {

    let element = document.querySelector('.monaco-list-rows .focused .details-label');

    if (element)
      element.innerText = detail;

    element = document.querySelector('.suggest-widget.docs-side .details .header');
        
    if (element)
      element.innerText = detail;

  }

  hasTextFocus = function () {

    return editor.hasTextFocus();

  }

  setActiveSuggestionAcceptors = function (characters) {

    activeSuggestionAcceptors = characters.split('|');

  }

  nextMatch = function () {

    editor.trigger('', 'editor.action.nextMatchFindAction');

  }

  previousMatch = function () {

    editor.trigger('', 'editor.action.previousMatchFindAction');

  }

  setOption = function (optionName, optionValue) {

    editor[optionName] = optionValue;

  }

  getOption = function (optionName) {

    return editor[optionName];
    
  }

  disableKeyBinding = function (keybinding) {

    const bind_str = keybinding.toString();
    const key_name = 'kbinding_' + bind_str;
  
    if (editor[key_name])
      editor[key_name].set(true);
    else
      editor[key_name] = editor.createContextKey(key_name, true);

    editor.addCommand(keybinding, function() {sendEvent('EVENT_KEY_BINDING_' + bind_str)}, key_name);

  }

  enableKeyBinding = function (keybinding) {
  
    const key_name = 'kbinding_' + keybinding;
    const context_key = editor[key_name];
    
    if (context_key)
      context_key.set(false);
    
  }

  jumpToBracket = function () {

    editor.trigger('', 'editor.action.jumpToBracket');

  }

  selectToBracket = function () {

    editor.trigger('', 'editor.action.selectToBracket');

  }

  setOriginalText = function (originalText) {

    editor.originalText = originalText;

    if (!originalText) {
      editor.removeDiffWidget();
      editor.diff_decorations = [];
    }
    else
      calculateDiff();

    editor.updateDecorations([]);

  }

  editor = undefined;

  // Register languages
  for (const [key, lang] of Object.entries(languages)) {
  
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

    if (lang.autoIndentation && lang.indentationRules)
      monaco.languages.setLanguageConfiguration(language.id, {indentationRules: lang.indentationRules});

    monaco.languages.setLanguageConfiguration(language.id, {brackets: lang.brackets});

    if (!editor) {

      for (const [key, value] of Object.entries(language.themes)) {
        monaco.editor.defineTheme(value.name, value);
        monaco.editor.setTheme(value.name);
      }

      editor = monaco.editor.create(document.getElementById("container"), {
        theme: "bsl-white",
        value: getCode(),
        language: language.id,
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

      editor.decorations = [];
      editor.bookmarks = new Map();
      editor.checkBookmarks = true;
      editor.diff_decorations = [];


      editor.updateDecorations = function(new_decorations) {
        
        let permanent_decor = [];

        editor.bookmarks.forEach(function (value) {
          permanent_decor.push(value);
        });

        permanent_decor = permanent_decor.concat(editor.diff_decorations);

        editor.decorations = editor.deltaDecorations(editor.decorations, permanent_decor.concat(new_decorations));
      }

      editor.removeDiffWidget = function () {

        if (editor.diffZoneId) {
          
          editor.removeOverlayWidget(inlineDiffWidget);
          inlineDiffWidget = null;
          inlineDiffEditor = null;

          editor.changeViewZones(function (changeAccessor) {
            changeAccessor.removeZone(editor.diffZoneId);
            editor.diffZoneId = 0;
          });

        }

      }

      contextMenuEnabled = editor.getRawOptions().contextmenu;

    }

  };
  
  for (const [action_id, action] of Object.entries(permanentActions)) {
    editor.addAction({
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

  editor.onDidChangeModelContent(e => {
    
    calculateDiff();

    if (generateModificationEvent)
      sendEvent('EVENT_CONTENT_CHANGED', '');

    checkBookmarksAfterRemoveLine(e);
    updateBookmarks(undefined);
        
  });

  editor.onKeyDown(e => {

    if (e.keyCode == 16 && editor.getPosition().lineNumber == 1)
      // ArrowUp
      scrollToTop();
    else if (e.keyCode == 3 && generateSelectSuggestEvent) {
      // Enter
      let element = document.querySelector('.monaco-list-row.focused');
      if (element) {
        genarateEventWithSuggestData('EVENT_ON_SELECT_SUGGEST_ROW', 'selection', element);
        // Prevent propagation of KeyDown event to editor if SuggestList was closed in EVENT_ON_SELECT_SUGGEST_ROW event handler https://github.com/salexdv/bsl_console/issues/90
        element = document.querySelector('.monaco-list-row.focused');
        if (!element) {
          e.preventDefault()
        }
      }
    }
    else if (e.ctrlKey && (e.keyCode == 36 || e.keyCode == 38)) {
      // Ctrl+F or Ctrl+H
      setFindWidgetDisplay('inherit');
    }
    else if (e.keyCode == 9) {
      // Esc
      if (document.querySelector('.find-widget'))
        setFindWidgetDisplay('none');
    }
    else if (e.keyCode == 61) {
      // F3
      if (!e.altKey && !e.shiftKey) {        
        if (e.ctrlKey) {
          editor.trigger('', 'actions.find');
          previousMatch();
        }          
        else
          editor.trigger('', 'editor.action.findWithSelection');
        setFindWidgetDisplay('inherit');
        editor.focus();
        document.querySelector('.find-widget .input').focus();
      }
    }
    else if (e.keyCode == 2) {
      // Tab
      if (generateSelectSuggestEvent) {
        let element = document.querySelector('.monaco-list-row.focused');
        if (element) {
          genarateEventWithSuggestData('EVENT_ON_SELECT_SUGGEST_ROW', 'selection', element);
        }
      }
    }

    if (e.ctrlKey)
      ctrlPressed = true;

    if (e.altKey)
      altPressed = true;

    if (e.shiftKey)
      shiftPressed = true;
    
    checkEmptySuggestions();
    
  });

  editor.onKeyUp(e => {
    
    if (e.ctrlKey)
      ctrlPressed = false;

    if (e.altKey)
      altPressed = false;

    if (e.shiftKey)
      shiftPressed = false;

  });

  editor.onMouseDown(e => {

    if (e.event.leftButton && e.event.ctrlKey) {

      let position = e.target.position;

      if (position) {

        let target = editor.getModel().getWordAtPosition(position);

        if (target)
          setSelection(position.lineNumber, target.startColumn, position.lineNumber, target.endColumn)

      }

    }

    let element = e.target.element;
    if (element.tagName.toLowerCase() == 'a') {
      sendEvent("EVENT_ON_LINK_CLICK", { label: element.innerText, href: element.dataset.href });
      setTimeout(() => {
        editor.focus();
      }, 100);
    }

    if (e.event.detail == 2 && element.classList.contains('line-numbers')) {
      let line = e.target.position.lineNumber;
      updateBookmarks(line);
    }

    if (element.classList.contains('diff-navi')) {
      createDiffWidget(e);
    }    

  });

  editor.onDidScrollChange(e => {
        
    if (e.scrollTop == 0) {
      scrollToTop();
    }

  });
  
  editor.onDidType(text => {

    if (text === '\n') {
      checkNewStringLine();
      checkBookmarksAfterNewLine();
    }

  });

  editor.onDidChangeCursorSelection(e => {
    
    upateStatusBar();
    
  });
    
  
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

  function getChildtWithClass(element, className) {

    for (var i = 0; i < element.childNodes.length; i++) {
      
      let child = element.childNodes[i];

      if (child.className && 0 <= child.className.split(' ').indexOf(className))
        return child
      else if (child.childNodes.length) {
        child = getChildtWithClass(child, className);
        if (child)
          return child;
      }

    }

    return null;

  }

  function setFindWidgetDisplay(value) {

    let element = document.querySelector('.find-widget');
    if (element)
      element.style.display = value;

  }

  function upateStatusBar() {
    
    if (statusBarWidget) {
      let status = 'Ln ' + getCurrentLine();
      status += ', Col ' + getCurrentColumn();
      statusBarWidget.domNode.firstElementChild.innerText = status;
    }

  }

  function resizeStatusBar() {

    if (statusBarWidget) {

      let element = statusBarWidget.domNode;

      if (statusBarWidget.overlapScroll) {
        element.style.top = editor.getDomNode().clientHeight - 20 + 'px';
      }
      else {
        let layout = editor.getLayoutInfo();
        element.style.top = (editor.getDomNode().offsetHeight - 20 - layout.horizontalScrollbarHeight) + 'px';
      }

    }

  }

  function checkBookmarksAfterNewLine() {

    let line = getCurrentLine();
    let content = getLineContent(line);

    if (content)
      line--;

    let line_check = getLineCount();

    while (line <= line_check) {

      let bookmark = editor.bookmarks.get(line_check);

      if (bookmark) {
        bookmark.range.startLineNumber = line_check + 1;
        bookmark.range.endLineNumber = line_check + 1;
        editor.bookmarks.set(line_check + 1, bookmark);
        editor.bookmarks.delete(line_check);
      }

      line_check--;

    }

    updateBookmarks(undefined);

  }

  function checkBookmarksAfterRemoveLine(contentChangeEvent) {

    if (contentChangeEvent.changes.length && editor.checkBookmarks) {

      let changes = contentChangeEvent.changes[0];
      let range = changes.range;

      if (!changes.text && range.startLineNumber != range.endLineNumber) {

        let line = range.startLineNumber;
        let prev_bookmark = editor.bookmarks.get(range.endLineNumber);

        if (prev_bookmark) {

          for (l = line; l <= range.endLineNumber; l++) {
            editor.bookmarks.delete(l);
          }

          prev_bookmark.range.startLineNumber = line;
          prev_bookmark.range.endLineNumber = line;
          editor.bookmarks.set(line, prev_bookmark);

        }

        for (l = line + 1; l <= range.endLineNumber; l++) {
          editor.bookmarks.delete(l);
        }

        let line_check = range.endLineNumber;
        let diff = range.endLineNumber - line;

        while (line_check < getLineCount()) {

          let bookmark = editor.bookmarks.get(line_check);

          if (bookmark) {
            bookmark.range.startLineNumber = line_check - diff;
            bookmark.range.endLineNumber = line_check - diff;
            editor.bookmarks.set(line_check - diff, bookmark);
            editor.bookmarks.delete(line_check);
          }

          line_check++;

        }

      }

    }

  }

  function checkBookmarksCount() {

    let count = getLineCount();
    let keys = [];

    editor.bookmarks.forEach(function (value, key) {
      if (count < key)
        keys.push(key);
    });

    keys.forEach(function (key) {
      editor.bookmarks.delete(key);
    });

  }

  function checkEmptySuggestions() {

    let msg_element = document.querySelector('.suggest-widget .message');

    if (msg_element && msg_element.innerText && !msg_element.style.display) {

      let word = editor.getModel().getWordAtPosition(editor.getPosition());

      if (!word) {
        hideSuggestionsList();
        setTimeout(() => {
          triggerSuggestions();
        }, 10);
      }

    }

  }

  function getCurrentThemeName() {

    let queryPostfix = '-query';
    let currentTheme = editor._themeService.getTheme().themeName;

    if ((queryMode || DCSMode) && currentTheme.indexOf(queryPostfix) == -1)
      currentTheme += queryPostfix;
    else if (!queryMode && !DCSMode && currentTheme.indexOf(queryPostfix) >= 0)
      currentTheme = currentTheme.replace(queryPostfix, '');

    return currentTheme;

  }

  function getLangId() {

		let lang_id = '';

		if (queryMode)
			lang_id = 'bsl_query';
		else if (DCSMode)
			lang_id = 'dcs_query';
		else
			lang_id = 'bsl';

		return lang_id;

	}

  function calculateDiff() {

    if (editor.originalText) {

      if (editor.diffTimer)
        clearTimeout(editor.diffTimer);

      editor.diffTimer = setTimeout(() => {
                
        if (!diffEditor) {
          diffEditor = monaco.editor.createDiffEditor(document.createElement("div"));
        }

        diffEditor.setModel({
          original: monaco.editor.createModel(editor.originalText),
          modified: editor.getModel()
        });

        setTimeout(() => {

          const changes = diffEditor.getLineChanges();

          if (Array.isArray(changes)) {

            editor.diff_decorations = [];

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

              editor.diff_decorations.push({
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

            editor.updateDecorations([]);
            editor.diffTimer = 0;

          }

        }, 0);

      }, 50);

    }

  }

  function createDiffWidget(e) {

    if (inlineDiffWidget) {
      
      editor.removeDiffWidget();

    }
    else {

      let element = e.target.element;
      let line_number = e.target.position.lineNumber;
      let class_name = 'new-block';

      if (element.classList.contains('diff-changed'))
        class_name = 'changed-block';
      else if (element.classList.contains('diff-removed'))
        class_name = 'removed-block';

      editor.changeViewZones(function (changeAccessor) {

        let domNode = document.getElementById('diff-zone');

        if (!domNode) {
          domNode = document.createElement('div');
          domNode.setAttribute('id', 'diff-zone');
        }

        editor.removeDiffWidget();

        editor.diffZoneId = changeAccessor.addZone({
          afterLineNumber: line_number,
          heightInLines: 10,
          domNode: domNode,
          onDomNodeTop: function (top) {
            if (inlineDiffWidget) {
              let layout = editor.getLayoutInfo();
              inlineDiffWidget.domNode.style.top = top + 'px';          
              inlineDiffWidget.domNode.style.width = (layout.contentWidth - layout.verticalScrollbarWidth) + 'px';
            }
          }
        });

      });

      setTimeout(() => {

        inlineDiffWidget = {
          domNode: null,
          getId: function () {
            return 'bsl.diff.widget';
          },
          getDomNode: function () {

            if (!this.domNode) {

              this.domNode = document.createElement('div');
              this.domNode.setAttribute("id", "diff-widget");

              let layout = editor.getLayoutInfo();
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

              header.innerText = engLang ? 'changes': 'изменения';

              let close_button = document.createElement('div');
              close_button.classList.add('diff-close');
              close_button.onclick = editor.removeDiffWidget;
              header.appendChild(close_button);

              this.domNode.appendChild(header);

              let body = document.createElement('div');
              body.classList.add('diff-body');
              body.classList.add(class_name);            
              this.domNode.appendChild(body);

              setTimeout(() => {

                let language_id = getLangId();              

                inlineDiffEditor = monaco.editor.createDiffEditor(body, {
                  theme: currentTheme,
                  language: language_id,
                  contextmenu: false,
                  automaticLayout: true,
                  renderSideBySide: false
                });

                let originalModel = monaco.editor.createModel(editor.originalText);
                let modifiedModel = editor.getModel();

                monaco.editor.setModelLanguage(originalModel, language_id);

                inlineDiffEditor.setModel({
                  original: originalModel,
                  modified: modifiedModel
                });

                inlineDiffEditor.navi = monaco.editor.createDiffNavigator(inlineDiffEditor, {
                  followsCaret: true,
                  ignoreCharChanges: true
                });

                setTimeout(() => {
                  inlineDiffEditor.revealLineInCenter(line_number);
                }, 10)

              }, 10);

            }

            return this.domNode;

          },
          getPosition: function () {
            return null;
          }
        };

        editor.addOverlayWidget(inlineDiffWidget);

      }, 50);

    }

  }
  
  function onSuggestListMouseOver(activationEventEnabled) {

    let widget = editor._contentWidgets['editor.widget.suggestWidget'].widget;

    if (activationEventEnabled) {
      
      if (!editor.alwaysDisplaySuggestDetails) {

        widget.listElement.onmouseoverOrig = widget.listElement.onmouseover;
        widget.listElement.onmouseover = function(e) {        
          
          document.querySelectorAll('.monaco-list-rows .details-label').forEach(function (node) {
            node.classList.remove('inactive-detail');
          });

          document.querySelectorAll('.monaco-list-rows .readMore').forEach(function (node) {
            node.classList.remove('inactive-more');
          });

          let parent_row = getParentWithClass(e.target, 'monaco-list-row');        

          if (parent_row) {
            
            if (!parent_row.classList.contains('focused')) {
              
              let details = getChildtWithClass(parent_row, 'details-label');
              
              if (details) {
                details.classList.add('inactive-detail');
                genarateEventWithSuggestData('EVENT_ON_ACTIVATE_SUGGEST_ROW', 'hover', parent_row);
              }

              let read_more = getChildtWithClass(parent_row, 'readMore');
              
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

    editor.checkBookmarks = false;
    bslHelper.setText('', editor.getModel().getFullModelRange(), false);
    editor.checkBookmarks = true;

  }

  document.onclick = function (e) {

    if (e.target.classList.contains('codicon-close')) {

      if (hasParentWithClass(e.target, 'find-widget'))
        setFindWidgetDisplay('none');

    }

  }

  document.onkeypress = function (e) {

    let char = String.fromCharCode(e.keyCode);

    if (Array.isArray(activeSuggestionAcceptors) && 0 <= activeSuggestionAcceptors.indexOf(char.toLowerCase())) {

      let element = document.querySelector('.monaco-list-row.focused');

      if (element) {

        if (generateSelectSuggestEvent) {
          genarateEventWithSuggestData('EVENT_ON_SELECT_SUGGEST_ROW', 'force-selection-' + char, element);
        }

        if (!editor.skipAcceptionSelectedSuggestion)
          editor.trigger('', 'acceptSelectedSuggestion');

        return editor.skipInsertSuggestionAcceptor ? false : true;

      }

    }

  };

  window.addEventListener('resize', function(event) {
    
    resizeStatusBar();
    
  }, true);

});