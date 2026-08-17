import { readHbk, decodeUtf8, normalizePath } from './hbk-reader';
import { searchDocuments } from './search';
import { decodeBase64 } from '../base64';
import { createBase64TransferManager } from '../base64_transfer';
import { resolvePage } from './navigation';
import {
  createTocLazyCandidate, hydrateNavigationChildren, finishPackage,
  indexPackageBatch, packageSummary
} from './package_builder';

const packages = { context: null, language: null };
const candidates = { context: null, language: null };
const base64Transfer = createBase64TransferManager();
const transferState = { ended: false, error: null };
let parseQueue = Promise.resolve();
let generationSequence = 0;
const indexJobs = {};
const INDEX_BATCH_BYTES = 512 * 1024;
const INDEX_BATCH_ENTRIES = 128;

function readBlob(blob) {
  if (blob && typeof blob.arrayBuffer == 'function')
    return blob.arrayBuffer();
  if (typeof FileReaderSync != 'undefined') {
    try {
      return Promise.resolve(new FileReaderSync().readAsArrayBuffer(blob));
    }
    catch (error) {
      return Promise.reject(error);
    }
  }
  return Promise.reject(new Error('Blob не поддерживается этим движком'));
}

function readSource(source) {
  if (typeof source == 'string') {
    try {
      const bytes = decodeBase64(source);
      return Promise.resolve({
        buffer: bytes.buffer,
        blob: new Blob([bytes], { type: 'application/octet-stream' })
      });
    }
    catch (error) {
      return Promise.reject(error);
    }
  }
  return readBlob(source).then(function (buffer) { return { buffer: buffer, blob: source }; });
}

function allDocuments() {
  let result = [];
  if (packages.context) result = result.concat(packages.context.documents);
  if (packages.language) result = result.concat(packages.language.documents);
  return result;
}

function visiblePackage(kind) {
  return candidates[kind] || packages[kind];
}

function findPage(kind, path, id) {
  const pack = visiblePackage(kind);
  if (!pack) return null;
  return resolvePage(pack.pages, kind, path, id);
}

function send(id, type, payload, transfer) {
  self.postMessage({ id: id, type: type, payload: payload }, transfer || []);
}

function localIndex(id, candidate, resolve) {
  function nextBatch() {
    try {
      if (!indexPackageBatch(candidate, 12)) {
        setTimeout(nextBatch, 0);
        return;
      }
      packages[candidate.kind] = candidate;
      candidates[candidate.kind] = null;
      send(id, 'parsed', packageSummary(candidate));
    }
    catch (error) {
      candidates[candidate.kind] = null;
      send(id, 'rollback', { kind: candidate.kind, generation: candidate.generation });
      send(id, 'error', { message: errorMessage(error) });
    }
    resolve();
  }
  setTimeout(nextBatch, 0);
}

function buildIndexBatch(candidate) {
  const entries = candidate.storage.entries;
  const selected = [];
  let total = 0;
  while (candidate.cursor < entries.length && selected.length < INDEX_BATCH_ENTRIES) {
    const entry = entries[candidate.cursor];
    if (selected.length && INDEX_BATCH_BYTES < total + entry.compressedSize)
      break;
    selected.push({ entry: entry, ordinal: candidate.cursor++ });
    total += entry.compressedSize;
  }
  if (!selected.length) return null;
  const buffer = new ArrayBuffer(total);
  const packed = new Uint8Array(buffer);
  const descriptors = [];
  let offset = 0;
  selected.forEach(function (selectedEntry) {
    const entry = selectedEntry.entry;
    packed.set(candidate.storage.data.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize), offset);
    const path = normalizePath(entry.name);
    const page = candidate.pages[candidate.kind + ':' + path];
    descriptors.push({
      offset: offset, length: entry.compressedSize,
      method: entry.method, crc: entry.crc,
      compressedSize: entry.compressedSize, uncompressedSize: entry.uncompressedSize,
      name: entry.name, page: !!page,
      id: page && page.id, kind: page && page.kind, path: page && page.path,
      title: page && page.title, fallbackTitle: page && page.title,
      alias: page && page.alias, ordinal: selectedEntry.ordinal
    });
    offset += entry.compressedSize;
  });
  return { buffer: buffer, entries: descriptors };
}

function dispatchIndexBatch(job, workerIndex) {
  const batch = buildIndexBatch(job.candidate);
  if (!batch) return false;
  const batchId = job.batchSequence++;
  job.inFlight++;
  send(job.id, 'index-batch', {
    requestId: job.id, generation: job.candidate.generation, kind: job.candidate.kind,
    batchId: batchId, workerIndex: workerIndex,
    entries: batch.entries, buffer: batch.buffer
  }, [batch.buffer]);
  return true;
}

function finishPooledIndex(job) {
  if (job.waitingCommit) return;
  finishPackage(job.candidate);
  job.waitingCommit = true;
  send(job.id, 'index-commit', {
    requestId: job.id, generation: job.candidate.generation, kind: job.candidate.kind
  });
}

function fallbackIndexJob(job) {
  if (!job || job.fallback) return;
  job.fallback = true;
  delete indexJobs[job.id];
  send(job.id, 'index-cancel', {
    requestId: job.id, generation: job.candidate.generation, kind: job.candidate.kind
  });
  job.candidate.cursor = 0;
  job.candidate.documents = [];
  job.candidate.complete = false;
  localIndex(job.id, job.candidate, job.resolve);
}

function restoreLocalDocuments() {
  Object.keys(packages).forEach(function (kind) {
    const pack = packages[kind];
    if (!pack || pack.documents.length) return;
    pack.cursor = 0;
    pack.documents = [];
    pack.complete = false;
    indexPackageBatch(pack, Infinity);
  });
}

