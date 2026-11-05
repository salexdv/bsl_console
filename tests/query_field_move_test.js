const assert = require('assert');
const path = require('path');
const vm = require('vm');
const esbuild = require('esbuild');

const compiled = esbuild.buildSync({
    entryPoints: [path.join(__dirname, '../src/query_field_move.js')],
    bundle: true, write: false, platform: 'node', format: 'cjs', target: 'node22'
}).outputFiles[0].text;
const sandbox = { module: { exports: {} }, performance, console };
vm.runInNewContext(compiled, sandbox);
const calculate = sandbox.module.exports.calculateFieldMove;
let passed = 0;

function test(name, callback) {
    try { callback(); passed++; }
    catch (error) { console.error(name); throw error; }
}

function move(text, fragment, direction, expected, endFragment) {
    const queryStart = /^(select|выбрать)/i.exec(text);
    const anchor = text.indexOf(fragment, queryStart ? queryStart[0].length : 0);
    assert.notEqual(anchor, -1);
    const active = endFragment == undefined ? anchor : text.indexOf(endFragment);
    const result = calculate(text, [{ anchor, active }], direction);
    assert.equal(result.status, 'edit');
    const actual = text.slice(0, result.start) + result.text + text.slice(result.end);
    assert.equal(actual, expected);
    if (anchor == active) {
        const word = /^[\w\u0400-\u04ff]+/.exec(fragment)[0];
        assert.equal(actual.slice(result.active, result.active + word.length), word);
    }
    return { result, actual };
}

