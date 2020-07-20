define(['bslGlobals', 'bslMetadata', 'snippets', 'vs/editor/editor.main'], function () {

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

    let position = editor.getPosition();

    const matches = editor.getModel().findMatches("\"(?:\\n|\\r|\\|)*(?:выбрать|select)(?:(?:.|\\n|\\r)*?)?\"", false, true, false, null, true)
    const lineNumber = position.lineNumber;

    let idx = 0;
    let match = null;
    let queryFound = false;

    if (matches) {

      while (idx < matches.length && !queryFound) {
        match = matches[idx];
        queryFound = (match.range.startLineNumber <= lineNumber && lineNumber <= match.range.endLineNumber);
        idx++;
      }

    }

    return queryFound ? { text: match.matches[0], range: match.range } : null;

  }

  updateMetadata = function (metadata) {
        
    return bslHelper.updateMetadata(metadata);    

  }

  // Register a new language
  monaco.languages.register({ id: 'bsl' });

  // Register a tokens provider for the language
  monaco.languages.setMonarchTokensProvider('bsl', {
    defaultToken: '',
    tokenPostfix: 'bsl',
    brackets: [
      { open: '[', close: ']', token: 'delimiter.square' },
      { open: '(', close: ')', token: 'delimiter.parenthesis' },
    ],
    keywords: [
      'КонецПроцедуры', 'EndProcedure', 'КонецФункции', 'EndFunction',
      'Прервать', 'Break', 'Продолжить', 'Continue', 'Возврат', 'Return',
      'Если', 'If', 'Иначе', 'Else', 'ИначеЕсли', 'ElsIf', 'Тогда', 'Then',
      'КонецЕсли', 'EndIf', 'Попытка', 'Try', 'Исключение', 'Except',
      'КонецПопытки', 'EndTry', 'Raise', 'ВызватьИсключение', 'Пока',
      'While', 'Для', 'For', 'Каждого', 'Each', 'Из', 'In', 'По', 'To', 'Цикл',
      'Do', 'КонецЦикла', 'EndDo', 'НЕ', 'NOT', 'И', 'AND', 'ИЛИ', 'OR', 'Новый',
      'New', 'Процедура', 'Procedure', 'Функция', 'Function', 'Перем', 'Var',
      'Экспорт', 'Export', 'Знач', 'Val', 'Неопределено', 'Выполнить'
    ],
    namespaceFollows: [
      'namespace', 'using',
    ],
    parenFollows: [
      'if', 'for', 'while', 'switch', 'foreach', 'using', 'catch', 'when'
    ],
    operators: ['=', '<=', '>=', '<>', '<', '>', '+', '-', '*', '/', '%'],
    symbols: /[=><!~?:&+\-*\/\^%]+/,
    // escape sequences
    escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,
    // The main tokenizer for our languages
    tokenizer: {
      root: [
        [/[a-zA-Z\u0410-\u044F_][a-zA-Z\u0410-\u044F_0-9]*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
        // whitespace
        { include: '@whitespace' },
        // delimiters and operators
        [/}/, {
          cases: {
            '$S2==interpolatedstring': { token: 'string.quote', next: '@pop' },
            '$S2==litinterpstring': { token: 'string.quote', next: '@pop' },
            '@default': '@brackets'
          }
        }],
        [/^\s*#.*$/, 'preproc'],
        [/[()\[\]]/, '@brackets'],
        [/@symbols/, {
          cases: {
            '@operators': 'delimiter',
            '@default': ''
          }
        }],
        // numbers
        [/[0-9_]*\.[0-9_]+([eE][\-+]?\d+)?[fFdD]?/, 'number.float'],
        [/[0-9_]+/, 'number'],
        // delimiter: after number because of .\d floats
        [/[;,.]/, 'delimiter'],
        // strings
        [/"([^"\\]|\\.)*$/, 'string.invalid'],
        [/["|]/, { token: 'string.quote', next: '@string' }],
        [/\$\@"/, { token: 'string.quote', next: '@litinterpstring' }],
        [/\@"/, { token: 'string.quote', next: '@litstring' }],
        [/\$"/, { token: 'string.quote', next: '@interpolatedstring' }],
        // characters
        [/'[^\\']'/, 'string'],
        [/(')(@escapes)(')/, ['string', 'string.escape', 'string']],
        [/'/, 'string.invalid']
      ],
      comment: [
        [/\/\/.*$/, 'comment'],
      ],
      string: [
        [/[^\\"]+/, 'string'],
        [/@escapes/, 'string.escape'],
        [/\\./, 'string.escape.invalid'],
        [/"/, { token: 'string.quote', next: '@pop' }],
        [/\|.*"/, { token: 'string.quote', next: '@pop' }],
      ],
      litstring: [
        [/[^"]+/, 'string'],
        [/""/, 'string.escape'],
        [/"/, { token: 'string.quote', next: '@pop' }]
      ],
      litinterpstring: [
        [/[^"{]+/, 'string'],
        [/""/, 'string.escape'],
        [/{{/, 'string.escape'],
        [/}}/, 'string.escape'],
        [/{/, { token: 'string.quote', next: 'root.litinterpstring' }],
        [/"/, { token: 'string.quote', next: '@pop' }]
      ],
      interpolatedstring: [
        [/[^\\"{]+/, 'string'],
        [/@escapes/, 'string.escape'],
        [/\\./, 'string.escape.invalid'],
        [/{{/, 'string.escape'],
        [/}}/, 'string.escape'],
        [/{/, { token: 'string.quote', next: 'root.interpolatedstring' }],
        [/"/, { token: 'string.quote', next: '@pop' }]
      ],
      whitespace: [
        [/\/\/.*$/, 'comment'],
      ],
    },
  });


  // Register a completion item provider for the new language
  monaco.languages.registerCompletionItemProvider('bsl', {

    triggerCharacters: [' ', '.'],

    provideCompletionItems: function (model, position) {

      let suggestions = [];

      let bsl = new bslHelper(model, position);

      if (!bsl.getClassCompletition(suggestions, bslGlobals.classes)) {

        if (!bsl.getClassCompletition(suggestions, bslGlobals.systemEnum)) {

          if (!bsl.getMetadataCompletition(suggestions, bslMetadata)) {

            bsl.getCommonCompletition(suggestions, bslGlobals.keywords, monaco.languages.CompletionItemKind.Keyword.ru, true);
            bsl.getCommonCompletition(suggestions, bslGlobals.keywords, monaco.languages.CompletionItemKind.Keyword.en, true);

            if (bsl.requireClass()) {
              bsl.getCommonCompletition(suggestions, bslGlobals.classes, monaco.languages.CompletionItemKind.Constructor, false);
            }
            else {
              bsl.getCommonCompletition(suggestions, bslGlobals.globalfunctions, monaco.languages.CompletionItemKind.Function, true);
              bsl.getCommonCompletition(suggestions, bslGlobals.globalvariables, monaco.languages.CompletionItemKind.Class, false);
              bsl.getCommonCompletition(suggestions, bslGlobals.systemEnum, monaco.languages.CompletionItemKind.Enum, false);
            }

            bsl.getSnippets(suggestions, snippets);

          }

        }

      }

      if (suggestions.length)
        return { suggestions: suggestions }
      else
        return [];
    }

  });

  monaco.languages.registerSignatureHelpProvider('bsl', {

    signatureHelpTriggerCharacters: ['(', ','],

    provideSignatureHelp: (model, position) => {

      let bsl = new bslHelper(model, position);
      let helper = bsl.getMetadataSigHelp(bslMetadata);

      if (!helper)
        helper = bsl.getClassSigHelp(bslGlobals.classes);

      if (!helper)
        helper = bsl.getCommonSigHelp(bslGlobals.globalfunctions);

      if (helper)
        return new SignatureHelpResult(helper);

    }

  });

  monaco.editor.defineTheme('bsl-white', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'commentbsl', foreground: '008000' },
      { token: 'keywordbsl', foreground: 'ff0000' },
      { token: 'delimiterbsl', foreground: 'ff0000' },
      { token: 'delimiter.squarebsl', foreground: 'ff0000' },
      { token: 'delimiter.parenthesisbsl', foreground: 'ff0000' },
      { token: 'identifierbsl', foreground: '0000ff' },
      { token: 'stringbsl', foreground: '000000' },
      { token: 'string.quotebsl', foreground: '000000' },
      { token: 'string.invalidbsl', foreground: '000000' },
      { token: 'numberbsl', foreground: '000000' },
      { token: 'number.floatbsl', foreground: '000000' },
      { token: 'preprocbsl', foreground: '963200' },
    ]
  });

  monaco.editor.defineTheme('bsl-dark', {
    base: 'vs',
    inherit: true,
    colors: {
      'foreground': '#d4d4d4',
      'editor.background': '#1e1e1e',
      'editor.selectionBackground': '#062f4a',
      'editorCursor.foreground': '#d4d4d4',
      'editorSuggestWidget.background': '#252526',
      'editorSuggestWidget.foreground': '#d4d4d4',
      'editorSuggestWidget.selectedBackground': '#062f4a',
      'editorWidget.background': '#252526',
      'editorWidget.foreground': '#d4d4d4',
      'editorWidget.border': '#d4d4d4'
    },
    rules: [
      { token: 'commentbsl', foreground: '6A9955' },
      { token: 'keywordbsl', foreground: '499caa' },
      { token: 'delimiterbsl', foreground: 'd4d4d4' },
      { token: 'delimiter.squarebsl', foreground: 'd4d4d4' },
      { token: 'delimiter.parenthesisbsl', foreground: 'd4d4d4' },
      { token: 'identifierbsl', foreground: 'd4d4d4' },
      { token: 'stringbsl', foreground: 'c3602c' },
      { token: 'string.quotebsl', foreground: 'c3602c' },
      { token: 'string.invalidbsl', foreground: 'c3602c' },
      { token: 'numberbsl', foreground: 'b5cea8' },
      { token: 'number.floatbsl', foreground: 'b5cea8' },
      { token: 'preprocbsl', foreground: '963200' },
      { background: '#1e1e1e' }
    ]
  });

  monaco.editor.setTheme('bsl-dark');

  editor = monaco.editor.create(document.getElementById("container"), {
    theme: "bsl-white",
    value: getCode(),
    language: 'bsl'
  });

});