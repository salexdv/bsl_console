#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');

function loadModule(relativePath) {
    const file = path.join(ROOT, relativePath);
    const source = fs.readFileSync(file, 'utf8');
    const transformed = esbuild.transformSync(source, {
        sourcefile: file,
        loader: 'js',
        target: 'node22',
        format: 'cjs'
    }).code;
    const sandbox = {
        console: console,
        module: { exports: {} },
        exports: {},
        require: require,
        Set: Set,
        Map: Map,
        Array: Array,
        JSON: JSON,
        TypeError: TypeError
    };
    sandbox.exports = sandbox.module.exports;
    vm.createContext(sandbox);
    vm.runInContext(transformed, sandbox, { filename: file });
    return sandbox.module.exports;
}

const historyModule = loadModule('src/search_history.js');
const normalizeSearchHistory = historyModule.normalizeSearchHistory;
const addSearchHistoryValue = historyModule.addSearchHistoryValue;
const replaceHistoryNavigator = historyModule.replaceHistoryNavigator;
const SearchHistoryController = historyModule.SearchHistoryController;

assert.deepStrictEqual(
    Array.from(normalizeSearchHistory(['новый', 'старый', 'новый', '', '  '])),
    ['новый', 'старый', '  '],
    'Нормализация должна сохранять MRU-порядок, пробелы и удалять дубли/пустую строку'
);

assert.throws(
    () => normalizeSearchHistory(['строка', 42]),
    /строкой/,
    'Нестроковые значения должны отклоняться'
);
assert.throws(
    () => normalizeSearchHistory(Array(10).fill('строка').map((value, index) => value + index).concat([null])),
    /строкой/,
    'Нестроковые значения после лимита также должны отклоняться'
);

let history = [];
for (let index = 1; index <= 11; index++)
    history = addSearchHistoryValue(history, 'строка-' + index);
assert.strictEqual(history.length, 10, 'История должна быть ограничена десятью значениями');
assert.strictEqual(history[0], 'строка-11', 'Новое значение должно быть первым');
assert.strictEqual(history[9], 'строка-2', 'Самое старое значение должно вытесняться');

history = addSearchHistoryValue(history, 'строка-5');
assert.strictEqual(history[0], 'строка-5', 'Повторное значение должно переноситься в начало');
assert.strictEqual(history.filter(value => value == 'строка-5').length, 1, 'Дубли не должны сохраняться');

const fakeNavigator = {
    values: [],
    _initialize: function (values) { this.values = values.slice(); },
    _onChange: function () { this.changed = true; }
};
assert.strictEqual(replaceHistoryNavigator(fakeNavigator, ['старый', 'новый']), true,
    'HistoryNavigator Monaco 0.20 должен синхронизироваться через приватный lifecycle');
assert.deepStrictEqual(fakeNavigator.values, ['старый', 'новый'],
    'В HistoryNavigator значения должны передаваться от старых к новым');
assert.strictEqual(fakeNavigator.changed, true, 'После замены HistoryNavigator должен пересоздать навигатор');

const fakeMonaco = {
    editor: {
        onDidCreateEditor: function () { return { dispose: function () {} }; }
    }
};
const controller = new SearchHistoryController(fakeMonaco);
assert.strictEqual(controller.restore('["второй","первый"]'), true, 'Корректное состояние должно восстанавливаться');
assert.strictEqual(controller.save(), '["второй","первый"]', 'Сохранение должно возвращать новый элемент первым');

const beforeError = controller.save();
const invalidJson = controller.restore('{');
assert.ok(invalidJson.errorDescription, 'Ошибка JSON должна возвращаться вызывающему коду');
assert.strictEqual(controller.save(), beforeError, 'Ошибка не должна менять историю');

const invalidElement = controller.restore('["строка",null]');
assert.ok(invalidElement.errorDescription, 'Нестроковый элемент должен возвращать ошибку');
assert.strictEqual(controller.save(), beforeError, 'Ошибка элемента не должна менять историю');

console.log('search_history_test: ok');
