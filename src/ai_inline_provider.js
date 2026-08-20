const AI_INLINE_PROTOCOL_VERSION = 1;

const AI_INLINE_DEFAULT_OPTIONS = {
    generateAIInlineCompletionEvent: false,
    aiInlineCompletionDebounceMs: 400,
    aiInlineCompletionRequestTimeoutMs: 15000,
    aiInlineCompletionMaxPrefixChars: 16000,
    aiInlineCompletionMaxSuffixChars: 4000
};

const AI_INLINE_LANGUAGES = ['bsl', 'bsl_query', 'dcs_query'];

function isNonNegativeInteger(value) {
    return typeof value == 'number' && isFinite(value) && Math.floor(value) == value && value >= 0;
}

function isPositiveInteger(value) {
    return isNonNegativeInteger(value) && value > 0;
}

function isAIInlineOption(name) {
    return Object.prototype.hasOwnProperty.call(AI_INLINE_DEFAULT_OPTIONS, name);
}

function isValidAIInlineOption(name, value) {

    if (!isAIInlineOption(name))
        return true;

    if (name == 'generateAIInlineCompletionEvent')
        return typeof value == 'boolean';

    if (name == 'aiInlineCompletionRequestTimeoutMs')
        return isPositiveInteger(value);

    return isNonNegativeInteger(value);

}

function emptyResult() {
    return { items: [] };
}

function positionsEqual(left, right) {
    return !!left && !!right
        && left.lineNumber == right.lineNumber
        && left.column == right.column;
}

function clonePosition(position) {
    return {
        lineNumber: position.lineNumber,
        column: position.column
    };
}

function getLanguageId(model) {

    if (!model)
        return '';

    if (model.getLanguageIdentifier)
        return model.getLanguageIdentifier().language;

    if (model.getModeId)
        return model.getModeId();

    return '';

}

function isSupportedLanguage(model) {
    return AI_INLINE_LANGUAGES.indexOf(getLanguageId(model)) >= 0;
}

