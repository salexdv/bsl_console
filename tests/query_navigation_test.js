#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');

function loadDefaultModule(relativePath) {
    let file = path.join(ROOT, relativePath);
    let source = fs.readFileSync(file, 'utf8');
    let transformed = esbuild.transformSync(source, {
        sourcefile: file,
        loader: 'js',
        target: 'node22',
        format: 'cjs'
    }).code;
    let sandbox = {
        console: console,
        Date: Date,
        performance: performance,
        module: { exports: {} },
        exports: {},
        require: require
    };
    sandbox.exports = sandbox.module.exports;
    vm.createContext(sandbox);
    vm.runInContext(transformed, sandbox, { filename: file });
    return sandbox.module.exports.default || sandbox.module.exports;
}

const queryModel = loadDefaultModule('src/query_model.js');
const queryNavigation = loadDefaultModule('src/query_navigation.js');
const kinds = { Struct: 1, Object: 2, Namespace: 3, Field: 4 };

function offsetAt(document, range, end) {
    let line = end ? range.endLineNumber : range.startLineNumber;
    let column = end ? range.endColumn : range.startColumn;
    return document.lineStarts[line - 1] + column - 1;
}

function rangeText(document, text, range) {
    return text.slice(offsetAt(document, range, false), offsetAt(document, range, true));
}

function positionAt(document, offset) {
    let line = 0;
    while (line + 1 < document.lineStarts.length && document.lineStarts[line + 1] <= offset)
        line++;
    return { lineNumber: line + 1, column: offset - document.lineStarts[line] + 1 };
}

function definitionAt(text, fragment, occurrence, shift) {
    let document = queryModel.parse(text);
    let offset = -1;
    let from = 0;
    for (let index = 0; index <= (occurrence || 0); index++) {
        offset = text.indexOf(fragment, from);
        from = offset + fragment.length;
    }
    assert.notEqual(offset, -1, 'Фрагмент для позиции должен существовать: ' + fragment);
    let position = positionAt(document, offset + (shift || 0));
    return {
        document: document,
        definition: queryNavigation.provideDefinition(document, text, position.lineNumber, position.column)
    };
}

function completionAt(textWithMarker, sourceName) {
    let markerOffset = textWithMarker.indexOf('|');
    assert.notEqual(markerOffset, -1, 'В тексте подсказки должен быть маркер позиции');

    let text = textWithMarker.slice(0, markerOffset) + textWithMarker.slice(markerOffset + 1);
    let document = queryModel.parse(text);
    let position = positionAt(document, markerOffset);
    return queryNavigation.resolveFieldCompletionSources(
        document,
        position.lineNumber,
        position.column,
        sourceName || ''
    );
}

function testDocumentSymbols() {
    let text = `ВЫБРАТЬ
    Источник.Ссылка КАК Ссылка,
    Источник.Код
ПОМЕСТИТЬ втТовары
ИЗ Справочник.Товары КАК Источник
ОБЪЕДИНИТЬ ВСЕ
ВЫБРАТЬ
    Возврат.Ссылка,
    Возврат.Код КАК Код
ИЗ Документ.Возврат КАК Возврат;

ВЫБРАТЬ втТовары.Ссылка КАК Итог
ИЗ втТовары;

ВЫБРАТЬ 1 КАК Номер;`;
    let document = queryModel.parse(text);
    let symbols = queryNavigation.provideDocumentSymbols(document, text, kinds);

    assert.equal(symbols.length, 3);
    assert.equal(symbols[0].name, 'втТовары');
    assert.equal(symbols[0].kind, kinds.Struct);
    assert.equal(rangeText(document, text, symbols[0].selectionRange), 'втТовары');
    assert.equal(symbols[0].children.length, 2);
    assert.equal(symbols[0].children[0].name, 'Ветка 1');
    assert.equal(symbols[0].children[0].kind, kinds.Namespace);
    assert.equal(symbols[0].children[0].children[0].kind, kinds.Field);
    assert.equal(rangeText(document, text, symbols[0].children[0].children[0].selectionRange), 'Ссылка');
    assert.equal(rangeText(document, text, symbols[0].children[0].children[1].selectionRange), 'Код');
    assert.equal(symbols[0].children[1].name, 'Ветка 2');
    assert.equal(symbols[1].name, 'Результат запроса 1');
    assert.equal(symbols[1].kind, kinds.Object);
    assert.equal(symbols[1].children[0].name, 'Итог');
    assert.equal(symbols[2].name, 'Результат запроса 2');
    assert.equal(symbols[2].children[0].name, 'Номер');
}

