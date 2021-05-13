require.config( { 'vs/nls': { availableLanguages: { '*': "ru" } } } );

define(['bslGlobals', 'bslMetadata', 'snippets', 'bsl_language', 'vs/editor/editor.main', 'actions', 'bslQuery', 'bslDCS'], function () {

  selectionText = '';
  engLang = false;
  decorations = [];
  bookmarks = new Map();
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

  reserMark = function() {

    clearInterval(err_tid);
    let bm_decorations = getBookmarksDecorations();
    decorations = editor.deltaDecorations(decorations, bm_decorations);

  }

  sendEvent = function(eventName, eventParams) {

    let lastEvent = new MouseEvent('click');
    lastEvent.eventData1C = {event : eventName, params: eventParams};
    return dispatchEvent(lastEvent);
    
  }

  setText = function(txt, range, usePadding) {
    
    reserMark();
    bslHelper.setText(txt, range, usePadding);    

  }

  updateText = function(txt, range, usePadding) {

    readOnly = readOnlyMode;
    modEvent = generateModificationEvent;
    
    if (readOnly)
      setReadOnly(false);

    if (modEvent)    
      enableModificationEvent(false);

    eraseText();
    setText(txt, range, usePadding);

    if (modEvent)    
      enableModificationEvent(true);

    if (readOnly)
      setReadOnly(true);

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
    let bm_decorations = getBookmarksDecorations();
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
      newDecor = newDecor.concat(bm_decorations);
      decorations = editor.deltaDecorations(decorations, newDecor);
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

    let queryPostfix = '-query';
    let currentTheme = editor._themeService.getTheme().themeName;

    if ((queryMode || DCSMode) && currentTheme.indexOf(queryPostfix) == -1)
      currentTheme += queryPostfix;
    else if (!queryMode && !DCSMode && currentTheme.indexOf(queryPostfix) >= 0)
      currentTheme = currentTheme.replace(queryPostfix, '');

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

  selectedText = function(text) {

    if (!text)
      
      return getSelectedText();    

    else {      
      
      if (getSelectedText()) {

        let selection = getSelection();
        let tempModel = monaco.editor.createModel(text);
        let tempRange = tempModel.getFullModelRange();
        
        setText(text, getSelection(), false);

        if (tempRange.startLineNumber == tempRange.endLineNumber)
          setSelection(selection.startLineNumber, selection.startColumn, selection.startLineNumber, selection.startColumn + tempRange.endColumn - 1);
        else
          setSelection(selection.startLineNumber, selection.startColumn, selection.startLineNumber + tempRange.endLineNumber - tempRange.startLineNumber, tempRange.endColumn);          

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
    let language_id = queryMode ? 'bsl_query' : 'bsl';

    let queryPostfix = '-query';
    let currentTheme = editor._themeService.getTheme().themeName;

    if (queryMode && currentTheme.indexOf(queryPostfix) == -1)
      currentTheme += queryPostfix;
    else if (!queryMode && currentTheme.indexOf(queryPostfix) >= 0)
      currentTheme = currentTheme.replace(queryPostfix, '');

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

    for (let i = 0; i < element.parentElement.childNodes.length; i++) {              
      
      let row = element.parentElement.childNodes[i];
      
      if (row.classList.contains('monaco-list-row'))
        rows.push(row.getAttribute('aria-label'));

    }

    return rows;

  }

  genarateEventWithSuggestData = function(eventName, suggestRows, trigger, extra) {

    let bsl = new bslHelper(editor.getModel(), editor.getPosition());		

    eventParams = {
      trigger: trigger,
      current_word: bsl.word,
      last_word: bsl.lastRawExpression,
      last_expression: bsl.lastExpression,                    
      rows: suggestRows              
    }

    if (eventName == 'EVENT_ON_ACTIVATE_SUGGEST_ROW') 
      eventParams['focused'] = extra;
    else if (eventName == 'EVENT_ON_SELECT_SUGGEST_ROW') 
      eventParams['selected'] = extra;
    
    sendEvent(eventName, eventParams);

  }

  enableSuggestActivationEvent = function(enabled) {

    if (suggestObserver != null) {
      suggestObserver.disconnect();
      suggestObserver = null;
    }

    if (enabled) {

      suggestObserver = new MutationObserver(function (mutations) {        
      
        mutations.forEach(function (mutation) {      
          
          if (mutation.target.classList.contains('monaco-list-rows') && mutation.addedNodes.length) {
              
              let element = mutation.addedNodes[0];
    
              if (element.classList.contains('monaco-list-row') && element.classList.contains('focused')) {
                let rows = getSuggestWidgetRows(element);
                genarateEventWithSuggestData('EVENT_ON_ACTIVATE_SUGGEST_ROW', rows, 'focus', element.getAttribute('aria-label'));
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
      widget.style.display = 'hidden';
      widget.style.visibility = 'hidden';

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

  showStatusBar = function() {
    
    if (!statusBarWidget) {

      statusBarWidget = {
        domNode: null,
        getId: function () {
          return 'bsl.statusbar.widget';
        },
        getDomNode: function () {
          
          if (!this.domNode) {
            
            this.domNode = document.createElement('div');
            this.domNode.classList.add('statusbar-widget');
            this.domNode.style.left = '0px';
            this.domNode.style.top = editor.getDomNode().offsetHeight - 20 + 'px';
            this.domNode.style.height = '20px';
            this.domNode.style.width = editor.getDomNode().clientWidth + 'px';
            this.domNode.style.textAlign = 'right';
            this.domNode.style.zIndex = 1;
            this.domNode.style.fontSize = '12px';

            let pos = document.createElement('div');
            pos.style.marginRight = '25px';            
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

      let bookmark = bookmarks.get(lineNumber);

      if (!bookmark)
        updateBookmarks(lineNumber);

      return !bookmark ? true : false;

    }
    else {
      
      bookmarks.delete(lineNumber);
      return false;

    }

  }

  removeBookmark = function(lineNumber) {

    if (lineNumber < getLineCount()) {

      let bookmark = bookmarks.get(lineNumber);

      if (bookmark)
        updateBookmarks(lineNumber);    
      
      return bookmark ? true : false;

    }
    else {

      bookmarks.delete(lineNumber);
      return false;

    }

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
        autoIndent: true,
        customOptions: true
      });

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
        let rows = getSuggestWidgetRows(element);
        genarateEventWithSuggestData('EVENT_ON_SELECT_SUGGEST_ROW', rows, 'selection', element.getAttribute('aria-label'));

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

    if (e.ctrlKey)
      ctrlPressed = true;

    if (e.altKey)
      altPressed = true;

    if (e.shiftKey)
      shiftPressed = true;

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
      sendEvent("EVENT_ON_LINK_CLICK", {label: element.innerText, href: element.dataset.href});
      setTimeout(() => {
        editor.focus();
      }, 100);      
    }
    
    if (e.event.detail == 2 && element.classList.contains('line-numbers')) {
      let line = e.target.position.lineNumber;
      updateBookmarks(line);      
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

  function setFindWidgetDisplay(value) {

    let element = document.querySelector('.find-widget');
    if (element)
      element.style.display = value;

  }

  function upateStatusBar() {
    
    if (statusBarWidget) {
      let status = 'Стр: ' + getCurrentLine();
      status += ' Кол: ' + getCurrentColumn();
      statusBarWidget.domNode.firstElementChild.innerText = status;
    }

  }

  function resizeStatusBar() {
    
    if (statusBarWidget) {
      let element = statusBarWidget.domNode;
      element.style.top = editor.getDomNode().clientHeight - 20 + 'px';      
      element.style.width = editor.getDomNode().clientWidth + 'px';
    }

  }

  function checkBookmarksAfterNewLine() {

    let line = getCurrentLine();
    let prev_bookmark = bookmarks.get(line - 1);

    if (prev_bookmark) {

      let content = getLineContent(line);
      let prev_content = getLineContent(line - 1)
      
      if (content || content == prev_content) {
        
        prev_bookmark.range.startLineNumber = line;
        prev_bookmark.range.endLineNumber = line;
        bookmarks.set(line, prev_bookmark);
        bookmarks.delete(line - 1);
        
        let line_check = getLineCount();
        
        while(line < line_check) {
        
          let bookmark = bookmarks.get(line_check);
        
          if (bookmark) {
            bookmark.range.startLineNumber = line_check + 1;
            bookmark.range.endLineNumber = line_check + 1;
            bookmarks.set(line_check + 1, bookmark);
            bookmarks.delete(line_check);
          }

          line_check--;

        }

        updateBookmarks(undefined);

      }

    }

  }

  function checkBookmarksAfterRemoveLine(contentChangeEvent) {

    if (contentChangeEvent.changes.length) {

      let changes = contentChangeEvent.changes[0];
      let range = changes.range;

      if (!changes.text && range.startLineNumber != range.endLineNumber) {

        let line = range.startLineNumber;
        let prev_bookmark = bookmarks.get(range.endLineNumber);

        if (prev_bookmark) {

          for (l = line; l <= range.endLineNumber; l++) {
            bookmarks.delete(l);
          }

          let line_check = range.endLineNumber;
          let diff = range.endLineNumber - line;
        
          while(line_check < getLineCount()) {
          
            let bookmark = bookmarks.get(line_check);
          
            if (bookmark) {
              bookmark.range.startLineNumber = line_check - diff;
              bookmark.range.endLineNumber = line_check - diff;
              bookmarks.set(line_check - diff, bookmark);
              bookmarks.delete(line_check);
            }

            line_check++;
            
          }

          prev_bookmark.range.startLineNumber = line;
          prev_bookmark.range.endLineNumber = line;
          bookmarks.set(line, prev_bookmark);

        }

      }

    }

  }

  document.onclick = function (e) {

    if (e.target.classList.contains('codicon-close')) {

      if (hasParentWithClass(e.target, 'find-widget'))
        setFindWidgetDisplay('none');

    }

  }

  window.addEventListener('resize', function(event) {
    
    resizeStatusBar();
    
  }, true);
  
});