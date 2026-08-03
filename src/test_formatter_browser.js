export default function registerFormatterBrowserTests(getModel) {

  describe("интеграция форматирования BSL (#255)", function () {

    const assert = chai.assert;

    function publicFormatOptions(defaultValue, overrides) {
      const options = {};
      [
        'formatCanonicalKeywords',
        'formatCanonicalPlatformNames',
        'formatSplitStatements',
        'formatSpaceAfterComma',
        'formatAlignAssignments',
        'formatJoinThen',
        'formatBlankLinesAroundBlocks'
      ].forEach(name => options[name] = defaultValue);
      return Object.assign(options, overrides || {});
    }

      it("возвращает корректный TextEdit для документа и диапазона", function () {

        const model = getModel('Если Истина Тогда\nА = 1;\nКонецЕсли;');
        const documentEdits = window.languages.bsl.formatProvider.provideDocumentFormattingEdits(model);
        const range = new monaco.Range(2, 1, 2, model.getLineMaxColumn(2));
        const rangeEdits = window.languages.bsl.formatProvider.provideDocumentRangeFormattingEdits(model, range);

        assert.isArray(documentEdits);
        assert.isString(documentEdits[0].text);
        assert.deepEqual(documentEdits[0].range, model.getFullModelRange());
        assert.isArray(rangeEdits);
        assert.isString(rangeEdits[0].text);
        assert.equal(rangeEdits[0].range.startLineNumber, 2);
        assert.equal(rangeEdits[0].range.startColumn, 1);

        model.dispose();

      });

      it("канонизирует класс после Новый только с опцией ключевых слов", async function () {

        const originalText = window.editor.getValue();
        const source = [
          'Если ТипЗнч(Макет) = Тип("ОбъектМетаданных") Тогда',
          '\tШаблон = новый структура("ТипМакета"); ',
          'КонецЕсли;'
        ].join('\n');

        try {
          window.editor.setValue(source);
          window.editor.setSelection(new monaco.Selection(1, 1, 1, 1));
          window.formatDocument(JSON.stringify(publicFormatOptions(false, {
            formatCanonicalKeywords: true
          })));
          await new Promise(resolve => setTimeout(resolve, 100));

          assert.equal(window.editor.getValue(), [
            'Если ТипЗнч(Макет) = Тип("ОбъектМетаданных") Тогда',
            '\tШаблон = Новый Структура("ТипМакета");',
            'КонецЕсли;'
          ].join('\n'));
        }
        finally {
          window.editor.setValue(originalText);
        }

      });

      it("включает все опции по умолчанию и принимает явные false", async function () {

        const originalText = window.editor.getValue();
        const savedOption = window.getOption('formatAlignAssignments');
        const source = [
          'еСлИ Истина',
          'тОгДа',
          'А=1; ДлинноеИмя=2;',
          'Данные=нОвЫй структура("Ключ",Значение);',
          'кОнЕцЕсЛи;'
        ].join('\n');
        const withoutAlignment = [
          'Если Истина Тогда',
          '',
          '\tА=1;',
          '\tДлинноеИмя=2;',
          '\tДанные=Новый Структура("Ключ", Значение);',
          '',
          'КонецЕсли;'
        ].join('\n');
        const allEnabled = [
          'Если Истина Тогда',
          '',
          '\tА          = 1;',
          '\tДлинноеИмя = 2;',
          '\tДанные     = Новый Структура("Ключ", Значение);',
          '',
          'КонецЕсли;'
        ].join('\n');

        try {
          window.setOption('formatAlignAssignments', true);
          window.editor.setValue(source);
          window.editor.setSelection(new monaco.Selection(1, 1, 1, 1));

          const result = window.formatDocument(JSON.stringify({
            formatAlignAssignments: false,
            futureFormatOption: 'ignored'
          }));
          assert.isUndefined(result);
          await new Promise(resolve => setTimeout(resolve, 100));
          assert.equal(window.editor.getValue(), withoutAlignment);
          assert.notProperty(window.editor, 'bslFormattingContext');

          window.editor.setValue(source);
          window.formatDocument('{}');
          await new Promise(resolve => setTimeout(resolve, 100));
          assert.equal(window.editor.getValue(), allEnabled);

          window.editor.setValue(source);
          window.formatDocument();
          await new Promise(resolve => setTimeout(resolve, 100));
          assert.equal(window.editor.getValue(), allEnabled);
        }
        finally {
          window.setOption('formatAlignAssignments', savedOption);
          window.editor.setValue(originalText);
        }

      });

      it("разделяет операторы через публичный formatDocument только для текущего вызова", async function () {

        const originalText = window.editor.getValue();
        const source = [
          'перем1 = 1;перем2="А;Б";',
          'перем3 = 1; сообщить("Привет!; Как дела?");'
        ].join('\n');
        const expected = [
          'перем1 = 1;',
          'перем2="А;Б";',
          'перем3 = 1;',
          'сообщить("Привет!; Как дела?");'
        ].join('\n');

        try {
          window.editor.setValue(source);
          window.editor.setSelection(new monaco.Selection(1, 1, 1, 1));
          window.formatDocument(JSON.stringify(publicFormatOptions(false, {
            formatSplitStatements: true
          })));
          await new Promise(resolve => setTimeout(resolve, 100));
          assert.equal(window.editor.getValue(), expected);
        }
        finally {
          window.editor.setValue(originalText);
        }

      });

      it("разделяет операторы только внутри выделенного диапазона и отменяет одной операцией", async function () {

        const originalText = window.editor.getValue();
        const source = [
          'До=0;',
          'Если Истина Тогда',
          '  Первый = 1; Второй = "А;Б";',
          'КонецЕсли;',
          'После=1; Еще=2;'
        ].join('\n');

        try {
          window.editor.setValue(source);
          window.editor.setSelection(new monaco.Selection(
            3,
            1,
            3,
            window.editor.getModel().getLineMaxColumn(3)
          ));
          window.formatDocument(JSON.stringify(publicFormatOptions(false, {
            formatSplitStatements: true
          })));
          await new Promise(resolve => setTimeout(resolve, 100));

          assert.equal(window.editor.getValue(), [
            'До=0;',
            'Если Истина Тогда',
            '\tПервый = 1;',
            '\tВторой = "А;Б";',
            'КонецЕсли;',
            'После=1; Еще=2;'
          ].join('\n'));

          window.editor.trigger('', 'undo');
          await new Promise(resolve => setTimeout(resolve, 50));
          assert.equal(window.editor.getValue(), source);
        }
        finally {
          window.editor.setValue(originalText);
        }

      });

      it("передает formatBlankLinesAroundBlocks только в текущий вызов", async function () {

        const originalText = window.editor.getValue();
        const source = 'Перед = 1;\nЕсли Истина Тогда\nВозврат;\nКонецЕсли;\nПосле = 2;';
        const expected = [
          'Перед = 1;',
          '',
          'Если Истина Тогда',
          '',
          '\tВозврат;',
          '',
          'КонецЕсли;',
          '',
          'После = 2;'
        ].join('\n');

        try {
          window.editor.setValue(source);
          window.editor.setSelection(new monaco.Selection(1, 1, 1, 1));
          window.formatDocument(JSON.stringify(publicFormatOptions(false, {
            formatBlankLinesAroundBlocks: true
          })));
          await new Promise(resolve => setTimeout(resolve, 100));
          assert.equal(window.editor.getValue(), expected);

          window.editor.setValue(source);
          window.formatDocument();
          await new Promise(resolve => setTimeout(resolve, 100));
          assert.equal(window.editor.getValue(), expected);
        }
        finally {
          window.editor.setValue(originalText);
        }

      });

      it("обособляет блок внутри выделения без изменения строк за диапазоном", async function () {

        const originalText = window.editor.getValue();
        const source = [
          'До=0;',
          'Если Истина Тогда',
          'Возврат;',
          'КонецЕсли;',
          'После=1;'
        ].join('\n');

        try {
          window.editor.setValue(source);
          window.editor.setSelection(new monaco.Selection(2, 1, 4, 12));
          window.formatDocument(JSON.stringify(publicFormatOptions(false, {
            formatBlankLinesAroundBlocks: true
          })));
          await new Promise(resolve => setTimeout(resolve, 100));

          assert.equal(window.editor.getValue(), [
            'До=0;',
            'Если Истина Тогда',
            '',
            '\tВозврат;',
            '',
            'КонецЕсли;',
            'После=1;'
          ].join('\n'));

          window.editor.trigger('', 'undo');
          await new Promise(resolve => setTimeout(resolve, 50));
          assert.equal(window.editor.getValue(), source);
        }
        finally {
          window.editor.setValue(originalText);
        }

      });

      it("отклоняет некорректные параметры formatDocument без изменения текста", function () {

        const originalText = window.editor.getValue();
        const source = 'А = 1;\nДлинноеИмя = 2;';
        const invalidArguments = [
          '{',
          'null',
          '[]',
          { formatAlignAssignments: true },
          JSON.stringify({ formatAlignAssignments: 'true' })
        ];

        try {
          invalidArguments.forEach(argument => {
            window.editor.setValue(source);
            const result = window.formatDocument(argument);
            assert.isObject(result);
            assert.isString(result.errorDescription);
            assert.equal(window.editor.getValue(), source);
            assert.notProperty(window.editor, 'bslFormattingContext');
          });
        }
        finally {
          window.editor.setValue(originalText);
        }

      });

      it("сохраняет выбранный диапазон и одну операцию отмены", async function () {

        const originalText = window.editor.getValue();
        const source = [
          'Если Истина Тогда',
          '  А = 1;',
          '  ДлинноеИмя = 2;',
          'КонецЕсли;',
          'ВнеВыделения=3;'
        ].join('\n');

        try {
          window.editor.setValue(source);
          window.editor.setSelection(new monaco.Selection(2, 1, 3, 20));

          window.formatDocument(JSON.stringify(publicFormatOptions(false, {
            formatAlignAssignments: true
          })));
          await new Promise(resolve => setTimeout(resolve, 100));

          assert.equal(window.editor.getValue(), [
            'Если Истина Тогда',
            '\tА          = 1;',
            '\tДлинноеИмя = 2;',
            'КонецЕсли;',
            'ВнеВыделения=3;'
          ].join('\n'));
          assert.equal(window.editor.getSelection().startLineNumber, 2);
          assert.equal(window.editor.getSelection().endLineNumber, 3);

          window.editor.trigger('', 'undo');
          await new Promise(resolve => setTimeout(resolve, 50));
          assert.equal(window.editor.getValue(), source);
        }
        finally {
          window.editor.setValue(originalText);
        }

      });

      it("форматирует управляющую конструкцию в выделении и отменяет одной операцией", async function () {

        const originalText = window.editor.getValue();
        const source = [
          'Если Истина',
          '  Тогда',
          '  Возврат;',
          'КонецЕсли;',
          'ЗаВыделением=2;'
        ].join('\n');

        try {
          window.editor.setValue(source);
          window.editor.setSelection(new monaco.Selection(1, 1, 4, 12));

          window.formatDocument(JSON.stringify(publicFormatOptions(false, {
            formatJoinThen: true
          })));
          await new Promise(resolve => setTimeout(resolve, 100));

          assert.equal(window.editor.getValue(), [
            'Если Истина Тогда',
            '\tВозврат;',
            'КонецЕсли;',
            'ЗаВыделением=2;'
          ].join('\n'));

          window.editor.trigger('', 'undo');
          await new Promise(resolve => setTimeout(resolve, 50));
          assert.equal(window.editor.getValue(), source);
        }
        finally {
          window.editor.setValue(originalText);
        }

      });


  });

}

