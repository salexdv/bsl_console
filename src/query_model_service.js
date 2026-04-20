import queryModel from './query_model';
const queryModelWorkerUrl = require('blob-url-loader?type=application/javascript!compile-loader?target=worker&emit=false!./query_model_worker');

    const QUERY_MODEL_PARSE_DELAY_MS = 250;
    const QUERY_MODEL_SYNC_PARSE_LIMIT = 20000;

    let worker = null;
    let workerAvailable = true;
    let workerInitializing = false;
    let workerJobId = 0;
    let workerModelId = 0;
    let workerModels = {};

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

        model._queryModelCache = {
            version: version,
            document: document,
            parsedAt: Date.now()
        };

        return document;
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
            worker = new Worker(queryModelWorkerUrl);
            worker.onmessage = onWorkerMessage;
            worker.onerror = error => {
                workerAvailable = false;

                if (worker) {
                    worker.terminate();
                    worker = null;
                }

                if (typeof console != 'undefined' && console.warn)
                    console.warn('query_model worker failed, fallback to main thread', error);

                Object.keys(workerModels).forEach(key => {
                    let model = workerModels[key];
                    if (model)
                        schedule(model, 0);
                });
            };
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

    function getModelId(model) {
        if (!isModelAvailable(model))
            return 0;

        if (!model._queryModelWorkerId)
            model._queryModelWorkerId = ++workerModelId;

        workerModels[model._queryModelWorkerId] = model;

        return model._queryModelWorkerId;
    }

    function onWorkerMessage(event) {
        let data = event.data || {};
        let model = workerModels[data.modelId];

        if (!isModelAvailable(model)) {
            delete workerModels[data.modelId];
            return;
        }

        let state = model._queryModelParseState || {};

        if (state.jobId && data.jobId < state.jobId)
            return;

        state.isParsing = false;

        if (data.type == 'parsed' && data.document) {
            queryModel.attachRuntime(data.document);

            if (getVersion(model) == data.version) {
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

        model._queryModelParseState = state;
    }

    function scheduleInWorker(model, delay) {
        let parseWorker = createWorker();

        if (!parseWorker)
            return false;

        let state = model._queryModelParseState || {};

        if (state.timer)
            clearTimeout(state.timer);

        state.pendingVersion = getVersion(model);
        state.timer = setTimeout(() => {
            state.timer = null;

            if (!isModelAvailable(model))
                return;

            state.isParsing = true;
            state.jobId = ++workerJobId;
            model._queryModelParseState = state;

            try {
                parseWorker.postMessage({
                    type: 'parse',
                    jobId: state.jobId,
                    modelId: getModelId(model),
                    version: getVersion(model),
                    text: model.getValue()
                });
            }
            catch (error) {
                state.isParsing = false;
                workerAvailable = false;

                if (typeof console != 'undefined' && console.warn)
                    console.warn('query_model worker postMessage failed, fallback to main thread', error);

                schedule(model, delay);
            }
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

const queryModelService = {
        attachRuntime(document) {
            return queryModel.attachRuntime(document);
        },

        get: get,

        getCached(model) {
            return get(model, false);
        },

        schedule: schedule,

        parseForModel: parseForModel
    };

export default queryModelService;
