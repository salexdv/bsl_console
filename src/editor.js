require.config( { 'vs/nls': { availableLanguages: { '*': "ru" } } } );

define(['bslGlobals', 'bslMetadata', 'snippets', 'bsl_language', 'vs/editor/editor.main', 'actions', 'bslQuery'], function () {

  selectionText = '';
  engLang = false;
  decorations = [];
  contextData = new Map();
  generateModificationEvent = false;
  readOnlyMode = false;
  queryMode = false;
  version1C = '';
  contextActions = [];
  customHovers = {};

  sendEvent = function(eventName, eventParams) {

    let lastEvent = new MouseEvent('click');
    lastEvent.eventData1C = {event : eventName, params: eventParams};
    return dispatchEvent(lastEvent);
    
  }

  setText = function(txt, range, usePadding) {

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

  updateMetadata = function (metadata) {
        
    return bslHelper.updateMetadata(metadata);    

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
    editor.updateOptions({ readOnly: readOnly })
    
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
    let count = 12;
    let tid = setInterval(function() {
      let newDecor = [];
      if (!decorations.length) {
        newDecor = [            
          { range: new monaco.Range(line,1,line), options: { isWholeLine: true, inlineClassName: 'error-string' }},
          { range: new monaco.Range(line,1,line), options: { isWholeLine: true, linesDecorationsClassName: 'error-mark' }},
        ];
      }
      decorations = editor.deltaDecorations(decorations, newDecor);
      count--;
      if (count == 0) {
        clearInterval(tid);
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

    let id = new Date().getTime().toString();
    editor.addAction({
      id: id + "_bsl",
      label: label,
      contextMenuGroupId: 'navigation',
      contextMenuOrder: id,
      run: function () {     
          sendEvent(eventName, "");
          return null;
      }
    });

  }

  switchQueryMode = function() {
    
    queryMode = !queryMode;

    let queryPostfix = '-query';
    let currentTheme = editor._themeService.getTheme().themeName;

    if (queryMode && currentTheme.indexOf(queryPostfix) == -1)
      currentTheme += queryPostfix;
    else if (!queryMode && currentTheme.indexOf(queryPostfix) >= 0)
      currentTheme = currentTheme.replace(queryPostfix, '');

    if (queryMode)
      monaco.editor.setModelLanguage(editor.getModel(), "bsl_query");
    else
      monaco.editor.setModelLanguage(editor.getModel(), "bsl");
    
    setTheme(currentTheme);

    initContextMenuActions();

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

  setCustomHovers = function (variables) {
        
    try {
			customHovers = JSON.parse(variables);			
			return true;
		}
		catch (e) {
			return { errorDescription: e.message };
		}

  }

  getVarsNames = function () {
    
    let bsl = new bslHelper(editor.getModel(), editor.getPosition());		
    return bsl.getVarsNames(editor.getModel().getLineCount());
    
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

    if (!editor) {

      for (const [key, value] of Object.entries(language.themes)) {
        monaco.editor.defineTheme(value.name, value);
        monaco.editor.setTheme(value.name);
      }

      editor = monaco.editor.create(document.getElementById("container"), {
        theme: "bsl-white",
        value: getCode(),
        language: language.id,
        contextmenu: true
      });

    }

  };
  
  for (const [action_id, action] of Object.entries(permanentActions)) {
    editor.addAction({
      id: action_id,
      label: action.label,
      keybindings: [action.key, action.cmd],
      precondition: null,
      keybindingContext: null,
      contextMenuGroupId: 'navigation',
      contextMenuOrder: action.order,
      run: action.callback
    });

  }

  editor.onDidChangeModelContent(e => {
    
    if (generateModificationEvent)
      sendEvent('EVENT_CONTENT_CHANGED', '');
      
  });

});