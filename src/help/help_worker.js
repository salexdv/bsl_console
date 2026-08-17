import { readHbk, decodeUtf8 } from './hbk-reader';
import { searchDocuments } from './search';
import { decodeBase64 } from '../base64';
import { createBase64TransferManager } from '../base64_transfer';
import { resolvePage } from './navigation';
import {
  createTocLazyCandidate, indexPackageBatch, packageSummary
} from './package_builder';

const packages = { context: null, language: null };
const candidates = { context: null, language: null };
const base64Transfer = createBase64TransferManager();
const transferState = { ended: false, error: null };
let parseQueue = Promise.resolve();

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

function send(id, type, payload) {
  self.postMessage({ id: id, type: type, payload: payload });
}

function parseMessage(message) {
  return readSource(message.source).then(function (input) {
    const parsed = readHbk(input.buffer);
    const candidate = createTocLazyCandidate(parsed);
    candidate.blob = input.blob;
    candidates[candidate.kind] = candidate;
    send(message.id, 'prepared', packageSummary(candidate));
    return new Promise(function (resolve) {
      function nextBatch() {
        try {
          if (!indexPackageBatch(candidate, 12)) {
            setTimeout(nextBatch, 0);
            return;
          }
          packages[candidate.kind] = candidate;
          candidates[candidate.kind] = null;
          send(message.id, 'parsed', packageSummary(candidate));
        }
        catch (error) {
          candidates[candidate.kind] = null;
          send(message.id, 'rollback', { kind: candidate.kind });
          send(message.id, 'error', { message: errorMessage(error) });
        }
        resolve();
      }
      setTimeout(nextBatch, 0);
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
  }
};
