
describe("Проверка автокомлита и подсказок редактора кода", function () {

  require(['editor'], function () {

    init('8.3.18.1');

    var assert = chai.assert;
    var expect = chai.expect;
    chai.should();

    function getPosition(line, column) {
      
      return new monaco.Position(line, column);

    }

    function getModel(string) {

      return monaco.editor.createModel(string, 'bsl');

    }

    function helper(string, line, column) {
      let model = getModel(string);
      let position = getPosition(line, column);
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

    it("проверка автокомплита для таблицы запроса, являющейся справочником", function () {
      bsl = helper(getCode(), 4, 9);      
      let suggestions = [];
      bsl.getQueryFieldsCompletition(suggestions)
      expect(suggestions).to.be.an('array').that.not.is.empty;
      assert.equal(suggestions.some(suggest => suggest.label === "СтавкаНДС"), true);
    });

    switchQueryMode();
        
    mocha.run();

  });

});