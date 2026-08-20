#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');

function loadModule() {
    let file = path.join(ROOT, 'src', 'ai_inline_provider.js');
    let source = fs.readFileSync(file, 'utf8');
    let transformed = esbuild.transformSync(source, {
        sourcefile: file,
        loader: 'js',
        target: 'node22',
        format: 'cjs'
    }).code;
    let sandbox = {
        console: { warn: function () { } },
        Date: Date,
        Promise: Promise,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        module: { exports: {} },
        exports: {},
        require: require
    };
    sandbox.exports = sandbox.module.exports;
    vm.createContext(sandbox);
    vm.runInContext(transformed, sandbox, { filename: file });
    return sandbox.module.exports;
}

class FakeClock {
    constructor() {
        this.time = 0;
        this.nextId = 0;
        this.tasks = [];
    }

    setTimeout(callback, delay) {
        let task = { id: ++this.nextId, at: this.time + delay, callback: callback, cancelled: false };
        this.tasks.push(task);
        return task.id;
    }

    clearTimeout(id) {
        this.tasks.forEach(function (task) {
            if (task.id == id)
                task.cancelled = true;
        });
    }

    tick(milliseconds) {
        let target = this.time + milliseconds;

        while (true) {
            let next = this.tasks
                .filter(function (task) { return !task.cancelled && task.at <= target; })
                .sort(function (left, right) { return left.at - right.at || left.id - right.id; })[0];

            if (!next)
                break;

            next.cancelled = true;
            this.time = next.at;
            next.callback();
        }

        this.time = target;
    }
}

class FakeModel {
    constructor(text, languageId) {
        this.text = text;
        this.languageId = languageId || 'bsl';
        this.version = 1;
        this.disposed = false;
        this.uri = { toString: function () { return 'inmemory://model/1'; } };
    }

    getValue() { return this.text; }
    getVersionId() { return this.version; }
    getLanguageId() { return this.languageId; }
    isDisposed() { return this.disposed; }

    getOffsetAt(position) {
        let lines = this.text.split('\n');
        let offset = 0;
        for (let idx = 0; idx < position.lineNumber - 1; idx++)
            offset += lines[idx].length + 1;
        return offset + position.column - 1;
    }

    update(text) {
        this.text = text;
        this.version++;
    }
}

function createTokenSource() {
    let listeners = [];
    let cancelled = false;
    let token = {
        get isCancellationRequested() { return cancelled; },
        onCancellationRequested: function (callback) {
            if (cancelled)
                callback();
            else
                listeners.push(callback);
            return {
                dispose: function () {
                    listeners = listeners.filter(function (item) { return item !== callback; });
                }
            };
        }
    };

    return {
        token: token,
        cancel: function () {
            if (cancelled)
                return;
            cancelled = true;
            let callbacks = listeners.slice();
            listeners = [];
            callbacks.forEach(function (callback) { callback(); });
        }
    };
}

function createFixture(overrides) {
    let api = loadModule();
    let clock = new FakeClock();
    let options = Object.assign({}, overrides || {});
    let events = [];
    let model = new FakeModel('Процедура Тест()\n    Запрос = Но\nКонецПроцедуры');
    let editor = {
        model: model,
        position: { lineNumber: 2, column: 16 },
        getModel: function () { return this.model; },
        getPosition: function () { return this.position; }
    };
    let service = api.createAIInlineProvider({
        getEditor: function () { return editor; },
        getOption: function (name) { return options[name]; },
        sendEvent: function (name, params) { events.push({ name: name, params: params }); },
        isInlineEnabled: function () { return true; },
        setTimeout: clock.setTimeout.bind(clock),
        clearTimeout: clock.clearTimeout.bind(clock),
        now: function () { return clock.time; }
    });

    function recordUserChange(text) {
        service.recordContentChange(model, { changes: [{ text: text || '' }] }, false);
        clock.tick(0);
    }

    return { api, clock, options, events, model, editor, service, recordUserChange };
}

async function testDisabledAndProviderShape() {
    let fixture = createFixture();
    fixture.recordUserChange('о');
    let result = fixture.service.provider.provideInlineCompletions(
        fixture.model,
        fixture.editor.position,
        { triggerKind: 0, requestIssuedDateTime: 0 },
        createTokenSource().token
    );

    assert.equal(result.items.length, 0);
    assert.equal(fixture.events.length, 0);
    assert.equal(fixture.service.provider.groupId, 'bsl-console-ai-inline');
    assert.equal(fixture.service.provider.yieldsToGroupIds[0], 'bsl-console-manual-inline');
    assert.equal(typeof fixture.service.provider.disposeInlineCompletions, 'function');
}

