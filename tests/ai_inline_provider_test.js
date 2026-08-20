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
    let transformed = esbuild.transformSync(source, { loader: 'js', target: 'node22', format: 'cjs' }).code;
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
        this.tasks.forEach(task => {
            if (task.id == id)
                task.cancelled = true;
        });
    }

    tick(milliseconds) {
        let target = this.time + milliseconds;

        while (true) {
            let next = this.tasks
                .filter(task => !task.cancelled && task.at <= target)
                .sort((left, right) => left.at - right.at || left.id - right.id)[0];

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
    getLanguageIdentifier() { return { language: this.languageId }; }
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
    let reason = '';
    let token = {
        get isCancellationRequested() { return cancelled; },
        get reason() { return reason; },
        onCancellationRequested(callback) {
            if (cancelled)
                callback();
            else
                listeners.push(callback);
            return { dispose: function () { listeners = listeners.filter(item => item !== callback); } };
        }
    };

    return {
        token: token,
        cancel(cancelReason) {
            cancelled = true;
            reason = cancelReason;
            let callbacks = listeners.slice();
            listeners = [];
            callbacks.forEach(callback => callback());
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
        getModel() { return this.model; },
        getPosition() { return this.position; },
        hasTextFocus() { return true; }
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

    return { api, clock, options, events, model, editor, service };
}

async function testDisabledByDefault() {
    let fixture = createFixture();
    let result = fixture.service.provider.provideInlineCompletions(
        fixture.model,
        fixture.editor.position,
        { triggerSource: 'content', triggeredAt: 0 },
        createTokenSource().token
    );

    assert.deepEqual(result, { items: [] });
    fixture.clock.tick(1000);
    assert.equal(fixture.events.length, 0);
}

async function testDebounceContextAndResolve() {
    let fixture = createFixture({
        generateAIInlineCompletionEvent: true,
        aiInlineCompletionDebounceMs: 400,
        aiInlineCompletionMaxPrefixChars: 8,
        aiInlineCompletionMaxSuffixChars: 5
    });
    let token = createTokenSource();
    let pending = fixture.service.provider.provideInlineCompletions(
        fixture.model,
        fixture.editor.position,
        { triggerSource: 'content', triggerCharacter: 'о', triggeredAt: 0 },
        token.token
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
    assert.equal(result.items[0].range.startLineNumber, 2);
    assert.equal(result.items[0].range.startColumn, 16);
}

async function testLatestRequestWins() {
    let fixture = createFixture({ generateAIInlineCompletionEvent: true, aiInlineCompletionDebounceMs: 400 });
    let first = fixture.service.provider.provideInlineCompletions(
        fixture.model,
        fixture.editor.position,
        { triggerSource: 'content', triggeredAt: 0 },
        createTokenSource().token
    );

    fixture.clock.tick(200);
    fixture.model.update(fixture.model.text + 'в');
    fixture.editor.position = { lineNumber: 2, column: 17 };
    let second = fixture.service.provider.provideInlineCompletions(
        fixture.model,
        fixture.editor.position,
        { triggerSource: 'content', triggeredAt: 200 },
        createTokenSource().token
    );

    assert.equal((await first).items.length, 0);
    fixture.clock.tick(399);
    assert.equal(fixture.events.length, 0);
    fixture.clock.tick(1);
    assert.equal(fixture.events.length, 1);

    let requestId = fixture.events[0].params.requestId;
    assert.equal(fixture.service.resolve(requestId, []), true);
    assert.equal((await second).items.length, 0);
}

async function testCancellationAfterSend() {
    let fixture = createFixture({ generateAIInlineCompletionEvent: true, aiInlineCompletionDebounceMs: 0 });
    let token = createTokenSource();
    let pending = fixture.service.provider.provideInlineCompletions(
        fixture.model,
        fixture.editor.position,
        { triggerSource: 'explicit', triggeredAt: 0 },
        token.token
    );

    assert.equal(fixture.events[0].name, 'EVENT_AI_INLINE_COMPLETION_REQUEST');
    let requestId = fixture.events[0].params.requestId;
    token.cancel('cursorChanged');

    assert.equal(fixture.events[1].name, 'EVENT_AI_INLINE_COMPLETION_CANCEL');
    assert.equal(fixture.events[1].params.requestId, requestId);
    assert.equal(fixture.events[1].params.reason, 'cursorChanged');
    assert.equal((await pending).items.length, 0);
    assert.equal(fixture.service.resolve(requestId, ['Поздно']), false);
}

async function testCancellationReasonsAndDebounce() {
    for (const reason of ['superseded', 'cursorChanged', 'hidden', 'disabled', 'disposed']) {
        let fixture = createFixture({ generateAIInlineCompletionEvent: true, aiInlineCompletionDebounceMs: 0 });
        let token = createTokenSource();
        let pending = fixture.service.provider.provideInlineCompletions(
            fixture.model,
            fixture.editor.position,
            { triggerSource: 'explicit', triggeredAt: 0 },
            token.token
        );

        token.cancel(reason);
        assert.equal(fixture.events[1].name, 'EVENT_AI_INLINE_COMPLETION_CANCEL');
        assert.equal(fixture.events[1].params.reason, reason);
        assert.equal((await pending).items.length, 0);
    }

    let fixture = createFixture({ generateAIInlineCompletionEvent: true, aiInlineCompletionDebounceMs: 400 });
    let token = createTokenSource();
    let pending = fixture.service.provider.provideInlineCompletions(
        fixture.model,
        fixture.editor.position,
        { triggerSource: 'content', triggeredAt: 0 },
        token.token
    );

    fixture.clock.tick(200);
    token.cancel('superseded');
    fixture.clock.tick(1000);
    assert.equal(fixture.events.length, 0, 'отмена во время debounce не должна отправлять событие');
    assert.equal((await pending).items.length, 0);
}

async function testSynchronousResponse() {
    let api = loadModule();
    let options = {
        generateAIInlineCompletionEvent: true,
        aiInlineCompletionDebounceMs: 0,
        aiInlineCompletionRequestTimeoutMs: 1000
    };
    let model = new FakeModel('Запрос = Нов');
    let editor = {
        getModel: function () { return model; },
        getPosition: function () { return { lineNumber: 1, column: 13 }; }
    };
    let service;
    let cancelEvents = [];
    service = api.createAIInlineProvider({
        getEditor: function () { return editor; },
        getOption: function (name) { return options[name]; },
        isInlineEnabled: function () { return true; },
        sendEvent: function (name, params) {
            if (name == 'EVENT_AI_INLINE_COMPLETION_REQUEST')
                assert.equal(service.resolve(params.requestId, ['ый']), true);
            else
                cancelEvents.push({ name: name, params: params });
        }
    });

    let result = await service.provider.provideInlineCompletions(
        model,
        editor.getPosition(),
        { triggerSource: 'explicit', triggeredAt: Date.now() },
        createTokenSource().token
    );

    assert.equal(result.items[0].insertText, 'ый');
    assert.equal(cancelEvents.length, 0);
}

async function testTimeoutAndStaleResponse() {
    let fixture = createFixture({
        generateAIInlineCompletionEvent: true,
        aiInlineCompletionDebounceMs: 0,
        aiInlineCompletionRequestTimeoutMs: 1000
    });
    let pending = fixture.service.provider.provideInlineCompletions(
        fixture.model,
        fixture.editor.position,
        { triggerSource: 'explicit', triggeredAt: 0 },
        createTokenSource().token
    );
    let requestId = fixture.events[0].params.requestId;

    fixture.clock.tick(1000);
    assert.equal(fixture.events[1].params.reason, 'timeout');
    assert.equal((await pending).items.length, 0);
    assert.equal(fixture.service.resolve(requestId, ['Поздно']), false);

    fixture = createFixture({ generateAIInlineCompletionEvent: true, aiInlineCompletionDebounceMs: 0 });
    pending = fixture.service.provider.provideInlineCompletions(
        fixture.model,
        fixture.editor.position,
        { triggerSource: 'explicit', triggeredAt: 0 },
        createTokenSource().token
    );
    requestId = fixture.events[0].params.requestId;
    fixture.model.update(fixture.model.text + 'й');
    assert.equal(fixture.service.resolve(requestId, ['Результат']), false);
    assert.equal((await pending).items.length, 0);
}

function testValidation() {
    let fixture = createFixture({ generateAIInlineCompletionEvent: true, aiInlineCompletionDebounceMs: 0 });
    fixture.service.provider.provideInlineCompletions(
        fixture.model,
        fixture.editor.position,
        { triggerSource: 'explicit', triggeredAt: 0 },
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
    await testDisabledByDefault();
    await testDebounceContextAndResolve();
    await testLatestRequestWins();
    await testCancellationAfterSend();
    await testCancellationReasonsAndDebounce();
    await testSynchronousResponse();
    await testTimeoutAndStaleResponse();
    testValidation();
    console.log('All AI inline provider checks passed.');
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
