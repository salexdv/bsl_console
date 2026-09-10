import bslHelper from './bsl_helper';
import registerFormatterBrowserTests from './test_formatter_browser';
import registerTabsBrowserTests from './test_tabs';

setTimeout(() => {

  const def_text = window.editor.getValue();

  describe("Проверка автокомлита и подсказок редактора кода", function () {

    after(function () {
      window.editor.setValue(def_text);
    });

    let urlParams = new URLSearchParams(window.location.search);
    let slow = urlParams.get('slow');

    if (slow)
      mocha.slow(parseInt(slow));

    window.init('8.3.18.1');
    window.showStatusBar(true);

    var assert = chai.assert;
    var expect = chai.expect;
    chai.should();

    const ownedModels = new Set();
    let modelsBeforeTest = new Set();

    beforeEach(function () {
      modelsBeforeTest = new Set(ownedModels);
    });

    afterEach(function () {
      ownedModels.forEach(function (model) {
        if (!modelsBeforeTest.has(model)) {
          if (!model.isDisposed || !model.isDisposed())
            model.dispose();
          ownedModels.delete(model);
        }
      });
    });

    after(function () {
      ownedModels.forEach(function (model) {
        if (!model.isDisposed || !model.isDisposed())
          model.dispose();
      });
      ownedModels.clear();
    });

    function getPosition(model) {

      let strings = model.getValue().split('\n');
      return new monaco.Position(strings.length, strings[strings.length - 1].length + 1);

    }

    function getModel(string) {

      const model = monaco.editor.createModel(string, 'bsl');
      ownedModels.add(model);
      return model;

    }

    function helper(string) {
      let model = getModel(string);
      let position = getPosition(model);
      return new bslHelper(model, position);
    }

    function waitFor(check, timeout = 2500, description = 'условия') {

      let started = Date.now();

      return new Promise(function (resolve, reject) {
        function poll() {
          if (check()) {
            resolve();
            return;
          }

          if (Date.now() - started >= timeout) {
            let details = typeof description == 'function' ? description() : description;
            reject(new Error('Истекло время ожидания: ' + details));
            return;
          }

          setTimeout(poll, 10);
        }

        poll();
      });

    }

    function wait(milliseconds) {
      return new Promise(function (resolve) {
        setTimeout(resolve, milliseconds);
      });
    }

    it("временные модели разбора модуля освобождаются", function () {
      const modelsCount = monaco.editor.getModels().length;
      const moduleText = [
        '// Параметры:',
        '//  Значение - Строка - проверяемое значение',
        '//',
        'Функция Проверить(Знач Значение) Экспорт',
        'Возврат Истина;',
        'КонецФункции'
      ].join('\n');

      for (let index = 0; index < 5; index++)
        assert.equal(bslHelper.parseModule(moduleText).count, 1);

      assert.equal(monaco.editor.getModels().length, modelsCount);
    });

    it("временная completion-модель освобождается при ошибке", function () {
      const modelsCount = monaco.editor.getModels().length;
      const originalResolve = bslHelper.prototype.resolveCompletionItem;

      try {
        bslHelper.prototype.resolveCompletionItem = function () {
          throw new Error('тестовая ошибка');
        };

        assert.throws(function () {
          window.languages.bsl.completionProvider.resolveCompletionItem({ insertText: 'Текст' }, {});
        }, 'тестовая ошибка');
      }
      finally {
        bslHelper.prototype.resolveCompletionItem = originalResolve;
      }

      assert.equal(monaco.editor.getModels().length, modelsCount);
    });

    it("diff-декорации переиспользуют и освобождают original-модель", async function () {
      const editor = window.editor;
      const model = editor.getModel();
      const previousText = model.getValue();
      const previousOriginalText = editor.originalText;
      const previousCalculateDiff = editor.calculateDiff;
      const previousShowDiffDecorations = window.getOption('showDiffDecorations');
      const modelsCount = monaco.editor.getModels().length;

      try {
        window.setOption('showDiffDecorations', true);
        window.setOriginalText('Исходный текст');
        await waitFor(function () {
          const diffModel = window.diffEditor && window.diffEditor.getModel();
          return diffModel && diffModel.original && diffModel.modified === model;
        });
        await waitFor(function () {
          return Array.isArray(window.diffEditor.getLineChanges());
        }, 2500, 'первичного расчёта diff');

        const firstOriginalModel = window.diffEditor.getModel().original;
        const modelsWithDiff = monaco.editor.getModels().length;

        model.setValue('Изменение 1');
        await wait(120);
        assert.strictEqual(window.diffEditor.getModel().original, firstOriginalModel);
        assert.equal(monaco.editor.getModels().length, modelsWithDiff);

        window.setOriginalText('');
        assert.equal(firstOriginalModel.isDisposed(), true);
        assert.equal(window.diffEditor, null);
        assert.equal(monaco.editor.getModels().length, modelsCount);
      }
      finally {
        model.setValue(previousText);
        window.setOriginalText(previousOriginalText, previousCalculateDiff && !previousOriginalText);
        window.setOption('showDiffDecorations', previousShowDiffDecorations);
      }
    });

    it("встроенный diff-виджет освобождает редактор и original-модель", async function () {
      const editor = window.editor;
      const model = editor.getModel();
      const previousText = model.getValue();
      const previousOriginalText = editor.originalText;
      const modelsCount = monaco.editor.getModels().length;
      const diffEditorsCount = monaco.editor.getDiffEditors().length;
      const targetElement = document.createElement('div');
      const mouseEvent = {
        target: {
          element: targetElement,
          position: new monaco.Position(1, 1)
        }
      };

      try {
        model.setValue('Строка 1\nСтрока 2');
        editor.originalText = 'Исходная строка 1\nИсходная строка 2';
        editor.createDiffWidget(mouseEvent);

        await waitFor(function () {
          return !!window.inlineDiffEditor;
        });

        const originalModel = window.inlineDiffEditor.getModel().original;
        assert.equal(monaco.editor.getModels().length, modelsCount + 1);
        assert.equal(monaco.editor.getDiffEditors().length, diffEditorsCount + 1);

        editor.removeDiffWidget();
        assert.equal(originalModel.isDisposed(), true);
        assert.equal(window.inlineDiffEditor, null);
        assert.equal(monaco.editor.getModels().length, modelsCount);
        assert.equal(monaco.editor.getDiffEditors().length, diffEditorsCount);

        editor.createDiffWidget(mouseEvent);
        editor.removeDiffWidget();
        await wait(80);
        assert.equal(window.inlineDiffEditor, null);
        assert.equal(monaco.editor.getModels().length, modelsCount);
        assert.equal(monaco.editor.getDiffEditors().length, diffEditorsCount);
      }
      finally {
        editor.removeDiffWidget();
        editor.originalText = previousOriginalText;
        model.setValue(previousText);
      }
    });

    it("AI inline provider выключен по умолчанию и валидирует опции", function () {
      const originalDebounce = window.getOption('aiInlineCompletionDebounceMs');

      try {
        assert.equal(window.getOption('generateAIInlineCompletionEvent'), false);
        window.setOption('aiInlineCompletionDebounceMs', 321);
        assert.equal(window.setOption('aiInlineCompletionDebounceMs', -1), false);
        assert.equal(window.getOption('aiInlineCompletionDebounceMs'), 321);
        assert.equal(window.setOption('generateAIInlineCompletionEvent', 1), false);
        assert.equal(window.getOption('generateAIInlineCompletionEvent'), false);
      }
      finally {
        window.setOption('aiInlineCompletionDebounceMs', originalDebounce);
      }
    });

    it("управляет подсветкой синтаксиса inline-подсказок", async function () {
      this.timeout(7000);

      const optionName = 'inlineSuggestionSyntaxHighlightingEnabled';
      const originalValue = window.getOption(optionName);
      const originalText = window.getText();

      try {
        assert.equal(originalValue, true);
        assert.equal(
          window.editor.getOption(monaco.editor.EditorOption.inlineSuggest).syntaxHighlightingEnabled,
          true
        );

        assert.equal(window.setOption(optionName, 'false'), false);
        assert.equal(window.getOption(optionName), true);

        window.setOption(optionName, false);
        assert.equal(
          window.editor.getOption(monaco.editor.EditorOption.inlineSuggest).syntaxHighlightingEnabled,
          false
        );
        assert.equal(window.editor_options[optionName], false,
          'настройка должна сохраняться для пересоздания редактора');

        window.updateText('');
        window.editor.setPosition({ lineNumber: 1, column: 1 });
        window.editor.focus();
        assert.equal(window.showInlineSuggestion('["Новый Запрос()"]'), true);

        await waitFor(function () {
          return !!document.querySelector('.ghost-text-decoration:not(.syntax-highlighted)');
        }, 2500, 'однотонного ghost text');

        window.editor.trigger('inline-syntax-highlighting-test', 'editor.action.inlineSuggest.hide');
        await waitFor(function () {
          return !document.querySelector('.ghost-text-decoration');
        }, 2500, 'скрытия однотонного ghost text');

        window.setOption(optionName, true);
        assert.equal(window.showInlineSuggestion('["Новый Запрос()"]'), true);
        await waitFor(function () {
          return !!document.querySelector('.ghost-text-decoration.syntax-highlighted');
        }, 2500, 'токенизированного ghost text');
        assert.equal(
          getComputedStyle(document.querySelector('.ghost-text-decoration.syntax-highlighted')).opacity,
          '0.7',
          'токенизированный ghost text должен быть приглушён'
        );
      }
      finally {
        window.editor.trigger('inline-syntax-highlighting-test', 'editor.action.inlineSuggest.hide');
        window.setOption(optionName, originalValue);
        window.updateText(originalText);
      }
    });

    it("AI inline provider использует нативный request-response lifecycle Monaco", async function () {
      this.timeout(7000);

      const originalText = window.getText();
      const originalSendEvent = window.sendEvent;
      const originalEnabled = window.getOption('generateAIInlineCompletionEvent');
      const originalDebounce = window.getOption('aiInlineCompletionDebounceMs');
      const originalTimeout = window.getOption('aiInlineCompletionRequestTimeoutMs');
      const capturedEvents = [];

      try {
        window.sendEvent = function (name, params) {
          if (name.indexOf('EVENT_AI_INLINE_COMPLETION_') == 0)
            capturedEvents.push({ name: name, params: params });
          else
            originalSendEvent(name, params);
        };
        window.setOption('aiInlineCompletionDebounceMs', 0);
        window.setOption('aiInlineCompletionRequestTimeoutMs', 3000);
        window.setOption('generateAIInlineCompletionEvent', true);

        window.updateText('Запрос = Но');
        window.editor.setPosition({ lineNumber: 1, column: 12 });
        window.editor.focus();
        await new Promise(function (resolve) { setTimeout(resolve, 150); });
        assert.equal(capturedEvents.length, 0, 'updateText не должен запрашивать AI');

        window.editor.trigger('ai-inline-browser-test', 'type', { text: 'в' });
        // Команда с explicit:false запускает тот же automatic fetch native-controller,
        // который в реальном редакторе планируется клавиатурным вводом.
        window.editor.trigger('ai-inline-browser-test', 'editor.action.inlineSuggest.trigger', { explicit: false });

        await waitFor(function () {
          return capturedEvents.some(function (event) {
            return event.name == 'EVENT_AI_INLINE_COMPLETION_REQUEST';
          });
        }, 2500, 'AI request после пользовательской правки');

        let request = capturedEvents.find(function (event) {
          return event.name == 'EVENT_AI_INLINE_COMPLETION_REQUEST';
        }).params;
        assert.equal(request.context.prefix, 'Запрос = Нов');
        assert.equal(request.position.column, 13);
        assert.equal(window.resolveAIInlineCompletion(request.requestId, ['ый Запрос()']), true);

        await waitFor(function () {
          return !!document.querySelector('.ghost-text-decoration');
        }, 2500, 'native ghost text AI-подсказки');
        window.editor.trigger('ai-inline-browser-test', 'editor.action.inlineSuggest.commit');
        await waitFor(function () { return window.getText() == 'Запрос = Новый Запрос()'; }, 2500, 'принятия AI-подсказки');
      }
      finally {
        window.setOption('generateAIInlineCompletionEvent', false);
        window.setOption('aiInlineCompletionDebounceMs', originalDebounce);
        window.setOption('aiInlineCompletionRequestTimeoutMs', originalTimeout);
        window.updateText(originalText);
        window.sendEvent = originalSendEvent;
        window.setOption('generateAIInlineCompletionEvent', originalEnabled);
      }
    });

    it("явный AI inline-запрос отменяется перемещением курсора", async function () {
      this.timeout(7000);

      const originalText = window.getText();
      const originalSendEvent = window.sendEvent;
      const originalEnabled = window.getOption('generateAIInlineCompletionEvent');
      const originalTimeout = window.getOption('aiInlineCompletionRequestTimeoutMs');
      const capturedEvents = [];

      try {
        window.sendEvent = function (name, params) {
          if (name.indexOf('EVENT_AI_INLINE_COMPLETION_') == 0)
            capturedEvents.push({ name: name, params: params });
          else
            originalSendEvent(name, params);
        };

        window.setOption('aiInlineCompletionRequestTimeoutMs', 3000);
        window.setOption('generateAIInlineCompletionEvent', true);
        window.updateText('АБ');
        window.editor.setPosition({ lineNumber: 1, column: 3 });
        window.editor.focus();

        assert.equal(window.triggerInlineSuggestions(), true);
        await waitFor(function () {
          return capturedEvents.some(function (event) {
            return event.name == 'EVENT_AI_INLINE_COMPLETION_REQUEST';
          });
        }, 2500, 'явного AI request');

        window.editor.setPosition({ lineNumber: 1, column: 1 });
        await waitFor(function () {
          return capturedEvents.some(function (event) {
            return event.name == 'EVENT_AI_INLINE_COMPLETION_CANCEL'
              && event.params.reason == 'cursorChanged';
          });
        }, 2500, 'отмены AI request курсором');

        assert.equal(window.triggerInlineSuggestions(), true);
        await waitFor(function () {
          return capturedEvents.filter(function (event) {
            return event.name == 'EVENT_AI_INLINE_COMPLETION_REQUEST';
          }).length == 2;
        }, 2500, 'повторного явного AI request');

        let inputArea = window.editor.getDomNode().querySelector('textarea');
        assert.isOk(inputArea, 'textarea Monaco должна существовать');
        inputArea.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          keyCode: 27,
          which: 27,
          bubbles: true,
          cancelable: true
        }));
        await waitFor(function () {
          return capturedEvents.some(function (event) {
            return event.name == 'EVENT_AI_INLINE_COMPLETION_CANCEL'
              && event.params.reason == 'hidden';
          });
        }, 2500, 'отмены AI request по Esc');
      }
      finally {
        window.setOption('generateAIInlineCompletionEvent', false);
        window.setOption('aiInlineCompletionRequestTimeoutMs', originalTimeout);
        window.updateText(originalText);
        window.sendEvent = originalSendEvent;
        window.setOption('generateAIInlineCompletionEvent', originalEnabled);
      }
    });

    it("showInlineSuggestion имеет приоритет над AI provider", async function () {
      this.timeout(7000);

      const originalText = window.getText();
      const originalSendEvent = window.sendEvent;
      const originalEnabled = window.getOption('generateAIInlineCompletionEvent');
      const capturedEvents = [];

      try {
        window.sendEvent = function (name, params) {
          if (name.indexOf('EVENT_AI_INLINE_COMPLETION_') == 0)
            capturedEvents.push({ name: name, params: params });
          else
            originalSendEvent(name, params);
        };
        window.setOption('generateAIInlineCompletionEvent', true);
        window.updateText('');
        window.editor.setPosition({ lineNumber: 1, column: 1 });
        window.editor.focus();
        assert.equal(window.showInlineSuggestion('["Б"]'), true);

        await waitFor(function () {
          return !!document.querySelector('.ghost-text-decoration');
        }, 2500, 'native ghost text ручной подсказки');
        await new Promise(function (resolve) { setTimeout(resolve, 150); });
        assert.equal(capturedEvents.length, 0, 'ручная inline-подсказка не должна запускать AI');
      }
      finally {
        window.editor.trigger('ai-inline-browser-test', 'editor.action.inlineSuggest.hide');
        window.setOption('generateAIInlineCompletionEvent', false);
        window.updateText(originalText);
        window.sendEvent = originalSendEvent;
        window.setOption('generateAIInlineCompletionEvent', originalEnabled);
      }
    });

    it("пользовательские подсказки не токенизируют текст до курсора (issue #335)", function () {

      const originalTokenize = monaco.editor.tokenize;
      const originalCustomSuggestions = window.customSuggestions;
      const originalPreviousCustomSuggestions = window.editor.previousCustomSuggestions;
      const originalShowSnippets = window.editor.showSnippetsOnCustomSuggestions;
      const model = getModel(new Array(301).join('ПроверяемоеЗначение = 1;\n') + 'ПроверяемоеЗначение');
      const position = getPosition(model);
      let tokenizeCalls = 0;

      try {
        monaco.editor.tokenize = function () {
          tokenizeCalls++;
          return originalTokenize.apply(this, arguments);
        };

        [false, true].forEach(function (showSnippets) {
          window.editor.showSnippetsOnCustomSuggestions = showSnippets;
          window.customSuggestions = [{
            label: 'ПользовательскаяПодсказка',
            kind: monaco.languages.CompletionItemKind.Property,
            insertText: 'ПользовательскаяПодсказка'
          }];

          const bsl = new bslHelper(model, position);
          const completion = bsl.getCompletion({});

          assert.equal(completion.suggestions[0].label, 'ПользовательскаяПодсказка');
        });

        assert.equal(tokenizeCalls, 0);
      }
      finally {
        monaco.editor.tokenize = originalTokenize;
        window.customSuggestions = originalCustomSuggestions;
        window.editor.previousCustomSuggestions = originalPreviousCustomSuggestions;
        window.editor.showSnippetsOnCustomSuggestions = originalShowSnippets;
        model.dispose();
      }

    });

    it("ленивый токен сохраняет распознавание строк и комментариев", function () {

      const originalTokenize = monaco.editor.tokenize;
      const stringModel = getModel('Сообщить("Незакрытая строка');
      const commentModel = getModel('// Комментарий');
      const stringHelper = new bslHelper(stringModel, getPosition(stringModel));
      const commentHelper = new bslHelper(commentModel, getPosition(commentModel));
      const originalCtrlPressed = window.ctrlPressed;
      let tokenizeCalls = 0;

      try {
        window.ctrlPressed = false;
        monaco.editor.tokenize = function () {
          tokenizeCalls++;
          return originalTokenize.apply(this, arguments);
        };

        assert.equal(tokenizeCalls, 0);
        assert.equal(stringHelper.isItStringLiteral(), true);
        assert.equal(commentHelper.completionIsAvailable(), false);
        assert.equal(tokenizeCalls, 0);

        stringHelper.isItStringLiteral();
        commentHelper.completionIsAvailable();
        assert.equal(tokenizeCalls, 0);
      }
      finally {
        monaco.editor.tokenize = originalTokenize;
        window.ctrlPressed = originalCtrlPressed;
        stringModel.dispose();
        commentModel.dispose();
      }

    });

    it("hover без события и пользовательских данных не токенизирует текст", function () {

      const originalTokenize = monaco.editor.tokenize;
      const originalCustomHovers = window.customHovers;
      const originalGenerateEvent = window.getOption('generateBeforeHoverEvent');
      const originalDisableNativeHovers = window.editor.disableNativeHovers;
      const model = getModel(new Array(301).join('ПроверяемоеЗначение = 1;\n') + 'НеизвестноеСлово');
      const bsl = new bslHelper(model, getPosition(model));
      let tokenizeCalls = 0;

      try {
        monaco.editor.tokenize = function () {
          tokenizeCalls++;
          return originalTokenize.apply(this, arguments);
        };
        window.customHovers = {};
        window.setOption('generateBeforeHoverEvent', false);
        window.editor.disableNativeHovers = true;

        bsl.onProvideHover();
        assert.equal(bsl.getHover(), null);
        assert.equal(tokenizeCalls, 0);
      }
      finally {
        monaco.editor.tokenize = originalTokenize;
        window.customHovers = originalCustomHovers;
        window.setOption('generateBeforeHoverEvent', originalGenerateEvent);
        window.editor.disableNativeHovers = originalDisableNativeHovers;
        model.dispose();
      }

    });

    it("hover с событием вычисляет токен один раз и сохраняет payload", function () {

      const originalTokenize = monaco.editor.tokenize;
      const originalSendEvent = window.sendEvent;
      const originalGenerateEvent = window.getOption('generateBeforeHoverEvent');
      const originalAltPressed = window.altPressed;
      const originalCtrlPressed = window.ctrlPressed;
      const originalShiftPressed = window.shiftPressed;
      const model = getModel('Переменная');
      const bsl = new bslHelper(model, new monaco.Position(1, 5));
      let tokenizeCalls = 0;
      let capturedEvent = null;

      try {
        monaco.editor.tokenize = function () {
          tokenizeCalls++;
          return originalTokenize.apply(this, arguments);
        };
        window.sendEvent = function (event, params) {
          capturedEvent = { event: event, params: params };
        };
        window.altPressed = true;
        window.ctrlPressed = false;
        window.shiftPressed = true;
        window.setOption('generateBeforeHoverEvent', true);

        bsl.onProvideHover();

        assert.equal(tokenizeCalls, 0);
        assert.equal(capturedEvent.event, 'EVENT_BEFORE_HOVER');
        assert.deepEqual(Object.keys(capturedEvent.params).sort(), [
          'altKey', 'column', 'ctrlKey', 'definition', 'line', 'shiftKey', 'token', 'word'
        ].sort());
        assert.deepEqual(capturedEvent.params.word, {
          word: 'Переменная',
          startColumn: 1,
          endColumn: 11
        });
        assert.equal(capturedEvent.params.token, 'identifierbsl');
        assert.equal(capturedEvent.params.line, 1);
        assert.equal(capturedEvent.params.column, 5);
        assert.equal(capturedEvent.params.altKey, true);
        assert.equal(capturedEvent.params.ctrlKey, false);
        assert.equal(capturedEvent.params.shiftKey, true);
        assert.equal(capturedEvent.params.definition, null);

        assert.equal(bsl.token, 'identifierbsl');
        assert.equal(tokenizeCalls, 0);
      }
      finally {
        monaco.editor.tokenize = originalTokenize;
        window.sendEvent = originalSendEvent;
        window.setOption('generateBeforeHoverEvent', originalGenerateEvent);
        window.altPressed = originalAltPressed;
        window.ctrlPressed = originalCtrlPressed;
        window.shiftPressed = originalShiftPressed;
        model.dispose();
      }

    });

    it("пользовательский и query-hover лениво получают корректный токен", function () {

      const originalTokenize = monaco.editor.tokenize;
      const originalCustomHovers = window.customHovers;
      const originalGenerateEvent = window.getOption('generateBeforeHoverEvent');
      const customModel = getModel('ПользовательскоеПоле');
      const queryModel = monaco.editor.createModel('ВЫБРАТЬ', 'bsl_query');
      const customHelper = new bslHelper(customModel, getPosition(customModel));
      const queryHelper = new bslHelper(queryModel, getPosition(queryModel));
      let tokenizeCalls = 0;

      try {
        monaco.editor.tokenize = function () {
          tokenizeCalls++;
          return originalTokenize.apply(this, arguments);
        };
        window.setOption('generateBeforeHoverEvent', false);
        window.customHovers = {
          'ПользовательскоеПоле': 'Пользовательская подсказка'
        };

        customHelper.onProvideHover();
        assert.equal(tokenizeCalls, 0);
        assert.equal(customHelper.getHover().contents[0].value, 'Пользовательская подсказка');
        assert.equal(customHelper.token, 'identifierbsl');
        assert.equal(tokenizeCalls, 0);

        window.customHovers = {};
        queryHelper.getLangId = function () {
          return 'bsl_query';
        };
        queryHelper.onProvideHover();
        assert.equal(tokenizeCalls, 0);
        queryHelper.getQueryHover();
        assert.equal(queryHelper.token, 'query.keywordbsl');
        assert.equal(tokenizeCalls, 0);
      }
      finally {
        monaco.editor.tokenize = originalTokenize;
        window.customHovers = originalCustomHovers;
        window.setOption('generateBeforeHoverEvent', originalGenerateEvent);
        customModel.dispose();
        queryModel.dispose();
      }

    });

    function helperToConsole(helper) {
      
      console.log('line number:', helper.column);
      console.log('column:', helper.lineNumber);      
      console.log('word:', helper.word);
      console.log('last operator:', helper.lastOperator);
      console.log('whitespace:', helper.hasWhitespace);
      console.log('last expr:', helper.lastExpression);
      console.log('expr array:', helper.getExpressioArray());      
      console.log('last raw expr:', helper.lastRawExpression);
      console.log('raw array:', helper.getRawExpressioArray());      
      console.log('text before:', helper.textBeforePosition);
            
    }

    function getModuleText() {

      return [
      '// Значение реквизита, прочитанного из информационной базы по ссылке на объект.',
      '//',
      '// Если необходимо зачитать реквизит независимо от прав текущего пользователя,',
      '// то следует использовать предварительный переход в привилегированный режим.',
      '//',
      '// Параметры:',
      '//  Ссылка    - ЛюбаяСсылка - объект, значения реквизитов которого необходимо получить.',
      '//            - Строка      - полное имя предопределенного элемента, значения реквизитов которого необходимо получить.',
      '//  ИмяРеквизита       - Строка - имя получаемого реквизита.',
      '//  ВыбратьРазрешенные - Булево - если Истина, то запрос к объекту выполняется с учетом прав пользователя, и в случае,',
      '//                                    - если есть ограничение на уровне записей, то возвращается Неопределено;',
      '//                                    - если нет прав для работы с таблицей, то возникнет исключение.',
      '//                              - если Ложь, то возникнет исключение при отсутствии прав на таблицу',
      '//                                или любой из реквизитов.',
      '//',
      '// Возвращаемое значение:',
      '//  Произвольный - зависит от типа значения прочитанного реквизита.',
      '//               - если в параметр Ссылка передана пустая ссылка, то возвращается Неопределено.',
      '//               - если в параметр Ссылка передана ссылка несуществующего объекта (битая ссылка), ',
      '//                 то возвращается Неопределено.',
      '//',
      'Функция ЗначениеРеквизитаОбъекта(Ссылка, ИмяРеквизита, ВыбратьРазрешенные = Ложь) Экспорт',
      '  ',
      '  Если ПустаяСтрока(ИмяРеквизита) Тогда ',
      '    ВызватьИсключение НСтр("ru = \'Неверный второй параметр ИмяРеквизита: ',
      '                                |- Имя реквизита должно быть заполнено\'");',
      '  КонецЕсли;',
      '  ',
      '  Результат = ЗначенияРеквизитовОбъекта(Ссылка, ИмяРеквизита, ВыбратьРазрешенные);',
      '  Возврат Результат[СтрЗаменить(ИмяРеквизита, ".", "")];',
      '  ',
      'КонецФункции ',
      '',
      '// Проверяет наличие ссылок на объект в базе данных.',
      '//',
      '// Параметры:',
      '//  СсылкаИлиМассивСсылок        - ЛюбаяСсылка, Массив - объект или список объектов.',
      '//  ИскатьСредиСлужебныхОбъектов - Булево - если Истина, то не будут учитываться',
      '//                                 исключения поиска ссылок, заданные при разработке конфигурации.',
      '//                                 Про исключение поиска ссылок подробнее',
      '//                                 см. ОбщегоНазначенияПереопределяемый.ПриДобавленииИсключенийПоискаСсылок',
      '//  ДругиеИсключения             - Массив - полные имена объектов метаданных, которые также',
      '//                                 требуется исключить из поиска ссылок.',
      '//',
      '// Возвращаемое значение:',
      '//  Булево - Истина, если есть ссылки на объект.',
      '//',
      'Функция ЕстьСсылкиНаОбъект(Знач СсылкаИлиМассивСсылок, Знач ИскатьСредиСлужебныхОбъектов = Ложь,  ДругиеИсключения = Неопределено) Экспорт',
      '  ',
      '  УстановитьПривилегированныйРежим(Истина);',
      '  ТаблицаСсылок = НайтиПоСсылкам(МассивСсылок);',
      '  Возврат ТаблицаСсылок.Количество() > 0;',
      '  ',
      'КонецФункции',
      '',
      '// Производит замену ссылок во всех данных. После замены неиспользуемые ссылки опционально удаляются.',
      '// Замена ссылок происходит с транзакциями по изменяемому объекту и его связям, не по анализируемой ссылке.',
      '//',
      '// Параметры:',
      '//   ПарыЗамен - Соответствие - Пары замен.',
      '//       * Ключ     - ЛюбаяСсылка - Что ищем (дубль).',
      '//       * Значение - ЛюбаяСсылка - На что заменяем (оригинал).',
      '//       Ссылки сами на себя и пустые ссылки для поиска будут проигнорированы.',
      '//   ',
      '//   Параметры - Структура - Необязательный. Параметры замены.',
      '//       ',
      '//       * СпособУдаления - Строка - Необязательный. Что делать с дублем после успешной замены.',
      '//           ""                - По умолчанию. Не предпринимать никаких действий.',
      '//           "Пометка"         - Помечать на удаление.',
      '//           "Непосредственно" - Удалять непосредственно.',
      '//       ',
      '//       * УчитыватьПрикладныеПравила - Булево - Необязательный. Режим проверки параметра ПарыЗамен.',
      '//           Истина - По умолчанию. Проверять каждую пару "дубль-оригинал" (вызывается функция',
      '//                    ВозможностьЗаменыЭлементов модуля менеджера).',
      '//           Ложь   - Отключить прикладные проверки пар.',
      '//       ',
      '//       * ВключатьБизнесЛогику - Булево - Необязательный. Режим записи мест использования при замене дублей на оригиналы.',
      '//           Истина - По умолчанию. Места использования дублей записываются в режиме ОбменДанными.Загрузка = Ложь.',
      '//           Ложь   - Запись ведется в режиме ОбменДанными.Загрузка = Истина.',
      '//       ',
      '//       * ЗаменаПарыВТранзакции - Булево - Необязательный. Определяет размер транзакции.',
      '//           Истина - По умолчанию. Транзакция охватывает все места использования одного дубля. Может быть очень ресурсоемко ',
      '//                    в случае большого количества мест использований.',
      '//           Ложь   - Замена каждого места использования выполняется в отдельной транзакции.',
      '//       ',
      '//       * ПривилегированнаяЗапись - Булево - Необязательный. Требуется ли устанавливать привилегированный режим перед запись.',
      '//           Ложь   - По умолчанию. Записывать с текущими правами.',
      '//           Истина - Записывать в привилегированном режиме.',
      '//',
      '// Возвращаемое значение:',
      '//   ТаблицаЗначений - Неуспешные замены (ошибки).',
      '//       * Ссылка - ЛюбаяСсылка - Ссылка, которую заменяли.',
      '//       * ОбъектОшибки - Произвольный - Объект - причина ошибки.',
      '//       * ПредставлениеОбъектаОшибки - Строка - Строковое представление объекта ошибки.',
      '//       * ТипОшибки - Строка - Тип ошибки:',
      '//           "ОшибкаБлокировки"  - при обработке ссылки некоторые объекты были заблокированы.',
      '//           "ДанныеИзменены"    - в процессе обработки данные были изменены другим пользователем.',
      '//           "ОшибкаЗаписи"      - не смогли записать объект, или метод ВозможностьЗаменыЭлементов вернул отказ.',
      '//           "ОшибкаУдаления"    - не смогли удалить объект.',
      '//           "НеизвестныеДанные" - при обработке были найдены данные, которые не планировались к анализу, замена не реализована.',
      '//       * ТекстОшибки - Строка - Подробное описание ошибки.',
      '//',
      'Функция ЗаменитьСсылки(Знач ПарыЗамен, Знач Параметры = Неопределено) Экспорт',
      '',
      '  Результат = Новый Структура;',
      '  Результат.Вставить("ЕстьОшибки", Ложь);',
      '  Результат.Вставить("Ошибки", ОшибкиЗамены);',
      '  ',
      '  Возврат Результат.Ошибки;',
      '',
      'КонецФункции',
      '// Выполняет фрагмент кода, который передается ему в качестве строкового значения',
      '//',
      '// Параметры:',
      '//  __Текст__	- Строка	- Строка, содержащая текст исполняемого кода',
      '//',
      'Процедура __Выполнить__(__Текст__) Экспорт',
      ' Вычислить(__Текст__);',
      'КонецПроцедуры'].join('\n');

    }

    let bsl = helper('');
    let bslLoaded = (window.bslGlobals != undefined);

    it("проверка загрузки bslGlobals", function () {
      assert.equal(bslLoaded, true);
    });

    it("проверка сворачивания раскрытого узла дерева переменных", function () {
      let variables = {
        "tree-parent": {
          label: "Родитель",
          children: {
            "tree-child": {
              label: "Дочерний узел",
              children: {
                "tree-leaf": { label: "Лист", class: "final" }
              }
            }
          }
        }
      };
      const container = document.getElementById("container");
      const containerHeight = container.style.height;

      try {
        assert.equal(window.showVariablesDescription(JSON.stringify(variables)), true);
        window.treeview.open("tree-child");

        let summary = document.getElementById("tree-parent");
        let prevented = false;
        window.treeview.on("click", {
          target: summary,
          preventDefault: function () {
            prevented = true;
          }
        });

        assert.equal(prevented, true);
        assert.equal(summary.parentNode.hasAttribute("open"), false);
        assert.equal(document.getElementById("tree-child").parentNode.hasAttribute("open"), false);

        prevented = false;
        window.treeview.on("click", {
          target: summary,
          preventDefault: function () {
            prevented = true;
          }
        });

        assert.equal(prevented, true);
        assert.equal(summary.parentNode.hasAttribute("open"), true);
      }
      finally {
        document.getElementById("display-close").click();
      }
      assert.equal(container.style.height, containerHeight);
    });

    if (bslLoaded) {

      it("проверка существования глобальной переменной editor", function () {
        assert.notEqual(window.editor, undefined);
      });

      it("проверка определения русского языка", function () {
        assert.equal(bsl.hasRu('тест'), true);
      });
  
      it("проверка автокомплита для глобальной функции Найти", function () {
        bsl = helper('най');
        let suggestions = [];
        bsl.getCommonCompletion(suggestions, window.bslGlobals.globalfunctions, monaco.languages.CompletionItemKind.Function)
        expect(suggestions).to.be.an('array').that.not.is.empty;
      });

      it("проверка автокомплита для глобальной функции Найти обернутой в функцию", function () {
        bsl = helper('СтрНайти(Най');
        let suggestions = [];
        bsl.getCommonCompletion(suggestions, window.bslGlobals.globalfunctions, monaco.languages.CompletionItemKind.Function)
        expect(suggestions).to.be.an('array').that.not.is.empty;
      });

      it("проверка подсказки параметров для глобальной функции Найти(", function () {
        bsl = helper('Найти(');        
        let context = bsl.getLastSigMethod({});
        let help = bsl.getCommonSigHelp(context, window.bslGlobals.globalfunctions);
        expect(help).to.have.property('activeParameter');
      });

      it("проверка подсказки параметров для глобальной функции Найти обернутой в функцию", function () {
        bsl = helper('СтрНайти(Найти(');
        let context = bsl.getLastSigMethod({});
        let help = bsl.getCommonSigHelp(context, window.bslGlobals.globalfunctions);
        expect(help).to.have.property('activeParameter');
      });

      it("проверка автокомплита для конструктора HTTPЗапрос", function () {
        bsl = helper('Запрос = Новый HTTPЗа');
        assert.equal(bsl.requireClass(), true);
        let suggestions = [];
        bsl.getCommonCompletion(suggestions, window.bslGlobals.classes, monaco.languages.CompletionItemKind.Constructor)        
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "HTTPЗапрос"), true);
      });

      it("проверка автокомплита для конструктора HTTPЗапрос обернутого в функцию", function () {
        bsl = helper('СтрНайти(Новый HTTPЗа');
        assert.equal(bsl.requireClass(), true);
        let suggestions = [];
        bsl.getCommonCompletion(suggestions, window.bslGlobals.classes, monaco.languages.CompletionItemKind.Constructor)
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "HTTPЗапрос"), true);      
      });

      it("проверка подсказки параметров для конструктора HTTPЗапрос", function () {
        bsl = helper('Новый HTTPЗапрос(');
        let suggestions = [];
        let context = bsl.getLastSigMethod({});
        let help = bsl.getClassSigHelp(context, window.bslGlobals.classes);
        expect(help).to.have.property('activeParameter');
      });

      it("проверка подсказки параметров для конструктора HTTPЗапрос обернутого в функцию", function () {
        bsl = helper('СтрНайти(Новый HTTPЗапрос(');
        let context = bsl.getLastSigMethod({});
        let help = bsl.getClassSigHelp(context, window.bslGlobals.classes);
        expect(help).to.have.property('activeParameter');
      });

      it("проверка автокомплита объекта HTTPЗапрос (список свойств и методов)", function () {
        bsl = helper('HTTPЗапрос.');
        let suggestions = [];
        bsl.getClassCompletion(suggestions, window.bslGlobals.classes);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "УстановитьПараметр"), false);
      });

      it("проверка автокомплита для экземпляра объекта HTTPЗапрос (список свойств и методов)", function () {
        bsl = helper('Запрос = Новый HTTPЗапрос();\nЗапрос.');
        let suggestions = [];
        bsl.getClassCompletion(suggestions, window.bslGlobals.classes);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "УстановитьПараметр"), false);
      });      

      it("проверка автокомплита объекта HTTPЗапрос (список свойств и методов) обернутого в функцию", function () {
        bsl = helper('Найти(HTTPЗапрос.');
        let suggestions = [];
        bsl.getClassCompletion(suggestions, window.bslGlobals.classes);
        expect(suggestions).to.be.an('array').that.not.is.empty;
      });

      it("проверка автокомплита метода УстановитьИмяФайлаТела объекта HTTPЗапрос", function () {
        bsl = helper('HTTPЗапрос.УстановитьИмя');
        let suggestions = [];
        bsl.getClassCompletion(suggestions, window.bslGlobals.classes);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "УстановитьИмяФайлаТела"), true);
      });

      it("проверка автокомплита метода УстановитьИмяФайлаТела объекта HTTPЗапрос обернутого в функцию", function () {
        bsl = helper('Найти(HTTPЗапрос.УстановитьИмя');
        let suggestions = [];
        bsl.getClassCompletion(suggestions, window.bslGlobals.classes);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "УстановитьИмяФайлаТела"), true);
      });

      it("проверка автокомплита для объекта метаданных 'Справочники'", function () {
        bsl = helper('Товар = Справоч');
        let suggestions = [];
        bsl.getCommonCompletion(suggestions, window.bslGlobals.globalvariables, monaco.languages.CompletionItemKind.Class)
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "Справочники"), true);      
      });

      it("проверка автокомплита для объекта метаданных 'Справочники.' обернутого в функцию", function () {
        bsl = helper('Найти(Справочн');
        let suggestions = [];
        bsl.getCommonCompletion(suggestions, window.bslGlobals.globalvariables, monaco.languages.CompletionItemKind.Class)
        expect(suggestions).to.be.an('array').that.not.is.empty;      
        assert.equal(suggestions.some(suggest => suggest.label === "Справочники"), true);
      });

      it("проверка автокомплита для объекта метаданных 'Справочники.' (список справочников)", function () {
        bsl = helper('Товар = Справочники.');
        let suggestions = [];
        bsl.getMetadataCompletion(suggestions, window.bslMetadata)
        expect(suggestions).to.be.an('array').that.not.is.empty;
      });

      it("проверка автокомплита для объекта метаданных 'Справочники.' (список справочников) обернутого в функцию", function () {
        bsl = helper('Найти(Справочники.');
        let suggestions = [];
        bsl.getMetadataCompletion(suggestions, window.bslMetadata)
        expect(suggestions).to.be.an('array').that.not.is.empty;
      });

      it("проверка автокомплита для объекта метаданных 'Справочники.Товары.' (список функций менеджера)", function () {
        bsl = helper('Товар = Справочники.Товары.');
        let suggestions = [];
        bsl.getMetadataCompletion(suggestions, window.bslMetadata)
        expect(suggestions).to.be.an('array').that.not.is.empty;
      });

      it("проверка автокомплита для объекта метаданных 'Справочники.Товары.' (список функций менеджера) обернутого в функцию", function () {
        bsl = helper('Найти(Справочники.Товары.');
        let suggestions = [];
        bsl.getMetadataCompletion(suggestions, window.bslMetadata)
        expect(suggestions).to.be.an('array').that.not.is.empty;
      });

      it("проверка автокомплита для элемента справочника 'Товары.' (список реквизитов и функций объекта)", function () {
        bsl = helper('Товар = Справочники.Товары.НайтиПоКоду(1);\nТовар.');
        let suggestions = [];
        bsl.getMetadataCompletion(suggestions, window.bslMetadata)
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "Цена"), true);
      });

      it("проверка автокомплита для элемента справочника 'Товары.' (список предопределенных)", function () {
        bsl = helper('Товар = Справочники.Товары.');
        let suggestions = [];
        bsl.getMetadataCompletion(suggestions, window.bslMetadata)
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "Услуга"), true);
      });

      it("проверка автокомплита для элемента справочника 'Товары.' (список реквизитов и функций объекта) обернутого в функцию", function () {
        bsl = helper('Товар = Справочники.Товары.НайтиПоКоду(1);\nНайти(Товар.');
        let suggestions = [];
        bsl.getMetadataCompletion(suggestions, window.bslMetadata)
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "Цена"), true);
      });

      it("проверка подсказки для выборки справочника 'Товары'", function () {
        bsl = helper('Выборка = Справочники.Товары.Выбрать();\nВыборка.');
        let suggestions = [];
        bsl.getMetadataCompletion(suggestions, window.bslMetadata)
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "Цена"), true);
        assert.equal(suggestions.some(suggest => suggest.label === "Следующий"), true);
        assert.equal(suggestions.some(suggest => suggest.label === "ЭтоГруппа"), true);
      });

      it("проверка подсказки параметров для метода 'Записать' документа 'АвансовыйОтчет'", function () {
        bsl = helper('Док = Документы.АвансовыйОтчет.НайтиПоНомеру(1);\nДок.Записать(');
        let context = bsl.getLastSigMethod({});
        let help = bsl.getMetadataSigHelp(context, window.bslMetadata);
        expect(help).to.have.property('activeParameter');
      });

      it("проверка получения существующего текста запроса", function () {        
        window.editor.setPosition(new monaco.Position(18, 1));
        assert.notEqual(window.getQuery(), null);
      });

      it("проверка получения несуществующего текста запроса", function () {        
        window.editor.setPosition(new monaco.Position(1, 1));
        assert.equal(window.getQuery(), null);
      });

      it("проверка очистки всего текста", function () {              	
        let text = window.editor.getValue();
        window.eraseText();
        assert.equal(window.editor.getValue(), window.getText());
        window.editor.setValue(text);
        assert.equal(text, window.getText());
      });

      it("проверка обновления метаданных", function () {              	                
        let mCopy = JSON.parse(JSON.stringify(window.bslMetadata));        
        assert.notEqual(window.updateMetadata(123), true);
        let strJSON = '{"catalogs": {"АвансовыйОтчетПрисоединенныеФайлы": {"properties": {"Автор": "Автор","ВладелецФайла": "Размещение","ДатаМодификацииУниверсальная": "Дата изменения (универсальное время)","ДатаСоздания": "Дата создания","Зашифрован": "Зашифрован","Изменил": "Отредактировал","ИндексКартинки": "Индекс значка","Описание": "Описание","ПодписанЭП": "Подписан электронно","ПутьКФайлу": "Путь к файлу","Размер": "Размер (байт)","Расширение": "Расширение","Редактирует": "Редактирует","СтатусИзвлеченияТекста": "Статус извлечения текста","ТекстХранилище": "Текст","ТипХраненияФайла": "Тип хранения файла","Том": "Том","ФайлХранилище": "Временное хранилище файла","ДатаЗаема": "Дата заема","ХранитьВерсии": "Хранить версии","ИмяПредопределенныхДанных": "","Предопределенный": "","Ссылка": "","ПометкаУдаления": "","Наименование": ""}}}}';                
        assert.equal(window.updateMetadata(strJSON), true);
        bsl = helper('Отчет = Справочники.АвансовыйОтчетПрисоединенныеФайлы.НайтиПоКоду(1);\nОтчет.');
        let suggestions = [];
        bsl.getMetadataCompletion(suggestions, window.bslMetadata)        
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "ДатаМодификацииУниверсальная"), true);
        window.bslMetadata = JSON.parse(JSON.stringify(mCopy));
      });

      it("проверка обновления сниппетов", function () {              	                
        let sCopy = JSON.parse(JSON.stringify(window.snippets));        
        assert.notEqual(window.updateSnippets(123), true);
        let strJSON = '{"snippets": { "ЕслиЧто": { "prefix": "Если", "body": "Если ${1:Условие} Тогда\n\t$0\nКонецЕсли;", "description": "ЕслиЧто"}}}';
        assert.equal(window.updateSnippets(strJSON), true);
        bsl = helper('ЕслиЧто');
        let suggestions = [];
        bsl.getSnippets(suggestions, window.snippets);        
        expect(suggestions).to.be.an('array').that.not.is.empty;        
        assert.equal(suggestions.some(suggest => suggest.detail === "ЕслиЧто"), true);
        window.snippets = JSON.parse(JSON.stringify(sCopy));
      });

      it("проверка замены сниппетов", function () {              	                
        let sCopy = JSON.parse(JSON.stringify(window.snippets));                
        let strJSON = '{"snippets": { "ЕслиЧто": { "prefix": "Если", "body": "Если ${1:Условие} Тогда\n\t$0\nКонецЕсли;", "description": "ЕслиЧто"}}}';
        assert.equal(window.updateSnippets(strJSON, true), true);
        bsl = helper('Если');
        let suggestions = [];
        bsl.getSnippets(suggestions, window.snippets);
        assert.equal(suggestions.length, 1);
        window.snippets = JSON.parse(JSON.stringify(sCopy));
      });

      it("проверка всплывающей подсказки", function () {        
        let model = getModel("Найти(");
        let position = new monaco.Position(1, 2);
        bsl = new bslHelper(model, position);
        assert.notEqual(bsl.getHover(), null);
        model = getModel("НайтиЧтоНибудь(");
        bsl = new bslHelper(model, position);
        assert.equal(bsl.getHover(), null);        
      });

      it("проверка получения существующей форматной строки", function () {        
        window.editor.setPosition(new monaco.Position(56, 33));
        assert.notEqual(window.getFormatString(), null);
      });

      it("проверка получения несуществующей форматной строки", function () {        
        window.editor.setPosition(new monaco.Position(47, 21));
        assert.equal(window.getFormatString(), null);
        window.editor.setPosition(new monaco.Position(10, 1));
        assert.equal(window.getFormatString(), null);
      });

      it("проверка загрузки пользовательских функций", function () {
        let strJSON = '{ "customFunctions":{ "МояФункция1":{ "name":"МояФункция1", "name_en":"MyFuntion1", "description":"Получает из строки закодированной по алгоритму base64 двоичные данные.", "returns":"Тип: ДвоичныеДанные. ", "signature":{ "default":{ "СтрокаПараметров":"(Строка: Строка): ДвоичныеДанные", "Параметры":{ "Строка":"Строка, закодированная по алгоритму base64." } } } }, "МояФункция2":{ "name":"МояФункция2", "name_en":"MyFuntion2", "description":"Выполняет сериализацию значения в формат XML.", "template":"МояФункция2(ВызовЗависимойФункции(${1:ПервыйЗависимыйПараметр}, ${2:ВторойЗависимыйПараметр}), ${0:ПараметрМоейФункции}))", "signature":{ "ЗаписатьБезИмени":{ "СтрокаПараметров":"(ЗаписьXML: ЗаписьXML, Значение: Произвольный, НазначениеТипа?: НазначениеТипаXML)", "Параметры":{ "ЗаписьXML":"Объект, через который осуществляется запись XML, полученный через зависимою функцию", "Значение":"Записываемое в поток XML значение. Тип параметра определяется совокупностью типов, для которых определена XML-сериализация." } }, "ЗаписатьСПолнымИменем":{ "СтрокаПараметров":"(ЗаписьXML: ЗаписьXML, Значение: Произвольный, ПолноеИмя: Строка, НазначениеТипа?: НазначениеТипаXML)", "Параметры":{ "ЗаписьXML":"Объект, через который осуществляется запись XML.", "Значение":"Записываемое в поток XML значение. Тип параметра определяется совокупностью типов, для которых определена XML-сериализация.", "ПолноеИмя":"Полное имя элемента XML, в который будет записано значение.", "НазначениеТипа":"Определяет необходимость назначения типа элементу XML. Значение по умолчанию: Неявное." } }, "ЗаписатьСЛокальнымИменемИПространствомИмен":{ "СтрокаПараметров":"(ЗаписьXML: ЗаписьXML, Значение: Произвольный, ЛокальноеИмя: Строка, URIПространстваИмен: Строка, НазначениеТипа?: НазначениеТипаXML)", "Параметры":{ "ЗаписьXML":"Объект, через который осуществляется запись XML.", "Значение":"Записываемое в поток XML значение. Тип параметра определяется совокупностью типов, для которых определена XML-сериализация.", "ЛокальноеИмя":"Локальное имя элемента XML, в который будет записано значение.", "URIПространстваИмен":"URI пространства имен, к которому принадлежит указанное ЛокальноеИмя.", "НазначениеТипа":"Определяет необходимость назначения типа элементу XML. Значение по умолчанию: Неявное." } } } } } }';
        assert.notEqual(window.updateCustomFunctions(123), true);
        assert.equal(window.updateCustomFunctions(strJSON), true);
      });

      it("проверка автокомплита для пользовательской функции МояФункция2", function () {
        bsl = helper('мояфу');
        let suggestions = [];
        bsl.getCommonCompletion(suggestions, window.bslGlobals.customFunctions, monaco.languages.CompletionItemKind.Function)
        expect(suggestions).to.be.an('array').that.not.is.empty;
      });

      it("проверка подсказки параметров для пользовательской функции МояФункция2", function () {
        bsl = helper('МояФункция2(');        
        let context = bsl.getLastSigMethod({});
        let help = bsl.getCommonSigHelp(context, window.bslGlobals.customFunctions);
        expect(help).to.have.property('activeParameter');
      });

      it("проверка подсказки переопределенных параметров для функции Состояние", function () {
        let strJSON = '{ "Состояние": [ { "label": "(Первый, Второй)", "documentation": "Описание сигнатуры", "parameters": [ { "label": "Первый", "documentation": "Описание первого" }, { "label": "Второй", "documentation": "Описание второго" } ] } ] }';
        assert.equal(window.setCustomSignatures(strJSON), true);
        let position = new monaco.Position(37, 12);
        let model = window.editor.getModel();
        window.editor.setPosition(position);
        bsl = new bslHelper(model, position);
        let context = bsl.getLastSigMethod({});
        let help = bsl.getCustomSigHelp(context);
        expect(help).to.have.property('activeParameter');
        assert.equal(window.setCustomSignatures('{}'), true);
      });

      describe("пользовательские сигнатуры контекстных вызовов (issue #343)", function () {

        const shortSignature = [{
          label: "Короткая(Имя?)",
          parameters: [{ label: "Имя?" }]
        }];
        const exactSignature = [{
          label: "Полная(Имя?)",
          parameters: [{ label: "Имя?" }]
        }];

        afterEach(function () {
          window.setCustomSignatures('{}');
        });

        it("использует короткий ключ метода после точки без учета регистра", function () {
          window.setCustomSignatures(JSON.stringify({ "ДоБаВиТь": shortSignature }));

          let signatureHelper = helper('я = Новый ТаблицаЗначений;\nя.Колонки.Добавить(');
          let context = signatureHelper.getLastSigMethod({});
          let help = signatureHelper.getCustomSigHelp(context);

          assert.equal(context.methodExpression, 'я.колонки.добавить');
          assert.equal(context.methodWord, 'добавить');
          assert.equal(help.signatures[0].label, 'Короткая(Имя?)');
        });

        it("дает полному ключу приоритет над коротким", function () {
          window.setCustomSignatures(JSON.stringify({
            "ДОБАВИТЬ": shortSignature,
            "Я.КоЛоНкИ.ДоБаВиТь": exactSignature
          }));

          let signatureHelper = helper('я.Колонки.Добавить(');
          let context = signatureHelper.getLastSigMethod({});
          let help = signatureHelper.getCustomSigHelp(context);

          assert.equal(help.signatures[0].label, 'Полная(Имя?)');
        });

        it("сохраняет короткий ключ глобальной функции", function () {
          window.setCustomSignatures(JSON.stringify({ "ОТКРЫТЬФОРМУ": shortSignature }));

          let signatureHelper = helper('ОткрытьФорму(');
          let context = signatureHelper.getLastSigMethod({});
          let help = signatureHelper.getCustomSigHelp(context);

          assert.equal(context.methodExpression, 'открытьформу');
          assert.equal(help.signatures[0].label, 'Короткая(Имя?)');
        });

        it("определяет внешний вызов внутри строки и после закрывающей кавычки", function () {
          let insideString = helper('ОткрытьФорму("ОбщаяФорма.Форма');
          let insideContext = insideString.getLastSigMethod({});
          assert.equal(insideContext.methodName, 'ОткрытьФорму');
          assert.equal(insideContext.activeParameter, 0);

          let afterString = helper('ОткрытьФорму("ОбщаяФорма.Форма"');
          let afterContext = afterString.getLastSigMethod({});
          assert.equal(afterContext.methodName, 'ОткрытьФорму');
          assert.equal(afterContext.activeParameter, 0);
        });

        it("игнорирует скобки и запятые строк, а также вложенные вызовы", function () {
          let signatureHelper = helper('Метод("текст, (скобка)", Вложенный(1, 2), ');
          let context = signatureHelper.getLastSigMethod({});

          assert.equal(context.methodName, 'Метод');
          assert.equal(context.activeParameter, 2);

          signatureHelper = helper('Метод(\n\tПервый,\n\tВложенный(1, 2),\n\t');
          context = signatureHelper.getLastSigMethod({});
          assert.equal(context.methodName, 'Метод');
          assert.equal(context.activeParameter, 2);
        });

        it("не создает вызов из скобки внутри строки или комментария", function () {
          let stringContext = helper('Строка = "Вызов(').getLastSigMethod({});
          let commentContext = helper('Значение = 1; // Вызов(').getLastSigMethod({});

          assert.equal(stringContext.methodName, '');
          assert.equal(commentContext.methodName, '');
        });

        it("передает короткое и полное имя в EVENT_BEFORE_SIGNATURE", function () {
          const originalSendEvent = window.sendEvent;
          const originalGenerateEvent = window.getOption('generateBeforeSignatureEvent');
          let capturedEvent = null;

          try {
            window.setCustomSignatures(JSON.stringify({ "добавить": shortSignature }));
            window.sendEvent = function (event, params) {
              capturedEvent = { event: event, params: params };
            };
            window.setOption('generateBeforeSignatureEvent', true);

            let model = getModel('я.Колонки.Добавить(');
            let position = getPosition(model);
            let context = { triggerCharacter: '(' };
            let result = window.languages.bsl.signatureProvider.provideSignatureHelp(
              model,
              position,
              { isCancellationRequested: false },
              context
            );

            expect(result).to.have.property('value');
            assert.equal(capturedEvent.event, 'EVENT_BEFORE_SIGNATURE');
            assert.equal(capturedEvent.params.word, 'добавить');
            assert.equal(capturedEvent.params.expression, 'я.колонки.добавить');
            assert.equal(capturedEvent.params.activeParameter, 0);
          }
          finally {
            window.sendEvent = originalSendEvent;
            window.setOption('generateBeforeSignatureEvent', originalGenerateEvent);
          }
        });

      });

      it("проверка автокомплита для функции 'Тип'", function () {
        bsl = helper('Тип("');
        assert.equal(bsl.requireType(), true);
        let suggestions = [];
        bsl.getTypesCompletion(suggestions, window.bslGlobals.types, monaco.languages.CompletionItemKind.Enum)
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "СправочникСсылка"), true);        
      });

      it("проверка автокомплита для функции 'Тип' обернутой в функцию", function () {
        bsl = helper('Поиск = Найти(Тип("');
        assert.equal(bsl.requireType(), true);
        let suggestions = [];
        bsl.getTypesCompletion(suggestions, window.bslGlobals.types, monaco.languages.CompletionItemKind.Enum)
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "СправочникСсылка"), true);        
      });

      it("проверка автокомплита для функции 'Тип' с указанием конкретного вида метаданных", function () {
        bsl = helper('Тип("СправочникСсылка.');
        assert.equal(bsl.requireType(), true);
        let suggestions = [];
        bsl.getTypesCompletion(suggestions, window.bslGlobals.types, monaco.languages.CompletionItemKind.Enum)
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "Товары"), true);        
      });

      it("проверка загрузки пользовательских объектов", function () {              	                        
        let strJSON = `{
          "customObjects":{
            "_СтруктураВыгрузки":{
                "ref": "classes.Структура",
                "properties":{
                  "Номенклатура":{
                      "name":"Номенклатура",
                      "detail":"Ссылка на справочник номенклатуры",
                      "description":"Подбробное описание поля номенклатуры пользовательского объекта",
                      "ref":"catalogs.Товары"
                  },
                  "Остаток":{
                      "name":"Остаток"
                  }
                },
                "methods":{
                  "ВставитьВСтруктуру": {
                    "name": "ВставитьВСтруктуру",
                    "name_en": "InsertToStructure",
                    "description": "Устанавливает значение элемента структуры по ключу. Если элемент с переданным значением ключа существует, то его значение заменяется, в противном случае добавляется новый элемент.",
                    "signature": {
                        "default": {
                            "СтрокаПараметров": "(Ключ: Строка, Значение?: Произвольный)",
                            "Параметры": {
                                "Ключ": "Ключ устанавливаемого элемента. Ключ должен соответствовать правилам, установленным для идентификаторов:   - Первым символом ключа должна быть буква или символ подчеркивания (_).  - Каждый из последующих символов может быть буквой, цифрой или символом подчеркивания (_).",
                                "Значение": "Значение устанавливаемого элемента."
                            }
                        }
                      }
                  },
                  "КоличествоЗаписейВВыгрузке": {
                      "name": "КоличествоЗаписейВВыгрузке",
                      "name_en": "CountItemsToUpload",
                      "description": "Получает количество элементов структуры.",
                      "returns": "Тип: Число. "
                  }
                },
                "detail":"Пользовательская структура выгрузка",
                "description":"Подробное описание пользовательской структуры выгрузки"
            },
            "_ОстаткиТовара":{
                "properties":{
                  "Партия":{
                      "name":"Партия",
                      "description":"Ссылка на приходный документ",
                      "ref":"documents.ПриходнаяНакладная"
                  },
                  "Номенклатура":{
                      "name":"Номенклатура",
                      "ref":"catalogs.Товары"
                  },
                  "Оборот":{
                      "name":"Оборот"
                  }
                }
            },
            "_ОбъектСВложениями":{
                "ref": "classes.Структура",
                "properties":{
                  "Товар":{
                      "name":"Товар",
                      "description":"Ссылка на справочник номенклатуры",
                      "ref":"catalogs.Товары"
                  },
                  "ВложенныйОбъект":{
                    "name":"ВложенныйОбъект",
                    "description":"Вложенный объект",
                    "ref":"catalogs.Структура",
                    "properties":{
                      "ПервыйРеквизитОбъекта":{
                        "name":"ПервыйРеквизитОбъекта",                       
                        "ref":"documents.ПриходнаяНакладная"
                      },
                      "ВторойРеквизитОбъекта":{
                        "name":"ВторойРеквизитОбъекта",                       
                        "ref":"classes.Соответствие"
                      },
                      "ТретийРеквизитОбъекта":{
                        "name":"ТретийРеквизитОбъекта",                       
                        "ref":"classes.Структура",
                        "properties":{
                          "Партия":{
                            "name":"Партия",
                            "description":"Ссылка на приходный документ",
                            "ref":"documents.ПриходнаяНакладная"
                          },
                          "Номенклатура":{
                            "name":"Номенклатура",
                            "ref":"catalogs.Товары"
                          }
                        }                        
                      }
                    },
                    "methods":{
                      "ВложенныйМетод": {
                        "name": "ВложенныйМетод",
                        "name_en": "NestedMethod",
                        "description": "Устанавливает значение элемента структуры по ключу. Если элемент с переданным значением ключа существует, то его значение заменяется, в противном случае добавляется новый элемент.",
                        "ref": "customObjects._СтруктураВыгрузки",
                        "signature": {
                            "default": {
                                "СтрокаПараметров": "(Ключ: Строка, Значение?: Произвольный)",
                                "Параметры": {
                                    "Ключ": "Ключ устанавливаемого элемента. Ключ должен соответствовать правилам, установленным для идентификаторов:   - Первым символом ключа должна быть буква или символ подчеркивания (_).  - Каждый из последующих символов может быть буквой, цифрой или символом подчеркивания (_).",
                                    "Значение": "Значение устанавливаемого элемента."
                                }
                            }
                          }
                      }
                    }
                  }
                }
            }           
          }
        }`;                
        let res = window.updateMetadata(strJSON);
        assert.equal(res, true);
        bsl = helper('_ОстаткиТ');
        let suggestions = [];
        bsl.getCustomObjectsCompletion(suggestions, window.bslMetadata.customObjects, monaco.languages.CompletionItemKind.Enum);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "_ОстаткиТовара"), true);        
      });

      it("проверка подсказки для вложенного пользовательского объекта", function () {
        bsl = helper('_ОбъектСВложениями.');
        let suggestions = [];
        bsl.getCustomObjectsCompletion(suggestions, window.bslMetadata.customObjects, monaco.languages.CompletionItemKind.Enum);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "ВложенныйОбъект"), true);
        suggestions.forEach(function (suggestion) {
          if (suggestion.label == "ВложенныйОбъект") {
            let command = suggestion.command.arguments[0];
            window.contextData = new Map([
              [1, new Map([[command.name.toLowerCase(), command.data]])]
            ]);
            suggestions = [];
            bsl = helper('_ОбъектСВложениями.ВложенныйОбъект.');
            bsl.getRefCompletion(suggestions);
            assert.equal(suggestions.some(suggest => suggest.label === "ПервыйРеквизитОбъекта"), true);        
            window.contextData = new Map();
          }
        });                                
      });

      it("проверка подсказки методов, когда у пользовательского объекта явна задана ссылка", function () {
        bsl = helper('_СтруктураВыгрузки.');
        let suggestions = [];
        bsl.getCustomObjectsCompletion(suggestions, window.bslMetadata.customObjects, monaco.languages.CompletionItemKind.Enum);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "Вставить"), true);
      });

      it("проверка подсказки собственных методов для пользовательского объекта", function () {
        bsl = helper('_СтруктураВыгрузки.');
        let suggestions = [];
        bsl.getCustomObjectsCompletion(suggestions, window.bslMetadata.customObjects, monaco.languages.CompletionItemKind.Enum);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "КоличествоЗаписейВВыгрузке"), true);
      });

      it("проверка подсказки ссылочных реквизитов", function () {              	                                
        bsl = helper('_ОстаткиТовара.Номенклатура.');
        let suggestions = [];
        window.contextData = new Map([
          [1, new Map([["номенклатура", { "ref": "catalogs.Товары", "sig": null }]])]
        ]);
        bsl.getRefCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "СтавкаНДС"), true);        
        suggestions = [];
        bsl = helper('_ОстаткиТовара.Наминклатура.');
        bsl.getRefCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.is.empty;
        window.contextData = new Map();
      });

      it("проверка подсказки для таблицы, полученной из результата запроса", function () {              	                                
        bsl = helper('ОбъектЗапрос = Новый Запрос();\nРезультат = ОбъектЗапрос.Выполнить();\nТаблица = Результат.Выгрузить();\nТаблица.');
        let suggestions = [];        
        window.contextData = new Map([
          [2, new Map([["выполнить", { "ref": "types.РезультатЗапроса", "sig": null }]])],
          [3, new Map([["выгрузить", { "ref": "classes.ТаблицаЗначений", "sig": null }]])]
        ]);        
        bsl.getRefCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "ВыгрузитьКолонку"), true);        
        window.contextData = new Map();
      });

      describe("вывод типов переменных из текста (specs/type-inference, Этап 1)", function () {

        it("тип из конструктора Новый", function () {
          window.contextData = new Map();
          let suggestions = [];
          helper('Таблица = Новый ТаблицаЗначений;\nТаблица.').getRefCompletion(suggestions);
          expect(suggestions).to.be.an('array').that.not.is.empty;
          assert.equal(suggestions.some(suggest => suggest.label === "ВыгрузитьКолонку"), true);
        });

        it("тип из конструктора Новый на английском", function () {
          window.contextData = new Map();
          let suggestions = [];
          helper('Таблица = New ValueTable;\nТаблица.').getRefCompletion(suggestions);
          expect(suggestions).to.be.an('array').that.not.is.empty;
          assert.equal(suggestions.some(suggest => suggest.label === "ВыгрузитьКолонку"), true);
        });

        it("проброс типа при присваивании переменной", function () {
          window.contextData = new Map();
          let suggestions = [];
          helper('Таблица = Новый ТаблицаЗначений;\nТЗ = Таблица;\nТЗ.').getRefCompletion(suggestions);
          expect(suggestions).to.be.an('array').that.not.is.empty;
          assert.equal(suggestions.some(suggest => suggest.label === "ВыгрузитьКолонку"), true);
        });

        it("тип результата метода: строка таблицы значений", function () {
          window.contextData = new Map();
          let suggestions = [];
          helper('Таблица = Новый ТаблицаЗначений;\nСтр = Таблица.Добавить();\nСтр.').getRefCompletion(suggestions);
          expect(suggestions).to.be.an('array').that.not.is.empty;
          assert.equal(suggestions.some(suggest => suggest.label === "Владелец"), true);
        });

        it("тип результата свойства: коллекция колонок", function () {
          window.contextData = new Map();
          let suggestions = [];
          helper('Таблица = Новый ТаблицаЗначений;\nКолонки = Таблица.Колонки;\nКолонки.').getRefCompletion(suggestions);
          expect(suggestions).to.be.an('array').that.not.is.empty;
          assert.equal(suggestions.some(suggest => suggest.label === "Добавить"), true);
        });

        it("берётся последнее присваивание выше позиции", function () {
          window.contextData = new Map();
          let suggestions = [];
          helper('Значение = Новый Массив;\nЗначение = Новый ТаблицаЗначений;\nЗначение.').getRefCompletion(suggestions);
          expect(suggestions).to.be.an('array').that.not.is.empty;
          assert.equal(suggestions.some(suggest => suggest.label === "ВыгрузитьКолонку"), true);
        });

        it("присваивание внутри строки или комментария не типизирует", function () {
          window.contextData = new Map();
          let suggestions = [];
          helper('Текст = "Таблица = Новый ТаблицаЗначений";\n// Таблица = Новый ТаблицаЗначений\nТаблица.').getRefCompletion(suggestions);
          expect(suggestions).to.be.an('array').that.is.empty;
        });

        it("сравнение не принимается за присваивание", function () {
          window.contextData = new Map();
          let suggestions = [];
          helper('Если Таблица == Неопределено Тогда\nКонецЕсли;\nТаблица.').getRefCompletion(suggestions);
          expect(suggestions).to.be.an('array').that.is.empty;
        });

        it("циклическое присваивание не вешает разбор", function () {
          window.contextData = new Map();
          let suggestions = [];
          helper('А = Б;\nБ = А;\nА.').getRefCompletion(suggestions);
          expect(suggestions).to.be.an('array').that.is.empty;
        });

        it("неизвестный тип не даёт подсказок и не бросает", function () {
          window.contextData = new Map();
          let suggestions = [];
          helper('Объект = Новый ЧегоТакогоНетВСправочнике;\nОбъект.').getRefCompletion(suggestions);
          expect(suggestions).to.be.an('array').that.is.empty;
        });

        it("тип переменной не подменяется типом из соседнего вызова (issue #305)", function () {
          // Полевой отчёт: после `А.` предлагались свойства КОЛОНКИ (Заголовок, Имя, Ширина,
          // ТипЗначения), потому что эвристика lookBehind переиспользовала тип из
          // `А.Колонки.Добавить(...)`, сохранённый в contextData при выборе подсказки.
          window.contextData = new Map([
            [2, new Map([
              ["колонки", { "ref": "types.КоллекцияКолонокТаблицыЗначений", "sig": null }],
              ["добавить", { "ref": "types.КолонкаТаблицыЗначений", "sig": null }]
            ])],
            [5, new Map([["добавить", { "ref": "types.СтрокаТаблицыЗначений", "sig": null }]])]
          ]);
          let suggestions = [];
          helper('А = Новый ТаблицаЗначений();\nА.Колонки.Добавить("Колонка1");\n\nСтр = А.Добавить();\n\nА.').getRefCompletion(suggestions);
          expect(suggestions).to.be.an('array').that.not.is.empty;
          assert.equal(suggestions.some(suggest => suggest.label === "ВыгрузитьКолонку"), true);
          assert.equal(suggestions.some(suggest => suggest.label === "ТипЗначения"), false);
          window.contextData = new Map();
        });

        it("тип от 1С сильнее выведенного из текста", function () {
          let suggestions = [];
          window.contextData = new Map([
            [2, new Map([["таблица", { "ref": "catalogs.Товары", "sig": null }]])]
          ]);
          helper('Таблица = Новый ТаблицаЗначений;\nТаблица.').getRefCompletion(suggestions);
          expect(suggestions).to.be.an('array').that.not.is.empty;
          assert.equal(suggestions.some(suggest => suggest.label === "СтавкаНДС"), true);
          assert.equal(suggestions.some(suggest => suggest.label === "ВыгрузитьКолонку"), false);
          window.contextData = new Map();
        });

      });

      describe("типизирующие комментарии (specs/type-inference, Этап 2)", function () {

        it("форма `// Имя - Тип` без присваивания", function () {
          window.contextData = new Map();
          let suggestions = [];
          helper('// Таб - ТаблицаЗначений\nТаб.').getRefCompletion(suggestions);
          expect(suggestions).to.be.an('array').that.not.is.empty;
          assert.equal(suggestions.some(suggest => suggest.label === "ВыгрузитьКолонку"), true);
        });

        it("форма `// Имя - Тип` над присваиванием", function () {
          window.contextData = new Map();
          let suggestions = [];
          helper('// Таб - ТаблицаЗначений\nТаб = ПолучитьТаблицу();\nТаб.').getRefCompletion(suggestions);
          expect(suggestions).to.be.an('array').that.not.is.empty;
          assert.equal(suggestions.some(suggest => suggest.label === "ВыгрузитьКолонку"), true);
        });

        it("тип в конце строки присваивания", function () {
          window.contextData = new Map();
          let suggestions = [];
          helper('Таб = ПолучитьТаблицу(); // ТаблицаЗначений\nТаб.').getRefCompletion(suggestions);
          expect(suggestions).to.be.an('array').that.not.is.empty;
          assert.equal(suggestions.some(suggest => suggest.label === "ВыгрузитьКолонку"), true);
        });

        it("блок `// Структура:` добавляет объявленные свойства", function () {
          window.contextData = new Map();
          let suggestions = [];
          helper('// Структура:\n//    * Свойство1 - Строка\n//    * Свойство2 - Число\nПарам = ПолучитьПараметры();\nПарам.').getRefCompletion(suggestions);
          expect(suggestions).to.be.an('array').that.not.is.empty;
          assert.equal(suggestions.some(suggest => suggest.label === "Свойство1"), true);
          assert.equal(suggestions.some(suggest => suggest.label === "Свойство2"), true);
          assert.equal(suggestions.some(suggest => suggest.label === "Вставить"), true);
        });

        it("тип объявленного свойства работает по цепочке", function () {
          window.contextData = new Map();
          let suggestions = [];
          helper('// Структура:\n//    * Таблица - ТаблицаЗначений\nПарам = ПолучитьПараметры();\nТЗ = Парам.Таблица;\nТЗ.').getRefCompletion(suggestions);
          expect(suggestions).to.be.an('array').that.not.is.empty;
          assert.equal(suggestions.some(suggest => suggest.label === "ВыгрузитьКолонку"), true);
        });

        it("комментарий сильнее вывода из кода", function () {
          window.contextData = new Map();
          let suggestions = [];
          helper('Знач = Новый Массив; // ТаблицаЗначений\nЗнач.').getRefCompletion(suggestions);
          expect(suggestions).to.be.an('array').that.not.is.empty;
          assert.equal(suggestions.some(suggest => suggest.label === "ВыгрузитьКолонку"), true);
        });

        it("неизвестный тип в комментарии игнорируется", function () {
          window.contextData = new Map();
          let suggestions = [];
          helper('// Таб - ЧегоТакогоНетВСправочнике\nТаб.').getRefCompletion(suggestions);
          expect(suggestions).to.be.an('array').that.is.empty;
        });

        it("блок свойств рвётся строкой кода", function () {
          window.contextData = new Map();
          let suggestions = [];
          helper('// Структура:\n//    * Свойство1 - Строка\nВыполнить();\nПарам = ПолучитьПараметры();\nПарам.').getRefCompletion(suggestions);
          expect(suggestions).to.be.an('array').that.is.empty;
        });

      });

      describe("состояние коллекций: ключи и колонки (specs/type-inference, Этап 3)", function () {

        function helperAt(string, lineNumber, column) {
          let model = getModel(string);
          return new bslHelper(model, new monaco.Position(lineNumber, column));
        }

        it("ключи из конструктора Новый Структура", function () {
          window.contextData = new Map();
          let suggestions = [];
          helper('С = Новый Структура("Ключ1, Ключ2");\nС.').getRefCompletion(suggestions);
          assert.equal(suggestions.some(suggest => suggest.label === "Ключ1"), true);
          assert.equal(suggestions.some(suggest => suggest.label === "Ключ2"), true);
        });

        it("Вставить добавляет ключ к типу из комментария", function () {
          window.contextData = new Map();
          let suggestions = [];
          helper('А = ПолучитьСтруктуру(); // Структура\nА.Вставить("Ключ1", "");\nА.').getRefCompletion(suggestions);
          assert.equal(suggestions.some(suggest => suggest.label === "Ключ1"), true);
          assert.equal(suggestions.some(suggest => suggest.label === "Вставить"), true);
        });

        it("Удалить снимает ключ", function () {
          window.contextData = new Map();
          let suggestions = [];
          helper('С = Новый Структура("Ключ1, Ключ2");\nС.Удалить("Ключ1");\nС.').getRefCompletion(suggestions);
          assert.equal(suggestions.some(suggest => suggest.label === "Ключ2"), true);
          assert.equal(suggestions.some(suggest => suggest.label === "Ключ1"), false);
        });

        it("Очистить снимает все ключи", function () {
          window.contextData = new Map();
          let suggestions = [];
          helper('С = Новый Структура("Ключ1, Ключ2");\nС.Очистить();\nС.').getRefCompletion(suggestions);
          assert.equal(suggestions.some(suggest => suggest.label === "Ключ1"), false);
          assert.equal(suggestions.some(suggest => suggest.label === "Ключ2"), false);
        });

        it("операции применяются по порядку: удалили и вставили снова", function () {
          window.contextData = new Map();
          let suggestions = [];
          helper('С = Новый Структура;\nС.Вставить("Ключ1", 1);\nС.Удалить("Ключ1");\nС.Вставить("Ключ1", 2);\nС.').getRefCompletion(suggestions);
          assert.equal(suggestions.some(suggest => suggest.label === "Ключ1"), true);
        });

        it("учитываются только операции выше курсора", function () {
          window.contextData = new Map();
          let suggestions = [];
          helperAt('С = Новый Структура;\nС.Вставить("Ключ1", 1);\nС.\nС.Вставить("Ключ2", 2);', 3, 3).getRefCompletion(suggestions);
          assert.equal(suggestions.some(suggest => suggest.label === "Ключ1"), true);
          assert.equal(suggestions.some(suggest => suggest.label === "Ключ2"), false);
        });

        it("колонки таблицы значений добавляются и снимаются", function () {
          window.contextData = new Map();
          let suggestions = [];
          helper('ТЗ = Новый ТаблицаЗначений;\nТЗ.Колонки.Добавить("К1");\nТЗ.Колонки.Добавить("К2");\nТЗ.Колонки.Удалить("К1");\nТЗ.').getRefCompletion(suggestions);
          assert.equal(suggestions.some(suggest => suggest.label === "К2"), true);
          assert.equal(suggestions.some(suggest => suggest.label === "К1"), false);
        });

        it("Колонки.Вставить добавляет колонку: имя идёт вторым аргументом", function () {
          window.contextData = new Map();
          let suggestions = [];
          helper('ТЗ = Новый ТаблицаЗначений;\nТЗ.Колонки.Добавить("Имя1");\nТЗ.Колонки.Вставить(1, "Имя2");\nТЗ.').getRefCompletion(suggestions);
          assert.equal(suggestions.some(suggest => suggest.label === "Имя1"), true);
          assert.equal(suggestions.some(suggest => suggest.label === "Имя2"), true);
        });

        it("строка таблицы наследует её колонки", function () {
          window.contextData = new Map();
          let suggestions = [];
          helper('ТЗ = Новый ТаблицаЗначений;\nТЗ.Колонки.Добавить("К1");\nСтр = ТЗ.Добавить();\nСтр.').getRefCompletion(suggestions);
          assert.equal(suggestions.some(suggest => suggest.label === "К1"), true);
          assert.equal(suggestions.some(suggest => suggest.label === "Владелец"), true);
        });

        it("Удалить снимает и имя, объявленное комментарием", function () {
          window.contextData = new Map();
          let suggestions = [];
          helper('// Структура:\n//\t* Ключ1 - Строка\n//\t* Ключ2 - Число\nБ = Тест();\nБ.Удалить("Ключ2");\nБ.').getRefCompletion(suggestions);
          assert.equal(suggestions.some(suggest => suggest.label === "Ключ1"), true);
          assert.equal(suggestions.some(suggest => suggest.label === "Ключ2"), false);
        });

        it("Очистить снимает все имена, включая объявленные комментарием", function () {
          window.contextData = new Map();
          let suggestions = [];
          helper('// Структура:\n//\t* Ключ1 - Строка\nБ = Тест();\nБ.Очистить();\nБ.').getRefCompletion(suggestions);
          assert.equal(suggestions.some(suggest => suggest.label === "Ключ1"), false);
        });

        it("тип объявленного свойства сохраняется после операций над набором", function () {
          window.contextData = new Map();
          let suggestions = [];
          helper('// Структура:\n//\t* Таблица - ТаблицаЗначений\n//\t* Лишний - Строка\nПарам = Тест();\nПарам.Удалить("Лишний");\nТЗ = Парам.Таблица;\nТЗ.').getRefCompletion(suggestions);
          assert.equal(suggestions.some(suggest => suggest.label === "ВыгрузитьКолонку"), true);
        });

        it("ключи соответствия не подсказываются: точкой к ним не обращаются", function () {
          window.contextData = new Map();
          let suggestions = [];
          helper('М = Новый Соответствие;\nМ.Вставить("Ключ1", 1);\nМ.').getRefCompletion(suggestions);
          assert.equal(suggestions.some(suggest => suggest.label === "Вставить"), true);
          assert.equal(suggestions.some(suggest => suggest.label === "Ключ1"), false);
        });

        it("ключ из строкового литерала не принимается за код", function () {
          window.contextData = new Map();
          let suggestions = [];
          helper('Текст = "С.Вставить(""Фейк"", 1)";\nС = Новый Структура;\nС.Вставить("Ключ1", 1);\nС.').getRefCompletion(suggestions);
          assert.equal(suggestions.some(suggest => suggest.label === "Ключ1"), true);
          assert.equal(suggestions.some(suggest => suggest.label === "Фейк"), false);
        });

      });

      describe("подсказка ключей в первом параметре Свойство (issue #228)", function () {

        let previousCustomObjects;

        beforeEach(function () {
          previousCustomObjects = window.bslMetadata.customObjects.items;
          window.bslMetadata.customObjects.items = {
            "Параметры": {
              "ref": "classes.Структура",
              "properties": {
                "Номенклатура": {
                  "name": "Номенклатура",
                  "description": "Ссылка на справочник номенклатуры",
                  "ref": "catalogs.Товары"
                },
                "Остаток": {
                  "name": "Остаток"
                },
                "МассивТоваров": {
                  "name": "МассивТоваров",
                  "ref": "classes.Массив"
                }
              }
            },
            "ФиксированныеПараметры": {
              "ref": "classes.ФиксированнаяСтруктура",
              "properties": {
                "Ключ": { "name": "Ключ" }
              }
            },
            "НеструктурныйОбъект": {
              "ref": "classes.Массив",
              "properties": {
                "ЛожноеСвойство": { "name": "ЛожноеСвойство" }
              }
            }
          };
          window.contextData = new Map();
        });

        afterEach(function () {
          window.bslMetadata.customObjects.items = previousCustomObjects;
          window.contextData = new Map();
        });

        function getPropertyCompletion(text) {
          let bsl = helper(text);
          let completion = bsl.getCompletion({ triggerCharacter: '"' });
          return { bsl: bsl, suggestions: completion.suggestions };
        }

        it("предлагает свойства пользовательского объекта", function () {
          let result = getPropertyCompletion('Параметры.Свойство("');
          let labels = result.suggestions.map(suggestion => suggestion.label);

          expect(labels).to.include.members(["Номенклатура", "Остаток", "МассивТоваров"]);
          assert.equal(labels.includes("Вставить"), false);
        });

        it("поддерживает фиксированную структуру и английское имя Property", function () {
          let suggestions = getPropertyCompletion('ФиксированныеПараметры.Property("').suggestions;
          assert.equal(suggestions.some(suggestion => suggestion.label === "Ключ"), true);
        });

        it("фильтрует префикс и заменяет только текст внутри кавычек", function () {
          let result = getPropertyCompletion('Параметры.Свойство("Но');
          let suggestion = result.suggestions.find(item => item.label === "Номенклатура");

          expect(result.suggestions).to.have.length(1);
          expect(suggestion).to.not.equal(undefined);
          assert.equal(suggestion.insertText, "Номенклатура");
          assert.equal(result.bsl.model.getValueInRange(suggestion.range), "Но");
        });

        it("применяет операции кода поверх свойств customObjects", function () {
          let suggestions = getPropertyCompletion(
            'Параметры.Удалить("Остаток");\n'
            + 'Параметры.Вставить("НовыйКлюч", 1);\n'
            + 'Параметры.Свойство("'
          ).suggestions;

          assert.equal(suggestions.some(item => item.label === "Номенклатура"), true);
          assert.equal(suggestions.some(item => item.label === "НовыйКлюч"), true);
          assert.equal(suggestions.some(item => item.label === "Остаток"), false);
        });

        it("использует ключи локальной структуры из конструктора и операций", function () {
          let suggestions = getPropertyCompletion(
            'С = Новый Структура("Ключ1, Ключ2");\n'
            + 'С.Удалить("Ключ1");\n'
            + 'С.Вставить("Ключ3", 3);\n'
            + 'С.Свойство("'
          ).suggestions;

          assert.equal(suggestions.some(item => item.label === "Ключ1"), false);
          assert.equal(suggestions.some(item => item.label === "Ключ2"), true);
          assert.equal(suggestions.some(item => item.label === "Ключ3"), true);
        });

        it("использует типизирующий комментарий и учитывает Очистить", function () {
          let suggestions = getPropertyCompletion(
            '// Структура:\n'
            + '// * Объявленный - Строка\n'
            + 'С = ПолучитьПараметры();\n'
            + 'С.Очистить();\n'
            + 'С.Вставить("ПослеОчистки", 1);\n'
            + 'С.Свойство("'
          ).suggestions;

          assert.equal(suggestions.some(item => item.label === "Объявленный"), false);
          assert.equal(suggestions.some(item => item.label === "ПослеОчистки"), true);
        });

        it("не срабатывает вне первого незакрытого строкового параметра", function () {
          let texts = [
            'Параметры.Свойство("Номенклатура")',
            'Параметры.Свойство("Номенклатура", "',
            'Параметры.Вставить("',
            'Неизвестный.Свойство("',
            'НеструктурныйОбъект.Свойство("'
          ];

          texts.forEach(text => {
            let suggestions = getPropertyCompletion(text).suggestions;
            assert.equal(suggestions.some(item => item.label === "Номенклатура" || item.label === "ЛожноеСвойство"), false, text);
          });
        });

        it("не срабатывает в режиме запроса и СКД", function () {
          let originalIsQueryMode = window.isQueryMode;
          let originalIsDCSMode = window.isDCSMode;

          try {
            let bsl = helper('Параметры.Свойство("');
            let suggestions = [];

            window.isQueryMode = function () { return true; };
            assert.equal(bsl.getStructurePropertyNameCompletion(suggestions), false);
            expect(suggestions).to.be.empty;

            window.isQueryMode = function () { return false; };
            window.isDCSMode = function () { return true; };
            assert.equal(bsl.getStructurePropertyNameCompletion(suggestions), false);
            expect(suggestions).to.be.empty;
          }
          finally {
            window.isQueryMode = originalIsQueryMode;
            window.isDCSMode = originalIsDCSMode;
          }
        });

      });

      describe("setObjectContext: контекст текущего объекта", function () {

        it("подсказки объекта по Ctrl+Space в пустом редакторе", function () {
          try {
            window.setObjectContext('Справочники.Товары');
            let suggestions = [];
            bsl = helper('');
            bsl.getRefSuggestions(suggestions, { ref: window.objectContext, parent_ref: null, sig: null });
            expect(suggestions).to.be.an('array').that.not.is.empty;
            assert.equal(suggestions.some(suggest => suggest.label === "Записать"), true);
            assert.equal(suggestions.some(suggest => suggest.label === "Заблокировать"), true);
            assert.equal(suggestions.some(suggest => suggest.label === "ОбменДанными"), true);
          }
          finally {
            window.clearObjectContext();
          }
        });

        it("подсказки объекта при наборе префикса", function () {
          try {
            window.setObjectContext('Справочники.Товары');
            bsl = helper('Запи');
            let suggestions = bsl.getCodeCompletion({ triggerCharacter: '' });
            expect(suggestions).to.be.an('array').that.not.is.empty;
            assert.equal(suggestions.some(suggest => suggest.label === "Записать"), true);
          }
          finally {
            window.clearObjectContext();
          }
        });

        it("подсказка после точки для переменной ЭтотОбъект", function () {
          try {
            window.setObjectContext('Справочники.Товары');
            bsl = helper('ЭтотОбъект.');
            let suggestions = [];
            bsl.getRefCompletion(suggestions);
            expect(suggestions).to.be.an('array').that.not.is.empty;
            assert.equal(suggestions.some(suggest => suggest.label === "Записать"), true);
            assert.equal(suggestions.some(suggest => suggest.label === "ОбменДанными"), true);
          }
          finally {
            window.clearObjectContext();
          }
        });

        it("подсказка после точки для переменной ThisObject", function () {
          try {
            window.setObjectContext('Справочники.Товары');
            bsl = helper('ThisObject.');
            let suggestions = [];
            bsl.getRefCompletion(suggestions);
            expect(suggestions).to.be.an('array').that.not.is.empty;
            assert.equal(suggestions.some(suggest => suggest.label === "Записать"), true);
          }
          finally {
            window.clearObjectContext();
          }
        });

        it("другие переменные после точки не получают объектный контекст", function () {
          try {
            window.setObjectContext('Справочники.Товары');
            bsl = helper('СпрОбъект.');
            let suggestions = [];
            bsl.getRefCompletion(suggestions);
            assert.equal(suggestions.some(suggest => suggest.label === "ОбменДанными"), false);
            assert.equal(suggestions.some(suggest => suggest.label === "Записать"), false);
          }
          finally {
            window.clearObjectContext();
          }
        });

        it("переменная со своим контекстом работает как раньше", function () {
          try {
            window.setObjectContext('Справочники.Товары');
            bsl = helper('СтавкаНДС = Справочники.СтавкиНДС.НайтиПоКоду(1);\nСтавкаНДС.');
            let suggestions = [];
            bsl.getMetadataCompletion(suggestions, window.bslMetadata)
            expect(suggestions).to.be.an('array').that.not.is.empty;
            assert.equal(suggestions.some(suggest => suggest.label === "Ставка"), true);
          }
          finally {
            window.clearObjectContext();
          }
        });

        it("clearObjectContext снимает установленный контекст объекта", function () {
          window.setObjectContext('Справочники.Товары');
          assert.equal(window.clearObjectContext(), true);
          bsl = helper('ЭтотОбъект.');
          let suggestions = [];
          bsl.getRefCompletion(suggestions);
          assert.equal(suggestions.some(suggest => suggest.label === "ОбменДанными"), false);
        });

      })

      it("проверка подсказки параметров для функции ВыгрузитьКолонку таблицы значений, полученной из другой таблицы", function () {
        bsl = helper('Таблица1 = Новый ТаблицаЗначений();\nТаблица2 = Таблица1.Скопировать();\nТаблица2.ВыгрузитьКолонку(');
        let suggestions = [];  
        let signature = {
          "default": {
            "СтрокаПараметров": "(Колонка: Число): Массив",
            "Параметры": {
              "Колонка": "Колонка, из которой нужно выгрузить значения. В качестве значения параметра может быть передан индекс колонки, имя колонки, либо колонка дерева значений."
            }
          }
        };
        window.contextData = new Map([
          [2, new Map([["скопировать", { "ref": "classes.ТаблицаЗначений", "sig": null }]])],
          [3, new Map([["выгрузитьколонку", { "ref": "classes.Массив", "sig": signature }]])]
        ]);        
        let context = bsl.getLastSigMethod({});
        let help = bsl.getRefSigHelp(context);
        expect(help).to.have.property('activeParameter');
        window.contextData = new Map();
      });

      it("проверка подсказки для таблицы, полученной функцией НайтиПоСсылкам", function () {              	                                
        bsl = helper('Таблица = НайтиПоСсылкам();\nТаблица.');
        let suggestions = [];        
        window.contextData = new Map([
          [1, new Map([["найтипоссылкам", { "ref": "classes.ТаблицаЗначений", "sig": null }]])]          
        ]);        
        bsl.getRefCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "ВыгрузитьКолонку"), true);        
        window.contextData = new Map();
      });

      it("проверка подсказки для таблицы, полученной из результата запроса в одну строку", function () {              	                                
        bsl = helper('ОбъектЗапрос = Новый Запрос();\nТаблица = ОбъектЗапрос.Выполнить().Выгрузить().');
        let suggestions = [];        
        window.contextData = new Map([
          [2, new Map([["выполнить", { "ref": "types.РезультатЗапроса", "sig": null }]])],
          [2, new Map([["выгрузить", { "ref": "classes.ТаблицаЗначений", "sig": null }]])]
        ]);        
        bsl.getRefCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "Скопировать"), true);        
        window.contextData = new Map();
      });

      it("проверка подсказки имен переменных", function () {              	                                
        bsl = helper('Функция МояФункция(Парам1, Парам2, Парам3)\nПараметрыФормы = Новый Структура();\nПарам');        
        let suggestions = [];
        bsl.getVariablesCompetition(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "Парам1"), true);
        assert.equal(suggestions.some(suggest => suggest.label === "ПараметрыФормы"), true);
      });

      it("проверка подсказки для реквизитов составного типа", function () {              	                                
        bsl = helper('_ОстаткиТовара.Номенклатура.');
        let suggestions = [];
        window.contextData = new Map([
          [1, new Map([["номенклатура", { "ref": "catalogs.Товары, documents.ПриходнаяНакладная", "sig": null }]])]
        ]);
        bsl.getRefCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "СтавкаНДС") && suggestions.some(suggest => suggest.label === "СуммаДокумента"), true);
        window.contextData = new Map();
      });

      it("проверка подсказки объекта, полученного методом ПолучитьОбъект()", function () {              	                                
        bsl = helper('СправочникСсылка = Справочник.Товары.НайтиПоКоду(1);\nСправочникОбъект = СправочникСсылка.ПолучитьОбъект();\nСправочникОбъект.');
        let suggestions = [];        
        window.contextData = new Map([
          [2, new Map([["получитьобъект", { "ref": "catalogs.Товары.obj", "sig": null }]])],          
        ]);        
        bsl.getRefCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "Заблокирован"), true);        
        window.contextData = new Map();
      });

      it("проверка подсказки ресурсов регистра", function () {              	                                
        bsl = helper('Рег = РегистрыНакопления.ОстаткиТоваров.СоздатьНаборЗаписей();(1);\nРег.');
        let suggestions = [];                
        bsl.getMetadataCompletion(suggestions, window.bslMetadata);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "Себестоимость"), true);
      });

      it("проверка подсказки определяемой по стеку для метаданных (первый потомок)", function () {
        
        let position = new monaco.Position(104, 17);
        let model = window.editor.getModel();
        editor.setPosition(position);
        bsl = new bslHelper(model, position);
        let suggestions = [];
        bsl.getStackCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "ПодотчетноеЛицо"), true);
        assert.equal(suggestions.some(suggest => suggest.label === "Заблокировать"), true);

      });

      it("проверка подсказки определяемой по стеку для метаданных (второй потомок)", function () {
        
        let position = new monaco.Position(109, 19);
        let model = window.editor.getModel();
        editor.setPosition(position);
        let bsl = new bslHelper(model, position);
        let suggestions = [];
        bsl.getStackCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "СуммаДокумента"), true);
        assert.equal(suggestions.some(suggest => suggest.label === "Заблокировать"), true);        

      });

      it("проверка подсказки определяемой по стеку для метаданных через ранее определенную ссылку", function () {
        
        let map = new Map();
        map.set('товарссылка', {list:[], ref: 'catalogs.Товары', sig: null});
        window.contextData.set(111, map);

        let position = new monaco.Position(113, 18);
        let model = window.editor.getModel();
        editor.setPosition(position);
        let bsl = new bslHelper(model, position);
        let suggestions = [];
        bsl.getStackCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "Ставка"), true);
        assert.equal(suggestions.some(suggest => suggest.label === "Заблокировать"), true);

      });

      it("проверка подсказки определяемой по стеку для пользовательских объектов", function () {

        let position = new monaco.Position(116, 24);
        let model = window.editor.getModel();
        editor.setPosition(position);
        let bsl = new bslHelper(model, position);
        let suggestions = [];
        bsl.getStackCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "СтавкаНДС"), true);

      });

      it("проверка подсказки определяемой по стеку для классов", function () {

        let position = new monaco.Position(123, 12);
        let model = window.editor.getModel();
        editor.setPosition(position);
        bsl = new bslHelper(model, position);
        let suggestions = [];
        bsl.getStackCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "Следующий"), true);

      });

      it("проверка подсказки свойтва объекта 'ОбменДанными'", function () {
        
        bsl = helper('Спр = Справочники.Товары.НайтиПоКоду(1);\nСпр2 = Спр.ПолучитьОбъект();\nСпр2.');
        let suggestions = [];
        window.contextData = new Map([
          [2, new Map([["получитьобъект", { "ref": "catalogs.Товары.obj", "sig": null }]])],          
        ]);        
        bsl.getRefCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "ОбменДанными"), true);      

        bsl = helper('Спр = Справочники.Товары.НайтиПоКоду(1);\nСпр2 = Спр.ПолучитьОбъект();\nСпр2.ОбменДанными.');
        suggestions = [];
        window.contextData = new Map([
          [3, new Map([["обменданными", { "ref": "types.ПараметрыОбменаДанными", "sig": null }]])],          
        ]);        
        bsl.getRefCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "Загрузка"), true);      

      });

      it("проверка подсказки методов менеджера справочника", function () {              	                                
        bsl = helper('Справочники.Товары.');
        let suggestions = [];                
        bsl.getMetadataCompletion(suggestions, window.bslMetadata);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "ПервыйМетодМенеджера"), true);
      });

      it("проверка подсказки параметров для метода менеджера справочника", function () {
        bsl = helper('Справочники.Товары.ПервыйМетодМенеджера(');
        let context = bsl.getLastSigMethod({});
        let help = bsl.getMetadataSigHelp(context, window.bslMetadata);
        expect(help).to.have.property('activeParameter');
      });

      it("проверка подсказки методов объекта справочника", function () {              	                                
        
        bsl = helper('Спр = Справочники.Товары.НайтиПоКоду(1);\nСпр2 = Спр.');
        let suggestions = [];                
        bsl.getMetadataCompletion(suggestions, window.bslMetadata);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "ПервыйМетодМенеджера"), false);
        
        bsl = helper('Спр = Справочники.Товары.НайтиПоКоду(1);\nСпр2 = Спр.ПолучитьОбъект();\nСпр2.');
        suggestions = bsl.getCodeCompletion({triggerCharacter: ''});
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "ПервыйМетодОбъекта"), true);

      });

      it("проверка загрузки общего модуля (обычный и глобальный)", function () {
        
        let text = getModuleText();
        bslHelper.parseCommonModule('ОбщегоНазначения', text, false);
        
        bsl = helper('ОбщегоНазначения.');
        let suggestions = bsl.getCodeCompletion({triggerCharacter: ''});
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "ЗначениеРеквизитаОбъекта"), true);

        bsl = helper('ЗначениеРеквиз');
        suggestions = bsl.getCodeCompletion({triggerCharacter: ''});
        expect(suggestions).to.be.an('array').that.is.empty;        

        bslHelper.parseCommonModule('ОбщегоНазначения', text, true);

        suggestions = bsl.getCodeCompletion({triggerCharacter: ''});
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "ЗначениеРеквизитаОбъекта"), true);

        bsl = helper('ЕстьСсылкиНаОбъект(');
        let context = bsl.getLastSigMethod({});
        let help = bsl.getCommonSigHelp(context, window.bslGlobals.globalfunctions);
        expect(help).to.have.property('signatures');
        expect(help.signatures).to.be.an('array').that.not.is.empty;
        assert.equal(
          help.signatures.some(
            signature => expect(signature).to.have.property('parameters') &&
            signature.parameters.some(param => param.documentation.indexOf('ЛюбаяСсылка, Массив - объект или список объектов') === 0)
          ), true
        );
        
      });

      it("проверка загрузки модуля менеджера объекта метаданных", function () {

        let text = getModuleText();
        bslHelper.parseMetadataModule(text, 'documents.items.АвансовыйОтчет.manager');

        bsl = helper('Документы.АвансовыйОтчет.');
        let suggestions = [];                
        bsl.getMetadataCompletion(suggestions, window.bslMetadata);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "ЗаменитьСсылки"), true);

      });

      it("проверка подсказки описания метаданных", function () {

        let position = new monaco.Position(160, 13);
        let model = window.editor.getModel();
        window.editor.setPosition(position);
        bsl = new bslHelper(model, position);
        let suggestions = bsl.getCodeCompletion({ triggerCharacter: '' });
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "Автонумерация"), true);
        assert.equal(suggestions.some(suggest => suggest.label === "ПолучитьИменаПредопределенных"), true);

      });

      it("проверка подсказки по глобальной структуре метаданных", function () {

        bsl = helper('Структура.Метаданные.');
        let suggestions = [];
        bsl.getMetadataDescription(suggestions);
        expect(suggestions).to.be.an('array').that.is.empty;

        bsl = helper('(Метаданные.');
        suggestions = [];
        bsl.getMetadataDescription(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "Справочники"), true);

      });

      it("проверка подсказки структуры метаданных справочника 'Товары'", function () {

        contextData = new Map([
          [1, new Map([["товары", { "ref": "catalogs.metadata.Товары", "sig": null }]])],
        ]);

        bsl = helper('(Метаданные.Справочники.Товары.');
        let suggestions = bsl.getCodeCompletion({triggerCharacter: ''});
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(
          suggestions.some(
            suggest => suggest.label === "Реквизиты" &&
            expect(suggest).to.have.property('command') &&
            expect(suggest.command).to.have.property('arguments') &&
            expect(suggest.command.arguments).to.be.an('array').that.not.is.empty &&
            suggest.command.arguments.some(
              arg => expect(arg).to.have.property('data') &&
              expect(arg.data.list).to.be.an('array').that.not.is.empty &&
              arg.data.list.some(
                list => list.name === "СтавкаНДС" &&
                list.ref === "metadataObjectCollection.Реквизит"
              )
            )
          ), true
        );

      });

      it("проверка подсказки табличных частей для справочника 'Товары.' ", function () {

        bsl = helper('Товар = Справочники.Товары.НайтиПоКоду(1);\nТовар.');
        let suggestions = [];
        bsl.getMetadataCompletion(suggestions, bslMetadata)
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "ДополнительныеРеквизиты"), true);

      });

      it("проверка подсказки методов табличных частей для справочника 'Товары.' по ссылке", function () {
        
        bsl = helper('Спр = Справочники.Товары.НайтиПоКоду(1);\nСпр.ДополнительныеРеквизиты.');        
        let suggestions = [];
        window.contextData = new Map([
          [2, new Map([["дополнительныереквизиты", { "ref": "universalObjects.ТабличнаяЧасть", "sig": null }]])],
        ]);
        bsl.getRefCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "ВыгрузитьКолонки"), true);      

      });

      it("проверка подсказки реквизитов строки табличной частей для справочника 'Товары.' по ссылке", function () {

        bsl = helper('Спр = Справочники.Товары.НайтиПоКоду(1);\nСтрокаТЧ = Спр.ДополнительныеРеквизиты.Добавить();\nСтрокаТЧ.');
        let suggestions = [];
        window.contextData = new Map([
          [2, new Map([["добавить", { "ref": "catalogs.Товары.tabulars.ДополнительныеРеквизиты,universalObjects.СтрокаТабличнойЧасти", "sig": null }]])],
        ]);
        bsl.getRefCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "ЗначениеРеквизита"), true);
        assert.equal(suggestions.some(suggest => suggest.label === "НомерСтроки"), true);

      });

      it("проверка подсказки реквизитов строки табличной части определяемой по стеку", function () {

        bsl = helper('Спр = Справочники.Товары.НайтиПоКоду(1);\nСтрокаТЧ = Спр.ДополнительныеРеквизиты.Добавить();\nСтрокаТЧ.');
        window.contextData.clear();
        let suggestions = [];
        bsl.getStackCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "ЗначениеРеквизита"), true);
        assert.equal(suggestions.some(suggest => suggest.label === "НомерСтроки"), true);

      });

      it("проверка подсказки реквизитов строки табличной части при получении по индексу (отдельная переменная для ТЧ)", function () {

        bsl = helper('Спр = Справочники.Товары.НайтиПоКоду(1);\nСтрокаТЧ = Спр.ДополнительныеРеквизиты[0];\nСтрокаТЧ.');
        window.contextData.clear();
        let suggestions = [];
        bsl.getStackCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "ЗначениеРеквизита"), true);
        assert.equal(suggestions.some(suggest => suggest.label === "НомерСтроки"), true);

      });

      it("проверка подсказки реквизитов строки табличной части при получении через метод в строке", function () {

        bsl = helper('Спр = Справочники.Товары.НайтиПоКоду(1);\nСтрокаТЧ = Спр.ДополнительныеРеквизиты.Получить(0).');
        window.contextData.clear();
        let suggestions = [];
        bsl.getStackCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "ЗначениеРеквизита"), true);
        assert.equal(suggestions.some(suggest => suggest.label === "НомерСтроки"), true);

      });

      it("проверка подсказки реквизитов строки табличной части при получении через индекс в строке", function () {

        bsl = helper('Спр = Справочники.Товары.НайтиПоКоду(1);\nСтрокаТЧ = Спр.ДополнительныеРеквизиты[0].');
        window.contextData.clear();
        let suggestions = [];
        bsl.getStackCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "ЗначениеРеквизита"), true);
        assert.equal(suggestions.some(suggest => suggest.label === "НомерСтроки"), true);

      });

      it("проверка подсказки внешних источников", function () {

        bsl = helper('ВнешниеИсточникиДанных.');
        let suggestions = bsl.getCodeCompletion({triggerCharacter: ''});
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "РозничныйСайт"), true);

      });

      it("проверка подсказки методов и полей внешних источников", function () {

        bsl = helper('ВнешниеИсточникиДанных.РозничныйСайт.');
        let suggestions = bsl.getCodeCompletion({triggerCharacter: ''});
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "Таблицы"), true);
        assert.equal(suggestions.some(suggest => suggest.label === "ПолучитьПараметрыСоединенияПользователя"), true);

      });

      it("проверка подсказки таблиц внешних источников", function () {

        bsl = helper('ВнешниеИсточникиДанных.РозничныйСайт.Таблицы.');
        let suggestions = bsl.getCodeCompletion({triggerCharacter: ''});
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "Customers"), true);

      });

      it("проверка подсказки методов таблиц внешних источников", function () {

        bsl = helper('ВнешниеИсточникиДанных.РозничныйСайт.Таблицы.Customers.');
        let suggestions = bsl.getCodeCompletion({triggerCharacter: ''});
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "СоздатьОбъект"), true);
        assert.equal(suggestions.some(suggest => suggest.label === "СоздатьМенеджерЗаписи"), false);

        bsl = helper('ВнешниеИсточникиДанных.РозничныйСайт.Таблицы.Orders.');
        suggestions = bsl.getCodeCompletion({triggerCharacter: ''});
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "СоздатьОбъект"), true);
        assert.equal(suggestions.some(suggest => suggest.label === "СоздатьМенеджерЗаписи"), true);

      });

      it("проверка подсказки методов менеджера справочников/документов/т.п", function () {

        bsl = helper('Справочники.');
        let suggestions = bsl.getCodeCompletion({triggerCharacter: '.'});
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "ТипВсеСсылки"), true);

      });

      it("проверка подсказки директив компиляции", function () {

        bsl = helper('&');
        let suggestions = bsl.getCodeCompletion({ triggerCharacter: '&' });
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "НаСервере"), true);

        bsl = helper('&');
        suggestions = bsl.getCodeCompletion({ triggerCharacter: '' });
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "НаСервере"), true);

        bsl = helper('&На');
        suggestions = bsl.getCodeCompletion({ triggerCharacter: '' });
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "НаСервере"), true);

        bsl = helper('На &');
        suggestions = bsl.getCodeCompletion({ triggerCharacter: '' });
        expect(suggestions).to.be.an('array').that.is.empty;

      });

      it("проверка подсказки объявленных процедур/функций", function () {

        bsl = helper('Функция МояФункция(Параметры)\n//Код функции\nКонецФункции\n\nРезультат = Моя');
        let suggestions = bsl.getCodeCompletion({ triggerCharacter: '' });
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "МояФункция"), true);
        
      });

      it("проверка подсказки методов макета", function () {

        bsl = helper('Макет = Справочники.Товары.ПолучитьМакет("Макет");\nМакет.');
        let suggestions = bsl.getCodeCompletion({triggerCharacter: '.'});
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "ПолучитьОбласть"), true);
        assert.equal(suggestions.some(suggest => suggest.label === "ПолучитьТекст"), true);
        assert.equal(suggestions.some(suggest => suggest.label === "Размер"), true);
        assert.equal(suggestions.some(suggest => suggest.label === "ПолучитьОбъект"), false);

      });

      it("проверка получения ресурсов регистра сведений по указанным ключевым полям.", function () {

        bsl = helper('Ресурсы = РегистрыСведений.ЦеныНоменклатуры.Получить(Отбор);\Ресурсы.');
        let suggestions = bsl.getCodeCompletion({triggerCharacter: '.'});
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "Цена"), true);
        assert.equal(suggestions.some(suggest => suggest.label === "Номенклатура"), false);

      });

      it("проверка подсказки для элементов массива определеннного типа", function () {
        
        let strJSON = `{
          "customObjects":{
             "Параметры":{
                "ref": "classes.Структура",
                "properties":{
                   "Товары":{
                      "name":"Товары",
                      "ref":"classes.Массив",
                      "item_ref":"catalogs.Товары"
                   }                   
                }
             }
          }
        }`;                
        let res = updateMetadata(strJSON);
        assert.equal(res, true);
        
        bsl = helper(`Для Каждого Товар Из Параметры.Т`);
        let suggestions = bsl.getCodeCompletion({triggerCharacter: '.'});
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "Товары"), true);
        
        bsl = helper(`Для Каждого Товар Из Параметры.Товары Цикл
        Товар.`);
        suggestions = [];
        bsl.getStackCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "Наименование"), true);

        bsl = helper(`Товары = Параметры.Товары;
        Товары.`);
        suggestions = [];
        bsl.getStackCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "Добавить"), true);

        bsl = helper(`Товар = Параметры.Товары[0];
        Товар.`);
        suggestions = [];
        bsl.getStackCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "Наименование"), true);

        bsl = helper(`Для Каждого Товар Из Параметры.Товары Цикл
        ТоварОбъект = Товар.ПолучитьОбъект();
        ТоварОбъект.`);
        suggestions = [];
        bsl.getStackCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "Записать"), true);

      });

      it("проверка поиска определения для функции, вызываемой внутри конструкции", function () {
        
        let model = getModel('Функция СкопироватьРекурсивно(Источник)\n// Какой-то код\nКонецФункции\n\nСтруктура.Вставить(Обход.Ключ, СкопироватьРекурсивно(Обход.Значение));');
        let position = new monaco.Position(5, 33);
        bsl = new bslHelper(model, position);
        let locations = bsl.provideDefinition();
        expect(locations).to.be.an('array').that.not.is.empty;
        position = new monaco.Position(5, 1);
        bsl = new bslHelper(model, position);
        locations = bsl.provideDefinition();
        assert.equal(locations, null);

        model = getModel('Структура.Вставить(Обход.Ключ, СкопироватьРекурсивно(Обход.Значение));\n\nФункция СкопироватьРекурсивно(Источник)\n// Какой-то код\nКонецФункции');
        position =  new monaco.Position(1, 33);
        bsl = new bslHelper(model, position);
        locations = bsl.provideDefinition();
        expect(locations).to.be.an('array').that.not.is.empty;

      });

      it("проверка списка процедур и функций модуля", function () {

        const model = getModel([
          '// Функция ЛожнаяФункция() Экспорт',
          'Текст = "Процедура ЛожнаяПроцедура() Экспорт";',
          '',
          'Процедура БезПараметров()',
          'КонецПроцедуры',
          '',
          'фУнКцИя ЭтоЧисло(',
          '  Знач ПроверяемоеЗначение,',
          '  Настройка = "a,b=c",',
          '  ПустаяСтрока = "",',
          '  Выражение = Обертка(1, 2)',
          ') Экспорт',
          'КонецФункции',
          '',
          'Procedure EnglishMethod(',
          '  Val Value = Undefined,',
          '  Reference',
          ') Export',
          'EndProcedure'
        ].join('\n'));

        const methods = bslHelper.getModuleMethods(model);

        assert.equal(methods.length, 3);
        assert.deepEqual(methods.map(method => method.name), ['БезПараметров', 'ЭтоЧисло', 'EnglishMethod']);

        assert.deepInclude(methods[0], {
          line: 4,
          type: 'procedure',
          isExport: false,
          hasParameters: false
        });
        assert.deepEqual(methods[0].parameters, []);

        assert.deepInclude(methods[1], {
          line: 7,
          type: 'function',
          isExport: true,
          hasParameters: true
        });
        assert.deepEqual(methods[1].parameters, [
          { name: 'ПроверяемоеЗначение', byValue: true, hasDefaultValue: false, defaultValue: null },
          { name: 'Настройка', byValue: false, hasDefaultValue: true, defaultValue: '"a,b=c"' },
          { name: 'ПустаяСтрока', byValue: false, hasDefaultValue: true, defaultValue: '""' },
          { name: 'Выражение', byValue: false, hasDefaultValue: true, defaultValue: 'Обертка(1, 2)' }
        ]);

        assert.deepInclude(methods[2], {
          line: 15,
          type: 'procedure',
          isExport: true,
          hasParameters: true
        });
        assert.deepEqual(methods[2].parameters, [
          { name: 'Value', byValue: true, hasDefaultValue: true, defaultValue: 'Undefined' },
          { name: 'Reference', byValue: false, hasDefaultValue: false, defaultValue: null }
        ]);

      });

      it("проверка символов процедур и функций для Monaco", function () {

        const model = getModel([
          'Процедура ВыполнитьДействие()',
          'КонецПроцедуры',
          '',
          'Функция ПолучитьЗначение() Экспорт',
          'КонецФункции'
        ].join('\n'));

        const symbols = bslHelper.provideDocumentSymbols(model);

        assert.equal(symbols.length, 2);
        assert.equal(symbols[0].kind, monaco.languages.SymbolKind.Method);
        assert.equal(symbols[1].kind, monaco.languages.SymbolKind.Function);
        assert.equal(symbols[0].selectionRange.startLineNumber, 1);
        assert.equal(symbols[1].selectionRange.startLineNumber, 4);
        assert.equal(symbols[1].selectionRange.startColumn, 9);

      });

      it("проверка публичной функции getModuleMethods", function () {

        const originalText = window.editor.getValue();

        try {
          window.editor.setValue('Функция Публичная(Знач Параметр = Ложь) Экспорт\nКонецФункции');
          const methods = JSON.parse(window.getModuleMethods());

          assert.equal(methods.length, 1);
          assert.deepInclude(methods[0], {
            name: 'Публичная',
            line: 1,
            type: 'function',
            isExport: true,
            hasParameters: true
          });
          assert.deepEqual(methods[0].parameters[0], {
            name: 'Параметр',
            byValue: true,
            hasDefaultValue: true,
            defaultValue: 'Ложь'
          });
        }
        finally {
          window.editor.setValue(originalText);
        }

      });

    }

    it("проверка доступности объектов в подсказках при смене контекста", function () {

      window.setContextMode('Server');
      bsl = helper('Товар = Справоч');
      let completion = bsl.getCompletion({ triggerCharacter: undefined });
      expect(completion).to.be.an('object');
      expect(completion.suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(completion.suggestions.some(suggest => suggest.label === "Справочники"), true);

      bsl = helper('Запрос = Новый ');
      completion = bsl.getCompletion({ triggerCharacter: ' ' });
      expect(completion).to.be.an('object');
      expect(completion.suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(completion.suggestions.some(suggest => suggest.label === "Запрос"), true);
      assert.equal(completion.suggestions.some(suggest => suggest.label === "ТаблицаЗначений"), true);
      assert.equal(completion.suggestions.some(suggest => suggest.label === "Массив"), true);

      window.setContextMode('Client');
      bsl = helper('Товар = Справоч');
      completion = bsl.getCompletion({ triggerCharacter: undefined });
      expect(completion).to.be.an('object');
      expect(completion.suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(completion.suggestions.some(suggest => suggest.label === "Справочники"), false);

      bsl = helper('Запрос = Новый ');
      completion = bsl.getCompletion({ triggerCharacter: ' ' });
      console.log(completion);
      expect(completion).to.be.an('object');
      expect(completion.suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(completion.suggestions.some(suggest => suggest.label === "Запрос"), false);
      assert.equal(completion.suggestions.some(suggest => suggest.label === "ТаблицаЗначений"), false);
      assert.equal(completion.suggestions.some(suggest => suggest.label === "Массив"), true);

    });

    it("compare создаётся при отключённых diff-декорациях", async function () {
      const previousShowDiffDecorations = window.getOption('showDiffDecorations');
      const modelsCount = monaco.editor.getModels().length;

      try {
        window.setOption('showDiffDecorations', false);
        assert.doesNotThrow(function () {
          window.compare("123", true, true);
        });
        assert.ok(window.editor.navi);
        await waitFor(function () {
          return Array.isArray(window.editor.getLineChanges());
        }, 2500);
      }
      finally {
        if (window.editor.navi)
          window.compare();
        window.setOption('showDiffDecorations', previousShowDiffDecorations);
      }

      assert.equal(monaco.editor.getModels().length, modelsCount);
    });

    describe("Инлей-хинты (specs/inlay-hints)", function () {

      function controller() {
        return window.editor.inlayHintsController;
      }

      // Спаны injected text имеют динамические классы dyn-rule-* (в атрибуте class после
      // класса токена mtk*, поэтому [class*=]); у whitespace-вставок паддинга текст из
      // узких пробелов \u200a — отбираем «настоящие» хинты и нормализуем неразрывные пробелы
      // (\u00a0, штатная подмена injected text) в обычные. Остальные пользователи dyn-rule-*
      // (color-decorators) в тестовом тексте не встречаются.
      function renderedHintTexts() {
        const nodes = window.editor.getDomNode().querySelectorAll('.view-lines span[class*="dyn-rule-"]');
        const texts = [];
        nodes.forEach(function (node) {
          const text = node.textContent;
          if (text && text.indexOf('\u200a') < 0)
            texts.push(text.replace(/\u00a0/g, ' '));
        });
        return texts;
      }

      // Синтетическое событие мыши по отрисованному хинту: повторяет структуру
      // IEditorMouseEvent для клика по injected text (см. hintFromMouseTarget в inlay_hints.js).
      function clickEvent(hint, modifiers) {
        modifiers = modifiers || {};
        return {
          event: {
            leftButton: true,
            ctrlKey: !!modifiers.ctrl,
            altKey: !!modifiers.alt,
            metaKey: !!modifiers.meta
          },
          target: {
            type: monaco.editor.MouseTargetType.CONTENT_TEXT,
            detail: {
              injectedText: {
                options: {
                  attachedData: { item: { hint: hint } }
                }
              }
            }
          }
        };
      }

      function withCapturedEvents(capturedEvents, run) {
        const originalSendEvent = window.editor.sendEvent;
        window.editor.sendEvent = function (name, params) {
          capturedEvents.push({ name: name, params: params });
        };
        try {
          run();
        }
        finally {
          window.editor.sendEvent = originalSendEvent;
        }
      }

      function clickTab(index) {
        const nodes = document.querySelectorAll('.bsl-editor-tab');
        if (nodes.length > index)
          nodes[index].click();
      }

      afterEach(function () {
        window.clearInlayHints();
      });

      it("setInlayHints рисует хинты, clearInlayHints убирает, getText не содержит текст хинтов", async function () {

        window.updateText('Таб = ПолучитьТаблицу();\nСтр = Таб.Добавить();');

        assert.equal(window.setInlayHints([
          { line: 1, column: 25, text: ': ТаблицаЗначений' },
          { line: 2, column: 22, text: ': СтрокаТаблицыЗначений', id: 'row' }
        ]), true);

        assert.equal(controller().getState().hintsCount, 2);

        await waitFor(function () {
          const texts = renderedHintTexts();
          return texts.length == 2
            && texts.indexOf(': ТаблицаЗначений') >= 0
            && texts.indexOf(': СтрокаТаблицыЗначений') >= 0;
        }, 2500, function () { return 'хинты не отрисованы: ' + JSON.stringify(renderedHintTexts()); });

        assert.equal(window.getText().indexOf('ТаблицаЗначений'), -1);

        window.clearInlayHints();
        assert.equal(controller().getState().hintsCount, 0);
        await waitFor(function () { return renderedHintTexts().length == 0; });

      });

      it("клик по хинту с event_params генерирует EVENT_ON_INLAY_HINT_CLICK с прокинутым значением", async function () {

        window.updateText('Таб = ПолучитьТаблицу();');

        window.setInlayHints([{
          line: 1,
          column: 25,
          text: ': ТаблицаЗначений',
          id: 7,
          event_params: { action: 'open', code: 42 }
        }]);

        await waitFor(function () { return controller().getRenderedHints().length == 1; });

        const capturedEvents = [];

        withCapturedEvents(capturedEvents, function () {
          const event = clickEvent(controller().getRenderedHints()[0]);
          controller().handleMouseDown(event);
          controller().handleMouseUp(event);
        });

        assert.equal(capturedEvents.length, 1);
        assert.equal(capturedEvents[0].name, 'EVENT_ON_INLAY_HINT_CLICK');
        assert.deepEqual(capturedEvents[0].params, {
          id: 7,
          line: 1,
          column: 25,
          text: ': ТаблицаЗначений',
          event_params: { action: 'open', code: 42 }
        });

      });

      it("хинт без event_params не кликабельный, клик с Ctrl не дублирует событие", async function () {

        window.updateText('Таб = ПолучитьТаблицу();');

        window.setInlayHints([
          { line: 1, column: 25, text: ': ТаблицаЗначений' },
          { line: 1, column: 4, text: ': тип', event_params: { action: 'open' } }
        ]);

        await waitFor(function () { return controller().getRenderedHints().length == 2; });

        const capturedEvents = [];
        const renderedHints = controller().getRenderedHints();
        const plainHint = renderedHints.filter(function (hint) { return hint.label == ': ТаблицаЗначений'; })[0];
        const clickableHint = renderedHints.filter(function (hint) { return hint.label != ': ТаблицаЗначений'; })[0];

        withCapturedEvents(capturedEvents, function () {

          // обычный клик по некликабельному — событие не генерируется
          controller().handleMouseDown(clickEvent(plainHint));
          controller().handleMouseUp(clickEvent(plainHint));
          assert.equal(capturedEvents.length, 0);

          // обычный клик по кликабельному — событие
          controller().handleMouseDown(clickEvent(clickableHint));
          controller().handleMouseUp(clickEvent(clickableHint));
          assert.equal(capturedEvents.length, 1);

          // клик с Ctrl (жест command label part) — обычный путь молчит, дубля нет
          controller().handleMouseDown(clickEvent(clickableHint, { ctrl: true }));
          controller().handleMouseUp(clickEvent(clickableHint, { ctrl: true }));
          assert.equal(capturedEvents.length, 1);

        });

      });

      it("невалидный вход возвращает errorDescription и не меняет предыдущий набор", async function () {

        window.updateText('Таб = ПолучитьТаблицу();');

        window.setInlayHints([{ line: 1, column: 25, text: ': ТаблицаЗначений' }]);
        await waitFor(function () { return renderedHintTexts().length == 1; });
        assert.equal(controller().getState().hintsCount, 1);

        let invalidResult = window.setInlayHints('{oops');
        assert.isObject(invalidResult);
        assert.property(invalidResult, 'errorDescription');

        invalidResult = window.setInlayHints('{"line": 1}');
        assert.property(invalidResult, 'errorDescription');

        assert.equal(controller().getState().hintsCount, 1);
        await waitFor(function () { return renderedHintTexts().length == 1; });

      });

      it("пропускает позиции вне модели и элементы без текста, пустой набор очищает хинты", async function () {

        window.updateText('Таб = ПолучитьТаблицу();\nСтр = Таб.Добавить();');

        assert.equal(window.setInlayHints([
          { line: 99, column: 1, text: 'вне модели' },
          { line: 1, column: 999, text: 'вне строки' },
          { line: 0, column: 1, text: 'нулевая строка' },
          { line: 1, column: 25 },
          { line: 1, column: 25, text: ': ТаблицаЗначений' }
        ]), true);

        assert.equal(controller().getState().hintsCount, 3);
        await waitFor(function () { return renderedHintTexts().length == 1; });

        assert.equal(window.setInlayHints([]), true);
        assert.equal(controller().getState().hintsCount, 0);
        await waitFor(function () { return renderedHintTexts().length == 0; });

      });

      it("принимает JSON-строку с массивом хинтов", async function () {

        window.updateText('Таб = ПолучитьТаблицу();');

        assert.equal(window.setInlayHints(
          '[{"line":1,"column":25,"text":": ТаблицаЗначений","id":"json"}]'
        ), true);

        assert.equal(controller().getState().hintsCount, 1);
        await waitFor(function () { return renderedHintTexts().length == 1; });

      });

      it("якорь хинта следует за правками текста выше", async function () {

        window.updateText('Таб = ПолучитьТаблицу();');

        window.setInlayHints([{ line: 1, column: 25, text: ': ТаблицаЗначений' }]);
        await waitFor(function () { return renderedHintTexts().length == 1; });

        window.editor.executeEdits('inlay-hints-test', [{
          range: new monaco.Range(1, 1, 1, 1),
          text: 'НоваяСтрока();\n'
        }]);

        // хинт уезжает на строку 2 вместе со своим якорем
        await waitFor(function () {
          const hints = controller().getRenderedHints();
          return hints.length == 1 && hints[0].position.lineNumber == 2;
        }, 2500, function () { return 'якорь не проследовал за правкой: ' + JSON.stringify(controller().getRenderedHints()); });

        await waitFor(function () { return renderedHintTexts().length == 1; });

      });

      it("набор хинтов хранится на вкладке и восстанавливается при переключении", async function () {

        window.updateText('Таб = ПолучитьТаблицу();');

        window.setInlayHints([{ line: 1, column: 25, text: ': ТаблицаЗначений' }]);
        await waitFor(function () { return renderedHintTexts().length == 1; });

        window.createTab('Вторая', 'Стр = Таб.Добавить();', { language: 'bsl' });

        try {

          assert.equal(controller().getState().hintsCount, 0);
          await waitFor(function () { return renderedHintTexts().length == 0; });

          window.setInlayHints([{ line: 1, column: 22, text: ': СтрокаТаблицыЗначений' }]);
          await waitFor(function () { return renderedHintTexts().length == 1; });

          // возврат на первую вкладку — её набор на месте
          clickTab(0);
          await waitFor(function () {
            const texts = renderedHintTexts();
            return texts.length == 1 && texts.indexOf(': ТаблицаЗначений') >= 0;
          }, 2500, function () { return 'набор первой вкладки не восстановлен: ' + JSON.stringify(renderedHintTexts()); });

        }
        finally {

          // закрытие второй вкладки (диспоз её редактора/модели) и возврат на первую
          clickTab(1);
          window.closeCurrentTab();

        }

      });

    });

    describe("Тултипы параметров запроса (specs/query-params-tooltips)", function () {

      function controller() {
        return window.editor.inlayHintsController;
      }

      function inlayState() {
        return controller().getState();
      }

      function queryParamsController() {
        return window.editor.queryParamsTooltipsController;
      }

      // Спаны injected text имеют динамические классы dyn-rule-* (см. renderedHintTexts
      // в блоке Инлей-хинты).
      function renderedHintTexts() {
        const nodes = window.editor.getDomNode().querySelectorAll('.view-lines span[class*="dyn-rule-"]');
        const texts = [];
        nodes.forEach(function (node) {
          const text = node.textContent;
          if (text && text.indexOf('\u200a') < 0)
            texts.push(text.replace(/\u00a0/g, ' '));
        });
        return texts;
      }

      // Синтетическое событие мыши по отрисованному хинту (см. clickEvent в блоке Инлей-хинты).
      function clickEvent(hint, modifiers) {
        modifiers = modifiers || {};
        return {
          event: {
            leftButton: true,
            ctrlKey: !!modifiers.ctrl,
            altKey: !!modifiers.alt,
            metaKey: !!modifiers.meta
          },
          target: {
            type: monaco.editor.MouseTargetType.CONTENT_TEXT,
            detail: {
              injectedText: {
                options: {
                  attachedData: { item: { hint: hint } }
                }
              }
            }
          }
        };
      }

      function executeEdit(range, text) {
        window.editor.executeEdits('query-params-test', [{ range: range, text: text, forceMoveMarkers: false }]);
      }

      // '\tТовары.СтавкаНДС <> &БезНДС' — &БезНДС занимает колонки 22..28, хинт на 29;
      // 'ГДЕ &БезНДС <> 0' — &БезНДС занимает колонки 5..11, хинт на 12.
      const queryText = [
        'ВЫБРАТЬ',
        '\tТовары.СтавкаНДС <> &БезНДС',
        'ИЗ Справочник.Товары КАК Товары',
        'ГДЕ &БезНДС <> 0'
      ].join('\n');

      beforeEach(function () {
        window.setLanguageMode('bsl_query');
        window.updateText(queryText);
      });

      afterEach(function () {
        window.clearInlayHints();
        window.setLanguageMode('bsl');
      });

      it("setQueryParamsTooltips рисует тултип после каждого вхождения параметра", async function () {

        assert.equal(window.setQueryParamsTooltips([
          { param: 'БезНДС', label: 'Без НДС', value: 'ref-1' }
        ]), true);

        assert.deepEqual(inlayState().hints, [
          { line: 2, column: 29, text: 'Без НДС', id: 'БезНДС', eventParams: 'ref-1' },
          { line: 4, column: 12, text: 'Без НДС', id: 'БезНДС', eventParams: 'ref-1' }
        ]);

        await waitFor(function () {
          const texts = renderedHintTexts();
          return texts.length == 2 && texts.indexOf('Без НДС') >= 0;
        }, 2500, function () { return 'тултипы не отрисованы: ' + JSON.stringify(renderedHintTexts()); });

      });

      it("пересчитывает тултипы при изменении текста: смещение, переименование, новое вхождение", async function () {

        window.setQueryParamsTooltips([{ param: 'БезНДС', label: 'Без НДС' }]);
        await waitFor(function () { return renderedHintTexts().length == 2; });

        // Вставка строки выше — оба тултипа сместились на строку вниз.
        executeEdit(new monaco.Range(1, 1, 1, 1), '// выше\n');
        assert.deepEqual(inlayState().hints.map(function (hint) { return hint.line; }), [3, 5]);
        assert.equal(inlayState().hints[0].column, 29);

        // Переименование параметра — тултип у него исчез, второй остался.
        executeEdit(new monaco.Range(3, 22, 3, 29), '&Другой');
        assert.deepEqual(inlayState().hints.map(function (hint) { return hint.line; }), [5]);

        // Новое вхождение параметра — тултип появился без повторного вызова из 1С.
        executeEdit(new monaco.Range(1, 1, 1, 1), '&БезНДС,\n');
        assert.deepEqual(inlayState().hints.map(function (hint) { return hint.line; }), [1, 6]);
        await waitFor(function () { return renderedHintTexts().length == 2; });

      });

      it("клик по тултипу с value генерирует EVENT_ON_INLAY_HINT_CLICK с id параметра и event_params", async function () {

        const originalSendEvent = window.editor.sendEvent;
        const capturedEvents = [];

        try {
          window.editor.sendEvent = function (name, params) {
            capturedEvents.push({ name: name, params: params });
          };

          window.setQueryParamsTooltips([{
            param: 'БезНДС',
            label: 'Без НДС',
            value: { action: 'open', ref: 'e8db7890-6b72-453e-a3c4-ecc721864638' }
          }]);

          await waitFor(function () { return controller().getRenderedHints().length == 2; });

          const event = clickEvent(controller().getRenderedHints()[0]);
          controller().handleMouseDown(event);
          controller().handleMouseUp(event);

          assert.equal(capturedEvents.length, 1);
          assert.equal(capturedEvents[0].name, 'EVENT_ON_INLAY_HINT_CLICK');
          assert.deepEqual(capturedEvents[0].params, {
            id: 'БезНДС',
            line: 2,
            column: 29,
            text: 'Без НДС',
            event_params: { action: 'open', ref: 'e8db7890-6b72-453e-a3c4-ecc721864638' }
          });
        }
        finally {
          window.editor.sendEvent = originalSendEvent;
        }

      });

      it("тултип без value не кликабельный: событие не генерируется, клики проходят сквозь", async function () {

        const originalSendEvent = window.editor.sendEvent;
        const capturedEvents = [];

        try {
          window.editor.sendEvent = function (name, params) {
            capturedEvents.push({ name: name, params: params });
          };

          window.setQueryParamsTooltips([{ param: 'БезНДС', label: 'Без НДС' }]);
          await waitFor(function () { return controller().getRenderedHints().length == 2; });

          const renderedHints = controller().getRenderedHints();

          for (let i = 0; i < renderedHints.length; i++) {
            const event = clickEvent(renderedHints[i]);
            controller().handleMouseDown(event);
            controller().handleMouseUp(event);
          }

          assert.equal(capturedEvents.length, 0);
        }
        finally {
          window.editor.sendEvent = originalSendEvent;
        }

      });

      it("вызов вне режимов запроса возвращает false, набор не хранится", function () {

        window.setLanguageMode('bsl');
        assert.equal(window.setQueryParamsTooltips([{ param: 'БезНДС', label: 'Без НДС' }]), false);

        // Набор не запоминается: возврат в режим запроса и правки текста хинтов не рисуют.
        window.setLanguageMode('bsl_query');
        executeEdit(new monaco.Range(1, 1, 1, 1), '// выше\n');
        assert.equal(inlayState().hintsCount, 0);
        assert.equal(queryParamsController().getState().paramsCount, 0);

      });

      it("setLanguageMode из режима запроса очищает тултипы и запомненный набор", async function () {

        window.setQueryParamsTooltips([{ param: 'БезНДС', label: 'Без НДС' }]);
        await waitFor(function () { return renderedHintTexts().length == 2; });

        window.setLanguageMode('bsl');
        assert.equal(controller().getRenderedHints().length, 0);
        assert.equal(queryParamsController().getState().paramsCount, 0);
        await waitFor(function () { return renderedHintTexts().length == 0; });

      });

      it("setInlayHints заменяет тултипы и отключает автопересчёт, clearInlayHints убирает всё", async function () {

        window.setQueryParamsTooltips([{ param: 'БезНДС', label: 'Без НДС' }]);
        await waitFor(function () { return renderedHintTexts().length == 2; });

        assert.equal(window.setInlayHints([{ line: 1, column: 8, text: 'ручной хинт' }]), true);
        assert.equal(inlayState().hintsCount, 1);
        assert.equal(queryParamsController().getState().paramsCount, 0);

        // Автопересчёт отключен: правка текста не восстанавливает тултипы параметров.
        executeEdit(new monaco.Range(1, 1, 1, 1), '// выше\n');
        assert.equal(inlayState().hintsCount, 1);
        assert.equal(inlayState().hints[0].text, 'ручной хинт');

        window.clearInlayHints();
        assert.equal(controller().getRenderedHints().length, 0);
        assert.equal(queryParamsController().getState().paramsCount, 0);

        // Пустой массив — эквивалент clearInlayHints.
        window.setQueryParamsTooltips([{ param: 'БезНДС', label: 'Без НДС' }]);
        assert.equal(inlayState().hintsCount, 2);
        assert.equal(window.setQueryParamsTooltips([]), true);
        assert.equal(inlayState().hintsCount, 0);
        assert.equal(queryParamsController().getState().paramsCount, 0);

      });

      it("граница имени: &Парам не совпадает с &Параметр", function () {

        window.updateText('ВЫБРАТЬ\nГДЕ &Параметр <> 0');

        assert.equal(window.setQueryParamsTooltips([{ param: 'Парам', label: 'парам' }]), true);
        assert.equal(inlayState().hintsCount, 0);

        assert.equal(window.setQueryParamsTooltips([{ param: 'Параметр', label: 'полный' }]), true);
        assert.equal(inlayState().hintsCount, 1);
        assert.equal(inlayState().hints[0].column, 14);

      });

      it("невалидный вход возвращает errorDescription и не меняет предыдущий набор", function () {

        window.setQueryParamsTooltips([{ param: 'БезНДС', label: 'Без НДС' }]);
        assert.equal(inlayState().hintsCount, 2);

        let invalidResult = window.setQueryParamsTooltips('{oops');
        assert.isObject(invalidResult);
        assert.property(invalidResult, 'errorDescription');

        invalidResult = window.setQueryParamsTooltips('{"param": "БезНДС"}');
        assert.property(invalidResult, 'errorDescription');

        assert.equal(inlayState().hintsCount, 2);

      });

      it("принимает JSON-строку, работает в режиме dcs_query", function () {

        window.setLanguageMode('dcs_query');

        assert.equal(window.setQueryParamsTooltips(
          '[{"param":"БезНДС","label":"Без НДС","value":"ref-1"}]'
        ), true);
        assert.equal(inlayState().hintsCount, 2);
        assert.equal(inlayState().hints[0].id, 'БезНДС');

        executeEdit(new monaco.Range(1, 1, 1, 1), '// выше\n');
        assert.deepEqual(inlayState().hints.map(function (hint) { return hint.line; }), [3, 5]);

      });

    });

    registerTabsBrowserTests();

    const testFormatter = false;

    if (testFormatter)
      registerFormatterBrowserTests(getModel);
    
    // Адаптер результатов (Этап 3c): по завершении прогона кладём runner.stats в
    // window.mochaResults (headless-раннер их читает) и «кликаем» скрытую #AutotestResult
    // (механика T3-автотеста в поле 1С по образцу VAEditor — для будущего гейта в .epf).
    var __runner = mocha.run();
    window.mochaFailures = [];
    __runner.on('fail', function (test, err) {
      window.mochaFailures.push({ title: (test.fullTitle ? test.fullTitle() : test.title), error: (err && err.message) || String(err) });
    });
    __runner.on('end', function () {
      window.mochaResults = __runner.stats;
      var __btn = document.getElementById('AutotestResult');
      if (__btn) __btn.click();
    });

  })

}, 1000);
