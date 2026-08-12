import { readHbk, normalizePath, decodeUtf8 } from './hbk-reader';
import { buildSearchDocument, preparePrefixIndex, searchDocuments } from './search';
import { decodeBase64 } from '../base64';
import { createBase64TransferManager } from '../base64_transfer';
import { decorateContextNavigation, resolvePage } from './navigation';

const packages = { context: null, language: null };
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

function htmlText(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ').trim();
}

function htmlTitle(html, fallback) {
  const match = /<h1\b[^>]*class\s*=\s*["']?[^>"']*V8SH_pagetitle[^>]*>([\s\S]*?)<\/h1\s*>/i.exec(html)
    || /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
  return match ? htmlText(match[1]) : fallback;
}

function genericValue(source) {
  const tokens = [];
  let pos = source.charCodeAt(0) == 0xfeff ? 1 : 0;
  while (pos < source.length) {
    const c = source.charAt(pos);
    if (/\s/.test(c)) { pos++; continue; }
    if (c == '{' || c == '}' || c == ',') { tokens.push(c); pos++; continue; }
    if (c == '"') {
      let value = ''; pos++;
      while (pos < source.length) {
        if (source.charAt(pos) != '"') { value += source.charAt(pos++); continue; }
        if (source.charAt(pos + 1) == '"') { value += '"'; pos += 2; continue; }
        pos++; break;
      }
      tokens.push({ value: value }); continue;
    }
    const match = /^\d+/.exec(source.slice(pos));
    if (!match) throw new Error('HBK: повреждён __categories__');
    tokens.push({ value: Number(match[0]) }); pos += match[0].length;
  }
  pos = 0;
  function parse() {
    if (tokens[pos] == '{') {
      pos++;
      const result = [];
      if (tokens[pos] != '}') {
        result.push(parse());
        while (tokens[pos] == ',') { pos++; result.push(parse()); }
      }
      if (tokens[pos++] != '}') throw new Error('HBK: повреждён __categories__');
      return result;
    }
    const token = tokens[pos++];
    if (!token || token.value === undefined) throw new Error('HBK: повреждён __categories__');
    return token.value;
  }
  const result = parse();
  if (pos != tokens.length) throw new Error('HBK: хвост в __categories__');
  return result;
}

function buildLanguageNavigation(categories, pages) {
  const parsed = genericValue(categories);
  const names = [];
  const declared = Number(parsed[0]) || 0;
  for (let i = 1; i + 2 < parsed.length && names.length < declared; i += 3) {
    if (typeof parsed[i] == 'string')
      names.push(parsed[i]);
  }
  const children = [];
  names.forEach(function (name) {
    const page = pages['language:' + normalizePath(name)];
    if (page)
      children.push({ id: page.id, title: page.title, path: page.path, kind: 'language', children: [] });
  });
  const index = pages['language:index'];
  return [{
    id: index ? index.id : 'language:index',
    title: index ? index.title : 'Встроенный язык',
    path: 'index',
    kind: 'language',
    children: children
  }];
}

function buildPackage(parsed) {
  const storage = parsed.storage;
  const pages = {};
  const documents = [];
  let htmlCount = 0;
  storage.entries.forEach(function (entry) {
    const data = storage.extract(entry); // Одновременно строгая проверка размера и CRC всех записей.
    const path = normalizePath(entry.name);
    if (!/\.html$/i.test(path) && parsed.kind != 'language')
      return;
    if (parsed.kind == 'language' && (/\.st$/i.test(path) || path == '__categories__'
      || /^IndexPackLookup(?:Temp)?$/i.test(path)))
      return;
    const html = decodeUtf8(data);
    if (!/<html\b|<body\b|<h1\b/i.test(html))
      return;
    const id = parsed.kind + ':' + path;
    const fallback = path.split('/').pop().replace(/\.html$/i, '');
    const page = { id: id, kind: parsed.kind, path: path, title: htmlTitle(html, fallback), alias: '', text: htmlText(html), entry: entry };
    pages[id] = page;
    documents.push(buildSearchDocument(page));
    delete page.text;
    htmlCount++;
  });

  let navigation;
  if (parsed.kind == 'context') {
    navigation = parsed.toc.roots;
    decorateContextNavigation(navigation, pages);
  }
  else {
    navigation = buildLanguageNavigation(parsed.categoriesText, pages);
    Object.keys(pages).forEach(function (key) {
      const page = pages[key];
      page.context = 'Встроенный язык/' + page.title;
    });
  }

  const index = preparePrefixIndex(Object.keys(pages).map(function (key) {
    const page = pages[key];
    return { id: page.id, title: page.title, path: page.path, kind: page.kind, context: page.context || '' };
  }));

  return {
    kind: parsed.kind,
    storage: storage,
    pages: pages,
    documents: documents,
    navigation: navigation,
    index: index,
    pageCount: htmlCount,
    zipEntries: storage.entries.length,
    tocNodes: parsed.toc ? parsed.toc.count : navigation[0].children.length
  };
}

function allDocuments() {
  let result = [];
  if (packages.context) result = result.concat(packages.context.documents);
  if (packages.language) result = result.concat(packages.language.documents);
  return result;
}

function findPage(kind, path, id) {
  const pack = packages[kind];
  if (!pack) return null;
  return resolvePage(pack.pages, kind, path, id);
}

function send(id, type, payload) {
  self.postMessage({ id: id, type: type, payload: payload });
}

function parseMessage(message) {
  return readSource(message.source).then(function (input) {
    const parsed = readHbk(input.buffer);
    const candidate = buildPackage(parsed);
    candidate.blob = input.blob;
    packages[candidate.kind] = candidate;
    send(message.id, 'parsed', {
      kind: candidate.kind,
      pages: candidate.pageCount,
      navigation: candidate.navigation,
      index: candidate.index,
      stats: { zipEntries: candidate.zipEntries, htmlPages: candidate.pageCount, tocNodes: candidate.tocNodes }
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
    try { send(message.id, 'search', searchDocuments(allDocuments(), message.query, 1000)); }
    catch (error) { send(message.id, 'error', { message: error.message }); }
    return;
  }
  if (message.type == 'article') {
    try {
      const page = findPage(message.kind, message.path, message.pageId);
      if (!page) throw new Error('Статья не найдена');
      const pack = packages[page.kind];
      send(message.id, 'article', {
        id: page.id, kind: page.kind, path: page.path, title: page.title,
        html: decodeUtf8(pack.storage.extract(page.entry)), terms: message.terms || []
      });
    }
    catch (error) { send(message.id, 'error', { message: error.message }); }
  }
};