function testTempTableAndLocalDefinitions() {
    let text = `ВЫБРАТЬ
    Товары.Код КАК Код,
    Товары.Ссылка КАК Ссылка
ПОМЕСТИТЬ ВтТовары
ИЗ Справочник.Товары КАК Товары;

ВЫБРАТЬ
    т.кОд КАК КодРезультата
ИЗ вттовары КАК т
УПОРЯДОЧИТЬ ПО КодРезультата;`;

    let table = definitionAt(text, 'вттовары', 0, 2);
    assert(table.definition);
    assert.equal(rangeText(table.document, text, table.definition.targetSelectionRange), 'ВтТовары');
    assert.equal(rangeText(table.document, text, table.definition.originSelectionRange), 'вттовары');

    let field = definitionAt(text, 'т.кОд', 0, 3);
    assert(field.definition);
    assert.equal(rangeText(field.document, text, field.definition.targetSelectionRange), 'Код');
    assert.equal(rangeText(field.document, text, field.definition.originSelectionRange), 'кОд');

    let alias = definitionAt(text, 'т.кОд', 0, 0);
    assert(alias.definition);
    assert.equal(rangeText(alias.document, text, alias.definition.targetSelectionRange), 'т');

    let output = definitionAt(text, 'КодРезультата', 1, 3);
    assert(output.definition);
    assert.equal(rangeText(output.document, text, output.definition.targetSelectionRange), 'КодРезультата');
}

function testRecreateAndDestroy() {
    let text = `ВЫБРАТЬ 1 КАК Старое ПОМЕСТИТЬ ВТ;
ВЫБРАТЬ 2 КАК Новое ПОМЕСТИТЬ вт;
ВЫБРАТЬ ВТ.Новое ИЗ ВТ;
УНИЧТОЖИТЬ вТ;
ВЫБРАТЬ ВТ.Новое ИЗ ВТ;
ВЫБРАТЬ 3 КАК После ПОМЕСТИТЬ Вт;
ВЫБРАТЬ вт.После ИЗ вт;`;

    let newest = definitionAt(text, 'ВТ.Новое', 0, 3);
    assert(newest.definition);
    assert.equal(rangeText(newest.document, text, newest.definition.targetSelectionRange), 'Новое');

    let destroyed = definitionAt(text, 'ВТ.Новое', 1, 3);
    assert.equal(destroyed.definition, null);

    let recreated = definitionAt(text, 'вт.После', 0, 3);
    assert(recreated.definition);
    assert.equal(rangeText(recreated.document, text, recreated.definition.targetSelectionRange), 'После');
}

function testJoinAndFirstUnionBranch() {
    let text = `ВЫБРАТЬ 1 КАК ПолеПервой
ПОМЕСТИТЬ ВТОбъединение
ОБЪЕДИНИТЬ ВСЕ
ВЫБРАТЬ 2 КАК ПолеВторой;

ВЫБРАТЬ Соединенная.ПолеПервой
ИЗ Справочник.Товары КАК Товары
ЛЕВОЕ СОЕДИНЕНИЕ втОбъединение КАК Соединенная
ПО ИСТИНА;`;

    let joinedTable = definitionAt(text, 'втОбъединение', 0, 3);
    assert(joinedTable.definition);
    assert.equal(rangeText(joinedTable.document, text, joinedTable.definition.targetSelectionRange), 'ВТОбъединение');

    let joinedField = definitionAt(text, 'Соединенная.ПолеПервой', 0, 'Соединенная.'.length + 2);
    assert(joinedField.definition);
    assert.equal(rangeText(joinedField.document, text, joinedField.definition.targetSelectionRange), 'ПолеПервой');
}

function testAmbiguousAndExternalReferences() {
    let ambiguous = `ВЫБРАТЬ 1 КАК Код ПОМЕСТИТЬ ВТ1;
ВЫБРАТЬ 2 КАК Код ПОМЕСТИТЬ ВТ2;
ВЫБРАТЬ Код ИЗ ВТ1, ВТ2;`;
    let incomplete = definitionAt(ambiguous, 'Код', 2, 1);
    assert.equal(incomplete.definition, null);

    let external = `ВЫБРАТЬ Товары.Код
ИЗ Справочник.Товары КАК Товары;`;
    let externalField = definitionAt(external, 'Товары.Код', 0, 8);
    assert.equal(externalField.definition, null);

    let localAlias = definitionAt(external, 'Товары.Код', 0, 2);
    assert(localAlias.definition);
    assert.equal(rangeText(localAlias.document, external, localAlias.definition.targetSelectionRange), 'Товары');
}

