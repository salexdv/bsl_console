
describe("Проверка автокомлита и подсказок редактора кода", function () {

  require(['editor'], function () {

    init('8.3.18.1');

    var assert = chai.assert;
    var expect = chai.expect;
    chai.should();

    function getPosition(line, column) {
      
      return new monaco.Position(line, column);

    }

    function getPositionByModel(model) {

      let strings = model.getValue().split('\n');
      return new monaco.Position(strings.length, strings[strings.length - 1].length + 1);

    }

    function getModel(string) {

      return monaco.editor.createModel(string, 'bsl');

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
    
    it("проверка существования глобальной переменной editor", function () {
      assert.notEqual(editor, undefined);
    });

    it("проверка загрузки bslMetadata", function () {
      assert.notEqual(bslMetadata, undefined);
    });
    
    it("проверка подсказки ключевых слов запроса", function () {
      bsl = helper('Выра');
      let suggestions = bsl.getQueryCompletition(languages.query.languageDef);
      expect(suggestions).to.be.an('object');
      expect(suggestions.suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.suggestions.some(suggest => suggest.label === "ВЫРАЗИТЬ"), true);
    });

    it("проверка подсказки параметров для функции запроса", function () {                                                     
      bsl = helper('РАЗНОСТЬДАТ(');
      let help = bsl.getCommonSigHelp(bslQuery.functions);
      expect(help).to.have.property('activeParameter');              
    });

    it("проверка автокомплита для таблицы запроса, являющейся справочником", function () {
      bsl = helper(getCode(), 4, 9);      
      let suggestions = [];
      bsl.getQueryFieldsCompletition(suggestions)
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "СтавкаНДС"), true);
    });

    it("проверка автокомплита для таблицы запроса, полученной из временной таблицы", function () {
      bsl = helper(getCode(), 209, 26);
      let suggestions = [];
      bsl.getQueryFieldsCompletition(suggestions)
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "ПФРПоСуммарномуТарифу"), true);
    });

    it("проверка подсказки ссылочных реквизитов", function () {              	                                
      bsl = helper('Товары.СтавкаНДС.');      
      let suggestions = [];
      contextData = new Map([
        [1, new Map([["ставкандс", { "ref": "catalogs.СтавкиНДС", "sig": null }]])]
      ]);
      bsl.getRefCompletition(suggestions);
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "Ставка"), true);
      contextData = new Map();
    });

    it("проверка подсказки для таблицы запроса", function () {
      bsl = helper(getCode(), 38, 9);      
      let suggestions = [];
      bsl.getQueryTablesCompletition(suggestions, null);
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "ИсчисленныеСтраховыеВзносы"), true);
      assert.equal(suggestions.some(suggest => suggest.label === "ФизлицаБезОблагаемойБазы"), true);
    });

    it("проверка отсутствия подсказки для таблицы запроса там, где её быть не должно", function () {
      bsl = helper(getCode(), 144, 9);
      let suggestions = [];
      bsl.getQueryTablesCompletition(suggestions, null);
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "ИсчисленныеСтраховыеВзносы"), false);      
    });

    it("проверка подсказки для метаданных в конструкции ИЗ ИЛИ СОЕДИНЕНИЕ ", function () {
      bsl = helper(`ВЫБРАТЬ
      *
      ИЗ      
      `);      
      let suggestions = [];
      bsl.getQuerySourceCompletition(suggestions, null);
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "Справочник"), true);      
    });

    it("проверка подсказки для объекта метаданных в конструкции ИЗ ИЛИ СОЕДИНЕНИЕ ", function () {
      bsl = helper(`ВЫБРАТЬ
      *
      ИЗ      
      Справочник.`);      
      let suggestions = [];
      bsl.getQuerySourceCompletition(suggestions, null);
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "Товары"), true);      
    });

    it("проверка подсказки для временных таблиц в конструкции ИЗ ИЛИ СОЕДИНЕНИЕ ", function () {
      bsl = helper(getCode(), 74, 20);
      let suggestions = [];
      bsl.getQuerySourceCompletition(suggestions, null);
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "ВТФизлицаБезОблагаемойБазы"), true);      
    });

    it("проверка подсказки для функции ЗНАЧЕНИЕ", function () {
      
      bsl = helper("ЗНАЧЕНИЕ(");
      let suggestions = [];
      bsl.getQueryValuesCompletition(suggestions, bslQuery.values, null)
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "Справочник"), true);

      bsl = helper("ЗНАЧЕНИЕ(Справочник.");
      suggestions = [];
      bsl.getQueryValuesCompletition(suggestions, bslQuery.values, null)
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "Товары"), true);

      bsl = helper("ЗНАЧЕНИЕ(Справочник.Товары.");
      suggestions = [];
      bsl.getQueryValuesCompletition(suggestions, bslQuery.values, null)
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "ПустаяСсылка"), true);
      assert.equal(suggestions.some(suggest => suggest.label === "Услуга"), true);

    });

    it("проверка подсказки для конструкции ССЫЛКА", function () {
      
      bsl = helper("ССЫЛКА ");
      let suggestions = [];
      bsl.getQueryRefCompletition(suggestions, null)
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "Справочник"), true);

      bsl = helper("ССЫЛКА Справочник.");
      suggestions = [];
      bsl.getQueryRefCompletition(suggestions, null)
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "Товары"), true);

    });

    it("проверка подсказки временной таблицы СрезПоследних в конструкции ИЗ ИЛИ СОЕДИНЕНИЕ", function () {
      bsl = helper(`ВЫБРАТЬ
      *
      ИЗ      
      РегистрСведений.ЦеныНоменклатуры.`);      
      let suggestions = [];
      bsl.getQuerySourceCompletition(suggestions, null);
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "СрезПоследних"), true);      
    });

    switchQueryMode();
        
    mocha.run();

  });

});