function pooledIndex(id, candidate, workers, resolve) {
  const job = {
    id: id, candidate: candidate, workers: workers, resolve: resolve,
    inFlight: 0, batchSequence: 0, waitingCommit: false, fallback: false
  };
  indexJobs[id] = job;
  send(id, 'index-begin', {
    requestId: id, generation: candidate.generation, kind: candidate.kind, workers: workers
  });
  for (let workerIndex = 0; workerIndex < workers; workerIndex++)
    dispatchIndexBatch(job, workerIndex);
  if (!job.inFlight) finishPooledIndex(job);
}

function parseMessage(message) {
  return readSource(message.source).then(function (input) {
    const parsed = readHbk(input.buffer);
    const candidate = createTocLazyCandidate(parsed, ++generationSequence);
    candidate.blob = input.blob;
    candidates[candidate.kind] = candidate;
    send(message.id, 'prepared', packageSummary(candidate));
    return new Promise(function (resolve) {
      if (message.indexWorkers > 0)
        pooledIndex(message.id, candidate, message.indexWorkers, resolve);
      else localIndex(message.id, candidate, resolve);
    });
  }).catch(function (error) {
    send(message.id, 'error', { message: error && error.message ? error.message : String(error) });
  });
}

function errorMessage(error) {
  return error && error.message ? error.message : String(error);
}

function beginTransfer(message) {
  try {
    base64Transfer.begin(message.name);
    transferState.ended = false;
    transferState.error = null;
  }
  catch (error) {
    transferState.ended = false;
    transferState.error = errorMessage(error);
  }
}

function pushTransfer(message) {
  if (transferState.error) return;
  try { base64Transfer.push(message.chunk); }
  catch (error) { transferState.error = errorMessage(error); }
}

function endTransfer() {
  if (!transferState.error) {
    try { base64Transfer.end(); }
    catch (error) { transferState.error = errorMessage(error); }
  }
  transferState.ended = true;
}

function captureTransferredBlob() {
  if (!transferState.ended)
    throw new Error('Нет завершённой передачи Base64');
  if (transferState.error)
    throw new Error(transferState.error);
  const transferred = base64Transfer.getReady();
  if (!transferred)
    throw new Error('Нет завершённой передачи Base64');
  return transferred.blob;
}

self.onmessage = function (event) {
  const message = event.data || {};
  if (message.type == 'index-result') {
    const job = indexJobs[message.requestId];
    if (!job || job.fallback || job.candidate.generation != message.generation) return;
    (message.pages || []).forEach(function (result) {
      const page = job.candidate.pages[result.id];
      if (page) {
        page.title = result.title;
        page.titleResolved = true;
      }
    });
    job.inFlight--;
    dispatchIndexBatch(job, message.workerIndex);
    if (!job.inFlight && job.candidate.cursor >= job.candidate.storage.entries.length)
      finishPooledIndex(job);
    return;
  }
  if (message.type == 'index-committed') {
    const job = indexJobs[message.requestId];
    if (!job || job.fallback || job.candidate.generation != message.generation) return;
    packages[job.candidate.kind] = job.candidate;
    candidates[job.candidate.kind] = null;
    delete indexJobs[job.id];
    send(job.id, 'parsed', packageSummary(job.candidate));
    job.resolve();
    return;
  }
  if (message.type == 'index-pool-error') {
    try { restoreLocalDocuments(); }
    catch (error) { /* Ошибка проявится при следующем поиске или замене пакета. */ }
    fallbackIndexJob(indexJobs[message.requestId]);
    return;
  }
  if (message.type == 'index-error') {
    fallbackIndexJob(indexJobs[message.requestId]);
    return;
  }
  if (message.type == 'transfer-begin') {
    beginTransfer(message);
    return;
  }
  if (message.type == 'transfer-push') {
    pushTransfer(message);
    return;
  }
  if (message.type == 'transfer-end') {
    endTransfer();
    return;
  }
  if (message.type == 'parse-transferred') {
    let source;
    try { source = captureTransferredBlob(); }
    catch (error) {
      send(message.id, 'error', { message: errorMessage(error) });
      return;
    }
    const captured = { id: message.id, source: source };
    parseQueue = parseQueue.then(function () { return parseMessage(captured); });
    return;
  }
  if (message.type == 'parse') {
    parseQueue = parseQueue.then(function () { return parseMessage(message); });
    return;
  }
  if (message.type == 'search') {
    parseQueue.then(function () {
      try { send(message.id, 'search', searchDocuments(allDocuments(), message.query, 1000)); }
      catch (error) { send(message.id, 'error', { message: error.message }); }
    });
    return;
  }
  if (message.type == 'article') {
    try {
      const page = findPage(message.kind, message.path, message.pageId);
      if (!page) throw new Error('Статья не найдена');
      const pack = visiblePackage(page.kind);
      send(message.id, 'article', {
        id: page.id, kind: page.kind, path: page.path, title: page.title,
        html: decodeUtf8(pack.storage.extract(page.entry)), terms: message.terms || []
      });
    }
    catch (error) { send(message.id, 'error', { message: error.message }); }
    return;
  }
  if (message.type == 'navigation-children') {
    try {
      const pack = visiblePackage(message.kind);
      if (!pack || pack.generation != message.generation)
        throw new Error('Поколение справки изменилось');
      const children = hydrateNavigationChildren(pack, message.tocId);
      send(message.id, 'navigation-children', {
        kind: pack.kind, generation: pack.generation,
        tocId: message.tocId, children: children
      });
    }
    catch (error) { send(message.id, 'error', { message: error.message }); }
  }
};

export { buildIndexBatch };
