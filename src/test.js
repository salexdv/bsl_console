
describe("Проверка автокомлита и подсказок редактора кода", function () {

  let urlParams = new URLSearchParams(window.location.search);
  let slow = urlParams.get('slow');

  if (slow)
    mocha.slow(parseInt(slow));

  require(['editor'], function () {

    init('8.3.18.1');
    showStatusBar(true);

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
      '',
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
        let context = bsl.getLastSigMethod({});
        let help = bsl.getCommonSigHelp(context, bslGlobals.globalfunctions);
        expect(help).to.have.property('activeParameter');
      });

      it("проверка подсказки параметров для глобальной функции Найти обернутой в функцию", function () {
        bsl = helper('СтрНайти(Найти(');
        let context = bsl.getLastSigMethod({});
        let help = bsl.getCommonSigHelp(context, bslGlobals.globalfunctions);
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
        let context = bsl.getLastSigMethod({});
        let help = bsl.getClassSigHelp(context, bslGlobals.classes);
        expect(help).to.have.property('activeParameter');
      });

      it("проверка подсказки параметров для конструктора HTTPЗапрос обернутого в функцию", function () {
        bsl = helper('СтрНайти(Новый HTTPЗапрос(');
        let context = bsl.getLastSigMethod({});
        let help = bsl.getClassSigHelp(context, bslGlobals.classes);
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

      it("проверка подсказки для выборки справочника 'Товары'", function () {
        bsl = helper('Выборка = Справочники.Товары.Выбрать();\nВыборка.');
        let suggestions = [];
        bsl.getMetadataCompletion(suggestions, bslMetadata)
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "Цена"), true);
        assert.equal(suggestions.some(suggest => suggest.label === "Следующий"), true);
        assert.equal(suggestions.some(suggest => suggest.label === "ЭтоГруппа"), true);
      });

      it("проверка подсказки параметров для метода 'Записать' документа 'АвансовыйОтчет'", function () {
        bsl = helper('Док = Документы.АвансовыйОтчет.НайтиПоНомеру(1);\nДок.Записать(');
        let context = bsl.getLastSigMethod({});
        let help = bsl.getMetadataSigHelp(context, bslMetadata);
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
        bsl = helper('МояФункция2(');        
        let context = bsl.getLastSigMethod({});
        let help = bsl.getCommonSigHelp(context, bslGlobals.customFunctions);
        expect(help).to.have.property('activeParameter');
      });

      it("проверка подсказки переопределенных параметров для функции Состояние", function () {
        let strJSON = '{ "Состояние": [ { "label": "(Первый, Второй)", "documentation": "Описание сигнатуры", "parameters": [ { "label": "Первый", "documentation": "Описание первого" }, { "label": "Второй", "documentation": "Описание второго" } ] } ] }';
        assert.equal(setCustomSignatures(strJSON), true);        
        let position = new monaco.Position(28, 12);
        let model = editor.getModel();
        editor.setPosition(position);
        bsl = new bslHelper(model, position);
        let context = bsl.getLastSigMethod({});
        let help = bsl.getCustomSigHelp(context);
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
        let context = bsl.getLastSigMethod({});
        let help = bsl.getRefSigHelp(context);
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

      it("проверка подсказки определяемой по стеку для метаданных (первый потомок)", function () {
        
        let position = new monaco.Position(95, 17);
        let model = editor.getModel();
        editor.setPosition(position);
        bsl = new bslHelper(model, position);
        let suggestions = [];
        bsl.getStackCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "ПодотчетноеЛицо"), true);
        assert.equal(suggestions.some(suggest => suggest.label === "Заблокировать"), true);

      });

      it("проверка подсказки определяемой по стеку для метаданных (второй потомок)", function () {
        
        let position = new monaco.Position(100, 19);
        let model = editor.getModel();
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
        contextData.set(102, map);

        let position = new monaco.Position(104, 18);
        let model = editor.getModel();
        editor.setPosition(position);
        let bsl = new bslHelper(model, position);
        let suggestions = [];
        bsl.getStackCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "Ставка"), true);
        assert.equal(suggestions.some(suggest => suggest.label === "Заблокировать"), true);

      });

      it("проверка подсказки определяемой по стеку для пользовательских объектов", function () {

        let position = new monaco.Position(107, 24);
        let model = editor.getModel();
        editor.setPosition(position);
        let bsl = new bslHelper(model, position);
        let suggestions = [];
        bsl.getStackCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "СтавкаНДС"), true);

      });

      it("проверка подсказки определяемой по стеку для классов", function () {

        let position = new monaco.Position(114, 12);
        let model = editor.getModel();
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
        let context = bsl.getLastSigMethod({});
        let help = bsl.getMetadataSigHelp(context, bslMetadata);
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

      it("проверка загрузки общего модуля (обычный и глобальный)", function () {
        
        let text = getModuleText();
        bslHelper.parseCommonModule('ОбщегоНазначения', text, false);
        
        bsl = helper('ОбщегоНазначения.');
        suggestions = bsl.getCodeCompletion({triggerCharacter: ''});
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
        let help = bsl.getCommonSigHelp(context, bslGlobals.globalfunctions);
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
        bsl.getMetadataCompletion(suggestions, bslMetadata);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "ЗаменитьСсылки"), true);

      });

      it("проверка подсказки описания метаданных", function () {

        let position = new monaco.Position(151, 13);
        let model = editor.getModel();
        editor.setPosition(position);
        bsl = new bslHelper(model, position);
        let suggestions = bsl.getCodeCompletion({triggerCharacter: ''});
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
        contextData = new Map([
          [2, new Map([["дополнительныереквизиты", { "ref": "universalObjects.ТабличнаяЧасть", "sig": null }]])],
        ]);
        bsl.getRefCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "ВыгрузитьКолонки"), true);      

      });

      it("проверка подсказки реквизитов строки табличной частей для справочника 'Товары.' по ссылке", function () {
        
        bsl = helper('Спр = Справочники.Товары.НайтиПоКоду(1);\nСтрокаТЧ = Спр.ДополнительныеРеквизиты.Добавить();\nСтрокаТЧ.');        
        let suggestions = [];
        contextData = new Map([
          [2, new Map([["добавить", { "ref": "catalogs.Товары.tabulars.ДополнительныеРеквизиты,universalObjects.СтрокаТабличнойЧасти", "sig": null }]])],
        ]);
        bsl.getRefCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "ЗначениеРеквизита"), true);
        assert.equal(suggestions.some(suggest => suggest.label === "НомерСтроки"), true);

      });

      it("проверка подсказки реквизитов строки табличной части определяемой по стеку", function () {

        bsl = helper('Спр = Справочники.Товары.НайтиПоКоду(1);\nСтрокаТЧ = Спр.ДополнительныеРеквизиты.Добавить();\nСтрокаТЧ.');
        contextData.clear();
        let suggestions = [];
        bsl.getStackCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "ЗначениеРеквизита"), true);
        assert.equal(suggestions.some(suggest => suggest.label === "НомерСтроки"), true);

      });

      it("проверка подсказки реквизитов строки табличной части при получении по индексу (отдельная переменная для ТЧ)", function () {

        bsl = helper('Спр = Справочники.Товары.НайтиПоКоду(1);\nСтрокаТЧ = Спр.ДополнительныеРеквизиты[0];\nСтрокаТЧ.');
        contextData.clear();
        let suggestions = [];
        bsl.getStackCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "ЗначениеРеквизита"), true);
        assert.equal(suggestions.some(suggest => suggest.label === "НомерСтроки"), true);

      });

      it("проверка подсказки реквизитов строки табличной части при получении через метод в строке", function () {

        bsl = helper('Спр = Справочники.Товары.НайтиПоКоду(1);\nСтрокаТЧ = Спр.ДополнительныеРеквизиты.Получить(0).');
        contextData.clear();
        let suggestions = [];
        bsl.getStackCompletion(suggestions);
        expect(suggestions).to.be.an('array').that.not.is.empty;
        assert.equal(suggestions.some(suggest => suggest.label === "ЗначениеРеквизита"), true);
        assert.equal(suggestions.some(suggest => suggest.label === "НомерСтроки"), true);

      });

      it("проверка подсказки реквизитов строки табличной части при получении через индекс в строке", function () {

        bsl = helper('Спр = Справочники.Товары.НайтиПоКоду(1);\nСтрокаТЧ = Спр.ДополнительныеРеквизиты[0].');
        contextData.clear();
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

      });
      
    }

    mocha.run();

  });

});