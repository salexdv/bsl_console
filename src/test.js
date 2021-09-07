
describe("Проверка автокомлита и подсказок редактора кода", function () {

  require(['editor'], function () {

    init('8.3.18.1');

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
        bsl.getCommonCompletion(suggestions, bslGlobals.globalfunctions, monaco.languages.CompletionItemKind.Function)
        expect(suggestions).to.be.an('array').that.not.is.empty;
      });

      it("проверка автокомплита для глобальной функции Найти обернутой в функцию", function () {
        bsl = helper('СтрНайти(Най');
        let suggestions = [];
        bsl.getCommonCompletion(suggestions, bslGlobals.globalfunctions, monaco.languages.CompletionItemKind.Function)
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
        bsl.getCommonCompletion(suggestions, bslGlobals.classes, monaco.languages.CompletionItemKind.Constructor)
        expect(suggestions).to.be.an('array').that.not.is.empty;
        expect(suggestions).to.have.deep.property('[0].label', 'HTTPЗапрос');
      });

      it("проверка автокомплита для конструктора HTTPЗапрос обернутого в функцию", function () {
        bsl = helper('СтрНайти(Новый HTTPЗа');
        assert.equal(bsl.requireClass(), true);
        let suggestions = [];
        bsl.getCommonCompletion(suggestions, bslGlobals.classes, monaco.languages.CompletionItemKind.Constructor)
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
        bsl.getClassCompletion(suggestions, bslGlobals.classes);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "УстановитьПараметр"), false);
      });

      it("проверка автокомплита для экземпляра объекта HTTPЗапрос (список свойств и методов)", function () {
        bsl = helper('Запрос = Новый HTTPЗапрос();\nЗапрос.');
        let suggestions = [];
        bsl.getClassCompletion(suggestions, bslGlobals.classes);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "УстановитьПараметр"), false);
      });      

      it("проверка автокомплита объекта HTTPЗапрос (список свойств и методов) обернутого в функцию", function () {
        bsl = helper('Найти(HTTPЗапрос.');
        let suggestions = [];
        bsl.getClassCompletion(suggestions, bslGlobals.classes);
        expect(suggestions).to.be.an('array').that.not.is.empty;
      });

      it("проверка автокомплита метода УстановитьИмяФайлаТела объекта HTTPЗапрос", function () {
        bsl = helper('HTTPЗапрос.УстановитьИмя');
        let suggestions = [];
        bsl.getClassCompletion(suggestions, bslGlobals.classes);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "УстановитьИмяФайлаТела"), true);
      });

      it("проверка автокомплита метода УстановитьИмяФайлаТела объекта HTTPЗапрос обернутого в функцию", function () {
        bsl = helper('Найти(HTTPЗапрос.УстановитьИмя');
        let suggestions = [];
        bsl.getClassCompletion(suggestions, bslGlobals.classes);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "УстановитьИмяФайлаТела"), true);
      });

      it("проверка автокомплита для объекта метаданных 'Справочники'", function () {
        bsl = helper('Товар = Справоч');
        let suggestions = [];
        bsl.getCommonCompletion(suggestions, bslGlobals.globalvariables, monaco.languages.CompletionItemKind.Class)
        expect(suggestions).to.be.an('array').that.not.is.empty;
        expect(suggestions).to.have.deep.property('[0].label', 'Справочники');
      });

      it("проверка автокомплита для объекта метаданных 'Справочники.' обернутого в функцию", function () {
        bsl = helper('Найти(Справочн');
        let suggestions = [];
        bsl.getCommonCompletion(suggestions, bslGlobals.globalvariables, monaco.languages.CompletionItemKind.Class)
        expect(suggestions).to.be.an('array').that.not.is.empty;
        expect(suggestions).to.have.deep.property('[0].label', 'Справочники');
      });

      it("проверка автокомплита для объекта метаданных 'Справочники.' (список справочников)", function () {
        bsl = helper('Товар = Справочники.');
        let suggestions = [];
        bsl.getMetadataCompletion(suggestions, bslMetadata)
        expect(suggestions).to.be.an('array').that.not.is.empty;
      });

      it("проверка автокомплита для объекта метаданных 'Справочники.' (список справочников) обернутого в функцию", function () {
        bsl = helper('Найти(Справочники.');
        let suggestions = [];
        bsl.getMetadataCompletion(suggestions, bslMetadata)
        expect(suggestions).to.be.an('array').that.not.is.empty;
      });

      it("проверка автокомплита для объекта метаданных 'Справочники.Товары.' (список функций менеджера)", function () {
        bsl = helper('Товар = Справочники.Товары.');
        let suggestions = [];
        bsl.getMetadataCompletion(suggestions, bslMetadata)
        expect(suggestions).to.be.an('array').that.not.is.empty;
      });

      it("проверка автокомплита для объекта метаданных 'Справочники.Товары.' (список функций менеджера) обернутого в функцию", function () {
        bsl = helper('Найти(Справочники.Товары.');
        let suggestions = [];
        bsl.getMetadataCompletion(suggestions, bslMetadata)
        expect(suggestions).to.be.an('array').that.not.is.empty;
      });

      it("проверка автокомплита для элемента справочника 'Товары.' (список реквизитов и функций объекта)", function () {
        bsl = helper('Товар = Справочники.Товары.НайтиПоКоду(1);\nТовар.');
        let suggestions = [];
        bsl.getMetadataCompletion(suggestions, bslMetadata)
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "Цена"), true);
      });

      it("проверка автокомплита для элемента справочника 'Товары.' (список предопределенных)", function () {
        bsl = helper('Товар = Справочники.Товары.');
        let suggestions = [];
        bsl.getMetadataCompletion(suggestions, bslMetadata)
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "Услуга"), true);
      });

      it("проверка автокомплита для элемента справочника 'Товары.' (список реквизитов и функций объекта) обернутого в функцию", function () {
        bsl = helper('Товар = Справочники.Товары.НайтиПоКоду(1);\nНайти(Товар.');
        let suggestions = [];
        bsl.getMetadataCompletion(suggestions, bslMetadata)
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
        bsl.getMetadataCompletion(suggestions, bslMetadata)        
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "ДатаМодификацииУниверсальная"), true);
        bslMetadata = JSON.parse(JSON.stringify(mCopy));
      });

      it("проверка обновления сниппетов", function () {              	                
        let sCopy = JSON.parse(JSON.stringify(snippets));        
        assert.notEqual(updateSnippets(123), true);
        let strJSON = '{"snippets": { "ЕслиЧто": { "prefix": "Если", "body": "Если ${1:Условие} Тогда\n\t$0\nКонецЕсли;", "description": "ЕслиЧто"}}}';
        assert.equal(updateSnippets(strJSON), true);
        bsl = helper('ЕслиЧто');
        let suggestions = [];
        bsl.getSnippets(suggestions, snippets, false);        
        expect(suggestions).to.be.an('array').that.not.is.empty;        
        assert.equal(suggestions.some(suggest => suggest.detail === "ЕслиЧто"), true);
        snippets = JSON.parse(JSON.stringify(sCopy));
      });

      it("проверка замены сниппетов", function () {              	                
        let sCopy = JSON.parse(JSON.stringify(snippets));                
        let strJSON = '{"snippets": { "ЕслиЧто": { "prefix": "Если", "body": "Если ${1:Условие} Тогда\n\t$0\nКонецЕсли;", "description": "ЕслиЧто"}}}';
        assert.equal(updateSnippets(strJSON, true), true);
        bsl = helper('Если');
        let suggestions = [];
        bsl.getSnippets(suggestions, snippets, false);
        assert.equal(suggestions.length, 1);
        snippets = JSON.parse(JSON.stringify(sCopy));
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

      it("проверка загрузки пользовательских функций", function () {
        let strJSON = '{ "customFunctions":{ "МояФункция1":{ "name":"МояФункция1", "name_en":"MyFuntion1", "description":"Получает из строки закодированной по алгоритму base64 двоичные данные.", "returns":"Тип: ДвоичныеДанные. ", "signature":{ "default":{ "СтрокаПараметров":"(Строка: Строка): ДвоичныеДанные", "Параметры":{ "Строка":"Строка, закодированная по алгоритму base64." } } } }, "МояФункция2":{ "name":"МояФункция2", "name_en":"MyFuntion2", "description":"Выполняет сериализацию значения в формат XML.", "template":"МояФункция2(ВызовЗависимойФункции(${1:ПервыйЗависимыйПараметр}, ${2:ВторойЗависимыйПараметр}), ${0:ПараметрМоейФункции}))", "signature":{ "ЗаписатьБезИмени":{ "СтрокаПараметров":"(ЗаписьXML: ЗаписьXML, Значение: Произвольный, НазначениеТипа?: НазначениеТипаXML)", "Параметры":{ "ЗаписьXML":"Объект, через который осуществляется запись XML, полученный через зависимою функцию", "Значение":"Записываемое в поток XML значение. Тип параметра определяется совокупностью типов, для которых определена XML-сериализация." } }, "ЗаписатьСПолнымИменем":{ "СтрокаПараметров":"(ЗаписьXML: ЗаписьXML, Значение: Произвольный, ПолноеИмя: Строка, НазначениеТипа?: НазначениеТипаXML)", "Параметры":{ "ЗаписьXML":"Объект, через который осуществляется запись XML.", "Значение":"Записываемое в поток XML значение. Тип параметра определяется совокупностью типов, для которых определена XML-сериализация.", "ПолноеИмя":"Полное имя элемента XML, в который будет записано значение.", "НазначениеТипа":"Определяет необходимость назначения типа элементу XML. Значение по умолчанию: Неявное." } }, "ЗаписатьСЛокальнымИменемИПространствомИмен":{ "СтрокаПараметров":"(ЗаписьXML: ЗаписьXML, Значение: Произвольный, ЛокальноеИмя: Строка, URIПространстваИмен: Строка, НазначениеТипа?: НазначениеТипаXML)", "Параметры":{ "ЗаписьXML":"Объект, через который осуществляется запись XML.", "Значение":"Записываемое в поток XML значение. Тип параметра определяется совокупностью типов, для которых определена XML-сериализация.", "ЛокальноеИмя":"Локальное имя элемента XML, в который будет записано значение.", "URIПространстваИмен":"URI пространства имен, к которому принадлежит указанное ЛокальноеИмя.", "НазначениеТипа":"Определяет необходимость назначения типа элементу XML. Значение по умолчанию: Неявное." } } } } } }';
        assert.notEqual(updateCustomFunctions(123), true);
        assert.equal(updateCustomFunctions(strJSON), true);
      });

      it("проверка автокомплита для пользовательской функции МояФункция2", function () {
        bsl = helper('мояфу');
        let suggestions = [];
        bsl.getCommonCompletion(suggestions, bslGlobals.customFunctions, monaco.languages.CompletionItemKind.Function)
        expect(suggestions).to.be.an('array').that.not.is.empty;
      });

      it("проверка подсказки параметров для пользовательской функции МояФункция2", function () {
        bsl = helper('МояФункция2');        
        let suggestions = [];
        let help = bsl.getCommonSigHelp(bslGlobals.customFunctions);
        expect(help).to.have.property('activeParameter');
      });

      it("проверка подсказки переопределенных параметров для функции Состояние", function () {
        let strJSON = '{ "Состояние": [ { "label": "(Первый, Второй)", "documentation": "Описание сигнатуры", "parameters": [ { "label": "Первый", "documentation": "Описание первого" }, { "label": "Второй", "documentation": "Описание второго" } ] } ] }';
        assert.equal(setCustomSignatures(strJSON), true);        
        let position = new monaco.Position(28, 12);
        let model = editor.getModel();
        editor.setPosition(position);
        bsl = new bslHelper(model, position);
        let help = bsl.getCustomSigHelp();
        expect(help).to.have.property('activeParameter');
        assert.equal(setCustomSignatures('{}'), true);        
      });

      it("проверка автокомплита для функции 'Тип'", function () {
        bsl = helper('Тип("');
        assert.equal(bsl.requireType(), true);
        let suggestions = [];
        bsl.getTypesCompletion(suggestions, bslGlobals.types, monaco.languages.CompletionItemKind.Enum)
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "СправочникСсылка"), true);        
      });

      it("проверка автокомплита для функции 'Тип' обернутой в функцию", function () {
        bsl = helper('Поиск = Найти(Тип("');
        assert.equal(bsl.requireType(), true);
        let suggestions = [];
        bsl.getTypesCompletion(suggestions, bslGlobals.types, monaco.languages.CompletionItemKind.Enum)
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "СправочникСсылка"), true);        
      });

      it("проверка автокомплита для функции 'Тип' с указанием конкретного вида метаданных", function () {
        bsl = helper('Тип("СправочникСсылка.');
        assert.equal(bsl.requireType(), true);
        let suggestions = [];
        bsl.getTypesCompletion(suggestions, bslGlobals.types, monaco.languages.CompletionItemKind.Enum)
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
                      "description":"Ссылка на справочник номенклатуры",
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
                }
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
        let res = updateMetadata(strJSON);
        assert.equal(res, true);
        bsl = helper('_ОстаткиТ');
        let suggestions = [];
        bsl.getCustomObjectsCompletion(suggestions, bslMetadata.customObjects, monaco.languages.CompletionItemKind.Enum);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "_ОстаткиТовара"), true);        
      });

      it("проверка подсказки для вложенного пользовательского объекта", function () {
        bsl = helper('_ОбъектСВложениями.');
        let suggestions = [];
        bsl.getCustomObjectsCompletion(suggestions, bslMetadata.customObjects, monaco.languages.CompletionItemKind.Enum);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "ВложенныйОбъект"), true);
        suggestions.forEach(function (suggestion) {
          if (suggestion.label == "ВложенныйОбъект") {
            let command = suggestion.command.arguments[0];
            contextData = new Map([
              [1, new Map([[command.name.toLowerCase(), command.data]])]
            ]);
            suggestions = [];
            bsl = helper('_ОбъектСВложениями.ВложенныйОбъект.');
            bsl.getRefCompletion(suggestions);
            assert.equal(suggestions.some(suggest => suggest.label === "ПервыйРеквизитОбъекта"), true);        
            contextData = new Map();
          }
        });                                
      });

      it("проверка подсказки методов, когда у пользовательского объекта явна задана ссылка", function () {
        bsl = helper('_СтруктураВыгрузки.');
        let suggestions = [];
        bsl.getCustomObjectsCompletion(suggestions, bslMetadata.customObjects, monaco.languages.CompletionItemKind.Enum);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "Вставить"), true);
      });

      it("проверка подсказки собственных методов для пользовательского объекта", function () {
        bsl = helper('_СтруктураВыгрузки.');
        let suggestions = [];
        bsl.getCustomObjectsCompletion(suggestions, bslMetadata.customObjects, monaco.languages.CompletionItemKind.Enum);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "КоличествоЗаписейВВыгрузке"), true);
      });

      it("проверка подсказки ссылочных реквизитов", function () {              	                                
        bsl = helper('_ОстаткиТовара.Номенклатура.');
        let suggestions = [];
        contextData = new Map([
          [1, new Map([["номенклатура", { "ref": "catalogs.Товары", "sig": null }]])]
        ]);
        bsl.getRefCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "СтавкаНДС"), true);        
        suggestions = [];
        bsl = helper('_ОстаткиТовара.Наминклатура.');
        bsl.getRefCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.is.empty;
        contextData = new Map();
      });

      it("проверка подсказки для таблицы, полученной из результата запроса", function () {              	                                
        bsl = helper('ОбъектЗапрос = Новый Запрос();\nРезультат = ОбъектЗапрос.Выполнить();\nТаблица = Результат.Выгрузить();\nТаблица.');
        let suggestions = [];        
        contextData = new Map([
          [2, new Map([["выполнить", { "ref": "types.РезультатЗапроса", "sig": null }]])],
          [3, new Map([["выгрузить", { "ref": "classes.ТаблицаЗначений", "sig": null }]])]
        ]);        
        bsl.getRefCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "ВыгрузитьКолонку"), true);        
        contextData = new Map();
      });

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
        contextData = new Map([
          [2, new Map([["скопировать", { "ref": "classes.ТаблицаЗначений", "sig": null }]])],
          [3, new Map([["выгрузитьколонку", { "ref": "classes.Массив", "sig": signature }]])]
        ]);        
        let help = bsl.getRefSigHelp();        
        expect(help).to.have.property('activeParameter');
        contextData = new Map();
      });

      it("проверка подсказки для таблицы, полученной функцией НайтиПоСсылкам", function () {              	                                
        bsl = helper('Таблица = НайтиПоСсылкам();\nТаблица.');
        let suggestions = [];        
        contextData = new Map([
          [1, new Map([["найтипоссылкам", { "ref": "classes.ТаблицаЗначений", "sig": null }]])]          
        ]);        
        bsl.getRefCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "ВыгрузитьКолонку"), true);        
        contextData = new Map();
      });

      it("проверка подсказки для таблицы, полученной из результата запроса в одну строку", function () {              	                                
        bsl = helper('ОбъектЗапрос = Новый Запрос();\nТаблица = ОбъектЗапрос.Выполнить().Выгрузить().');
        let suggestions = [];        
        contextData = new Map([
          [2, new Map([["выполнить", { "ref": "types.РезультатЗапроса", "sig": null }]])],
          [2, new Map([["выгрузить", { "ref": "classes.ТаблицаЗначений", "sig": null }]])]
        ]);        
        bsl.getRefCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "Скопировать"), true);        
        contextData = new Map();
      });

      it("проверка подсказки переменных из параметров функции", function () {              	                                
        bsl = helper('Функция МояФункция(Парам1, Парам2, Парам3)\nПар');        
        let suggestions = [];
        bsl.getVariablesCompetition(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "Парам1"), true);
      });

      it("проверка подсказки для реквизитов составного типа", function () {              	                                
        bsl = helper('_ОстаткиТовара.Номенклатура.');
        let suggestions = [];
        contextData = new Map([
          [1, new Map([["номенклатура", { "ref": "catalogs.Товары, documents.ПриходнаяНакладная", "sig": null }]])]
        ]);
        bsl.getRefCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "СтавкаНДС") && suggestions.some(suggest => suggest.label === "СуммаДокумента"), true);
        contextData = new Map();
      });

      it("проверка подсказки объекта, полученного методом ПолучитьОбъект()", function () {              	                                
        bsl = helper('СправочникСсылка = Справочник.Товары.НайтиПоКоду(1);\nСправочникОбъект = СправочникСсылка.ПолучитьОбъект();\nСправочникОбъект.');
        let suggestions = [];        
        contextData = new Map([
          [2, new Map([["получитьобъект", { "ref": "catalogs.Товары.obj", "sig": null }]])],          
        ]);        
        bsl.getRefCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "Заблокирован"), true);        
        contextData = new Map();
      });

      it("проверка подсказки ресурсов регистра", function () {              	                                
        bsl = helper('Рег = РегистрыНакопления.ОстаткиТоваров.СоздатьНаборЗаписей();(1);\nРег.');
        let suggestions = [];                
        bsl.getMetadataCompletion(suggestions, bslMetadata);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "Себестоимость"), true);
      });

      it("проверка подсказки определяемой по стеку", function () {              	                                
        
        let position = new monaco.Position(95, 17);
        let model = editor.getModel();
        editor.setPosition(position);
        bsl = new bslHelper(model, position);
        let suggestions = [];
        bsl.getMetadataStackCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "ПодотчетноеЛицо"), true);
        assert.equal(suggestions.some(suggest => suggest.label === "Заблокировать"), true);

        position = new monaco.Position(100, 19);
        editor.setPosition(position);
        bsl = new bslHelper(model, position);
        suggestions = [];
        bsl.getMetadataStackCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "СуммаДокумента"), true);
        assert.equal(suggestions.some(suggest => suggest.label === "Заблокировать"), true);

        map = new Map();
        map.set('товарссылка', {list:[], ref: 'catalogs.Товары', sig: null});
        contextData.set(102, map);

        position = new monaco.Position(104, 18);
        editor.setPosition(position);
        bsl = new bslHelper(model, position);
        suggestions = [];
        bsl.getMetadataStackCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "Ставка"), true);
        assert.equal(suggestions.some(suggest => suggest.label === "Заблокировать"), true);

        position = new monaco.Position(107, 24);
        editor.setPosition(position);
        bsl = new bslHelper(model, position);
        suggestions = [];
        bsl.getMetadataStackCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "СтавкаНДС"), true);        

      });

      it("проверка подсказки свойтва объекта 'ОбменДанными'", function () {
        
        bsl = helper('Спр = Справочники.Товары.НайтиПоКоду(1);\nСпр2 = Спр.ПолучитьОбъект();\nСпр2.');
        let suggestions = [];
        contextData = new Map([
          [2, new Map([["получитьобъект", { "ref": "catalogs.Товары.obj", "sig": null }]])],          
        ]);        
        bsl.getRefCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "ОбменДанными"), true);      

        bsl = helper('Спр = Справочники.Товары.НайтиПоКоду(1);\nСпр2 = Спр.ПолучитьОбъект();\nСпр2.ОбменДанными.');
        suggestions = [];
        contextData = new Map([
          [3, new Map([["обменданными", { "ref": "types.ПараметрыОбменаДанными", "sig": null }]])],          
        ]);        
        bsl.getRefCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "Загрузка"), true);      

      });

      it("проверка подсказки методов менеджера справочника", function () {              	                                
        bsl = helper('Справочники.Товары.');
        let suggestions = [];                
        bsl.getMetadataCompletion(suggestions, bslMetadata);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "ПервыйМетодМенеджера"), true);
      });

      it("проверка подсказки параметров для метода менеджера справочника", function () {
        bsl = helper('Справочники.Товары.ПервыйМетодМенеджера(');
        let help = bsl.getMetadataSigHelp(bslMetadata);
        expect(help).to.have.property('activeParameter');
      });

      it("проверка подсказки методов объекта справочника", function () {              	                                
        
        bsl = helper('Спр = Справочники.Товары.НайтиПоКоду(1);\nСпр2 = Спр.');
        let suggestions = [];                
        bsl.getMetadataCompletion(suggestions, bslMetadata);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "ПервыйМетодМенеджера"), false);
        
        bsl = helper('Спр = Справочники.Товары.НайтиПоКоду(1);\nСпр2 = Спр.ПолучитьОбъект();\nСпр2.');
        suggestions = bsl.getCodeCompletion({triggerCharacter: ''});
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "ПервыйМетодОбъекта"), true);

      });
      
    }

    mocha.run();

  });

});