async function testDebounceContextAndResolve() {
    let fixture = createFixture({
        generateAIInlineCompletionEvent: true,
        aiInlineCompletionDebounceMs: 400,
        aiInlineCompletionMaxPrefixChars: 8,
        aiInlineCompletionMaxSuffixChars: 5
    });
    fixture.recordUserChange('о');
    let pending = fixture.service.provider.provideInlineCompletions(
        fixture.model,
        fixture.editor.position,
        { triggerKind: 0, requestIssuedDateTime: 0 },
        createTokenSource().token
    );

    fixture.clock.tick(399);
    assert.equal(fixture.events.length, 0);
    fixture.clock.tick(1);
    assert.equal(fixture.events.length, 1);
    assert.equal(fixture.events[0].name, 'EVENT_AI_INLINE_COMPLETION_REQUEST');

    let request = fixture.events[0].params;
    assert.equal(request.protocolVersion, 1);
    assert.equal(request.modelVersionId, 1);
    assert.equal(request.languageId, 'bsl');
    assert.equal(request.triggerKind, 'automatic');
    assert.equal(request.triggerCharacter, 'о');
    assert.equal(request.context.prefix.length, 8);
    assert.equal(request.context.suffix.length, 5);
    assert.equal(request.context.prefixTruncated, true);
    assert.equal(request.context.suffixTruncated, true);

    assert.equal(fixture.service.resolve(request.requestId, '["вый Запрос()"]'), true);
    let result = await pending;
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].insertText, 'вый Запрос()');
    assert.equal(result.items[0].range.startColumn, 16);
}

async function testElapsedDebounceAndExplicitRequest() {
    let fixture = createFixture({
        generateAIInlineCompletionEvent: true,
        aiInlineCompletionDebounceMs: 400
    });
    fixture.recordUserChange('о');
    fixture.clock.tick(250);
    let automatic = fixture.service.provider.provideInlineCompletions(
        fixture.model,
        fixture.editor.position,
        { triggerKind: 0, requestIssuedDateTime: 0 },
        createTokenSource().token
    );
    fixture.clock.tick(149);
    assert.equal(fixture.events.length, 0);
    fixture.clock.tick(1);
    assert.equal(fixture.events.length, 1);
    fixture.service.resolve(fixture.events[0].params.requestId, []);
    await automatic;

    let explicit = fixture.service.provider.provideInlineCompletions(
        fixture.model,
        fixture.editor.position,
        { triggerKind: 1, requestIssuedDateTime: fixture.clock.time },
        createTokenSource().token
    );
    assert.equal(fixture.events.length, 2, 'explicit-запрос не должен ждать debounce');
    assert.equal(fixture.events[1].params.triggerKind, 'explicit');
    assert.equal(fixture.events[1].params.triggerCharacter, '');
    fixture.service.resolve(fixture.events[1].params.requestId, []);
    await explicit;
}

async function testProgrammaticAndCursorChanges() {
    let fixture = createFixture({ generateAIInlineCompletionEvent: true, aiInlineCompletionDebounceMs: 0 });
    fixture.service.recordContentChange(fixture.model, { changes: [{ text: 'X' }] }, true);
    fixture.clock.tick(0);
    let programmatic = fixture.service.provider.provideInlineCompletions(
        fixture.model,
        fixture.editor.position,
        { triggerKind: 0, requestIssuedDateTime: 0 },
        createTokenSource().token
    );
    assert.equal(programmatic.items.length, 0);

    fixture.recordUserChange('о');
    fixture.editor.position = { lineNumber: 2, column: 5 };
    fixture.service.cursorChanged();
    let cursorRequest = fixture.service.provider.provideInlineCompletions(
        fixture.model,
        fixture.editor.position,
        { triggerKind: 0, requestIssuedDateTime: 0 },
        createTokenSource().token
    );
    fixture.clock.tick(0);
    assert.equal(fixture.events.length, 0, 'перемещение курсора не должно создавать запрос');
    assert.equal((await cursorRequest).items.length, 0);
}

