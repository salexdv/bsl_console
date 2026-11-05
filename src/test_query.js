import bslHelper from './bsl_helper';
import queryModel from './query_model';
import { languages } from './bsl_language';

setTimeout(() => {

  describe("Проверка автокомлита и подсказок редактора кода", function () {

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

    function getPosition(line, column) {
      
      return new monaco.Position(line, column);

    }

    function getPositionByModel(model) {

      let strings = model.getValue().split('\n');
      return new monaco.Position(strings.length, strings[strings.length - 1].length + 1);

    }

    function getModel(string) {

      const model = monaco.editor.createModel(string, 'bsl');
      ownedModels.add(model);
      return model;

    }

    function helper(string, line, column) {
      let model = getModel(string);
      let position = line != undefined ? getPosition(line, column) : getPositionByModel(model);
      return new bslHelper(model, position);
    }

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

    let bsl = helper('', 1, 1);

    it("временная модель поиска токена освобождается", function () {
      const model = getModel('ВЫБРАТЬ Товары');
      const tokenHelper = new bslHelper(model, getPositionByModel(model));
      const modelsCount = monaco.editor.getModels().length;

      tokenHelper.getLastWordWithTokenInRange('keyword', 1, 1, 1, model.getLineMaxColumn(1), []);

      assert.equal(monaco.editor.getModels().length, modelsCount);
    });

    it("регистрация структуры только для bsl_query", async function () {
      let text = `ВЫБРАТЬ Товары.Код КАК Код
ПОМЕСТИТЬ ВтТовары
ИЗ Справочник.Товары КАК Товары;`;
      let queryModelInstance = monaco.editor.createModel(text, 'bsl_query');
      let dcsModelInstance = monaco.editor.createModel(text, 'dcs_query');

      try {
        expect(window.languages.query.documentSymbolProvider).to.be.an('object');
        assert.equal(window.languages.dcs.documentSymbolProvider, undefined);

        let querySymbols = await window.editor._commandService.executeCommand(
          '_executeDocumentSymbolProvider',
          queryModelInstance.uri
        );
        let dcsSymbols = await window.editor._commandService.executeCommand(
          '_executeDocumentSymbolProvider',
          dcsModelInstance.uri
        );

        expect(querySymbols).to.be.an('array').that.has.length(1);
        expect(dcsSymbols).to.be.an('array').that.is.empty;
      }
      finally {
        queryModelInstance.dispose();
        dcsModelInstance.dispose();
      }
    });

    it("иерархия, SymbolKind и selectionRange структуры запроса", async function () {
      let text = `ВЫБРАТЬ Источник.Ссылка КАК Ссылка
ПОМЕСТИТЬ ВтСсылки
ИЗ Справочник.Товары КАК Источник
ОБЪЕДИНИТЬ ВСЕ
ВЫБРАТЬ Возврат.Ссылка
ИЗ Документ.Возврат КАК Возврат;`;
      let model = monaco.editor.createModel(text, 'bsl_query');

      try {
        let symbols = await window.languages.query.documentSymbolProvider.provideDocumentSymbols(model, {
          isCancellationRequested: false
        });

        expect(symbols).to.be.an('array').that.has.length(1);
        assert.equal(symbols[0].name, 'ВтСсылки');
        assert.equal(symbols[0].kind, monaco.languages.SymbolKind.Struct);
        assert.equal(model.getValueInRange(symbols[0].selectionRange), 'ВтСсылки');
        expect(symbols[0].children).to.be.an('array').that.has.length(2);
        assert.equal(symbols[0].children[0].kind, monaco.languages.SymbolKind.Namespace);
        assert.equal(symbols[0].children[0].children[0].kind, monaco.languages.SymbolKind.Field);
        assert.equal(model.getValueInRange(symbols[0].children[0].children[0].selectionRange), 'Ссылка');
        assert.equal(model.getValueInRange(symbols[0].children[1].children[0].selectionRange), 'Ссылка');
      }
      finally {
        model.dispose();
      }
    });

    it("асинхронный DefinitionProvider возвращает точный LocationLink", async function () {
      let text = `ВЫБРАТЬ Товары.Код КАК Код
ПОМЕСТИТЬ ВтТовары
ИЗ Справочник.Товары КАК Товары;

ВЫБРАТЬ вт.кОд
ИЗ втТовары КАК вт;`;
      let model = monaco.editor.createModel(text, 'bsl_query');

      try {
        let offset = text.indexOf('вт.кОд') + 'вт.'.length + 1;
        let position = model.getPositionAt(offset);
        let pending = window.languages.query.definitionProvider.provideDefinition(model, position, {
          isCancellationRequested: false
        });

        assert.instanceOf(pending, Promise);
        let links = await pending;
        expect(links).to.be.an('array').that.has.length(1);
        assert.equal(links[0].targetUri.toString(), model.uri.toString());
        assert.equal(model.getValueInRange(links[0].originSelectionRange), 'кОд');
        assert.equal(model.getValueInRange(links[0].targetSelectionRange), 'Код');
      }
      finally {
        model.dispose();
      }
    });

    it("проверка построения модели запроса", function () {
      let model = queryModel.parse(`ВЫБРАТЬ
        Товары.Ссылка КАК Ссылка,
        Товары.Код КАК Код
      ИЗ
        Справочник.Товары КАК Товары
      ГДЕ
        Товары.Код = &Код
      УПОРЯДОЧИТЬ ПО
        Товары.Код`);

      expect(model.statements).to.be.an('array').that.has.length(1);
      expect(model.statements[0].branches).to.be.an('array').that.has.length(1);
      expect(model.statements[0].branches[0].select.items).to.be.an('array').that.has.length(2);
      assert.equal(model.statements[0].branches[0].select.items[0].alias.name, "Ссылка");
      assert.equal(model.statements[0].branches[0].from.sources[0].base.alias.name, "Товары");
      assert.equal(model.statements[0].branches[0].where.references.some(ref => ref.path === "Товары.Код"), true);
    });

    it("проверка полных имен источников в references модели запроса", function () {
      let model = queryModel.parse(`ВЫБРАТЬ
        Товары.Наименование КАК Наименование,
        Продажи.Сумма КАК Сумма,
        втТовары.Количество КАК Количество
      ИЗ
        Справочник.Товары КАК Товары,
        AccountingRegister.Sales КАК Продажи,
        втТовары КАК втТовары`);

      let branch = model.statements[0].branches[0];
      let catalogReference = branch.select.items[0].references[0];
      let accountingRegisterReference = branch.select.items[1].references[0];
      let tempTableReference = branch.select.items[2].references[0];

      assert.equal(catalogReference.sourceName, "Товары");
      assert.equal(catalogReference.fullSourceName, "Справочник.Товары");
      assert.equal(catalogReference.metadataSourse, "Справочник");
      assert.equal(accountingRegisterReference.fullSourceName, "AccountingRegister.Sales");
      assert.equal(accountingRegisterReference.metadataSourse, "AccountingRegister");
      assert.equal(tempTableReference.fullSourceName, "втТовары");
      assert.equal(tempTableReference.metadataSourse, "");
    });

    it("проверка метрик производительности модели запроса", function () {
      let model = queryModel.parse(`ВЫБРАТЬ
        Товары.Ссылка КАК Ссылка
      ИЗ
        Справочник.Товары КАК Товары`);

      expect(model.performance).to.be.an('object');
      expect(model.performance.tokenizeMs).to.be.a('number');
      expect(model.performance.parseMs).to.be.a('number');
      expect(model.performance.totalMs).to.be.a('number');
      expect(model.performance.tokenCount).to.be.a('number');
      expect(model.performance.nodeCount).to.be.a('number');
      expect(model.performance.errorCount).to.be.a('number');
    });

    it("проверка модели запроса с объединением", function () {
      let model = queryModel.parse(`ВЫБРАТЬ
        Источник.Период КАК Период,
        Источник.Организация КАК Организация
      ИЗ
        Документ.Продажа КАК Источник
      ОБЪЕДИНИТЬ ВСЕ
      ВЫБРАТЬ
        Источник.Период,
        Источник.Организация
      ИЗ
        Документ.Возврат КАК Источник`);

      expect(model.statements[0].branches).to.be.an('array').that.has.length(2);
      assert.equal(model.statements[0].branches[1].from.sources[0].base.name, "Документ.Возврат");
      assert.equal(model.statements[0].branches[1].from.sources[0].base.alias.name, "Источник");
    });

    it("проверка tolerant-модели объединения после лишней закрывающей скобки", function () {
      let model = queryModel.parse(`ВЫБРАТЬ
        Источник.Период КАК Период
      ИЗ
        Документ.Продажа КАК Источник
      ГДЕ
        Источник.Период В (ВЫБРАТЬ Данные.Период ИЗ Таблица КАК Данные)
        И НЕ Данные.Период ЕСТЬ NULL)

      ОБЪЕДИНИТЬ ВСЕ

      ВЫБРАТЬ
        Источник.Период
      ИЗ
        Документ.Возврат КАК Источник`);

      let context = model.getContextAt(12, 18);
      expect(model.statements[0].branches).to.be.an('array').that.has.length(2);
      assert.equal(context.branch, model.statements[0].branches[1]);
    });

    it("проверка tolerant-модели для битого запроса", function () {
      let model = queryModel.parse(`ВЫБРАТЬ
        Товары.Ссылка КАК Ссылка,
        ВЫБОР
          КОГДА Товары.Код =
      ИЗ
        Справочник.Товары КАК Товары`);

      expect(model.statements).to.be.an('array').that.not.is.empty;
      expect(model.statements[0].branches[0].select.items).to.be.an('array').that.not.is.empty;
      assert.equal(model.statements[0].branches[0].from.sources[0].base.alias.name, "Товары");
    });

    it("проверка контекста по позиции в модели запроса", function () {
      let model = queryModel.parse(`ВЫБРАТЬ
        Товары.Ссылка КАК Ссылка
      ИЗ
        Справочник.Товары КАК Товары
      ГДЕ
        Товары.Ссылка = &Ссылка`);

      let context = model.getContextAt(6, 15);
      assert.equal(context.branch.kind, "queryBranch");
      assert.equal(context.clause.kind, "whereClause");
      assert.equal(context.node.kind, "expression");
    });

    it("проверка query hover для ветвей объединения", function () {
      let query = `ВЫБРАТЬ
        Источник.Период КАК Период,
        Источник.Организация КАК Организация
      ИЗ
        Документ.Продажа КАК Источник
      ОБЪЕДИНИТЬ ВСЕ
      ВЫБРАТЬ
        &ДругойПериод,
        ВЫБОР КОГДА Источник.Организация = &Организация ТОГДА Источник.Организация ИНАЧЕ NULL КОНЕЦ
      ИЗ
        Документ.Возврат КАК Источник`;

      let queryHelper = helper(query, 8, 11);
      let parsedQuery = queryHelper.getParsedQueryModel();
      expect(parsedQuery, "модель запроса для hover").to.be.an('object');
      expect(parsedQuery.getContextAt, "позиционный API модели запроса").to.be.a('function');

      let context = parsedQuery.getContextAt(8, 11);
      expect(context, "контекст параметра во второй ветви").to.be.an('object');
      assert.equal(context.clause && context.clause.kind, "selectList");
      assert.equal(context.branch, context.statement.branches[1]);

      let modelHover = queryHelper.getQueryModelHover();
      expect(modelHover, "hover объектной модели для параметра").to.be.an('object');

      let hover = queryHelper.getQueryHover();
      expect(hover, "параметр во второй ветви").to.be.an('object');
      assert.equal(hover.contents[0].value, "Период");

      hover = helper(query, 9, 32).getQueryHover();
      expect(hover, "выражение ВЫБОР во второй ветви").to.be.an('object');
      assert.equal(hover.contents[0].value, "Организация");

      hover = helper(query, 2, 20).getQueryHover();
      expect(hover, "поле первой ветви").to.be.an('object');
      assert.equal(hover.contents[0].value, "Период");

      let customHovers = window.customHovers;
      let immediateHover = window.immediateHover;
      let priorityHelper = helper(query, 8, 11);

      window.customHovers = { "другойпериод": "Пользовательский hover" };
      window.immediateHover = [{ value: "Немедленный hover" }];
      hover = priorityHelper.getQueryHover();
      assert.equal(hover.contents[0].value, "Пользовательский hover");

      window.customHovers = {};
      hover = priorityHelper.getQueryHover();
      assert.equal(hover.contents[0].value, "Немедленный hover");

      window.customHovers = customHovers;
      window.immediateHover = immediateHover;

      let fallbackHelper = helper(query, 8, 11);
      fallbackHelper.getQueryModelHover = () => null;
      hover = fallbackHelper.getQueryHover();
      expect(hover, "эвристический fallback").to.be.an('object');
      assert.equal(hover.contents[0].value, "Период");
    });
    
    it("проверка существования глобальной переменной editor", function () {
      assert.notEqual(window.editor, undefined);
    });

    it("проверка загрузки bslMetadata", function () {
      assert.notEqual(window.bslMetadata, undefined);
    });
    
    it("проверка подсказки ключевых слов запроса", function () {
      bsl = helper('Выра');
      let suggestions = bsl.getQueryCompletion();
      expect(suggestions).to.be.an('object');
      expect(suggestions.suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.suggestions.some(suggest => suggest.label === "ВЫРАЗИТЬ"), true);
    });

    it("ожидание актуальной модели для подсказки по точке в большом запросе", async function () {
      let query = '// ' + 'д'.repeat(21000) + '\n' +
        'ВЫБРАТЬ\n' +
        '\tТовары.Ссылка КАК Ссылка,\n' +
        '\tТовары.Код КАК Код\n' +
        'ПОМЕСТИТЬ втТовары\n' +
        'ИЗ\n' +
        '\tСправочник.Товары КАК Товары;\n\n' +
        'ВЫБРАТЬ\n' +
        '\tТовары.\n' +
        'ИЗ\n' +
        '\tвтТовары КАК Товары;';
      let model = monaco.editor.createModel(query, 'bsl_query');
      let position = getPosition(10, 9);
      let completion = await languages.query.completionProvider.provideCompletionItems(
        model,
        position,
        { triggerCharacter: '.' },
        { isCancellationRequested: false }
      );

      expect(completion.suggestions).to.be.an('array').that.is.not.empty;
      assert.equal(completion.suggestions.some(suggest => suggest.label === 'Ссылка'), true);
      assert.equal(completion.suggestions.some(suggest => suggest.label === 'Код'), true);
      model.dispose();
    });

    it("проверка подсказки параметров для функции запроса", function () {
      bsl = helper('РАЗНОСТЬДАТ(');
      let context = bsl.getLastSigMethod({});
      let help = bsl.getCommonSigHelp(context, window.bslQuery.functions);
      expect(help).to.have.property('activeParameter');
    });

    describe('параметры виртуальных таблиц регистров', function () {
      const cases = [
        ['РегистрСведений.Цены.СрезПервых', 'InformationRegister.Prices.SliceFirst', ['Период', 'Условие']],
        ['РегистрСведений.Цены.СрезПоследних', 'InformationRegister.Prices.SliceLast', ['Период', 'Условие']],
        ['РегистрНакопления.Товары.Остатки', 'AccumulationRegister.Goods.Balance', ['Период', 'Условие']],
        ['РегистрНакопления.Товары.Обороты', 'AccumulationRegister.Goods.Turnovers', ['НачалоПериода', 'КонецПериода', 'Периодичность', 'Условие']],
        ['РегистрНакопления.Товары.ОстаткиИОбороты', 'AccumulationRegister.Goods.BalanceAndTurnovers', ['НачалоПериода', 'КонецПериода', 'Периодичность', 'МетодДополнения', 'Условие']],
        ['РегистрБухгалтерии.Хозрасчетный.Остатки', 'AccountingRegister.Ledger.Balance', ['Период', 'УсловиеСчета', 'Субконто', 'Условие']],
        ['РегистрБухгалтерии.Хозрасчетный.Обороты', 'AccountingRegister.Ledger.Turnovers', ['НачалоПериода', 'КонецПериода', 'Периодичность', 'УсловиеСчета', 'Субконто', 'Условие', 'УсловиеКорСчета', 'КорСубконто']],
        ['РегистрБухгалтерии.Хозрасчетный.ОстаткиИОбороты', 'AccountingRegister.Ledger.BalanceAndTurnovers', ['НачалоПериода', 'КонецПериода', 'Периодичность', 'МетодДополнения', 'УсловиеСчета', 'Субконто', 'Условие']],
        ['РегистрБухгалтерии.Хозрасчетный.ОборотыДтКт', 'AccountingRegister.Ledger.DrCrTurnovers', ['НачалоПериода', 'КонецПериода', 'Периодичность', 'УсловиеСчетаДт', 'СубконтоДт', 'УсловиеСчетаКт', 'СубконтоКт', 'Условие']],
        ['РегистрБухгалтерии.Хозрасчетный.ДвиженияССубконто', 'AccountingRegister.Ledger.RecordsWithExtDimensions', ['НачалоПериода', 'КонецПериода', 'Условие', 'Порядок', 'Первые']],
        ['РегистрРасчета.Начисления.ДанныеГрафика', 'CalculationRegister.Accruals.ScheduleData', ['Условие']],
        ['РегистрРасчета.Начисления.ФактическийПериодДействия', 'CalculationRegister.Accruals.AdjustedEffectivePeriod', ['Условие']],
        ['РегистрРасчета.Премии.БазаНачисления', 'CalculationRegister.Bonuses.BaseAccruals', ['ИзмеренияОсновногоРегистра', 'ИзмеренияБазовогоРегистра', 'Разрезы', 'Условие']]
      ];

      function queryHelper(text, mode) {
        const model = monaco.editor.createModel(text, mode || 'bsl_query');
        ownedModels.add(model);
        return new bslHelper(model, getPositionByModel(model));
      }

      function signature(text, mode, context) {
        const previousMode = window.getCurrentLanguageId();
        try {
          window.setLanguageMode(mode || 'bsl_query');
          const instance = queryHelper(text, mode);
          return mode == 'dcs_query' ? instance.getDCSSigHelp(context || {}) : instance.getQuerySigHelp(context || {});
        }
        finally { window.setLanguageMode(previousMode); }
      }

      function names(result, variant) {
        const sig = result.value.signatures[variant || 0];
        return sig.parameters.map(param => sig.label.slice(param.label[0], param.label[1]));
      }

      ['bsl_query', 'dcs_query'].forEach(mode => {
        cases.forEach(item => {
          it(mode + ': ' + item[0], function () {
            const result = signature('ВЫБРАТЬ * ИЗ ' + item[0] + '(', mode);
            assert.deepEqual(names(result), item[2]);
            assert.equal(result.value.activeParameter, 0);
            assert.equal(result.value.signatures[0].label.indexOf(item[0] + '('), 0);
            result.value.signatures[0].parameters.forEach(param => {
              assert.include(param.documentation.value, 'Тип:');
              assert.isAbove(param.documentation.value.split('\n\n').length, 2);
            });
            const english = signature('SELECT * FROM ' + item[1].toLowerCase() + '(', mode);
            assert.equal(english.value.signatures[0].parameters.length, item[2].length);
            assert.match(names(english)[0], /^[A-Za-z]+$/);
          });
        });
      });

      it('считает пропущенные аргументы, строки, комментарии и завершённые вложенные вызовы', function () {
        const prefix = 'ВЫБРАТЬ * ИЗ РегистрНакопления.Товары.ОстаткиИОбороты(';
        ['&Начало,', ',,', 'ДАТАВРЕМЯ(2020, 1, 1),,', '"(,)",,', '&Начало, // (,\n,'].forEach((suffix, index) => {
          assert.equal(signature(prefix + suffix).value.activeParameter, index == 0 ? 1 : 2);
        });
        const nested = signature(prefix + 'ДАТАВРЕМЯ(2020,');
        assert.equal(nested.value.activeParameter, 1);
        assert.notInclude(nested.value.signatures[0].label, 'ОстаткиИОбороты');
        assert.isUndefined(signature(prefix + '),'));
        assert.isUndefined(signature(prefix + ',,,,,'));
      });

      it('распознаёт пробелы, переносы, комментарии и смешанный регистр имени', function () {
        const result = signature('ВЫБРАТЬ * ИЗ рЕгИсТрНаКоПлЕнИя \n . // комментарий\n Товары . Остатки \n (');
        assert.deepEqual(names(result), ['Период', 'Условие']);
      });

      it('не требует метаданных и не принимает неизвестные или неполные имена', function () {
        const metadata = window.bslMetadata;
        try {
          window.bslMetadata = {};
          assert.deepEqual(names(signature('РегистрНакопления.Неизвестный.Остатки(')), ['Период', 'Условие']);
          ['РегистрНакопления.Товары.НетТаблицы(', 'Товары.Остатки(', 'Справочник.Товары.Остатки(',
            'РегистрСведений.Цены.Остатки(', 'РегистрРасчета.Премии.База(', 'РегистрБухгалтерии.Хозрасчетный.Субконто(',
            '"РегистрНакопления.Товары.Остатки("', '// РегистрНакопления.Товары.Остатки('].forEach(text => {
            assert.isUndefined(signature(text), text);
          });
        }
        finally { window.bslMetadata = metadata; }
      });

      it('сохраняет выбранный вариант бухгалтерских оборотов и проверяет лишние аргументы', function () {
        const prefix = 'РегистрБухгалтерии.Хозрасчетный.Обороты(';
        const result = signature(prefix, 'bsl_query', { activeSignatureHelp: { activeSignature: 1 } });
        assert.equal(result.value.activeSignature, 1);
        assert.equal(result.value.signatures[1].parameters.length, 6);
        assert.equal(signature(prefix + ',,,,,,', 'bsl_query', { activeSignatureHelp: { activeSignature: 1 } }).value.activeSignature, 0);
        assert.isUndefined(signature(prefix + ',,,,,,,,'));
      });

      it('уважает пользовательские сигнатуры и disableNativeSignatures', function () {
        const custom = window.customSignatures;
        const disabled = window.editor.disableNativeSignatures;
        try {
          const prefix = 'РегистрНакопления.Товары.Остатки(';
          window.editor.disableNativeSignatures = true;
          assert.isUndefined(signature(prefix));
          window.customSignatures = { 'регистрнакопления.товары.остатки': [{ label: '(МойПараметр)', parameters: [{ label: 'МойПараметр' }] }] };
          assert.equal(signature(prefix).value.signatures[0].label, '(МойПараметр)');
          window.editor.disableNativeSignatures = false;
          assert.equal(signature(prefix).value.signatures[0].label, '(МойПараметр)');
        }
        finally {
          window.customSignatures = custom;
          window.editor.disableNativeSignatures = disabled;
        }
      });

      it('исправляет имена виртуальных таблиц в автодополнении', function () {
        const instance = queryHelper('');
        const english = window.engLang;
        try {
          window.engLang = false;
          assert.property(instance.getRegisterVirtualTables('accounting'), 'ОборотыДтКт');
          assert.property(instance.getRegisterVirtualTables('action_period'), 'База<ИмяБазовогоРегистра>');
          window.engLang = true;
          assert.property(instance.getRegisterVirtualTables('action_period'), 'AdjustedEffectivePeriod');
          assert.property(instance.getRegisterVirtualTables('noaction_period'), 'Base<RegisterName>');
        }
        finally { window.engLang = english; }
      });

      it('показывает тип и корректную нижнюю границу среза первых', function () {
        const result = signature('РегистрСведений.Цены.СрезПервых(');
        const param = result.value.signatures[0].parameters[0];
        assert.include(param.documentation.value, 'Дата | МоментВремени | Граница');
        assert.include(param.documentation.value, 'Нижняя граница');
        const english = signature('CalculationRegister.Bonuses.BaseAccruals(');
        assert.deepEqual(names(english), ['MainRegisterDimensions', 'BaseRegisterDimensions', 'ViewPoints', 'Condition']);
      });

      ['bsl_query', 'dcs_query'].forEach(mode => {
        it(mode + ': открытие виртуальной таблицы показывает сигнатуру без списка метаданных', function () {
          const previousMode = window.getCurrentLanguageId();
          try {
            window.setLanguageMode(mode);
            cases.forEach(item => {
              const instance = queryHelper('ВЫБРАТЬ *\nИЗ ' + item[0] + '(', mode);
              const completion = mode == 'dcs_query'
                ? instance.getDCSCompletion({ triggerCharacter: '(' })
                : instance.getQueryCompletion({ triggerCharacter: '(' });
              assert.deepEqual(completion.suggestions, [], item[0]);
              const provider = mode == 'dcs_query' ? languages.dcs.completionProvider : languages.query.completionProvider;
              // Monaco 0.20: провайдер сохраняет пустой CompletionList.
              assert.deepEqual(provider.provideCompletionItems(instance.model, instance.position,
                { triggerCharacter: '(', triggerKind: monaco.languages.CompletionTriggerKind.TriggerCharacter },
                { isCancellationRequested: false }).suggestions, [], item[0]);
              assert.exists(mode == 'dcs_query' ? instance.getDCSSigHelp({}) : instance.getQuerySigHelp({}));
            });
            // Ограничение действует только на автотриггер виртуальной таблицы.
            assert.isFalse(!!queryHelper('ВЫБРАТЬ ЕСТЬNULL(', mode).isQueryVirtualTableOpening({ triggerCharacter: '(' }));
            assert.isFalse(!!queryHelper('ВЫБРАТЬ * ИЗ РегистрНакопления.Товары.Остатки(', mode).isQueryVirtualTableOpening({}));
          }
          finally { window.setLanguageMode(previousMode); }
        });
      });
    });

    it("токен-aware контекст сигнатуры сохраняется в режимах запроса и СКД (issue #343)", function () {
      let queryHelper = helper('РАЗНОСТЬДАТ(ДОБАВИТЬКДАТЕ(Дата, ДЕНЬ, 1), ');
      let queryContext = queryHelper.getLastSigMethod({});
      let queryHelp = queryHelper.getQuerySigHelp({});

      assert.equal(queryContext.methodName, 'РАЗНОСТЬДАТ');
      assert.equal(queryContext.activeParameter, 1);
      expect(queryHelp).to.have.property('value');

      try {
        window.setLanguageMode('dcs_query');
        let dcsHelper = helper('ВычислитьВыражение("Сумма(Поле, Другое)", ');
        let dcsContext = dcsHelper.getLastSigMethod({});
        let dcsHelp = dcsHelper.getDCSSigHelp({});

        assert.equal(dcsContext.methodName, 'ВычислитьВыражение');
        assert.equal(dcsContext.activeParameter, 1);
        expect(dcsHelp).to.have.property('value');
      }
      finally {
        window.setLanguageMode('bsl_query');
      }
    });

    it("проверка автокомплита для таблицы запроса, являющейся справочником", function () {
      bsl = helper(getCode(), 4, 9);      
      let suggestions = [];
      bsl.getQueryFieldsCompletion(suggestions)
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "СтавкаНДС"), true);
    });

    it("проверка автокомплита для таблицы запроса, полученной из временной таблицы", function () {
      bsl = helper(getCode(), 209, 26);
      let suggestions = [];
      const modelsCount = monaco.editor.getModels().length;
      bsl.getQueryFieldsCompletion(suggestions)
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "ПФРПоСуммарномуТарифу"), true);
      assert.equal(monaco.editor.getModels().length, modelsCount);
    });

    it("проверка подсказки ссылочных реквизитов", function () {              	                                
      bsl = helper('Товары.СтавкаНДС.');      
      let suggestions = [];
      window.contextData = new Map([
        [1, new Map([["ставкандс", { "ref": "catalogs.СтавкиНДС", "sig": null }]])]
      ]);
      bsl.getRefCompletion(suggestions);
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "Ставка"), true);
      window.contextData = new Map();
    });

    it("проверка подсказки для таблицы запроса", function () {
      bsl = helper(getCode(), 38, 9);      
      let suggestions = [];
      bsl.getQueryTablesCompletion(suggestions, null);
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "ИсчисленныеСтраховыеВзносы"), true);
      assert.equal(suggestions.some(suggest => suggest.label === "ФизлицаБезОблагаемойБазы"), true);
    });

    it("проверка отсутствия подсказки для таблицы запроса там, где её быть не должно", function () {
      bsl = helper(getCode(), 144, 9);
      let suggestions = [];
      bsl.getQueryTablesCompletion(suggestions, null);
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "ИсчисленныеСтраховыеВзносы"), false);      
    });

    it("проверка подсказки для метаданных в конструкции ИЗ ИЛИ СОЕДИНЕНИЕ ", function () {
      bsl = helper(`ВЫБРАТЬ
      *
      ИЗ      
      `);      
      let suggestions = [];
      bsl.getQuerySourceCompletion(suggestions, null);
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "Справочник"), true);      
    });

    it("проверка подсказки для метаданных в конструкции ИЗ ИЛИ СОЕДИНЕНИЕ после запятой", function () {
      bsl = helper(`ВЫБРАТЬ
      *
      ИЗ      
        Справочники.Товары КАК Товары,
      `);      
      let suggestions = [];
      bsl.getQuerySourceCompletion(suggestions, null);
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "Справочник"), true);      
    });

    it("проверка подсказки для объекта метаданных в конструкции ИЗ ИЛИ СОЕДИНЕНИЕ ", function () {
      bsl = helper(`ВЫБРАТЬ
      *
      ИЗ      
      Справочник.`);      
      let suggestions = [];
      bsl.getQuerySourceCompletion(suggestions, null);
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "Товары"), true);      
    });

    it("проверка подсказки для временных таблиц в конструкции ИЗ ИЛИ СОЕДИНЕНИЕ ", function () {
      bsl = helper(getCode(), 74, 20);
      let suggestions = [];
      bsl.getQuerySourceCompletion(suggestions, null);
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "ВТФизлицаБезОблагаемойБазы"), true);      
    });

    it("проверка подсказки для функции ЗНАЧЕНИЕ", function () {
      
      bsl = helper("ЗНАЧЕНИЕ(");
      let suggestions = [];
      bsl.getQueryValuesCompletion(suggestions, window.bslQuery.values, null)
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "Справочник"), true);
      assert.equal(suggestions.some(suggest => suggest.label === "ВидДвиженияБухгалтерии"), true);

      bsl = helper("ЗНАЧЕНИЕ(Справочник.");
      suggestions = [];
      bsl.getQueryValuesCompletion(suggestions, window.bslQuery.values, null)
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "Товары"), true);

      bsl = helper("ЗНАЧЕНИЕ(Справочник.Товары.");
      suggestions = [];
      bsl.getQueryValuesCompletion(suggestions, window.bslQuery.values, null)
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "ПустаяСсылка"), true);
      assert.equal(suggestions.some(suggest => suggest.label === "Услуга"), true);

      bsl = helper("ЗНАЧЕНИЕ(ВидДвиженияБухгалтерии.");
      suggestions = [];
      bsl.getQueryValuesCompletion(suggestions, window.bslQuery.values, null)
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "Дебет"), true);

    });

    it("проверка подсказки для конструкции ССЫЛКА", function () {
      
      bsl = helper("ССЫЛКА ");
      let suggestions = [];
      bsl.getQueryRefCompletion(suggestions, null)
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "Справочник"), true);

      bsl = helper("ССЫЛКА Справочник.");
      suggestions = [];
      bsl.getQueryRefCompletion(suggestions, null)
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "Товары"), true);

    });

    it("проверка подсказки временной таблицы регистра в конструкции ИЗ ИЛИ СОЕДИНЕНИЕ", function () {
      
      bsl = helper(`ВЫБРАТЬ
      *
      ИЗ      
      РегистрСведений.ЦеныНоменклатуры.`);      
      let suggestions = [];
      bsl.getQuerySourceCompletion(suggestions, null);
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "СрезПоследних"), true);
      assert.equal(suggestions.some(suggest => suggest.label === "ОстаткиИОбороты"), false);

      bsl = helper(`ВЫБРАТЬ
      *
      ИЗ      
      РегистрНакопления.ОстаткиТоваров.`);      
      suggestions = [];
      bsl.getQuerySourceCompletion(suggestions, null);
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "ОстаткиИОбороты"), true);      

    });

    it("проверка подсказки полей таблицы запроса, когда объявление таблицы многострочное", function () {
      bsl = helper(getCode(), 1094, 7);      
      let suggestions = [];
      bsl.getQueryFieldsCompletion(suggestions);
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "ВидЦены"), true);
    });

    it("проверка подсказки полей виртуальной таблицы остатков", function () {
      bsl = helper(getCode(), 1095, 10);      
      let suggestions = [];
      bsl.getQueryFieldsCompletion(suggestions);
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "КоличествоОстаток"), true);
      assert.equal(suggestions.some(suggest => suggest.label === "КоличествоНачальныйОстаток"), false);
      assert.equal(suggestions.some(suggest => suggest.label === "КоличествоПриход"), false);
      assert.equal(suggestions.some(suggest => suggest.label === "КоличествоОборот"), false);
    });

    it("проверка подсказки полей виртуальной таблицы остатков и оборотов", function () {
      bsl = helper(getCode(), 1097, 18);      
      let suggestions = [];
      bsl.getQueryFieldsCompletion(suggestions);
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "КоличествоПриход"), true);
      assert.equal(suggestions.some(suggest => suggest.label === "КоличествоОборот"), true);
      assert.equal(suggestions.some(suggest => suggest.label === "КоличествоНачальныйОстаток"), true);
      assert.equal(suggestions.some(suggest => suggest.label === "КоличествоОстаток"), false);
    });

    it("проверка подсказки полей виртуальной таблицы оборотов (вид регистра 'Остатки')", function () {
      bsl = helper(getCode(), 1096, 10);      
      let suggestions = [];
      bsl.getQueryFieldsCompletion(suggestions);
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "КоличествоПриход"), true);
      assert.equal(suggestions.some(suggest => suggest.label === "КоличествоОборот"), true);
      assert.equal(suggestions.some(suggest => suggest.label === "КоличествоОстаток"), false);
      assert.equal(suggestions.some(suggest => suggest.label === "КоличествоНачальныйОстаток"), false);
    });

    it("проверка подсказки полей виртуальной таблицы оборотов (вид регистра 'Обороты')", function () {
      bsl = helper(getCode(), 1098, 10);      
      let suggestions = [];
      bsl.getQueryFieldsCompletion(suggestions);
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "КоличествоОборот"), true);
      assert.equal(suggestions.some(suggest => suggest.label === "КоличествоПриход"), false);      
      assert.equal(suggestions.some(suggest => suggest.label === "КоличествоОстаток"), false);
      assert.equal(suggestions.some(suggest => suggest.label === "КоличествоНачальныйОстаток"), false);
    });

    it("проверка подсказки для ссылочного поля, когда поле не выбиралось руками (динамическое обновление ссылок) ", function () {
      bsl = helper(`ВЫБРАТЬ
      Товары.СтавкаНДС.
      ИЗ      
      Справочник.Товары КАК Товары`, 2, 24);
      let suggestions = [];
      bsl.getQueryFieldsCompletion(suggestions);
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "Наименование"), true);
    });

    it("проверка подсказки для функций в режим СКД ", function () {
      window.setLanguageMode('dcs_query');
      bsl = helper("ВычислитьВыражениеСГрупп");                  
      let result = bsl.getDCSCompletion();
      expect(result.suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(result.suggestions.some(suggest => suggest.label === "ВычислитьВыражениеСГруппировкойМассив"), true);
      window.setLanguageMode('bsl_query');
    });

    it("проверка подсказки ключевых слов в режим СКД ", function () {
      window.setLanguageMode('dcs_query');
      bsl = helper("ТОГ");                  
      let result = bsl.getDCSCompletion();
      expect(result.suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(result.suggestions.some(suggest => suggest.label === "Тогда"), true);
      window.setLanguageMode('bsl_query');
    });

    it("проверка подсказки для функции ЗНАЧЕНИЕ в режиме СКД", function () {
      
      window.setLanguageMode('dcs_query');
      
      bsl = helper("ЗНАЧЕНИЕ(");
      let suggestions = [];
      bsl.getQueryValuesCompletion(suggestions, window.bslQuery.values, null)
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "Справочник"), true);
      assert.equal(suggestions.some(suggest => suggest.label === "ВидДвиженияБухгалтерии"), true);

      bsl = helper("ЗНАЧЕНИЕ(Справочник.");
      suggestions = [];
      bsl.getQueryValuesCompletion(suggestions, window.bslQuery.values, null)
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "Товары"), true);

      bsl = helper("ЗНАЧЕНИЕ(Справочник.Товары.");
      suggestions = [];
      bsl.getQueryValuesCompletion(suggestions, window.bslQuery.values, null)
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "ПустаяСсылка"), true);
      assert.equal(suggestions.some(suggest => suggest.label === "Услуга"), true);
      
      window.setLanguageMode('bsl_query');

    });

    it("проверка подсказки функций и ключевых слов запроса в зависимости от версии 1С", function () {

      window.init('8.3.15.1');

      bsl = helper('Сокр');
        
      let suggestions = bsl.getQueryCompletion();
      expect(suggestions).to.be.an('array').that.is.empty;

      bsl = helper('Групп');
        
      suggestions = bsl.getQueryCompletion();
      expect(suggestions).to.be.an('array').that.is.empty;

      window.init('8.3.20.1')     
      
      bsl = helper('Сокр'); 

      suggestions = bsl.getQueryCompletion();
      expect(suggestions).to.be.an('object');
      expect(suggestions.suggestions).to.be.an('array').that.is.not.empty;
      assert.equal(suggestions.suggestions.some(suggest => suggest.label === "СОКРЛП"), true);

      bsl = helper('Групп');
        
      suggestions = bsl.getQueryCompletion();
      expect(suggestions).to.be.an('object');
      expect(suggestions.suggestions).to.be.an('array').that.is.not.empty;
      assert.equal(suggestions.suggestions.some(suggest => suggest.label === "ГРУППИРУЮЩИМ"), true);
      

    });

    it("проверка подсказки внешнего источника в конструкции ИЗ ИЛИ СОЕДИНЕНИЕ ", function () {
      bsl = helper(`ВЫБРАТЬ
      *
      ИЗ      
      ВнешнийИсточникДанных.`);      
      let suggestions = [];
      bsl.getQuerySourceCompletion(suggestions, null);
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "РозничныйСайт"), true);      
    });

    it("проверка подсказки поля 'Таблица' внешнего источника в конструкции ИЗ ИЛИ СОЕДИНЕНИЕ ", function () {
      bsl = helper(`ВЫБРАТЬ
      *
      ИЗ      
      ВнешнийИсточникДанных.РозничныйСайт.`);      
      let suggestions = [];
      bsl.getQuerySourceCompletion(suggestions, null);
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "Таблица"), true);
    });

    it("проверка подсказки таблиц внешнего источника в конструкции ИЗ ИЛИ СОЕДИНЕНИЕ ", function () {
      bsl = helper(`ВЫБРАТЬ
      *
      ИЗ      
      ВнешнийИсточникДанных.РозничныйСайт.Таблица.`);      
      let suggestions = [];
      bsl.getQuerySourceCompletion(suggestions, null);
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "Customers"), true);
    });

    it("проверка подсказки полей таблицы внешнего источника", function () {
      bsl = helper(`ВЫБРАТЬ
      Покупатели.
      ИЗ      
      ВнешнийИсточникДанных.РозничныйСайт.Таблица.Customers КАК Покупатели`, 2, 18);
      let suggestions = [];
      bsl.getQueryFieldsCompletion(suggestions);
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "customer_id"), true);   
    });

    it("проверка подсказки табличных частей в конструкции ИЗ или СОЕДИНЕНИЕ", function () {
      bsl = helper(`ВЫБРАТЬ
      *
      ИЗ      
        Справочник.Товары.`);
      let suggestions = bsl.getQueryCompletion();
      expect(suggestions).to.be.an('object');
      expect(suggestions.suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.suggestions.some(suggest => suggest.label === "ДополнительныеРеквизиты"), true);
    });

    it("проверка подсказки реквизитов табличных частей", function () {
      bsl = helper(`ВЫБРАТЬ
      ДопРеквизиты.
      ИЗ      
        Справочник.Товары.ДополнительныеРеквизиты КАК ДопРеквизиты`, 2, 20);
      let suggestions = [];
      bsl.getQueryFieldsCompletion(suggestions);
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "Ссылка"), true);
      assert.equal(suggestions.some(suggest => suggest.label === "ИмяРеквизита"), true);
    });

    
    it("проверка подсказки для функции ВЫРАЗИТЬ", function () {
            
      bsl = helper("ВЫРАЗИТЬ(");
      let suggestions = bsl.getQueryCompletion();
      expect(suggestions).to.be.an('array').that.is.empty;

      bsl = helper("ВЫРАЗИТЬ(Товары.Код ");
      suggestions = bsl.getQueryCompletion({ triggerCharacter: " " });
      expect(suggestions).to.be.an('object');
      expect(suggestions.suggestions).to.be.an('array').that.is.not.empty;
      assert.equal(suggestions.suggestions.some(suggest => suggest.label === "КАК "), true);

      bsl = helper("ВЫРАЗИТЬ(Товары.Код КАК ");
      suggestions = bsl.getQueryCompletion();
      expect(suggestions).to.be.an('object');
      expect(suggestions.suggestions).to.be.an('array').that.is.not.empty;
      assert.equal(suggestions.suggestions.some(suggest => suggest.label === "Строка"), true);
      assert.equal(suggestions.suggestions.some(suggest => suggest.label === "Справочник"), true);

      bsl = helper("ВЫРАЗИТЬ(Товары.Код КАК Справочник.");
      suggestions = bsl.getQueryCompletion();
      expect(suggestions).to.be.an('object');
      expect(suggestions.suggestions).to.be.an('array').that.is.not.empty;
      assert.equal(suggestions.suggestions.some(suggest => suggest.label === "Товары"), true);      

    });

    it("проверка автоподсказки ВЫРАЗИТЬ и CAST по SPACE", function () {

      bsl = helper("ВЫРАЗИТЬ(Валюты КАК ");
      let suggestions = bsl.getQueryCompletion({ triggerCharacter: " " });
      expect(suggestions).to.be.an('object');
      expect(suggestions.suggestions).to.be.an('array').that.is.not.empty;
      assert.equal(suggestions.suggestions.some(suggest => suggest.label === "Строка"), true);
      assert.equal(suggestions.suggestions.some(suggest => suggest.label === "Справочник"), true);
      assert.equal(suggestions.suggestions.some(suggest => suggest.label === "КАК "), false);
      assert.equal(suggestions.suggestions.some(suggest => suggest.label === "Валюты"), false);

      bsl = helper("CAST(smth AS ");
      suggestions = bsl.getQueryCompletion({ triggerCharacter: " " });
      expect(suggestions).to.be.an('object');
      expect(suggestions.suggestions).to.be.an('array').that.is.not.empty;
      assert.equal(suggestions.suggestions.some(suggest => suggest.label === "Строка"), true);
      assert.equal(suggestions.suggestions.some(suggest => suggest.label === "Справочник"), true);
      assert.equal(suggestions.suggestions.some(suggest => suggest.label === "КАК "), false);

      bsl = helper("ВЫБРАТЬ Товары.Код КАК ");
      suggestions = bsl.getQueryCompletion({ triggerCharacter: " " });
      expect(suggestions).to.be.an('object');
      expect(suggestions.suggestions).to.be.an('array').that.is.not.empty;
      assert.equal(suggestions.suggestions.some(suggest => suggest.label === "Код"), true);

    });

    it("проверка подсказки в условии ГДЕ", function () {

      bsl = helper(`ВЫБРАТЬ
        Товары.Ссылка
      ИЗ      
        Справочник.Товары КАК Товары
      ГДЕ
        Т`, 6, 10);
      let suggestions = bsl.getQueryCompletion();
      expect(suggestions).to.be.an('object');
      expect(suggestions.suggestions).to.be.an('array').that.is.not.empty;
      assert.equal(suggestions.suggestions.some(suggest => suggest.label === "Товары"), true);

      bsl = helper(`ВЫБРАТЬ
        Товары.Ссылка
      ИЗ      
        Справочник.Товары КАК Товары
      ГДЕ
        НЕ Т`, 6, 13);
      suggestions = bsl.getQueryCompletion();
      expect(suggestions).to.be.an('object');
      expect(suggestions.suggestions).to.be.an('array').that.is.not.empty;
      assert.equal(suggestions.suggestions.some(suggest => suggest.label === "Товары"), true);      

    });

    it("проверка подсказки ГДЕ при отсутствии псевдонима источника", function () {
      bsl = helper(`ВЫБРАТЬ
      *
      ИЗ      
        Справочник.Товары
      Г`);
      let suggestions = bsl.getQueryCompletion();
      expect(suggestions).to.be.an('object');
      expect(suggestions.suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.suggestions.some(suggest => suggest.label === "ГДЕ"), true);
    });

    it("проверка подсказки реквизитов при отсутствии псевдонима источника", function () {
      bsl = helper(`ВЫБРАТЬ
      *
      ИЗ      
        Справочник.Товары
      ГДЕ
        Н`);
      let suggestions = bsl.getQueryCompletion();
      expect(suggestions).to.be.an('object');
      expect(suggestions.suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.suggestions.some(suggest => suggest.label === "Наименование"), true);
    });

    window.setLanguageMode('bsl_query');
        
    let runner = mocha.run();
    runner.on('end', function () {
      window.queryTestsComplete = {
        failures: runner.failures,
        tests: runner.stats.tests,
        passes: runner.stats.passes
      };
    });

  })

}, 1000);
