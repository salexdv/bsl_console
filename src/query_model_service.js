import queryModel from './query_model';
const QueryModelWorker = require('worker-loader?inline=no-fallback&esModule=false!./query_model_worker');

const QUERY_MODEL_PARSE_DELAY_MS = 250;
const QUERY_MODEL_SYNC_PARSE_LIMIT = 20000;

let worker = null;
let workerAvailable = true;
let workerInitializing = false;
let workerJobId = 0;
let workerModelId = 0;
let workerModels = {};
let workerRequests = {};

function isModelAvailable(model) {
    return !!model && (!model.isDisposed || !model.isDisposed());
}

function getVersion(model) {
    if (!isModelAvailable(model))
        return 0;

    if (model.getVersionId)
        return model.getVersionId();

    return model.getValue ? model.getValue().length : 0;
}

function canParse() {
    return queryModel && queryModel.parse;
}

function parseForModel(model) {
    if (!isModelAvailable(model) || !model.getValue || !canParse())
        return null;

    let version = getVersion(model);
    let document = queryModel.attachRuntime(queryModel.parse(model.getValue()));

    if (!isModelAvailable(model) || getVersion(model) != version)
        return null;

    model._queryModelCache = {
        version: version,
        document: document,
        parsedAt: Date.now()
    };

    return document;
}

function completeRequest(request, result) {
    if (!request || request.completed)
        return;

    request.completed = true;
    delete workerRequests[request.jobId];

    (request.disposables || []).forEach(disposable => {
        if (disposable && disposable.dispose)
            disposable.dispose();
    });

    request.resolve(result);
}

function completeAllWorkerRequests(status, error) {
    Object.keys(workerRequests).forEach(key => {
        completeRequest(workerRequests[key], {
            status: status,
            document: null,
            error: error || null
        });
    });
}

function installModelCleanup(model, modelId) {
    if (!model || model._queryModelDisposeListener || !model.onWillDispose)
        return;

    model._queryModelDisposeListener = model.onWillDispose(() => {
        let state = model._queryModelParseState;
        if (state && state.timer)
            clearTimeout(state.timer);

        delete workerModels[modelId];

        Object.keys(workerRequests).forEach(key => {
            let request = workerRequests[key];
            if (request.model === model)
                completeRequest(request, { status: 'closed', document: null });
        });
    });
}

function getModelId(model) {
    if (!isModelAvailable(model))
        return 0;

    if (!model._queryModelWorkerId)
        model._queryModelWorkerId = ++workerModelId;

    workerModels[model._queryModelWorkerId] = model;
    installModelCleanup(model, model._queryModelWorkerId);
    return model._queryModelWorkerId;
}

function disableWorker(error) {
    workerAvailable = false;

    if (worker) {
        worker.terminate();
        worker = null;
    }

    if (typeof console != 'undefined' && console.warn)
        console.warn('query_model worker failed, fallback to main thread', error);

    completeAllWorkerRequests('unavailable', error);

    Object.keys(workerModels).forEach(key => {
        let model = workerModels[key];
        if (isModelAvailable(model))
            schedule(model, 0);
    });
}

function createWorker() {
    if (!workerAvailable || typeof Worker == 'undefined')
        return null;

    if (worker)
        return worker;

    if (workerInitializing)
        return null;

    workerInitializing = true;

    try {
        worker = new QueryModelWorker();
        worker.onmessage = onWorkerMessage;
        worker.onerror = disableWorker;
    }
    catch (error) {
        workerAvailable = false;

        if (typeof console != 'undefined' && console.warn)
            console.warn('query_model worker is unavailable, fallback to main thread', error);
    }
    finally {
        workerInitializing = false;
    }

    return worker;
}

function onWorkerMessage(event) {
    let data = event.data || {};
    let model = workerModels[data.modelId];
    let request = workerRequests[data.jobId];
    let modelCurrent = isModelAvailable(model) && getVersion(model) == data.version;

    if (model) {
        let state = model._queryModelParseState || {};
        if (state.jobId == data.jobId)
            state.isParsing = false;
        model._queryModelParseState = state;
    }

    if (data.type == 'parsed' && data.document) {
        queryModel.attachRuntime(data.document);

        if (modelCurrent) {
            model._queryModelCache = {
                version: data.version,
                document: data.document,
                parsedAt: Date.now(),
                worker: true
            };
        }
    }
    else if (data.type == 'error' && typeof console != 'undefined' && console.warn)
        console.warn('query_model worker parse failed', data.message);

    if (!request)
        return;

    if (!isModelAvailable(model)) {
        completeRequest(request, { status: 'closed', document: null });
        return;
    }

    if (!modelCurrent) {
        completeRequest(request, { status: 'stale', document: null });
        return;
    }

    if (data.type == 'parsed' && data.document) {
        completeRequest(request, {
            status: 'ready',
            document: queryModel.attachRuntime(data.document)
        });
    }
    else {
        completeRequest(request, {
            status: 'unavailable',
            document: null,
            error: data.message || 'query_model worker parse failed'
        });
    }
}

