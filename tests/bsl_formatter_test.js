#!/usr/bin/env node

const assert = require('chai').assert;
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');

function loadDefaultModule(relativePath) {
  const file = path.join(ROOT, relativePath);
  const source = fs.readFileSync(file, 'utf8');
  const transformed = esbuild.transformSync(source, {
    sourcefile: file,
    loader: 'js',
    target: 'node20',
    format: 'cjs'
  }).code;
  const sandbox = {
    console: console,
    module: { exports: {} },
    exports: {},
    require: require
  };
  sandbox.exports = sandbox.module.exports;
  vm.createContext(sandbox);
  vm.runInContext(transformed, sandbox, { filename: file });
  return sandbox.module.exports.default || sandbox.module.exports;
}

const BslFormatter = loadDefaultModule('src/bsl_formatter.js');

describe('Расширенное форматирование BSL (#255)', function () {

      const keywords = [
        'Если', 'ИначеЕсли', 'Тогда', 'КонецЕсли', 'Новый', 'Возврат',
        'If', 'ElsIf', 'Then', 'EndIf', 'New', 'Return',
        'Пока', 'Цикл', 'КонецЦикла', 'Для', 'Каждого', 'Из', 'По',
        'While', 'Do', 'EndDo', 'For', 'Each', 'In', 'To',
        'НЕ', 'И', 'ИЛИ', 'NOT', 'AND', 'OR'
      ];
      const platformNames = BslFormatter.buildPlatformNameMaps({
        globalfunctions: {
          ЗаполнитьЗначенияСвойств: { name: 'ЗаполнитьЗначенияСвойств' }
        },
        classes: {
          Структура: {
            name: 'Структура',
            name_en: 'Structure',
            methods: {
              Свойство: { name: 'Свойство' }
            }
          }
        }
      });

      function format(text, options, range) {
        options = Object.assign({ keywords: keywords, platformNames: platformNames }, options || {});
        return BslFormatter.format(text, range || {}, options)[0].text;
      }

      it("применяет все независимые преобразования и остаётся идемпотентным", function () {

        const source = [
          'еСлИ НЕ ЗначениеЗаполнено(Объект) тОгДа',
          'Коротко = 1; ДлинноеИмя = 2;',
          'заполнитьзначениясвойств(Объект,Источник);',
          'Данные = нОвЫй структура;',
          'Данные.свойство("Ключ",Значение);',
          'иНаЧеЕсЛи Условие',
          'тОгДа',
          'вОзВрАт;',
          'кОнЕцЕсЛи;'
        ].join('\n');
        const options = {
          formatCanonicalKeywords: true,
          formatCanonicalPlatformNames: true,
          formatSplitStatements: true,
          formatSpaceAfterComma: true,
          formatAlignAssignments: true,
          formatJoinThen: true
        };
        const expected = [
          'Если НЕ ЗначениеЗаполнено(Объект) Тогда',
          '\tКоротко    = 1;',
          '\tДлинноеИмя = 2;',
          '\tЗаполнитьЗначенияСвойств(Объект, Источник);',
          '\tДанные = Новый Структура;',
          '\tДанные.Свойство("Ключ", Значение);',
          'ИначеЕсли Условие Тогда',
          '\tВозврат;',
          'КонецЕсли;'
        ].join('\n');

        const actual = format(source, options);
        assert.equal(actual, expected);
        assert.equal(format(actual, options), expected);

      });

      it("включает каждую публичную опцию независимо", function () {

        assert.equal(
          format('Данные = нОвЫй структура;', { formatCanonicalKeywords: true }),
          'Данные = Новый Структура;'
        );
        assert.equal(
          format('Data = nEw structure;', { formatCanonicalKeywords: true }),
          'Data = New Structure;'
        );
        assert.equal(
          format('Данные = нОвЫй пользовательскийТип;', { formatCanonicalKeywords: true }),
          'Данные = Новый пользовательскийТип;'
        );
        assert.equal(
          format('заполнитьзначениясвойств(Объект,Источник);', { formatCanonicalPlatformNames: true }),
          'ЗаполнитьЗначенияСвойств(Объект,Источник);'
        );
        assert.equal(
          format('Первый = 1; Второй = 2;', { formatSplitStatements: true }),
          'Первый = 1;\nВторой = 2;'
        );
        assert.equal(
          format('Вызов(Первый,Второй);', { formatSpaceAfterComma: true }),
          'Вызов(Первый, Второй);'
        );
        assert.equal(
          format('А = 1;\nДлинноеИмя = 2;', { formatAlignAssignments: true }),
          'А          = 1;\nДлинноеИмя = 2;'
        );
        assert.equal(
          format('Если Истина\nТогда\nВозврат;\nКонецЕсли;', { formatJoinThen: true }),
          'Если Истина Тогда\n\tВозврат;\nКонецЕсли;'
        );
        assert.equal(
          format('А = 1;\nЕсли Истина Тогда\nВозврат;\nКонецЕсли;\nБ = 2;', {
            formatBlankLinesAroundBlocks: true
          }),
          'А = 1;\n\nЕсли Истина Тогда\n\n\tВозврат;\n\nКонецЕсли;\n\nБ = 2;'
        );

      });

      it("обособляет русские структурные блоки пустыми строками", function () {

        const source = [
          'Перед = 1;',
          'Функция Получить() Экспорт',
          'Попытка',
          'Если Условие Тогда',
          'Пока Условие Цикл',
          'Выполнить();',
          'КонецЦикла;',
          'ИначеЕсли Другое Тогда',
          'Для Индекс = 1 По 2 Цикл',
          'Выполнить();',
          'КонецЦикла;',
          'Иначе',
          'Для Каждого Элемент Из Коллекция Цикл',
          'Выполнить();',
          'КонецЦикла;',
          'КонецЕсли;',
          'Исключение',
          'Сообщить(ОписаниеОшибки());',
          'КонецПопытки;',
          'Возврат 1;',
          'КонецФункции',
          'После = 2;'
        ].join('\n');
        const actual = format(source, { formatBlankLinesAroundBlocks: true });

        [
          'Функция Получить() Экспорт', 'Попытка', 'Если Условие Тогда',
          'Пока Условие Цикл', 'КонецЦикла;', 'ИначеЕсли Другое Тогда',
          'Для Индекс = 1 По 2 Цикл', 'Иначе',
          'Для Каждого Элемент Из Коллекция Цикл', 'КонецЕсли;',
          'Исключение', 'КонецПопытки;', 'КонецФункции'
        ].forEach(boundary => {
          const lines = actual.split('\n');
          const index = lines.findIndex(line => line.trim() == boundary);
          assert.isAtLeast(index, 0, boundary);
          assert.equal(lines[index - 1], '', boundary);
          assert.equal(lines[index + 1], '', boundary);
        });
        assert.notMatch(actual, /\n\n\n/);
        assert.equal(format(actual, { formatBlankLinesAroundBlocks: true }), actual);

      });

      it("обособляет английские структурные блоки и поддерживает ElseIf и ElsIf", function () {

        const source = [
          'Procedure Run()',
          'Try',
          'If First Then',
          'Return;',
          'ElseIf Second Then',
          'Return;',
          'ElsIf Third Then',
          'While Ready Do',
          'RunStep();',
          'EndDo;',
          'Else',
          'For Each Item In Items Do',
          'RunStep();',
          'EndDo;',
          'EndIf;',
          'Except',
          'Return;',
          'EndTry;',
          'EndProcedure'
        ].join('\n');
        const actual = format(source, { formatBlankLinesAroundBlocks: true });

        assert.notMatch(actual, /\n\n\n/);
        [
          'Try', 'If First Then', 'ElseIf Second Then',
          'ElsIf Third Then', 'While Ready Do', 'EndDo;', 'Else',
          'For Each Item In Items Do', 'EndIf;', 'Except', 'EndTry;'
        ].forEach(boundary => {
          const lines = actual.split('\n');
          const index = lines.findIndex(line => line.trim() == boundary);
          assert.isAtLeast(index, 0, boundary);
          assert.equal(lines[index - 1], '', boundary);
          assert.equal(lines[index + 1], '', boundary);
        });
        assert.match(actual, /^Procedure Run\(\)\n\n/);
        assert.match(actual, /\n\nEndProcedure$/);

      });

      it("поддерживает все варианты объявлений функций и процедур", function () {

        const source = [
          'До = 0;',
          'Процедура Выполнить()',
          'Возврат;',
          'КонецПроцедуры',
          'Между = 1;',
          'Function GetValue()',
          'Return 1;',
          'EndFunction',
          'После = 2;'
        ].join('\n');
        const actual = format(source, { formatBlankLinesAroundBlocks: true });

        ['Процедура Выполнить()', 'КонецПроцедуры', 'Function GetValue()', 'EndFunction']
          .forEach(boundary => {
            const lines = actual.split('\n');
            const index = lines.findIndex(line => line.trim() == boundary);
            assert.equal(lines[index - 1], '', boundary);
            assert.equal(lines[index + 1], '', boundary);
          });

      });

      it("форматирует вложенный пользовательский пример ровно с одной пустой строкой", function () {

        const source = [
          'перем1 = 1;',
          'Если ТипЗнч(Макет) = Тип("ОбъектМетаданных") Тогда',
          '\tШаблон = Новый Структура("ТипМакета");',
          '\tЕсли Шаблон.свойство("ТипМакета", ТипМакета) Тогда',
          '        ТипМакета = Неопределено;',
          '',
          '\t\tВозврат ТипМакета <> Неопределено;',
          '\tКонецЕсли;',
          '',
          'КонецЕсли;',
          'перем2="А";'
        ].join('\n');
        const expected = [
          'перем1 = 1;',
          '',
          'Если ТипЗнч(Макет) = Тип("ОбъектМетаданных") Тогда',
          '',
          '\tШаблон = Новый Структура("ТипМакета");',
          '',
          '\tЕсли Шаблон.свойство("ТипМакета", ТипМакета) Тогда',
          '',
          '\t\tТипМакета = Неопределено;',
          '',
          '\t\tВозврат ТипМакета <> Неопределено;',
          '',
          '\tКонецЕсли;',
          '',
          'КонецЕсли;',
          '',
          'перем2="А";'
        ].join('\n');

        assert.equal(format(source, { formatBlankLinesAroundBlocks: true }), expected);

      });

      it("считает многострочные заголовки и отдельные маркеры одной границей", function () {

        const source = [
          'Перед = 1;',
          'Если (Первое',
          '\tИ Второе)',
          'Тогда',
          'Возврат;',
          'КонецЕсли;',
          'Функция Получить(',
          '\tПараметр)',
          'Возврат Параметр;',
          'КонецФункции',
          'После = 2;'
        ].join('\n');
        const expected = [
          'Перед = 1;',
          '',
          'Если (Первое',
          '\tИ Второе)',
          '\tТогда',
          '',
          '\tВозврат;',
          '',
          'КонецЕсли;',
          '',
          'Функция Получить(',
          '\tПараметр)',
          '',
          '\tВозврат Параметр;',
          '',
          'КонецФункции',
          '',
          'После = 2;'
        ].join('\n');

        assert.equal(format(source, { formatBlankLinesAroundBlocks: true }), expected);

      });

      it("сохраняет связанные комментарии, аннотации и обычные пустые строки", function () {

        const source = [
          'Перед = 1;',
          '// Документация',
          '&НаКлиенте',
          'Процедура Выполнить()',
          'Первый = 1;',
          '',
          '',
          'Второй = 2;',
          'КонецПроцедуры',
          'После = 2;'
        ].join('\n');
        const expected = [
          'Перед = 1;',
          '',
          '// Документация',
          '&НаКлиенте',
          'Процедура Выполнить()',
          '',
          '\tПервый = 1;',
          '',
          '',
          '\tВторой = 2;',
          '',
          'КонецПроцедуры',
          '',
          'После = 2;'
        ].join('\n');

        assert.equal(format(source, { formatBlankLinesAroundBlocks: true }), expected);

      });

      it("самостоятельно изолирует однозначные границы на одной строке", function () {

        const source = 'Перед = 1; Если Истина Тогда Возврат; КонецЕсли; После = 2;';
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
        const options = { formatBlankLinesAroundBlocks: true };

        assert.equal(format(source, options), expected);
        assert.equal(format(source, Object.assign({ formatSplitStatements: true }, options)), expected);
        assert.equal(
          format('Если Условие Возврат;', options),
          'Если Условие Возврат;'
        );
        assert.equal(
          format('КонецЕсли НеоднозначныйКод', options),
          'КонецЕсли НеоднозначныйКод'
        );

      });

      it("не распознает структурные слова в строках, запросах, комментариях и директивах", function () {

        const source = [
          'Текст = "Если Тогда; КонецЕсли";',
          'Запрос.Текст = "ВЫБРАТЬ Если',
          '|Иначе КонецЕсли";',
          '// Пока Цикл КонецЦикла',
          '#Если Клиент Тогда',
          'Значение = 1;',
          '#КонецЕсли'
        ].join('\n');

        const expected = source.replace('Значение = 1;', '\tЗначение = 1;');
        assert.equal(format(source, { formatBlankLinesAroundBlocks: true }), expected);

      });

      it("не добавляет крайние пустые строки и сохраняет CRLF", function () {

        const source = 'Если Истина Тогда\r\nВозврат;\r\nКонецЕсли;';
        const expected = 'Если Истина Тогда\r\n\r\n\tВозврат;\r\n\r\nКонецЕсли;';
        const actual = format(source, { formatBlankLinesAroundBlocks: true });

        assert.equal(actual, expected);
        assert.notMatch(actual, /^\r?\n|\r?\n$/);
        assert.notInclude(actual.replace(/\r\n/g, ''), '\n');

      });

      it("объединяет русские условия и все виды циклов", function () {

        const source = [
          'Если Условие',
          'Тогда',
          'Возврат;',
          'ИначеЕсли ДругоеУсловие',
          'Тогда',
          'Возврат;',
          'КонецЕсли;',
          'Пока Условие',
          'Цикл',
          'Выполнить();',
          'КонецЦикла;',
          'Для Индекс = 1 По 3',
          'Цикл',
          'Выполнить();',
          'КонецЦикла;',
          'Для Каждого Элемент Из Коллекция',
          'Цикл',
          'Выполнить();',
          'КонецЦикла;'
        ].join('\n');
        const expected = [
          'Если Условие Тогда',
          '\tВозврат;',
          'ИначеЕсли ДругоеУсловие Тогда',
          '\tВозврат;',
          'КонецЕсли;',
          'Пока Условие Цикл',
          '\tВыполнить();',
          'КонецЦикла;',
          'Для Индекс = 1 По 3 Цикл',
          '\tВыполнить();',
          'КонецЦикла;',
          'Для Каждого Элемент Из Коллекция Цикл',
          '\tВыполнить();',
          'КонецЦикла;'
        ].join('\n');
        const options = { formatJoinThen: true };

        assert.equal(format(source, options), expected);
        assert.equal(format(expected, options), expected);

      });

      it("объединяет английские условия и все виды циклов", function () {

        const source = [
          'If Condition',
          'Then',
          'Return;',
          'ElsIf OtherCondition',
          'Then',
          'Return;',
          'EndIf;',
          'While Condition',
          'Do',
          'Run();',
          'EndDo;',
          'For Index = 1 To 3',
          'Do',
          'Run();',
          'EndDo;',
          'For Each Item In Collection',
          'Do',
          'Run();',
          'EndDo;'
        ].join('\n');
        const actual = format(source, { formatJoinThen: true });

        assert.include(actual, 'If Condition Then');
        assert.include(actual, 'ElsIf OtherCondition Then');
        assert.include(actual, 'While Condition Do');
        assert.include(actual, 'For Index = 1 To 3 Do');
        assert.include(actual, 'For Each Item In Collection Do');
        assert.notInclude(actual, '\n\tThen\n');
        assert.notInclude(actual, '\n\tDo\n');

      });

      it("изолирует окончания условий и циклов без общего разделения операторов", function () {

        const source = [
          'Первый = 1; Второй = 2; КонецЕсли; Третий = 3;',
          'Четвертый = 4; EndIf; Fifth = 5;',
          'Шестой = 6; КонецЦикла; Седьмой = 7;',
          'Eighth = 8; EndDo; Ninth = 9;',
          'КонецЕсли; // комментарий остается с окончанием'
        ].join('\n');
        const expected = [
          'Первый = 1; Второй = 2;',
          'КонецЕсли;',
          'Третий = 3;',
          'Четвертый = 4;',
          'EndIf;',
          'Fifth = 5;',
          'Шестой = 6;',
          'КонецЦикла;',
          'Седьмой = 7;',
          'Eighth = 8;',
          'EndDo;',
          'Ninth = 9;',
          'КонецЕсли; // комментарий остается с окончанием'
        ].join('\n');

        assert.equal(format(source, { formatJoinThen: true }), expected);

      });

      it("сохраняет регистр управляющих слов без канонизации", function () {

        assert.equal(
          format('пОкА Условие\nцИкЛ\nВозврат;\nкОнЕцЦиКлА;', { formatJoinThen: true }),
          'пОкА Условие цИкЛ\n\tВозврат;\nкОнЕцЦиКлА;'
        );
        assert.equal(
          format('пОкА Условие\nцИкЛ\nВозврат;\nкОнЕцЦиКлА;', {
            formatCanonicalKeywords: true,
            formatJoinThen: true
          }),
          'Пока Условие Цикл\n\tВозврат;\nКонецЦикла;'
        );

      });

      it("сохраняет тип перевода строк", function () {

        const source = 'Если Истина\r\nТогда\r\nА = 1;\r\nКонецЕсли;';
        const actual = format(source, { formatJoinThen: true });

        assert.equal(actual, 'Если Истина Тогда\r\n\tА = 1;\r\nКонецЕсли;');
        assert.notInclude(actual.replace(/\r\n/g, ''), '\n');

        const splitSource = 'Первый = 1; Второй = 2;\r\nТретий = 3;';
        const splitActual = format(splitSource, { formatSplitStatements: true });
        assert.equal(splitActual, 'Первый = 1;\r\nВторой = 2;\r\nТретий = 3;');
        assert.notInclude(splitActual.replace(/\r\n/g, ''), '\n');

      });

      it("разделяет пользовательский пример по точкам с запятой вне строк", function () {

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
        const options = { formatSplitStatements: true };

        assert.equal(format(source, options), expected);
        assert.equal(format(expected, options), expected);

      });

      it("сохраняет отступ и экранированные строки при разделении операторов", function () {

        const source = [
          'Если Истина Тогда',
          '  Первый = 1; Второй = "А"";""Б"; Сообщить("Готово;");',
          'КонецЕсли;'
        ].join('\n');
        const expected = [
          'Если Истина Тогда',
          '\tПервый = 1;',
          '\tВторой = "А"";""Б";',
          '\tСообщить("Готово;");',
          'КонецЕсли;'
        ].join('\n');

        assert.equal(format(source, { formatSplitStatements: true }), expected);

      });

      it("не изменяет строки, тексты запросов и комментарии", function () {

        const source = [
          'Текст = "A;B,C"; Вторая = 2;',
          'ТекстУправления = "КонецЕсли; Пока Цикл";',
          'Запрос.Текст = "ВЫБРАТЬ Поле,Поле2;',
          '|ГДЕ Поле = ""A,B;C""";',
          'Вызов(Первый,Второй); // КонецЦикла; Пока Цикл'
        ].join('\n');
        const actual = format(source, {
          formatSplitStatements: true,
          formatSpaceAfterComma: true,
          formatJoinThen: true
        });

        assert.include(actual, 'Текст = "A;B,C";\nВторая = 2;');
        assert.include(actual, 'ТекстУправления = "КонецЕсли; Пока Цикл";');
        assert.include(actual, '"ВЫБРАТЬ Поле,Поле2;\n|ГДЕ Поле = ""A,B;C"""');
        assert.include(actual, 'Вызов(Первый, Второй); // КонецЦикла; Пока Цикл');

      });

      it("выравнивает только непрерывные группы простых присваиваний", function () {

        const source = [
          'Коротко = 1;',
          'ДлинноеИмя = 2;',
          'Если А = Б Тогда',
          '\tРезультат = Вызов(А = Б);',
          'КонецЕсли;',
          'Один = 1; // граница группы',
          'Другой = 2;'
        ].join('\n');
        const actual = format(source, { formatAlignAssignments: true });

        assert.include(actual, 'Коротко    = 1;\nДлинноеИмя = 2;');
        assert.include(actual, 'Если А = Б Тогда');
        assert.include(actual, '\tРезультат = Вызов(А = Б);');
        assert.include(actual, 'Один = 1; // граница группы\nДругой = 2;');

      });

      it("не переносит неоднозначное Тогда", function () {

        const source = [
          'Если Первое',
          '\tИ Второе',
          'тОгДа',
          '\tВозврат;',
          'КонецЕсли;'
        ].join('\n');
        const actual = format(source, {
          formatCanonicalKeywords: true,
          formatJoinThen: true
        });

        assert.include(actual, '\n\tТогда\n');

        const loop = format('Пока Первое\n\tИ Второе\nЦикл\nВозврат;\nКонецЦикла;', {
          formatCanonicalKeywords: true,
          formatJoinThen: true
        });
        assert.include(loop, '\n\tЦикл\n');

      });

      it("объединяет Тогда в пользовательском примере условия", function () {

        const source = [
          'Если Шаблон.свойство("ТипМакета", ТипМакета)',
          '\tТогда',
          '\tВозврат ТипМакета <> Неопределено;',
          'КонецЕсли;'
        ].join('\n');
        const expected = [
          'Если Шаблон.свойство("ТипМакета", ТипМакета) Тогда',
          '\tВозврат ТипМакета <> Неопределено;',
          'КонецЕсли;'
        ].join('\n');

        assert.equal(format(source, { formatJoinThen: true }), expected);

      });


});

