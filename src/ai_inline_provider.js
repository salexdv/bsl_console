const AI_INLINE_PROTOCOL_VERSION = 1;

const AI_INLINE_DEFAULT_OPTIONS = {
    generateAIInlineCompletionEvent: false,
    aiInlineCompletionDebounceMs: 400,
    aiInlineCompletionRequestTimeoutMs: 15000,
    aiInlineCompletionMaxPrefixChars: 16000,
    aiInlineCompletionMaxSuffixChars: 4000
};

const AI_INLINE_LANGUAGES = ['bsl', 'bsl_query', 'dcs_query'];
const AI_INLINE_PROVIDER_GROUP = 'bsl-console-ai-inline';
const MANUAL_INLINE_PROVIDER_GROUP = 'bsl-console-manual-inline';

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

    if (model.getLanguageId)
        return model.getLanguageId();

    if (model.getLanguageIdentifier)
        return model.getLanguageIdentifier().language;

    if (model.getModeId)
        return model.getModeId();

    return '';

}

function isSupportedLanguage(model) {
    return AI_INLINE_LANGUAGES.indexOf(getLanguageId(model)) >= 0;
}

function getTriggerCharacter(changeEvent) {

    if (!changeEvent || !changeEvent.changes || changeEvent.changes.length != 1)
        return '';

    let change = changeEvent.changes[0];
    return change.text && change.text.length == 1 ? change.text : '';

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
    let nextContentChangeId = 0;
    let pendingRequest = null;
    let lastContentChange = null;

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

        if (request.cancellationTimer) {
            cancelTimeout(request.cancellationTimer);
            request.cancellationTimer = 0;
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
                console.warn('Не удалось отправить отмену AI inline-подсказки', error);
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

    function currentEditorMatches(model, position) {

        let editor = getEditor();
        if (!editor || !editor.getModel || editor.getModel() !== model)
            return false;

        if (model.isDisposed && model.isDisposed())
            return false;

        return positionsEqual(editor.getPosition && editor.getPosition(), position);

    }

    function isRequestCurrent(request) {

        if (!currentEditorMatches(request.model, request.position))
            return false;

        return request.model.getVersionId
            && request.model.getVersionId() == request.modelVersionId;

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

        if (!isEnabled() || !isRequestCurrent(request)) {
            completeRequest(request, []);
            return;
        }

        if (request.contentChange) {
            let change = request.contentChange;
            if (change !== lastContentChange
                || change.consumed
                || change.programmatic
                || change.model !== request.model
                || change.modelVersionId != request.modelVersionId
                || !positionsEqual(change.position, request.position)) {
                completeRequest(request, []);
                return;
            }

            change.consumed = true;
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
            triggerKind: request.explicit ? 'explicit' : 'automatic',
            triggerCharacter: request.triggerCharacter,
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
            if (pendingRequest === request && !request.completed)
                cancelPending('timeout');
        }, requestTimeout);

    }

    function cancellationRequested(request) {

        if (request !== pendingRequest || request.completed || request.cancellationTimer)
            return;

        // Monaco сообщает только сам факт отмены. Откладываем обработку на один оборот
        // event loop, чтобы обработчики курсора/Esc успели уточнить причину через cancel().
        request.cancellationTimer = scheduleTimeout(function () {
            request.cancellationTimer = 0;
            if (request === pendingRequest && !request.completed)
                cancelPending('superseded');
        }, 0);

    }

    function provideInlineCompletions(model, position, context, token) {

        context = context || {};
        let explicit = context.triggerKind == 1;

        if (!isEnabled() || !model || !position || !isSupportedLanguage(model))
            return emptyResult();

        let contentChange = null;
        if (!explicit) {
            contentChange = lastContentChange;
            if (!contentChange
                || contentChange.consumed
                || contentChange.programmatic
                || contentChange.model !== model
                || contentChange.modelVersionId != model.getVersionId())
                return emptyResult();

        }

        cancelPending('superseded');

        return new Promise(function (resolve) {

            let issuedAt = typeof context.requestIssuedDateTime == 'number'
                ? context.requestIssuedDateTime
                : (contentChange ? contentChange.changedAt : now());

            let request = {
                id: ++nextRequestId,
                model: model,
                modelVersionId: model.getVersionId(),
                position: clonePosition(position),
                explicit: explicit,
                triggerCharacter: contentChange ? contentChange.triggerCharacter : '',
                contentChange: contentChange,
                resolve: resolve,
                debounceTimer: 0,
                timeoutTimer: 0,
                cancellationTimer: 0,
                tokenDisposable: null,
                sent: false,
                cancelEventSent: false,
                completed: false
            };

            pendingRequest = request;

            if (token && token.onCancellationRequested) {
                request.tokenDisposable = token.onCancellationRequested(function () {
                    cancellationRequested(request);
                });
            }

            if (request.completed)
                return;

            let delay = explicit
                ? 0
                : Math.max(0, effectiveOption('aiInlineCompletionDebounceMs') - Math.max(0, now() - issuedAt));

            // Автоматический запрос всегда откладываем хотя бы в macrotask: Monaco сначала
            // меняет модель, затем публикует итоговую позицию курсора.
            if (delay || !explicit)
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

    function recordContentChange(model, changeEvent, programmatic) {

        cancelPending('superseded');

        let change = {
            id: ++nextContentChangeId,
            model: model,
            modelVersionId: model && model.getVersionId ? model.getVersionId() : 0,
            changedAt: now(),
            triggerCharacter: getTriggerCharacter(changeEvent),
            programmatic: programmatic === true,
            position: null,
            consumed: false
        };

        lastContentChange = change;

        scheduleTimeout(function () {
            if (lastContentChange !== change || change.position)
                return;

            let editor = getEditor();
            if (editor && editor.getModel && editor.getModel() === model
                && model.getVersionId() == change.modelVersionId)
                change.position = clonePosition(editor.getPosition());
        }, 0);

    }

    function cursorChanged() {

        let editor = getEditor();
        let model = editor && editor.getModel ? editor.getModel() : null;
        let position = editor && editor.getPosition ? editor.getPosition() : null;

        if (lastContentChange && !lastContentChange.position
            && lastContentChange.model === model
            && model && model.getVersionId() == lastContentChange.modelVersionId) {
            lastContentChange.position = clonePosition(position);
            return false;
        }

        return cancelPending('cursorChanged');

    }

    function optionChanged(name, value) {

        if (name == 'generateAIInlineCompletionEvent' && value !== true)
            cancelPending('disabled');

    }

    function dispose() {
        cancelPending('disposed');
        lastContentChange = null;
    }

    return {
        provider: {
            groupId: AI_INLINE_PROVIDER_GROUP,
            yieldsToGroupIds: [MANUAL_INLINE_PROVIDER_GROUP],
            provideInlineCompletions: provideInlineCompletions,
            disposeInlineCompletions: function () { }
        },
        cancel: cancelPending,
        cursorChanged: cursorChanged,
        dispose: dispose,
        recordContentChange: recordContentChange,
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
    AI_INLINE_PROVIDER_GROUP,
    MANUAL_INLINE_PROVIDER_GROUP,
    createAIInlineProvider,
    isAIInlineOption,
    isValidAIInlineOption
};

export default createAIInlineProvider;
