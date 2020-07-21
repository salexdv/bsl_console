define(['bslGlobals', 'bslMetadata', 'snippets', 'bsl_language', 'vs/editor/editor.main'], function () {

  setText = function(txt, range) {

    editor.getModel().applyEdits([{
      range: range ? range : monaco.Range.fromPositions(editor.getPosition()),
      text: txt
    }]);

  }

  eraseText = function () {
    
    setText('', editor.getModel().getFullModelRange());    

  }

  getText = function(txt) {

    return editor.getValue();

  }

  getQuery = function () {

    let bsl = new bslHelper(editor.getModel(), editor.getPosition());		
    return bsl.getQuery();

  }

  updateMetadata = function (metadata) {
        
    return bslHelper.updateMetadata(metadata);    

  }

  setTheme = function (theme) {
        
    monaco.editor.setTheme(theme);    

  }

  // Register a new language
  monaco.languages.register({ id: language.id });

  // Register a tokens provider for the language
  monaco.languages.setMonarchTokensProvider(language.id, language.rules);


  // Register a completion item provider for the new language
  monaco.languages.registerCompletionItemProvider(language.id, {

    triggerCharacters: [' ', '.'],

    provideCompletionItems: function (model, position) {
      let bsl = new bslHelper(model, position);
      return bsl.getCompletition();
    }

  });

  monaco.languages.registerFoldingRangeProvider(language.id, {

    provideFoldingRanges: function (model, context, token) {
      return bslHelper.getFoldingRanges(model);
    }

  });

  monaco.languages.registerSignatureHelpProvider(language.id, {

    signatureHelpTriggerCharacters: ['(', ','],

    provideSignatureHelp: (model, position) => {
      let bsl = new bslHelper(model, position);
      return bsl.getSigHelp();
    }

  });

  monaco.languages.registerHoverProvider(language.id, {

    provideHover: function (model, position) {      
      let bsl = new bslHelper(model, position);
      return bsl.getHover();
    }

  });  

  for (const [key, value] of Object.entries(language.themes)) {
    monaco.editor.defineTheme(value.name, value);
    monaco.editor.setTheme(value.name);
  }

  editor = monaco.editor.create(document.getElementById("container"), {
    theme: "bsl-white",
    value: getCode(),
    language: language.id
  });

});