function testMetadataCompletionSources() {
    let explicit = completionAt(`ВЫБРАТЬ Источник.|
ИЗ Справочник.Товары КАК Источник`, 'иСтОчНиК');
    assert(explicit);
    assert.equal(explicit.length, 1);
    assert.equal(explicit[0].kind, 'metadata');
    assert.equal(explicit[0].name, 'Справочник.Товары');

    let implicit = completionAt(`ВЫБРАТЬ Товары.|
ИЗ Справочник.Товары`, 'тОвАрЫ');
    assert(implicit);
    assert.equal(implicit.length, 1);
    assert.equal(implicit[0].name, 'Справочник.Товары');

    let joined = completionAt(`ВЫБРАТЬ |
ИЗ Справочник.Товары КАК Товары
ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Группы КАК Группы
ПО ИСТИНА`);
    assert(joined);
    assert.equal(joined.length, 2);
    assert.equal(joined[0].name, 'Справочник.Товары');
    assert.equal(joined[1].name, 'Справочник.Группы');
}

function testTempTableCompletionSources() {
    let temporary = completionAt(`ВЫБРАТЬ
    Товары.Код,
    Товары.Ссылка КАК Ссылка,
    1
ПОМЕСТИТЬ ВТТовары
ИЗ Справочник.Товары КАК Товары;

ВЫБРАТЬ ВТ.|
ИЗ вттовары КАК вт`, 'вТ');
    assert(temporary);
    assert.equal(temporary.length, 1);
    assert.equal(temporary[0].kind, 'temporary');
    assert.equal(temporary[0].fields.join(','), 'Код,Ссылка');

    let unqualified = completionAt(`ВЫБРАТЬ 1 КАК Код ПОМЕСТИТЬ ВТ;
ВЫБРАТЬ |
ИЗ ВТ
ЛЕВОЕ СОЕДИНЕНИЕ Справочник.Товары КАК Товары
ПО ИСТИНА`);
    assert(unqualified);
    assert.equal(unqualified.length, 2);
    assert.equal(unqualified[0].kind, 'temporary');
    assert.equal(unqualified[0].fields.join(','), 'Код');
    assert.equal(unqualified[1].kind, 'metadata');

    let union = completionAt(`SELECT 1 AS FirstField
INTO TempUnion
UNION ALL
SELECT 2 AS SecondField;
SELECT Source.|
FROM TempUnion AS Source`, 'source');
    assert(union);
    assert.equal(union[0].fields.join(','), 'FirstField');

    let recreated = completionAt(`ВЫБРАТЬ 1 КАК Старое ПОМЕСТИТЬ ВТ;
ВЫБРАТЬ 2 КАК Новое ПОМЕСТИТЬ вт;
ВЫБРАТЬ ВТ.|
ИЗ ВТ`, 'вт');
    assert(recreated);
    assert.equal(recreated[0].fields.join(','), 'Новое');

    let destroyed = completionAt(`ВЫБРАТЬ 1 КАК Поле ПОМЕСТИТЬ ВТ;
УНИЧТОЖИТЬ вт;
ВЫБРАТЬ ВТ.|
ИЗ ВТ`, 'вт');
    assert.equal(destroyed, null);
}

function testUnresolvedCompletionSources() {
    let unknownAlias = completionAt(`ВЫБРАТЬ Неизвестный.|
ИЗ Справочник.Товары КАК Товары`, 'Неизвестный');
    assert.equal(unknownAlias, null);

    let subquery = completionAt(`ВЫБРАТЬ Подзапрос.|
ИЗ (ВЫБРАТЬ 1 КАК Поле) КАК Подзапрос`, 'Подзапрос');
    assert.equal(subquery, null);

    let unnamedField = completionAt(`ВЫБРАТЬ 1 ПОМЕСТИТЬ ВТ;
ВЫБРАТЬ ВТ.|
ИЗ ВТ`, 'ВТ');
    assert.equal(unnamedField, null);
}

testDocumentSymbols();
testTempTableAndLocalDefinitions();
testRecreateAndDestroy();
testJoinAndFirstUnionBranch();
testAmbiguousAndExternalReferences();
testMetadataCompletionSources();
testTempTableCompletionSources();
testUnresolvedCompletionSources();
console.log('All query navigation checks passed.');