function createAIInlineProvider(dependencies) {

    dependencies = dependencies || {};

    const getEditor = dependencies.getEditor || function () { return null; };
    const getOption = dependencies.getOption || function () { return undefined; };
    const sendEvent = dependencies.sendEvent || function () { };
    const isInlineEnabled = dependencies.isInlineEnabled || function () { return true; };
    const scheduleTimeout = dependencies.setTimeout || setTimeout;
    const cancelTimeout = dependencies.clearTimeout || clearTimeout;
    const now = dependencies.now || Date.now;

    let nextRequestId = 0;
    let pendingRequest = null;

    function effectiveOption(name) {

        let value = getOption(name);
        if (!isValidAIInlineOption(name, value))
            return AI_INLINE_DEFAULT_OPTIONS[name];

        return typeof value == 'undefined' ? AI_INLINE_DEFAULT_OPTIONS[name] : value;

    }

    function isEnabled() {
        return effectiveOption('generateAIInlineCompletionEvent') === true && isInlineEnabled();
    }

    function clearRequestResources(request) {

        if (request.debounceTimer) {
            cancelTimeout(request.debounceTimer);
            request.debounceTimer = 0;
        }

        if (request.timeoutTimer) {
            cancelTimeout(request.timeoutTimer);
            request.timeoutTimer = 0;
        }

        if (request.tokenDisposable && request.tokenDisposable.dispose)
            request.tokenDisposable.dispose();

        request.tokenDisposable = null;

    }

    function completeRequest(request, items) {

        if (!request || request.completed)
            return;

        request.completed = true;
        clearRequestResources(request);

        if (pendingRequest === request)
            pendingRequest = null;

        request.resolve({ items: items || [] });

    }

    function emitCancellation(request, reason) {

        if (!request.sent || request.cancelEventSent)
            return;

        request.cancelEventSent = true;

        try {
            sendEvent('EVENT_AI_INLINE_COMPLETION_CANCEL', {
                protocolVersion: AI_INLINE_PROTOCOL_VERSION,
                requestId: request.id,
                reason: reason
            });
        }
        catch (error) {
            if (typeof console != 'undefined' && console.warn)
                console.warn('AI inline completion cancellation event failed', error);
        }

    }

    function cancelPending(reason) {

        let request = pendingRequest;
        if (!request)
            return false;

        completeRequest(request, []);
        emitCancellation(request, reason || 'superseded');
        return true;

    }

    function isRequestCurrent(request) {

        let editor = getEditor();
        if (!editor || !editor.getModel || editor.getModel() !== request.model)
            return false;

        if (request.model.isDisposed && request.model.isDisposed())
            return false;

        if (!request.model.getVersionId || request.model.getVersionId() != request.modelVersionId)
            return false;

        return positionsEqual(editor.getPosition && editor.getPosition(), request.position);

    }

    function contextWindow(model, position) {

        let text = model.getValue();
        let offset = model.getOffsetAt(position);
        let maxPrefixChars = effectiveOption('aiInlineCompletionMaxPrefixChars');
        let maxSuffixChars = effectiveOption('aiInlineCompletionMaxSuffixChars');
        let prefixStart = Math.max(0, offset - maxPrefixChars);
        let suffixEnd = Math.min(text.length, offset + maxSuffixChars);

        return {
            prefix: text.substring(prefixStart, offset),
            suffix: text.substring(offset, suffixEnd),
            prefixTruncated: prefixStart > 0,
            suffixTruncated: suffixEnd < text.length
        };

    }

    function sendRequest(request) {

        request.debounceTimer = 0;

        if (request !== pendingRequest || request.completed)
            return;

        if (!isEnabled()) {
            completeRequest(request, []);
            return;
        }

        if (!isRequestCurrent(request)) {
            completeRequest(request, []);
            return;
        }

        let modelUri = request.model.uri && request.model.uri.toString
            ? request.model.uri.toString()
            : '';

        let payload = {
            protocolVersion: AI_INLINE_PROTOCOL_VERSION,
            requestId: request.id,
            modelVersionId: request.modelVersionId,
            modelUri: modelUri,
            languageId: getLanguageId(request.model),
            position: clonePosition(request.position),
            triggerKind: request.triggerSource == 'explicit' ? 'explicit' : 'automatic',
            triggerCharacter: request.triggerCharacter || '',
            context: contextWindow(request.model, request.position)
        };

        request.sent = true;

        try {
            sendEvent('EVENT_AI_INLINE_COMPLETION_REQUEST', payload);
        }
        catch (error) {
            request.sent = false;
            completeRequest(request, []);
            return;
        }

        if (request.completed)
            return;

        let requestTimeout = effectiveOption('aiInlineCompletionRequestTimeoutMs');
        request.timeoutTimer = scheduleTimeout(function () {
            if (pendingRequest === request && !request.completed) {
                completeRequest(request, []);
                emitCancellation(request, 'timeout');
            }
        }, requestTimeout);

    }

    function provideInlineCompletions(model, position, context, token) {

        context = context || {};
        let triggerSource = context.triggerSource || '';

        if (triggerSource == 'cursor') {
            cancelPending('cursorChanged');
            return emptyResult();
        }

        if (!isEnabled() || !model || !position || !isSupportedLanguage(model))
            return emptyResult();

        if (triggerSource != 'content' && triggerSource != 'explicit')
            return emptyResult();

        cancelPending('superseded');

        return new Promise(function (resolve) {

            let request = {
                id: ++nextRequestId,
                model: model,
                modelVersionId: model.getVersionId(),
                position: clonePosition(position),
                triggerSource: triggerSource,
                triggerCharacter: context.triggerCharacter || '',
                resolve: resolve,
                debounceTimer: 0,
                timeoutTimer: 0,
                tokenDisposable: null,
                sent: false,
                cancelEventSent: false,
                completed: false
            };

            pendingRequest = request;

            if (token && token.onCancellationRequested) {
                request.tokenDisposable = token.onCancellationRequested(function () {
                    if (pendingRequest === request)
                        cancelPending(token.reason || 'superseded');
                });
            }

            if (request.completed)
                return;

            let delay = 0;
            if (triggerSource != 'explicit') {
                let debounce = effectiveOption('aiInlineCompletionDebounceMs');
                let elapsed = context.triggeredAt ? Math.max(0, now() - context.triggeredAt) : 0;
                delay = Math.max(0, debounce - elapsed);
            }

            if (delay)
                request.debounceTimer = scheduleTimeout(function () { sendRequest(request); }, delay);
            else
                sendRequest(request);

        });

    }

    function resolve(requestId, suggestions) {

        try {
            if (!isPositiveInteger(requestId))
                throw new TypeError('requestId должен быть положительным целым числом');

            let suggestionItems = typeof suggestions == 'string' ? JSON.parse(suggestions) : suggestions;

            if (!Array.isArray(suggestionItems))
                throw new TypeError('Ожидается массив строк');

            for (let idx = 0; idx < suggestionItems.length; idx++) {
                if (typeof suggestionItems[idx] != 'string')
                    throw new TypeError('Все элементы подсказки должны быть строками');
            }

            let request = pendingRequest;
            if (!request || request.id != requestId)
                return false;

            if (!isEnabled() || !isRequestCurrent(request)) {
                completeRequest(request, []);
                return false;
            }

            let range = {
                startLineNumber: request.position.lineNumber,
                startColumn: request.position.column,
                endLineNumber: request.position.lineNumber,
                endColumn: request.position.column
            };

            let items = suggestionItems
                .filter(function (text) { return text.length > 0; })
                .map(function (text) {
                    return { insertText: text, range: range };
                });

            completeRequest(request, items);
            return true;
        }
        catch (error) {
            return { errorDescription: error.message };
        }

    }

    function optionChanged(name, value) {

        if (name == 'generateAIInlineCompletionEvent' && value !== true)
            cancelPending('disabled');

    }

    return {
        provider: {
            provideInlineCompletions: provideInlineCompletions,
            freeInlineCompletions: function () { }
        },
        cancel: cancelPending,
        resolve: resolve,
        optionChanged: optionChanged,
        getPendingRequestId: function () {
            return pendingRequest ? pendingRequest.id : null;
        }
    };

}

export {
    AI_INLINE_DEFAULT_OPTIONS,
    AI_INLINE_PROTOCOL_VERSION,
    createAIInlineProvider,
    isAIInlineOption,
    isValidAIInlineOption
};

export default createAIInlineProvider;
