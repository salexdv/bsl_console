
describe("Проверка автокомлита и подсказок редактора кода", function () {

  require(['editor'], function () {

    var assert = chai.assert;
    var expect = chai.expect;
    chai.should();

    function getPosition(model) {

      let strings = model.getValue().split('\n');
      return new monaco.Position(strings.length, strings[strings.length - 1].length + 1);

    }

    function getModel(string) {

      return monaco.editor.createModel(string, 'bsl');

    }

    function helper(string) {
      let model = getModel(string);
      let position = getPosition(model);
      return new bslHelper(model, position);
    }

    let bsl = helper('');
    let bslLoaded = (bslGlobals != undefined);

    it("проверка загрузки bslGlobals", function () {
      assert.equal(bslLoaded, true);
    });

    if (bslLoaded) {

      it("проверка существования глобальной переменной editor", function () {
        assert.notEqual(editor, undefined);
      });

      it("проверка определения русского языка", function () {
        assert.equal(bsl.hasRu('тест'), true);
      });
   
      it("проверка автокомплита для глобальной функции Найти", function () {
        bsl = helper('най');
        let suggestions = [];
        bsl.getCommonCompletition(suggestions, bslGlobals.globalfunctions, monaco.languages.CompletionItemKind.Function)
        expect(suggestions).to.be.an('array').that.not.is.empty;
      });

      it("проверка автокомплита для глобальной функции Найти обернутой в функцию", function () {
        bsl = helper('СтрНайти(Най');
        let suggestions = [];
        bsl.getCommonCompletition(suggestions, bslGlobals.globalfunctions, monaco.languages.CompletionItemKind.Function)
        expect(suggestions).to.be.an('array').that.not.is.empty;
      });

      it("проверка подсказки параметров для глобальной функции Найти(", function () {
        bsl = helper('Найти(');
        let suggestions = [];
        let help = bsl.getCommonSigHelp(bslGlobals.globalfunctions);
        expect(help).to.have.property('activeParameter');
      });

      it("проверка подсказки параметров для глобальной функции Найти обернутой в функцию", function () {
        bsl = helper('СтрНайти(Найти(');
        let suggestions = [];
        let help = bsl.getCommonSigHelp(bslGlobals.globalfunctions);
        expect(help).to.have.property('activeParameter');
      });

      it("проверка автокомплита для конструктора HTTPЗапрос", function () {
        bsl = helper('Запрос = Новый HTTPЗа');
        assert.equal(bsl.requireClass(), true);
        let suggestions = [];
        bsl.getCommonCompletition(suggestions, bslGlobals.classes, monaco.languages.CompletionItemKind.Constructor)
        expect(suggestions).to.be.an('array').that.not.is.empty;
        expect(suggestions).to.have.deep.property('[0].label', 'HTTPЗапрос');
      });

      it("проверка автокомплита для конструктора HTTPЗапрос обернутого в функцию", function () {
        bsl = helper('СтрНайти(Новый HTTPЗа');
        assert.equal(bsl.requireClass(), true);
        let suggestions = [];
        bsl.getCommonCompletition(suggestions, bslGlobals.classes, monaco.languages.CompletionItemKind.Constructor)
        expect(suggestions).to.be.an('array').that.not.is.empty;
        expect(suggestions).to.have.deep.property('[0].label', 'HTTPЗапрос');
      });

      it("проверка подсказки параметров для конструктора HTTPЗапрос", function () {
        bsl = helper('Новый HTTPЗапрос(');
        let suggestions = [];
        let help = bsl.getClassSigHelp(bslGlobals.classes);
        expect(help).to.have.property('activeParameter');
      });

      it("проверка подсказки параметров для конструктора HTTPЗапрос обернутого в функцию", function () {
        bsl = helper('СтрНайти(Новый HTTPЗапрос(');
        let suggestions = [];
        let help = bsl.getClassSigHelp(bslGlobals.classes);
        expect(help).to.have.property('activeParameter');
      });

      it("проверка автокомплита объекта HTTPЗапрос (список свойств и методов)", function () {
        bsl = helper('HTTPЗапрос.');
        let suggestions = [];
        bsl.getClassCompletition(suggestions, bslGlobals.classes);
        expect(suggestions).to.be.an('array').that.not.is.empty;
      });

      it("проверка автокомплита объекта HTTPЗапрос (список свойств и методов) обернутого в функцию", function () {
        bsl = helper('Найти(HTTPЗапрос.');
        let suggestions = [];
        bsl.getClassCompletition(suggestions, bslGlobals.classes);
        expect(suggestions).to.be.an('array').that.not.is.empty;
      });

      it("проверка автокомплита метода УстановитьИмяФайлаТела объекта HTTPЗапрос", function () {
        bsl = helper('HTTPЗапрос.УстановитьИмя');
        let suggestions = [];
        bsl.getClassCompletition(suggestions, bslGlobals.classes);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "УстановитьИмяФайлаТела"), true);
      });

      it("проверка автокомплита метода УстановитьИмяФайлаТела объекта HTTPЗапрос обернутого в функцию", function () {
        bsl = helper('Найти(HTTPЗапрос.УстановитьИмя');
        let suggestions = [];
        bsl.getClassCompletition(suggestions, bslGlobals.classes);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "УстановитьИмяФайлаТела"), true);
      });

      it("проверка автокомплита для объекта метаданных 'Справочники'", function () {
        bsl = helper('Товар = Справоч');
        let suggestions = [];
        bsl.getCommonCompletition(suggestions, bslGlobals.globalvariables, monaco.languages.CompletionItemKind.Class)
        expect(suggestions).to.be.an('array').that.not.is.empty;
        expect(suggestions).to.have.deep.property('[0].label', 'Справочники');
      });

      it("проверка автокомплита для объекта метаданных 'Справочники.' обернутого в функцию", function () {
        bsl = helper('Найти(Справочн');
        let suggestions = [];
        bsl.getCommonCompletition(suggestions, bslGlobals.globalvariables, monaco.languages.CompletionItemKind.Class)
        expect(suggestions).to.be.an('array').that.not.is.empty;
        expect(suggestions).to.have.deep.property('[0].label', 'Справочники');
      });

      it("проверка автокомплита для объекта метаданных 'Справочники.' (список справочников)", function () {
        bsl = helper('Товар = Справочники.');
        let suggestions = [];
        bsl.getMetadataCompletition(suggestions, bslMetadata)
        expect(suggestions).to.be.an('array').that.not.is.empty;
      });

      it("проверка автокомплита для объекта метаданных 'Справочники.' (список справочников) обернутого в функцию", function () {
        bsl = helper('Найти(Справочники.');
        let suggestions = [];
        bsl.getMetadataCompletition(suggestions, bslMetadata)
        expect(suggestions).to.be.an('array').that.not.is.empty;
      });

      it("проверка автокомплита для объекта метаданных 'Справочники.Товары.' (список функций менеджера)", function () {
        bsl = helper('Товар = Справочники.Товары.');
        let suggestions = [];
        bsl.getMetadataCompletition(suggestions, bslMetadata)
        expect(suggestions).to.be.an('array').that.not.is.empty;
      });

      it("проверка автокомплита для объекта метаданных 'Справочники.Товары.' (список функций менеджера) обернутого в функцию", function () {
        bsl = helper('Найти(Справочники.Товары.');
        let suggestions = [];
        bsl.getMetadataCompletition(suggestions, bslMetadata)
        expect(suggestions).to.be.an('array').that.not.is.empty;
      });

      it("проверка автокомплита для элемента справочника 'Товары.' (список реквизитов и функций объекта)", function () {
        bsl = helper('Товар = Справочники.Товары.НайтиПоКоду(1);\nТовар.');
        let suggestions = [];
        bsl.getMetadataCompletition(suggestions, bslMetadata)
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "Цена"), true);
      });

      it("проверка автокомплита для элемента справочника 'Товары.' (список предопределенных)", function () {
        bsl = helper('Товар = Справочники.Товары.');
        let suggestions = [];
        bsl.getMetadataCompletition(suggestions, bslMetadata)
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "Услуга"), true);
      });

      it("проверка автокомплита для элемента справочника 'Товары.' (список реквизитов и функций объекта) обернутого в функцию", function () {
        bsl = helper('Товар = Справочники.Товары.НайтиПоКоду(1);\nНайти(Товар.');
        let suggestions = [];
        bsl.getMetadataCompletition(suggestions, bslMetadata)
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "Цена"), true);
      });

      it("проверка подсказки параметров для метода 'Записать' документа 'АвансовыйОтчет'", function () {
        bsl = helper('Док = Документы.АвансовыйОтчет.НайтиПоНомеру(1);\nДок.Записать(');
        let suggestions = [];
        let help = bsl.getMetadataSigHelp(bslMetadata);
        expect(help).to.have.property('activeParameter');
      });

      it("проверка получения существующего текста запроса", function () {        
      	editor.setPosition(new monaco.Position(10, 1));
        assert.notEqual(getQuery(), null);
      });

      it("проверка получения несуществующего текста запроса", function () {        
      	editor.setPosition(new monaco.Position(1, 1));
        assert.equal(getQuery(), null);
      });

      it("проверка очистки всего текста", function () {              	
        let text = editor.getValue();
        eraseText();
        assert.equal(editor.getValue(), getText());
        editor.setValue(text);
        assert.equal(text, getText());
      });

      it("проверка обновления метаданных", function () {              	                
        let mCopy = JSON.parse(JSON.stringify(bslMetadata));        
        assert.notEqual(updateMetadata(123), true);
        let strJSON = '{"catalogs": {"АвансовыйОтчетПрисоединенныеФайлы": {"properties": {"Автор": "Автор","ВладелецФайла": "Размещение","ДатаМодификацииУниверсальная": "Дата изменения (универсальное время)","ДатаСоздания": "Дата создания","Зашифрован": "Зашифрован","Изменил": "Отредактировал","ИндексКартинки": "Индекс значка","Описание": "Описание","ПодписанЭП": "Подписан электронно","ПутьКФайлу": "Путь к файлу","Размер": "Размер (байт)","Расширение": "Расширение","Редактирует": "Редактирует","СтатусИзвлеченияТекста": "Статус извлечения текста","ТекстХранилище": "Текст","ТипХраненияФайла": "Тип хранения файла","Том": "Том","ФайлХранилище": "Временное хранилище файла","ДатаЗаема": "Дата заема","ХранитьВерсии": "Хранить версии","ИмяПредопределенныхДанных": "","Предопределенный": "","Ссылка": "","ПометкаУдаления": "","Наименование": ""}}}}';                
        assert.equal(updateMetadata(strJSON), true);
        bsl = helper('Отчет = Справочники.АвансовыйОтчетПрисоединенныеФайлы.НайтиПоКоду(1);\nОтчет.');
        let suggestions = [];
        bsl.getMetadataCompletition(suggestions, bslMetadata)        
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "ДатаМодификацииУниверсальная"), true);
        bslMetadata = JSON.parse(JSON.stringify(mCopy));
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
      	editor.setPosition(new monaco.Position(47, 33));
        assert.notEqual(getFormatString(), null);
      });

      it("проверка получения несуществующей форматной строки", function () {        
        editor.setPosition(new monaco.Position(47, 21));
        assert.equal(getFormatString(), null);
        editor.setPosition(new monaco.Position(10, 1));
        assert.equal(getFormatString(), null);
      });

    }

    mocha.run();

  });

});