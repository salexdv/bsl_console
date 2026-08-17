import { inflatePayload } from './zip';
import { decodeUtf8 } from './hbk-reader';
import { htmlText, htmlTitle } from './package_builder';
import { buildSearchDocument, searchDocuments } from './search';

const committed = { context: [], language: [], query: [], dcs: [] };
const candidates = {};
const staged = {};

function send(type, payload) {
  self.postMessage({ type: type, payload: payload });
}

function errorMessage(error) {
  return error && error.message ? error.message : String(error);
}

function begin(message) {
  candidates[message.generation] = { kind: message.kind, documents: [] };
}

function processBatch(message) {
  const candidate = candidates[message.generation];
  if (!candidate || candidate.kind != message.kind)
    throw new Error('Поколение индекса HBK не найдено');
  const packed = new Uint8Array(message.buffer);
  const pages = [];
  (message.entries || []).forEach(function (entry) {
    const source = packed.subarray(entry.offset, entry.offset + entry.length);
    const data = inflatePayload(source, entry);
    if (!entry.page) return;
    const html = decodeUtf8(data);
    if (!/<html\b|<body\b|<h1\b/i.test(html)) return;
    const title = htmlTitle(html, entry.title || entry.fallbackTitle);
    candidate.documents.push(buildSearchDocument({
      id: entry.id, kind: entry.kind, path: entry.path,
      title: title, alias: entry.alias || '', text: htmlText(html), ordinal: entry.ordinal
    }));
    pages.push({ id: entry.id, title: title, ordinal: entry.ordinal });
  });
  send('index-result', {
    requestId: message.requestId, generation: message.generation,
    batchId: message.batchId, pages: pages
  });
}

function commit(message) {
  const candidate = candidates[message.generation];
  if (!candidate || candidate.kind != message.kind)
    throw new Error('Поколение индекса HBK не найдено');
  staged[message.generation] = { kind: candidate.kind, previous: committed[candidate.kind] };
  committed[candidate.kind] = candidate.documents;
  delete candidates[message.generation];
  send('index-commit-result', { requestId: message.requestId, generation: message.generation });
}

function cancel(message) {
  delete candidates[message.generation];
  const pending = staged[message.generation];
  if (pending) {
    committed[pending.kind] = pending.previous;
    delete staged[message.generation];
  }
}

function finalize(message) {
  delete staged[message.generation];
}

self.onmessage = function (event) {
  const message = event.data || {};
  try {
    if (message.type == 'index-begin') begin(message);
    else if (message.type == 'index-batch') processBatch(message);
    else if (message.type == 'index-commit') commit(message);
    else if (message.type == 'index-cancel') cancel(message);
    else if (message.type == 'index-finalize') finalize(message);
    else if (message.type == 'search') {
      let documents = [];
      (message.kinds || Object.keys(committed)).forEach(function (kind) {
        if (committed[kind]) documents = documents.concat(committed[kind]);
      });
      send('search-result', {
        searchId: message.searchId,
        result: searchDocuments(documents, message.query, message.limit)
      });
    }
  }
  catch (error) {
    send('index-error', {
      requestId: message.requestId, generation: message.generation,
      batchId: message.batchId, message: errorMessage(error)
    });
  }
};
