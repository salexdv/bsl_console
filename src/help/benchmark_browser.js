import { benchmarkBuffer } from './benchmark_api';
import { decodeBase64 } from '../base64';
import { createBase64TransferManager } from '../base64_transfer';
import { createHelpService } from './service';

// Отдельная development-страница; в production и публичный мост редактора не входит.
window.runHelpHbkBenchmark = function (buffer, strategy) {
  return benchmarkBuffer(buffer, strategy);
};

function signature(items) {
  let hash = 2166136261;
  (items || []).forEach(function (item) {
    const value = (item.id || '') + ':' + (item.title || '');
    for (let index = 0; index < value.length; index++) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  });
  return (hash >>> 0).toString(16);
}

function flattenNavigation(nodes, result) {
  (nodes || []).forEach(function (node) {
    result.push(node);
    flattenNavigation(node.children, result);
  });
  return result;
}

window.runHelpWorkerBenchmark = function (buffer, workers) {
  const service = createHelpService(undefined, undefined, workers);
  const started = performance.now();
  let navigationAt = 0;
  let navigationResolve;
  const navigationReady = new Promise(function (resolve) { navigationResolve = resolve; });
  const unsubscribe = service.subscribe(function (state) {
    if (!navigationAt && state.indexing && state.packages.context) {
      navigationAt = performance.now();
      navigationResolve();
    }
  });
  const parsed = service.parse(new Blob([buffer]));
  let articleMs = 0;
  return navigationReady.then(function () {
    const navigation = service.getNavigation();
    const first = flattenNavigation(navigation, []).filter(function (item) { return item.path; })[0];
    const articleAt = performance.now();
    return service.article(first, []).then(function () { articleMs = performance.now() - articleAt; });
  }).then(function () {
    return parsed;
  }).then(function (result) {
    const fullAt = performance.now();
    const prefixAt = performance.now();
    const prefix = service.prefix('стр');
    const prefixMs = performance.now() - prefixAt;
    const searchAt = performance.now();
    return service.search('строка').then(function (search) {
      const navigation = flattenNavigation(service.getNavigation(), []);
      return {
        workers: workers, parseMs: navigationAt - started,
        navigationReadyMs: navigationAt - started,
        firstArticleMs: articleMs, fullReadyMs: fullAt - started,
        prefixSearchMs: prefixMs, fullTextSearchMs: performance.now() - searchAt,
        pages: result.pages, navigationSignature: signature(navigation),
        prefixSignature: signature(prefix.items), searchSignature: signature(search.items),
        searchMatches: search.total
      };
    });
  }).then(function (result) {
    unsubscribe(); service.dispose(); return result;
  }, function (error) {
    unsubscribe(); service.dispose(); throw error;
  });
};

function bytesBase64(bytes) {
  let binary = '';
  const step = 32768;
  for (let offset = 0; offset < bytes.length; offset += step) {
    const part = bytes.subarray(offset, Math.min(bytes.length, offset + step));
    let text = '';
    for (let index = 0; index < part.length; index++) text += String.fromCharCode(part[index]);
    binary += text;
  }
  return btoa(binary);
}

window.prepareHelpTransferBenchmark = function (buffer) {
  const bytes = new Uint8Array(buffer);
  const encoded = bytesBase64(bytes);
  const binaryChunks = [];
  for (let offset = 0; offset < bytes.length; offset += 1024 * 1024)
    binaryChunks.push(bytesBase64(bytes.subarray(offset, Math.min(bytes.length, offset + 1024 * 1024))));
  window.__helpTransferData = { buffer: buffer, encoded: encoded, binaryChunks: binaryChunks };
};

window.runHelpTransferBenchmark = function (channel) {
  const data = window.__helpTransferData;
  const started = performance.now();
  if (channel == 'file-blob')
    return new Blob([data.buffer]).arrayBuffer().then(function () { return performance.now() - started; });
  if (channel == 'whole-base64') {
    decodeBase64(data.encoded);
    return Promise.resolve(performance.now() - started);
  }
  const manager = createBase64TransferManager();
  manager.begin(channel);
  if (channel == 'base64-fragments') {
    for (let offset = 0; offset < data.encoded.length; offset += 262141)
      manager.push(data.encoded.slice(offset, offset + 262141));
  }
  else {
    data.binaryChunks.forEach(function (chunk) { manager.push(chunk); });
  }
  manager.end();
  return manager.getReady().blob.arrayBuffer().then(function () { return performance.now() - started; });
};
