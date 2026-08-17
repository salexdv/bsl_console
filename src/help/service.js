import { mergePrefixIndexes, prefixSearch } from './search';

const HelpWorker = require('worker-loader?inline=no-fallback&esModule=false!./help_worker');

function createHelpService(workerFactory) {
  const factory = workerFactory || function () { return new HelpWorker(); };
  let worker = null;
  let sequence = 0;
  let pending = {};
  let loading = 0;
  let provisionalReady = 0;
  let prefixIndex = [];
  let visibleIndex = [];
  let transferActive = false;
  let transferEnded = false;
  let transferWorkerError = null;
  const listeners = [];
  const state = {
    status: 'empty',
    lastError: null,
    packages: { context: null, language: null }
  };

  function snapshot() {
    const hasPackage = state.packages.context || state.packages.language;
    return {
      status: loading ? (provisionalReady ? 'ready' : 'loading')
        : (state.lastError ? 'error' : (hasPackage ? 'ready' : 'empty')),
      loading: loading,
      indexing: provisionalReady > 0,
      lastError: state.lastError,
      packages: state.packages
    };
  }

  function notify() {
    const value = snapshot();
    listeners.slice().forEach(function (listener) { listener(value); });
  }

  function fail(message) {
    state.lastError = message;
    notify();
    return Promise.resolve({ ok: false, kind: null, pages: 0, error: message });
  }

  function completeAll(message) {
    Object.keys(pending).forEach(function (id) {
      const request = pending[id];
      delete pending[id];
      request.reject(new Error(message));
    });
  }

  function ensureWorker() {
    if (worker)
      return worker;
    worker = factory();
    worker.onmessage = function (event) {
      const data = event.data || {};
      const request = pending[data.id];
      if (!request) return;
      if (data.type == 'prepared' || data.type == 'rollback') {
        if (request.progress) request.progress(data);
        return;
      }
      delete pending[data.id];
      if (data.type == 'error') request.reject(new Error(data.payload && data.payload.message || 'Ошибка worker'));
      else request.resolve({ type: data.type, payload: data.payload });
    };
    worker.onerror = function (event) {
      const message = event && event.message || 'Worker справки завершился с ошибкой';
      completeAll(message);
      if (transferActive || transferEnded) {
        transferActive = false;
        transferEnded = true;
        transferWorkerError = message;
      }
      try { worker.terminate(); } catch (ignore) { /* noop */ }
      worker = null;
    };
    return worker;
  }

  function request(type, payload, progress) {
    return new Promise(function (resolve, reject) {
      const id = ++sequence;
      pending[id] = { resolve: resolve, reject: reject, progress: progress };
      try {
        const message = Object.assign({ id: id, type: type }, payload || {});
        ensureWorker().postMessage(message);
      }
      catch (error) {
        delete pending[id];
        reject(error);
      }
    });
  }

  function post(type, payload) {
    const message = Object.assign({ type: type }, payload || {});
    ensureWorker().postMessage(message);
  }

  function rebuildIndex() {
    const context = state.packages.context ? state.packages.context.index : [];
    const language = state.packages.language ? state.packages.language.index : [];
    prefixIndex = mergePrefixIndexes(context, language);
    visibleIndex = prefixIndex.map(function (entry) { return entry.item; });
  }

  function parseRequest(type, payload) {
    loading++;
    state.lastError = null;
    notify();
    let candidateKind = null;
    let previousPackage = null;
    let rolledBack = false;
    function assignPackage(result, provisional) {
      state.packages[result.kind] = {
        kind: result.kind,
        pages: result.pages,
        navigation: result.navigation,
        index: result.index,
        stats: result.stats,
        provisional: !!provisional
      };
      rebuildIndex();
    }
    function progress(response) {
      if (response.type == 'prepared') {
        const result = response.payload;
        candidateKind = result.kind;
        previousPackage = state.packages[candidateKind];
        assignPackage(result, true);
        provisionalReady++;
        notify();
      }
      else if (response.type == 'rollback' && candidateKind) {
        state.packages[candidateKind] = previousPackage;
        rolledBack = true;
        provisionalReady = Math.max(0, provisionalReady - 1);
        rebuildIndex();
        notify();
      }
    }
    return request(type, payload, progress).then(function (response) {
      const result = response.payload;
      assignPackage(result, false);
      provisionalReady = Math.max(0, provisionalReady - 1);
      state.lastError = null;
      return { ok: true, kind: result.kind, pages: result.pages, error: null };
    }).catch(function (error) {
      if (candidateKind && !rolledBack) {
        state.packages[candidateKind] = previousPackage;
        rebuildIndex();
        provisionalReady = Math.max(0, provisionalReady - 1);
      }
      state.lastError = error && error.message ? error.message : String(error);
      return { ok: false, kind: null, pages: 0, error: state.lastError };
    }).then(function (result) {
      loading--;
      notify();
      return result;
    });
  }

  function parse(source) {
    const isBlob = source && typeof source.size == 'number' && typeof source.slice == 'function';
    if (!isBlob && typeof source != 'string')
      return fail('parseHelp принимает Blob, File или строку Base64');
    return parseRequest('parse', { source: source });
  }

  function beginTransfer(name) {
    if (typeof name != 'string' || !name.trim())
      throw new Error('beginBase64Transfer принимает непустое имя данных');
    post('transfer-begin', { name: name.trim() });
    transferActive = true;
    transferEnded = false;
    transferWorkerError = null;
  }

  function pushTransfer(chunk) {
    if (!transferActive)
      throw new Error('Сначала вызовите beginBase64Transfer');
    if (typeof chunk != 'string')
      throw new Error('pushBase64Chunk принимает строку Base64');
    post('transfer-push', { chunk: chunk });
  }

  function endTransfer() {
    if (!transferActive)
      throw new Error('Нет активной передачи Base64');
    post('transfer-end');
    transferActive = false;
    transferEnded = true;
  }

  function parseTransferred() {
    if (transferActive)
      return fail('Передача Base64 ещё не завершена');
    if (transferWorkerError)
      return fail(transferWorkerError);
    if (!transferEnded)
      return fail('Нет завершённой передачи Base64');
    return parseRequest('parse-transferred');
  }

  return {
    parse: parse,
    parseTransferred: parseTransferred,
    beginTransfer: beginTransfer,
    pushTransfer: pushTransfer,
    endTransfer: endTransfer,
    fail: fail,
    getState: snapshot,
    isReady: function () { return snapshot().status == 'ready'; },
    subscribe: function (listener) {
      listeners.push(listener);
      return function () {
        const index = listeners.indexOf(listener);
        if (0 <= index) listeners.splice(index, 1);
      };
    },
    getNavigation: function () {
      let result = [];
      if (state.packages.context) result = result.concat(state.packages.context.navigation);
      if (state.packages.language) result = result.concat(state.packages.language.navigation);
      return result;
    },
    getIndex: function () {
      return visibleIndex;
    },
    prefix: function (query) { return prefixSearch(prefixIndex, query, 1000); },
    search: function (query) { return request('search', { query: query }).then(function (response) { return response.payload; }); },
    article: function (item, terms) {
      return request('article', {
        pageId: item.id || null, kind: item.kind, path: item.path, terms: terms || []
      }).then(function (response) { return response.payload; });
    },
    dispose: function () {
      if (worker) worker.terminate();
      worker = null;
      transferActive = false;
      transferEnded = false;
      transferWorkerError = null;
      completeAll('Сервис справки остановлен');
    }
  };
}

export { createHelpService };