function postWorkerParse(model, version, text, request) {
    let parseWorker = createWorker();
    if (!parseWorker)
        return false;

    let state = model._queryModelParseState || {};
    let jobId = ++workerJobId;
    state.isParsing = true;
    state.jobId = jobId;
    model._queryModelParseState = state;

    if (request) {
        request.jobId = jobId;
        workerRequests[jobId] = request;
    }

    try {
        parseWorker.postMessage({
            type: 'parse',
            jobId: jobId,
            modelId: getModelId(model),
            version: version,
            text: text
        });
        return true;
    }
    catch (error) {
        state.isParsing = false;
        if (request)
            delete workerRequests[jobId];
        disableWorker(error);
        return false;
    }
}

function scheduleInWorker(model, delay) {
    if (!createWorker())
        return false;

    let state = model._queryModelParseState || {};
    if (state.timer)
        clearTimeout(state.timer);

    state.pendingVersion = getVersion(model);
    state.timer = setTimeout(() => {
        state.timer = null;
        if (!isModelAvailable(model))
            return;

        postWorkerParse(model, getVersion(model), model.getValue(), null);
    }, delay == undefined ? QUERY_MODEL_PARSE_DELAY_MS : delay);

    model._queryModelParseState = state;
    return true;
}

function schedule(model, delay) {
    if (!isModelAvailable(model) || !canParse())
        return;

    if (scheduleInWorker(model, delay))
        return;

    let state = model._queryModelParseState || {};
    if (state.timer)
        clearTimeout(state.timer);

    state.pendingVersion = getVersion(model);
    state.timer = setTimeout(() => {
        state.timer = null;
        if (!isModelAvailable(model))
            return;

        state.isParsing = true;
        try {
            parseForModel(model);
        }
        catch (error) {
            if (typeof console != 'undefined' && console.warn)
                console.warn('query_model parse failed', error);
        }
        finally {
            state.isParsing = false;
        }
    }, delay == undefined ? QUERY_MODEL_PARSE_DELAY_MS : delay);

    model._queryModelParseState = state;
}

function get(model, parseIfMissing) {
    if (!isModelAvailable(model) || !canParse())
        return null;

    let version = getVersion(model);
    if (model._queryModelCache && model._queryModelCache.version == version)
        return queryModel.attachRuntime(model._queryModelCache.document);

    schedule(model);

    if (model._queryModelCache && model._queryModelCache.document)
        return queryModel.attachRuntime(model._queryModelCache.document);

    if (!parseIfMissing)
        return null;

    let textLength = model.getValueLength ? model.getValueLength() : (model.getValue ? model.getValue().length : 0);
    if (workerAvailable && QUERY_MODEL_SYNC_PARSE_LIMIT < textLength)
        return null;

    return parseForModel(model);
}

function isCancelled(token) {
    return !!(token && token.isCancellationRequested);
}

function parseCurrentSynchronously(model, token) {
    if (isCancelled(token))
        return { status: 'cancelled', document: null };

    try {
        let document = parseForModel(model);
        if (isCancelled(token))
            return { status: 'cancelled', document: null };
        if (!isModelAvailable(model))
            return { status: 'closed', document: null };
        return document ? { status: 'ready', document: document } : { status: 'unavailable', document: null };
    }
    catch (error) {
        if (typeof console != 'undefined' && console.warn)
            console.warn('query_model parse failed', error);
        return { status: 'unavailable', document: null, error: error };
    }
}

function getCurrent(model, token) {
    if (!isModelAvailable(model) || !model.getValue || !canParse())
        return Promise.resolve({ status: 'closed', document: null });

    if (isCancelled(token))
        return Promise.resolve({ status: 'cancelled', document: null });

    let version = getVersion(model);
    if (model._queryModelCache && model._queryModelCache.version == version) {
        return Promise.resolve({
            status: 'ready',
            document: queryModel.attachRuntime(model._queryModelCache.document)
        });
    }

    let text = model.getValue();
    if (text.length <= QUERY_MODEL_SYNC_PARSE_LIMIT || !workerAvailable || typeof Worker == 'undefined')
        return Promise.resolve(parseCurrentSynchronously(model, token));

    return new Promise(resolve => {
        let request = {
            model: model,
            version: version,
            resolve: resolve,
            completed: false,
            disposables: []
        };

        if (token && token.onCancellationRequested) {
            request.disposables.push(token.onCancellationRequested(() => {
                completeRequest(request, { status: 'cancelled', document: null });
            }));
        }

        if (model.onDidChangeContent) {
            request.disposables.push(model.onDidChangeContent(() => {
                if (getVersion(model) != version)
                    completeRequest(request, { status: 'stale', document: null });
            }));
        }

        if (model.onWillDispose) {
            request.disposables.push(model.onWillDispose(() => {
                completeRequest(request, { status: 'closed', document: null });
            }));
        }

        if (request.completed)
            return;

        if (!postWorkerParse(model, version, text, request)) {
            completeRequest(request, parseCurrentSynchronously(model, token));
        }
    });
}

const queryModelService = {
    attachRuntime(document) {
        return queryModel.attachRuntime(document);
    },

    get: get,

    getCached(model) {
        return get(model, false);
    },

    getCurrent: getCurrent,
    schedule: schedule,
    parseForModel: parseForModel
};

export default queryModelService;
