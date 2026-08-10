#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');

function loadQueryModel() {
    let file = path.join(ROOT, 'src', 'query_model.js');
    let source = fs.readFileSync(file, 'utf8');
    let transformed = esbuild.transformSync(source, { loader: 'js', target: 'node22', format: 'cjs' }).code;
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
    return sandbox.module.exports.default;
}

const queryModel = loadQueryModel();

class FakeWorker {
    constructor() {
        this.jobs = [];
        this.terminated = false;
        FakeWorker.instances.push(this);
    }

    postMessage(data) {
        this.jobs.push(data);
    }

    completeNext() {
        let data = this.jobs.shift();
        this.onmessage({
            data: {
                type: 'parsed',
                jobId: data.jobId,
                modelId: data.modelId,
                version: data.version,
                document: queryModel.parse(data.text)
            }
        });
    }

    terminate() {
        this.terminated = true;
    }
}
FakeWorker.instances = [];

class FakeModel {
    constructor(value) {
        this.value = value;
        this.version = 1;
        this.disposed = false;
        this.contentListeners = new Set();
        this.disposeListeners = new Set();
    }

    getValue() { return this.value; }
    getValueLength() { return this.value.length; }
    getVersionId() { return this.version; }
    isDisposed() { return this.disposed; }

    onDidChangeContent(callback) {
        this.contentListeners.add(callback);
        return { dispose: () => this.contentListeners.delete(callback) };
    }

    onWillDispose(callback) {
        this.disposeListeners.add(callback);
        return { dispose: () => this.disposeListeners.delete(callback) };
    }

    setValue(value) {
        this.value = value;
        this.version++;
        Array.from(this.contentListeners).forEach(callback => callback());
    }

    dispose() {
        this.disposed = true;
        Array.from(this.disposeListeners).forEach(callback => callback());
    }
}

class FakeCancellationToken {
    constructor(cancelled) {
        this.isCancellationRequested = !!cancelled;
        this.listeners = new Set();
    }

    onCancellationRequested(callback) {
        if (this.isCancellationRequested)
            callback();
        else
            this.listeners.add(callback);
        return { dispose: () => this.listeners.delete(callback) };
    }

    cancel() {
        this.isCancellationRequested = true;
        Array.from(this.listeners).forEach(callback => callback());
    }
}

function loadService() {
    FakeWorker.instances = [];
    let file = path.join(ROOT, 'src', 'query_model_service.js');
    let source = fs.readFileSync(file, 'utf8')
        .replace("import queryModel from './query_model';", 'const queryModel = globalThis.__queryModel;')
        .replace(/const QueryModelWorker = require\([^\n]+\);/, 'const QueryModelWorker = globalThis.__QueryModelWorker;');
    let transformed = esbuild.transformSync(source, { loader: 'js', target: 'node22', format: 'cjs' }).code;
    let sandbox = {
        __queryModel: queryModel,
        __QueryModelWorker: FakeWorker,
        Worker: function () {},
        Promise: Promise,
        Date: Date,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        console: { warn: function () {} },
        module: { exports: {} },
        exports: {},
        require: require
    };
    sandbox.exports = sandbox.module.exports;
    vm.createContext(sandbox);
    vm.runInContext(transformed, sandbox, { filename: file });
    return sandbox.module.exports.default;
}

function largeQuery(suffix) {
    return '// ' + 'д'.repeat(21000) + '\nВЫБРАТЬ 1 КАК Поле' + (suffix || '');
}

async function testSynchronousCurrentDocument() {
    let service = loadService();
    let model = new FakeModel('ВЫБРАТЬ 1 КАК Поле');
    let result = await service.getCurrent(model, new FakeCancellationToken());
    assert.equal(result.status, 'ready');
    assert.equal(result.document.statements.length, 1);
    assert.equal(FakeWorker.instances.length, 0);
}

function testCurrentDocumentSynchronouslyForCompletion() {
    let service = loadService();
    let model = new FakeModel('ВЫБРАТЬ 1 КАК Первое');
    let first = service.getCurrentSynchronously(model);
    assert(first);
    assert.equal(first.statements[0].branches[0].select.items[0].name, 'Первое');

    model.setValue('ВЫБРАТЬ 2 КАК Второе');
    let second = service.getCurrentSynchronously(model);
    assert(second);
    assert.equal(second.statements[0].branches[0].select.items[0].name, 'Второе');
    assert.equal(model._queryModelCache.version, model.version, 'устаревшая модель не должна возвращаться для подсказки');

    let largeModel = new FakeModel(largeQuery());
    assert.equal(service.getCurrentSynchronously(largeModel), null, 'большой запрос должен ждать актуальную модель worker');
}

async function testWorkerCurrentDocument() {
    let service = loadService();
    let model = new FakeModel(largeQuery());
    service.schedule(model);
    assert(model._queryModelParseState.timer, 'должен быть запланирован фоновый разбор');

    let pending = service.getCurrent(model, new FakeCancellationToken());
    assert.equal(FakeWorker.instances.length, 1);
    assert.equal(FakeWorker.instances[0].jobs.length, 1);
    assert.equal(model._queryModelParseState.timer, null, 'актуальный запрос должен отменить отложенный разбор');

    FakeWorker.instances[0].completeNext();
    let result = await pending;
    assert.equal(result.status, 'ready');
    assert.equal(model.contentListeners.size, 0);
    assert.equal(model.disposeListeners.size, 1, 'остаётся только обработчик жизненного цикла модели');
}

async function testStaleAndCancelledRequests() {
    let service = loadService();
    let staleModel = new FakeModel(largeQuery());
    let stalePending = service.getCurrent(staleModel, new FakeCancellationToken());
    staleModel.setValue(largeQuery(' ИЗ ВТ'));
    let stale = await stalePending;
    assert.equal(stale.status, 'stale');
    assert.equal(staleModel.contentListeners.size, 0);

    service = loadService();
    let cancelledModel = new FakeModel(largeQuery());
    let token = new FakeCancellationToken();
    let cancelledPending = service.getCurrent(cancelledModel, token);
    token.cancel();
    let cancelled = await cancelledPending;
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelledModel.contentListeners.size, 0);
    assert.equal(token.listeners.size, 0);
}

async function testClosedModelAndWorkerError() {
    let service = loadService();
    let closedModel = new FakeModel(largeQuery());
    let closedPending = service.getCurrent(closedModel, new FakeCancellationToken());
    closedModel.dispose();
    let closed = await closedPending;
    assert.equal(closed.status, 'closed');

    service = loadService();
    let failedModel = new FakeModel(largeQuery());
    let failedPending = service.getCurrent(failedModel, new FakeCancellationToken());
    FakeWorker.instances[0].onerror(new Error('worker failed'));
    let failed = await failedPending;
    assert.equal(failed.status, 'unavailable');
    assert.equal(failedModel.contentListeners.size, 0);
}

async function main() {
    await testSynchronousCurrentDocument();
    testCurrentDocumentSynchronouslyForCompletion();
    await testWorkerCurrentDocument();
    await testStaleAndCancelledRequests();
    await testClosedModelAndWorkerError();
    console.log('All query model service checks passed.');
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
