import { prefixSearch } from './search';

const workerUrl = require('blob-url-loader?type=application/javascript!compile-loader?target=worker&emit=false!./help_worker');

function createHelpService(workerFactory) {
  const factory = workerFactory || function () { return new Worker(workerUrl); };
  let worker = null;
  let sequence = 0;
  let pending = {};
  let loading = 0;
  const listeners = [];
  const state = {
    status: 'empty',
    lastError: null,
    packages: { context: null, language: null }
  };

  function snapshot() {
    return {
      status: loading ? 'loading' : (state.lastError ? 'error' : (state.packages.context || state.packages.language ? 'ready' : 'empty')),
      loading: loading,
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
      delete pending[data.id];
      if (data.type == 'error') request.reject(new Error(data.payload && data.payload.message || 'Ошибка worker'));
      else request.resolve({ type: data.type, payload: data.payload });
    };
    worker.onerror = function (event) {
      completeAll(event && event.message || 'Worker справки завершился с ошибкой');
      try { worker.terminate(); } catch (ignore) { /* noop */ }
      worker = null;
    };
    return worker;
  }

  function request(type, payload) {
    return new Promise(function (resolve, reject) {
      const id = ++sequence;
      pending[id] = { resolve: resolve, reject: reject };
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

  function parse(source) {
    loading++;
    state.lastError = null;
    notify();
    const isBlob = source && typeof source.size == 'number' && typeof source.slice == 'function';
    if (!isBlob && typeof source != 'string') {
      loading--;
      return fail('parseHelp принимает Blob, File или строку Base64');
    }
    return request('parse', { source: source }).then(function (response) {
      const result = response.payload;
      state.packages[result.kind] = {
        kind: result.kind,
        pages: result.pages,
        navigation: result.navigation,
        index: result.index,
        stats: result.stats
      };
      state.lastError = null;
      return { ok: true, kind: result.kind, pages: result.pages, error: null };
    }).catch(function (error) {
      state.lastError = error && error.message ? error.message : String(error);
      return { ok: false, kind: null, pages: 0, error: state.lastError };
    }).then(function (result) {
      loading--;
      notify();
      return result;
    });
  }

  return {
    parse: parse,
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
      let result = [];
      if (state.packages.context) result = result.concat(state.packages.context.index);
      if (state.packages.language) result = result.concat(state.packages.language.index);
      return result.sort(function (a, b) { return a.title.localeCompare(b.title); });
    },
    prefix: function (query) { return prefixSearch(this.getIndex(), query, 1000); },
    search: function (query) { return request('search', { query: query }).then(function (response) { return response.payload; }); },
    article: function (item, terms) {
      return request('article', {
        pageId: item.id || null, kind: item.kind, path: item.path, terms: terms || []
      }).then(function (response) { return response.payload; });
    },
    dispose: function () {
      if (worker) worker.terminate();
      worker = null;
      completeAll('Сервис справки остановлен');
    }
  };
}

export { createHelpService };