const basic = 'ВЫБРАТЬ\n\tА,\n\tБ,\n\tВ\nИЗ Т';
test('Последнее поле вверх и обратное движение', () => {
    const expected = 'ВЫБРАТЬ\n\tА,\n\tВ,\n\tБ\nИЗ Т';
    move(basic, 'В\n', -1, expected);
    move(expected, 'В,', 1, basic);
});
test('Предпоследнее поле вниз', () => {
    move(basic, 'Б', 1, 'ВЫБРАТЬ\n\tА,\n\tВ,\n\tБ\nИЗ Т');
});
test('Средние поля', () => {
    move(basic, 'Б', -1, 'ВЫБРАТЬ\n\tБ,\n\tА,\n\tВ\nИЗ Т');
});
test('Границы и единственное поле', () => {
    for (const [text, fragment, direction] of [[basic, 'А', -1], [basic, 'В\n', 1], ['SELECT A FROM T', 'A', 1]]) {
        const offset = text.indexOf(fragment, /^(select|выбрать)/i.exec(text)[0].length);
        assert.equal(calculate(text, [{ anchor: offset, active: offset }], direction).status, 'blocked');
    }
});
test('Регистр, модификаторы и поля на одной строке', () => {
    move('sElEcT allowed DISTINCT TOP 10 A, B FROM T', 'B', -1,
        'sElEcT allowed DISTINCT TOP 10 B, A FROM T');
    move('ВЫБРАТЬ РАЗРЕШЕННЫЕ РАЗЛИЧНЫЕ ПЕРВЫЕ 2 А, Б', 'Б', -1,
        'ВЫБРАТЬ РАЗРЕШЕННЫЕ РАЗЛИЧНЫЕ ПЕРВЫЕ 2 Б, А');
});
test('Многострочный CASE, внутренние запятые и ключевые слова в строке', () => {
    const expression = 'CASE\n WHEN A = 1 THEN F(A, "FROM, SELECT")\n ELSE 0\nEND AS X';
    move('SELECT\n ' + expression + ',\n Y\nFROM T', 'Y\n', -1,
        'SELECT\n Y,\n ' + expression + '\nFROM T');
});
test('Курсор внутри многострочного поля', () => {
    move('SELECT\n CASE\n WHEN A = 1 THEN 2\n END AS X,\n Y\nFROM T', 'WHEN', 1,
        'SELECT\n Y,\n CASE\n WHEN A = 1 THEN 2\n END AS X\nFROM T');
});
test('Операторы выражений и квалифицированная звёздочка', () => {
    for (const expression of ['T.*', 'CASE WHEN A IN (1, 2) THEN 1 ELSE 0 END',
        'ВЫБОР КОГДА А ЕСТЬ NULL ТОГДА 1 ИНАЧЕ 0 КОНЕЦ',
        'CASE WHEN A BETWEEN 1 AND 2 THEN 1 ELSE 0 END',
        'CASE WHEN A LIKE "B%" ESCAPE "!" THEN 1 ELSE 0 END']) {
        move('SELECT ' + expression + ', B FROM T', 'B FROM', -1, 'SELECT B, ' + expression + ' FROM T');
    }
});
test('Курсор в конце выражения или концевого комментария остаётся в поле', () => {
    for (const text of ['SELECT\n A, // пояснение\n B\nFROM T', 'SELECT\n A,\n B\nFROM T']) {
        const offset = text.indexOf('\n B');
        const result = calculate(text, [{ anchor: offset, active: offset }], 1);
        assert.equal(result.status, 'edit');
        assert.ok(result.text.indexOf('B,') < result.text.indexOf('A'));
    }
});
test('Концевые и ведущие комментарии; пустые промежутки', () => {
    move('SELECT\n // первое\n A, // хвост A\n\n // второе\n B // хвост B\nFROM T', 'B //', -1,
        'SELECT\n // второе\n B, // хвост B\n\n // первое\n A // хвост A\nFROM T');
});
test('Комментарии с ключевыми словами не создают списки', () => {
    move('SELECT\n A, // SELECT X FROM Y\n B\nFROM T', 'B\n', -1,
        'SELECT\n B,\n A // SELECT X FROM Y\nFROM T');
});
test('Комментарий SELECT остаётся в заголовке', () => {
    move('SELECT // заголовок\n A,\n B\nFROM T', 'B\n', -1,
        'SELECT // заголовок\n B,\n A\nFROM T');
});
test('Концевой комментарий не поглощает следующее поле или FROM', () => {
    move('SELECT A, // хвост\n B FROM T', 'B FROM', -1,
        'SELECT  B,\nA // хвост\n FROM T');
    move('SELECT A, B, // хвост\n C FROM T', 'B,', -1,
        'SELECT B, // хвост\n A,\n C FROM T');
});
test('Перенос перед запятой сохраняется', () => {
    move('SELECT A\n, B FROM T', 'B FROM', -1, 'SELECT B,\n A FROM T');
});
test('CRLF и отступы', () => {
    move('SELECT\r\n\tA,\r\n  B\r\nFROM T', 'B\r', -1,
        'SELECT\r\n  B,\r\n\tA\r\nFROM T');
});
test('Вложенные запросы независимы', () => {
    move('SELECT X, Y FROM (SELECT\n A,\n B\nFROM T) AS Q', 'B\n', -1,
        'SELECT X, Y FROM (SELECT\n B,\n A\nFROM T) AS Q');
});
test('Объединение и пакеты', () => {
    move('SELECT X, Y FROM T UNION ALL SELECT A, B FROM U; SELECT C, D', 'B FROM', -1,
        'SELECT X, Y FROM T UNION ALL SELECT B, A FROM U; SELECT C, D');
    move('SELECT X, Y; SELECT A, B', 'B', -1, 'SELECT X, Y; SELECT B, A');
});
test('INTO и остальные границы', () => {
    for (const boundary of ['INTO Q FROM T', 'WHERE 1 = 1', 'GROUP BY A', 'ORDER BY A', 'UNION SELECT 1', '']) {
        move('SELECT A, B ' + boundary, 'B ', -1, 'SELECT B, A ' + boundary);
    }
});
test('Закрывающая скобка ограничивает вложенный список', () => {
    move('SELECT * FROM (SELECT A, B) AS Q', 'B)', -1, 'SELECT * FROM (SELECT B, A) AS Q');
});
test('Лишняя последняя запятая нормализуется', () => {
    move('SELECT A, B, FROM T', 'B,', -1, 'SELECT B, A FROM T');
});
test('Выделение блока и обратное направление выделения', () => {
    for (const reverse of [false, true]) {
        const anchor = basic.indexOf('\tБ');
        const active = basic.indexOf('ИЗ');
        const selection = reverse ? { anchor: active, active: anchor } : { anchor, active };
        const result = calculate(basic, [selection], -1);
        assert.equal(result.status, 'edit');
        const actual = basic.slice(0, result.start) + result.text + basic.slice(result.end);
        assert.equal(actual, 'ВЫБРАТЬ\n\tБ,\n\tВ,\n\tА\nИЗ Т');
        assert.equal(actual.slice(Math.min(result.anchor, result.active), Math.max(result.anchor, result.active)), '\tБ,\n\tВ,\n');
    }
});
test('Конец в колонке 1 не захватывает следующее поле (LF/CRLF)', () => {
    for (const eol of ['\n', '\r\n']) {
        const text = basic.replace(/\n/g, eol);
        const anchor = text.indexOf('\tА');
        const active = text.indexOf('\tБ');
        const result = calculate(text, [{ anchor, active }], 1);
        assert.equal(result.status, 'edit');
        const actual = text.slice(0, result.start) + result.text + text.slice(result.end);
        assert.equal(actual, 'ВЫБРАТЬ\n\tБ,\n\tА,\n\tВ\nИЗ Т'.replace(/\n/g, eol));
    }
});
test('Несколько курсоров и выделение через границу блокируются', () => {
    const offset = basic.indexOf('Б,');
    assert.equal(calculate(basic, [{ anchor: offset, active: offset }, { anchor: 0, active: 0 }], -1).status, 'blocked');
    assert.equal(calculate(basic, [{ anchor: 0, active: offset }], -1).status, 'blocked');
    assert.equal(calculate(basic, [{ anchor: offset, active: basic.length }], -1).status, 'blocked');
});
test('Вне полей — штатная команда', () => {
    assert.equal(calculate(basic, [{ anchor: basic.length, active: basic.length }], -1).status, 'fallback');
    assert.equal(calculate('SELEFT A, B FROM T', [{ anchor: 10, active: 10 }], -1).status, 'fallback');
});
test('Конец документа принадлежит последнему полю', () => {
    const text = 'SELECT\n A,\n B';
    const result = calculate(text, [{ anchor: text.length, active: text.length }], -1);
    assert.equal(result.status, 'edit');
    assert.equal(text.slice(0, result.start) + result.text, 'SELECT\n B,\n A');
    assert.equal(calculate(text, [{ anchor: text.length, active: text.length }], 1).status, 'blocked');
});
test('Ключевые слова после точки являются именами реквизитов', () => {
    move('SELECT T.FROM, T.SELECT FROM T', 'T.SELECT', -1, 'SELECT T.SELECT, T.FROM FROM T');
});
test('Незавершённые и неоднозначные списки не изменяются', () => {
    for (const expression of ['B +', 'F(B', 'CASE WHEN B = 1 THEN 2', '"строка', 'B AS', 'B C', 'B AS C AS D', ', B', 'AS B', 'B + AS C', 'B IN']) {
        const text = 'SELECT A, ' + expression + '\nFROM T';
        const offset = text.indexOf('A,');
        assert.equal(calculate(text, [{ anchor: offset, active: offset }], 1).status, 'blocked', expression);
    }
});
console.log('Перемещение полей: ' + passed + ' тестов пройдено');
