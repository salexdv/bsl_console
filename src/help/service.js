import { mergePrefixIndexes, prefixSearch } from './search';

const workerUrl = require('blob-url-loader!compile-loader!./help_worker');
const indexWorkerUrl = require('blob-url-loader!compile-loader!./index_worker');

const PRODUCTION_INDEX_WORKERS = 1;
const PACKAGE_KINDS = ['context', 'language', 'query', 'dcs'];

function normalizedKinds(value) {
  const source = Array.isArray(value) ? value : ['context', 'language'];
  return PACKAGE_KINDS.filter(function (kind) { return source.indexOf(kind) >= 0; });
}

function kindFromName(name) {
  const value = String(name || '').toLowerCase();
  if (/shcntx/.test(value)) return 'context';
  if (/shlang/.test(value)) return 'language';
  if (/shquery/.test(value)) return 'query';
  if (/dcsui/.test(value)) return 'dcs';
  return null;
}

function createHelpService(workerFactory, indexWorkerFactory, indexWorkerCount) {
  const factory = workerFactory || function () { return new Worker(workerUrl); };
  const indexFactory = indexWorkerFactory || function () { return new Worker(indexWorkerUrl); };
  const defaultPool = workerFactory ? 0 : Math.min(PRODUCTION_INDEX_WORKERS,
    Math.max(1, ((typeof navigator != 'undefined' && navigator.hardwareConcurrency) || 3) - 1));
  const requestedIndexWorkers = indexWorkerCount === undefined ? defaultPool : Math.max(0, indexWorkerCount);
  let worker = null;
  let indexPool = null;
  let indexPoolBroken = false;
  let sequence = 0;
  let pending = {};
  const loadingByKind = { context: 0, language: 0, query: 0, dcs: 0 };
  const provisionalByKind = { context: 0, language: 0, query: 0, dcs: 0 };
  const errorsByKind = { context: null, language: null, query: null, dcs: null };
  const parseBarriers = {};
  let activeKinds = ['context', 'language'];
  let scopeSequence = 0;
  let prefixIndex = [];
  let visibleIndex = [];
  let transferActive = false;
  let transferEnded = false;
  let transferWorkerError = null;
  let transferKind = null;
  let poolSearchSequence = 0;
  const poolSearches = {};
  const poolCommits = {};
  const activeIndexRequests = {};
  const listeners = [];
  const state = {
    packages: { context: null, language: null, query: null, dcs: null }
  };

  function snapshot() {
    const hasPackage = activeKinds.some(function (kind) { return !!state.packages[kind]; });
    const loading = activeKinds.reduce(function (sum, kind) { return sum + loadingByKind[kind]; }, 0);
    const provisionalReady = activeKinds.reduce(function (sum, kind) { return sum + provisionalByKind[kind]; }, 0);
    let lastError = null;
    activeKinds.some(function (kind) {
      lastError = errorsByKind[kind];
      return !!lastError;
    });
    return {
      status: loading ? (provisionalReady ? 'ready' : 'loading')
        : (lastError ? 'error' : (hasPackage ? 'ready' : 'empty')),
      loading: loading,
      indexing: provisionalReady > 0,
      lastError: lastError,
      packages: state.packages,
      kinds: activeKinds.slice(),
      scope: scopeSequence
    };
  }

  function notify() {
    const value = snapshot();
    listeners.slice().forEach(function (listener) { listener(value); });
  }

  function fail(message) {
    return Promise.resolve({ ok: false, kind: null, pages: 0, error: message });
  }

  function completeAll(message) {
    Object.keys(pending).forEach(function (id) {
      const request = pending[id];
      delete pending[id];
      request.reject(new Error(message));
    });
  }

  function forwardToCoordinator(message) {
    ensureWorker().postMessage(message);
  }

  function failIndexPool(message) {
    const failed = indexPool || [];
    indexPool = null;
    indexPoolBroken = true;
    failed.forEach(function (item) {
      try { item.terminate(); } catch (ignore) { /* noop */ }
    });
    Object.keys(poolSearches).forEach(function (id) {
      const search = poolSearches[id];
      delete poolSearches[id];
      search.reject(new Error(message));
    });
    Object.keys(activeIndexRequests).forEach(function (id) {
      forwardToCoordinator({ type: 'index-pool-error', requestId: Number(id), message: message });
    });
    if (!Object.keys(activeIndexRequests).length)
      forwardToCoordinator({ type: 'index-pool-error', requestId: 0, message: message });
  }

  function indexWorkerMessage(workerIndex, data) {
    const payload = data.payload || {};
    if (data.type == 'index-result') {
      forwardToCoordinator(Object.assign({ type: 'index-result', workerIndex: workerIndex }, payload));
    }
    else if (data.type == 'index-error') {
      forwardToCoordinator(Object.assign({ type: 'index-error', workerIndex: workerIndex }, payload));
    }
    else if (data.type == 'index-commit-result') {
      const commit = poolCommits[payload.generation];
      if (commit && --commit.remaining == 0) {
        delete poolCommits[payload.generation];
        delete activeIndexRequests[commit.requestId];
        (indexPool || []).forEach(function (item) {
          item.postMessage({ type: 'index-finalize', generation: payload.generation });
        });
        forwardToCoordinator({
          type: 'index-committed', requestId: commit.requestId, generation: payload.generation
        });
      }
    }
    else if (data.type == 'search-result') {
      const search = poolSearches[payload.searchId];
      if (!search) return;
      search.results.push(payload.result);
      if (--search.remaining == 0) {
        delete poolSearches[payload.searchId];
        const items = [];
        let total = 0;
        let terms = [];
        search.results.forEach(function (result) {
          total += result.total;
          if (!terms.length) terms = result.terms || [];
          Array.prototype.push.apply(items, result.items || []);
        });
        items.sort(function (a, b) {
          return b.score - a.score || a.title.localeCompare(b.title)
            || (a.ordinal || 0) - (b.ordinal || 0);
        });
        search.resolve({ total: total, items: items.slice(0, search.limit), terms: terms });
      }
    }
  }

  function ensureIndexPool() {
    if (indexPool) return indexPool;
    if (!requestedIndexWorkers || indexPoolBroken) return [];
    const created = [];
    try {
      for (let index = 0; index < requestedIndexWorkers; index++) {
        const instance = indexFactory();
        (function (workerIndex, indexWorker) {
          indexWorker.onmessage = function (event) { indexWorkerMessage(workerIndex, event.data || {}); };
          indexWorker.onerror = function (event) {
            failIndexPool(event && event.message || 'Index-worker справки завершился с ошибкой');
          };
        }(index, instance));
        created.push(instance);
      }
      indexPool = created;
      return indexPool;
    }
    catch (error) {
      indexPool = created;
      failIndexPool(error && error.message || String(error));
      return [];
    }
  }

  function handleIndexCoordinatorMessage(data) {
    if (data.type != 'index-begin' && data.type != 'index-batch'
      && data.type != 'index-cancel' && data.type != 'index-commit') return false;
    const payload = data.payload || {};
    const pool = ensureIndexPool();
    if (!pool.length) {
      forwardToCoordinator({
        type: 'index-pool-error', requestId: payload.requestId || data.id,
        message: 'Пул index-worker недоступен'
      });
      return true;
    }
    if (data.type == 'index-begin') {
      activeIndexRequests[payload.requestId] = true;
      pool.forEach(function (item) {
        item.postMessage(Object.assign({ type: 'index-begin' }, payload));
      });
    }
    else if (data.type == 'index-batch') {
      const at = Math.max(0, Math.min(pool.length - 1, payload.workerIndex || 0));
      pool[at].postMessage(Object.assign({ type: 'index-batch' }, payload), [payload.buffer]);
    }
    else if (data.type == 'index-cancel') {
      delete activeIndexRequests[payload.requestId];
      pool.forEach(function (item) {
        item.postMessage(Object.assign({ type: 'index-cancel' }, payload));
      });
    }
    else if (data.type == 'index-commit') {
      poolCommits[payload.generation] = { requestId: payload.requestId, remaining: pool.length };
      pool.forEach(function (item) {
        item.postMessage(Object.assign({ type: 'index-commit' }, payload));
      });
    }
    return true;
  }

  function searchIndexPool(query, limit, kinds) {
    const pool = ensureIndexPool();
    if (!pool.length)
      return request('search', { query: query, kinds: kinds }).then(function (response) { return response.payload; });
    return new Promise(function (resolve, reject) {
      const searchId = ++poolSearchSequence;
      poolSearches[searchId] = {
        resolve: resolve, reject: reject, remaining: pool.length,
        results: [], limit: limit || 1000
      };
      pool.forEach(function (item) {
        item.postMessage({
          type: 'search', searchId: searchId, query: query,
          limit: limit || 1000, kinds: kinds
        });
      });
    });
  }

  function ensureWorker() {
    if (worker)
      return worker;
    worker = factory();
    worker.onmessage = function (event) {
      const data = event.data || {};
      if (handleIndexCoordinatorMessage(data)) return;
      const request = pending[data.id];
      if (!request) return;
      if (data.type == 'prepared' || data.type == 'rollback') {
        if (request.progress) request.progress(data);
        return;
      }
      delete pending[data.id];
      if (data.type == 'error') {
        const error = new Error(data.payload && data.payload.message || 'Ошибка worker');
        error.kind = data.payload && data.payload.kind || null;
        request.reject(error);
      }
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
    prefixIndex = activeKinds.reduce(function (result, kind) {
      const index = state.packages[kind] ? state.packages[kind].index : [];
      return mergePrefixIndexes(result, index);
    }, []);
    visibleIndex = prefixIndex.map(function (entry) { return entry.item; });
  }

  function parseRequest(type, payload, expectedKinds, onPrepared) {
    let candidateKind = null;
    let previousPackage = null;
    let rolledBack = false;
    let candidatePrepared = false;
    let operation = null;
    const trackedLoading = {};

    function trackLoading(kind) {
      if (!kind || trackedLoading[kind]) return;
      trackedLoading[kind] = true;
      loadingByKind[kind]++;
      errorsByKind[kind] = null;
    }

    function releaseLoading(kind) {
      if (!trackedLoading[kind]) return;
      delete trackedLoading[kind];
      loadingByKind[kind] = Math.max(0, loadingByKind[kind] - 1);
    }

    normalizedKinds(expectedKinds).forEach(trackLoading);
    notify();
    function assignPackage(result, provisional) {
      state.packages[result.kind] = {
        kind: result.kind,
        generation: result.generation,
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
        candidatePrepared = true;
        Object.keys(trackedLoading).forEach(function (kind) {
          if (kind != candidateKind) releaseLoading(kind);
        });
        trackLoading(candidateKind);
        errorsByKind[candidateKind] = null;
        previousPackage = state.packages[candidateKind];
        assignPackage(result, true);
        provisionalByKind[candidateKind]++;
        parseBarriers[candidateKind] = Promise.resolve().then(function () { return operation; })
          .then(function () { return undefined; });
        notify();
        if (onPrepared) onPrepared(result.kind);
      }
      else if (response.type == 'rollback' && candidateKind) {
        state.packages[candidateKind] = previousPackage;
        rolledBack = true;
        provisionalByKind[candidateKind] = Math.max(0, provisionalByKind[candidateKind] - 1);
        rebuildIndex();
        notify();
      }
    }
    // Пул создаётся только после prepared по сообщению index-begin, чтобы его
    // запуск не конкурировал с разбором контейнера и публикацией дерева.
    const workers = indexPoolBroken ? 0 : requestedIndexWorkers;
    const requestPayload = Object.assign({}, payload || {}, { indexWorkers: workers });
    operation = request(type, requestPayload, progress).then(function (response) {
      const result = response.payload;
      assignPackage(result, false);
      provisionalByKind[result.kind] = Math.max(0, provisionalByKind[result.kind] - 1);
      releaseLoading(result.kind);
      Object.keys(trackedLoading).forEach(releaseLoading);
      errorsByKind[result.kind] = null;
      return { ok: true, kind: result.kind, pages: result.pages, error: null };
    }).catch(function (error) {
      if (!candidateKind && PACKAGE_KINDS.indexOf(error && error.kind) >= 0)
        candidateKind = error.kind;
      if (candidatePrepared && candidateKind && !rolledBack) {
        state.packages[candidateKind] = previousPackage;
        rebuildIndex();
        provisionalByKind[candidateKind] = Math.max(0, provisionalByKind[candidateKind] - 1);
      }
      const message = error && error.message ? error.message : String(error);
      const errorKinds = candidateKind ? [candidateKind] : Object.keys(trackedLoading);
      Object.keys(trackedLoading).forEach(releaseLoading);
      errorKinds.forEach(function (kind) { errorsByKind[kind] = message; });
      return { ok: false, kind: null, pages: 0, error: message };
    }).then(function (result) {
      notify();
      return result;
    });
    return operation;
  }

  function parse(source, onPrepared) {
    const isBlob = source && typeof source.size == 'number' && typeof source.slice == 'function';
    if (!isBlob && typeof source != 'string')
      return fail('parseHelp принимает Blob, File или строку Base64');
    const namedKind = kindFromName(source && source.name);
    return parseRequest('parse', { source: source }, namedKind ? [namedKind] : activeKinds.slice(), onPrepared);
  }

  function beginTransfer(name) {
    if (typeof name != 'string' || !name.trim())
      throw new Error('beginBase64Transfer принимает непустое имя данных');
    post('transfer-begin', { name: name.trim() });
    transferKind = kindFromName(name);
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

  function parseTransferred(onPrepared) {
    if (transferActive)
      return fail('Передача Base64 ещё не завершена');
    if (transferWorkerError) {
      if (transferKind) {
        errorsByKind[transferKind] = transferWorkerError;
        notify();
      }
      return fail(transferWorkerError);
    }
    if (!transferEnded)
      return fail('Нет завершённой передачи Base64');
    return parseRequest('parse-transferred', null, transferKind ? [transferKind] : activeKinds.slice(), onPrepared);
  }

  function setKinds(kinds) {
    const next = normalizedKinds(kinds);
    if (next.join('|') == activeKinds.join('|')) return;
    activeKinds = next;
    scopeSequence++;
    rebuildIndex();
    notify();
  }

  function isActive(kind) {
    return activeKinds.indexOf(kind) >= 0;
  }

  return {
    parse: parse,
    parseTransferred: parseTransferred,
    beginTransfer: beginTransfer,
    pushTransfer: pushTransfer,
    endTransfer: endTransfer,
    fail: fail,
    setKinds: setKinds,
    getState: snapshot,
    isReady: function () { return snapshot().status == 'ready'; },
    isKindActive: isActive,
    subscribe: function (listener) {
      listeners.push(listener);
      return function () {
        const index = listeners.indexOf(listener);
        if (0 <= index) listeners.splice(index, 1);
      };
    },
    getNavigation: function () {
      let result = [];
      activeKinds.forEach(function (kind) {
        if (state.packages[kind]) result = result.concat(state.packages[kind].navigation);
      });
      return result;
    },
    getIndex: function () {
      return visibleIndex;
    },
    prefix: function (query) { return prefixSearch(prefixIndex, query, 1000); },
    search: function (query) {
      const kinds = activeKinds.slice();
      const scope = scopeSequence;
      const barriers = kinds.map(function (kind) { return parseBarriers[kind] || Promise.resolve(); });
      return Promise.all(barriers).then(function () {
        if (scope != scopeSequence) throw new Error('Режим справки изменился');
        return searchIndexPool(query, 1000, kinds);
      }).then(function (result) {
        if (scope != scopeSequence) throw new Error('Режим справки изменился');
        return result;
      });
    },
    hydrate: function (item) {
      const kind = item && item.kind;
      const pack = kind && state.packages[kind];
      const scope = scopeSequence;
      if (!pack || !item || !isActive(kind))
        return Promise.reject(new Error('Узел оглавления недоступен'));
      const tocId = item.tocId || item.id;
      return request('navigation-children', {
        kind: kind, generation: pack.generation, tocId: tocId
      }).then(function (response) {
        const result = response.payload;
        if (scope != scopeSequence || !isActive(result.kind))
          throw new Error('Режим справки изменился');
        const current = state.packages[result.kind];
        if (!current || current.generation != result.generation)
          throw new Error('Поколение справки изменилось');
        function replace(nodes) {
          for (let index = 0; index < nodes.length; index++) {
            const node = nodes[index];
            if (node.tocId == result.tocId || node.id == result.tocId) {
              node.children = result.children;
              node.childrenHydrated = true;
              return true;
            }
            if (replace(node.children || [])) return true;
          }
          return false;
        }
        replace(current.navigation || []);
        return result.children;
      });
    },
    article: function (item, terms) {
      const scope = scopeSequence;
      if (!item || !isActive(item.kind))
        return Promise.reject(new Error('Статья недоступна в текущем режиме'));
      return request('article', {
        pageId: item.id || null, kind: item.kind, path: item.path, terms: terms || []
      }).then(function (response) {
        if (scope != scopeSequence || !isActive(response.payload.kind))
          throw new Error('Режим справки изменился');
        return response.payload;
      });
    },
    dispose: function () {
      if (worker) worker.terminate();
      worker = null;
      (indexPool || []).forEach(function (item) {
        try { item.terminate(); } catch (ignore) { /* noop */ }
      });
      indexPool = null;
      transferActive = false;
      transferEnded = false;
      transferWorkerError = null;
      transferKind = null;
      completeAll('Сервис справки остановлен');
    }
  };
}

export { createHelpService };
