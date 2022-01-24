
describe("Проверка автокомлита и подсказок редактора кода", function () {

  let urlParams = new URLSearchParams(window.location.search);
  let slow = urlParams.get('slow');

  if (slow)
    mocha.slow(parseInt(slow));

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
      let suggestions = bsl.getQueryCompletion();
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
      bsl.getQueryFieldsCompletion(suggestions)
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "СтавкаНДС"), true);
    });

    it("проверка автокомплита для таблицы запроса, полученной из временной таблицы", function () {
      bsl = helper(getCode(), 209, 26);
      let suggestions = [];
      bsl.getQueryFieldsCompletion(suggestions)
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "ПФРПоСуммарномуТарифу"), true);
    });

    it("проверка подсказки ссылочных реквизитов", function () {              	                                
      bsl = helper('Товары.СтавкаНДС.');      
      let suggestions = [];
      contextData = new Map([
        [1, new Map([["ставкандс", { "ref": "catalogs.СтавкиНДС", "sig": null }]])]
      ]);
      bsl.getRefCompletion(suggestions);
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "Ставка"), true);
      contextData = new Map();
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
      bsl.getQueryValuesCompletion(suggestions, bslQuery.values, null)
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "Справочник"), true);
      assert.equal(suggestions.some(suggest => suggest.label === "ВидДвиженияБухгалтерии"), true);

      bsl = helper("ЗНАЧЕНИЕ(Справочник.");
      suggestions = [];
      bsl.getQueryValuesCompletion(suggestions, bslQuery.values, null)
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "Товары"), true);

      bsl = helper("ЗНАЧЕНИЕ(Справочник.Товары.");
      suggestions = [];
      bsl.getQueryValuesCompletion(suggestions, bslQuery.values, null)
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "ПустаяСсылка"), true);
      assert.equal(suggestions.some(suggest => suggest.label === "Услуга"), true);

      bsl = helper("ЗНАЧЕНИЕ(ВидДвиженияБухгалтерии.");
      suggestions = [];
      bsl.getQueryValuesCompletion(suggestions, bslQuery.values, null)
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
      setLanguageMode('dcs_query');
      bsl = helper("ВычислитьВыражениеСГрупп");                  
      result = bsl.getDCSCompletion();
      expect(result.suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(result.suggestions.some(suggest => suggest.label === "ВычислитьВыражениеСГруппировкойМассив"), true);
      setLanguageMode('bsl_query');
    });

    it("проверка подсказки ключевых слов в режим СКД ", function () {
      setLanguageMode('dcs_query');
      bsl = helper("ТОГ");                  
      result = bsl.getDCSCompletion();
      expect(result.suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(result.suggestions.some(suggest => suggest.label === "Тогда"), true);
      setLanguageMode('bsl_query');
    });

    it("проверка подсказки для функции ЗНАЧЕНИЕ в режиме СКД", function () {
      
      setLanguageMode('dcs_query');
      
      bsl = helper("ЗНАЧЕНИЕ(");
      let suggestions = [];
      bsl.getQueryValuesCompletion(suggestions, bslQuery.values, null)
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "Справочник"), true);
      assert.equal(suggestions.some(suggest => suggest.label === "ВидДвиженияБухгалтерии"), true);

      bsl = helper("ЗНАЧЕНИЕ(Справочник.");
      suggestions = [];
      bsl.getQueryValuesCompletion(suggestions, bslQuery.values, null)
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "Товары"), true);

      bsl = helper("ЗНАЧЕНИЕ(Справочник.Товары.");
      suggestions = [];
      bsl.getQueryValuesCompletion(suggestions, bslQuery.values, null)
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "ПустаяСсылка"), true);
      assert.equal(suggestions.some(suggest => suggest.label === "Услуга"), true);
      
      setLanguageMode('bsl_query');

    });

    it("проверка подсказки функций и ключевых слов запроса в зависимости от версии 1С", function () {

      init('8.3.15.1');

      bsl = helper('Сокр');
        
      suggestions = bsl.getQueryCompletion();
      expect(suggestions).to.be.an('array').that.is.empty;

      bsl = helper('Групп');
        
      suggestions = bsl.getQueryCompletion();
      expect(suggestions).to.be.an('array').that.is.empty;

      init('8.3.20.1')     
      
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

    setLanguageMode('bsl_query');
        
    mocha.run();

  });

});