async function testCancellationReasonsAndNativeToken() {
    for (const reason of ['superseded', 'cursorChanged', 'hidden', 'disabled', 'timeout', 'disposed']) {
        let fixture = createFixture({
            generateAIInlineCompletionEvent: true,
            aiInlineCompletionRequestTimeoutMs: 1000
        });
        let pending = fixture.service.provider.provideInlineCompletions(
            fixture.model,
            fixture.editor.position,
            { triggerKind: 1, requestIssuedDateTime: 0 },
            createTokenSource().token
        );
        let requestId = fixture.events[0].params.requestId;

        if (reason == 'timeout')
            fixture.clock.tick(1000);
        else if (reason == 'disposed')
            fixture.service.dispose();
        else
            fixture.service.cancel(reason);

        assert.equal(fixture.events[1].name, 'EVENT_AI_INLINE_COMPLETION_CANCEL');
        assert.equal(fixture.events[1].params.requestId, requestId);
        assert.equal(fixture.events[1].params.reason, reason);
        assert.equal((await pending).items.length, 0);
        assert.equal(fixture.service.resolve(requestId, ['Поздно']), false);
    }

    let fixture = createFixture({ generateAIInlineCompletionEvent: true });
    let token = createTokenSource();
    let pending = fixture.service.provider.provideInlineCompletions(
        fixture.model,
        fixture.editor.position,
        { triggerKind: 1, requestIssuedDateTime: 0 },
        token.token
    );
    token.cancel();
    fixture.clock.tick(0);
    assert.equal(fixture.events[1].params.reason, 'superseded');
    assert.equal((await pending).items.length, 0);
}

async function testLatestRequestAndStaleResponse() {
    let fixture = createFixture({ generateAIInlineCompletionEvent: true });
    let first = fixture.service.provider.provideInlineCompletions(
        fixture.model,
        fixture.editor.position,
        { triggerKind: 1, requestIssuedDateTime: 0 },
        createTokenSource().token
    );
    let firstId = fixture.events[0].params.requestId;
    let second = fixture.service.provider.provideInlineCompletions(
        fixture.model,
        fixture.editor.position,
        { triggerKind: 1, requestIssuedDateTime: 0 },
        createTokenSource().token
    );

    assert.equal((await first).items.length, 0);
    assert.equal(fixture.service.resolve(firstId, ['Устарело']), false);
    let secondId = fixture.events.filter(function (event) {
        return event.name == 'EVENT_AI_INLINE_COMPLETION_REQUEST';
    })[1].params.requestId;

    fixture.model.update(fixture.model.text + 'й');
    assert.equal(fixture.service.resolve(secondId, ['Результат']), false);
    assert.equal((await second).items.length, 0);
}

async function testSynchronousResponseAndValidation() {
    let fixture = createFixture({ generateAIInlineCompletionEvent: true });
    let service = fixture.service;

    let api = loadModule();
    let options = { generateAIInlineCompletionEvent: true };
    let model = new FakeModel('Запрос = Нов');
    let editor = {
        getModel: function () { return model; },
        getPosition: function () { return { lineNumber: 1, column: 13 }; }
    };
    service = api.createAIInlineProvider({
        getEditor: function () { return editor; },
        getOption: function (name) { return options[name]; },
        sendEvent: function (name, params) {
            if (name == 'EVENT_AI_INLINE_COMPLETION_REQUEST')
                assert.equal(service.resolve(params.requestId, ['ый']), true);
        }
    });

    let result = await service.provider.provideInlineCompletions(
        model,
        editor.getPosition(),
        { triggerKind: 1, requestIssuedDateTime: Date.now() },
        createTokenSource().token
    );
    assert.equal(result.items[0].insertText, 'ый');

    fixture = createFixture({ generateAIInlineCompletionEvent: true });
    fixture.service.provider.provideInlineCompletions(
        fixture.model,
        fixture.editor.position,
        { triggerKind: 1, requestIssuedDateTime: 0 },
        createTokenSource().token
    );
    let requestId = fixture.events[0].params.requestId;
    assert.match(fixture.service.resolve(requestId, '{}').errorDescription, /массив строк/);
    assert.match(fixture.service.resolve(requestId, '[1]').errorDescription, /элементы/);
    assert.match(fixture.service.resolve('bad-id', '[]').errorDescription, /requestId/);
    assert.equal(fixture.api.isValidAIInlineOption('aiInlineCompletionDebounceMs', -1), false);
    assert.equal(fixture.api.isValidAIInlineOption('aiInlineCompletionRequestTimeoutMs', 0), false);
    fixture.service.cancel('disabled');
}

async function main() {
    await testDisabledAndProviderShape();
    await testDebounceContextAndResolve();
    await testElapsedDebounceAndExplicitRequest();
    await testProgrammaticAndCursorChanges();
    await testCancellationReasonsAndNativeToken();
    await testLatestRequestAndStaleResponse();
    await testSynchronousResponseAndValidation();
    console.log('ai_inline_provider_test: ok');
}

main().catch(function (error) {
    console.error(error.stack || error.message);
    process.exit(1);
});
