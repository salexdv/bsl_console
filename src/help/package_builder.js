import { normalizePath, decodeUtf8 } from './hbk-reader';
import { decorateContextNavigation, inferGroupTitle, findNavigationNode } from './navigation';
import { buildSearchDocument, preparePrefixIndex } from './search';
import { parseSerialized } from './serialized';

const STRATEGY_TOC_LAZY = 'toc-lazy';

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

function isPage(kind, path) {
  if (kind == 'context') return /\.html$/i.test(path);
  return !/\.st$/i.test(path) && path != '__categories__'
    && !/^IndexPackLookup(?:Temp)?$/i.test(path);
}

function fallbackTitle(path) {
  return path.split('/').pop().replace(/\.html$/i, '');
}

function pageFromEntry(kind, entry, ordinal) {
  const path = normalizePath(entry.name);
  return {
    id: kind + ':' + path, kind: kind, path: path,
    title: fallbackTitle(path), titleResolved: false, alias: '', context: '', entry: entry,
    ordinal: ordinal === undefined ? 0 : ordinal
  };
}

function catalogPages(parsed) {
  const pages = {};
  parsed.storage.entries.forEach(function (entry, ordinal) {
    const path = normalizePath(entry.name);
    if (!isPage(parsed.kind, path)) return;
    const page = pageFromEntry(parsed.kind, entry, ordinal);
    pages[page.id] = page;
  });
  return pages;
}

function buildLanguageNavigation(categories, pages) {
  const parsed = parseSerialized(categories, '__categories__');
  const names = [];
  const declared = Number(parsed[0]) || 0;
  for (let index = 1; index + 2 < parsed.length && names.length < declared; index += 3) {
    if (typeof parsed[index] == 'string') names.push(parsed[index]);
  }
  const children = [];
  names.forEach(function (name) {
    const page = pages['language:' + normalizePath(name)];
    if (page) children.push({ id: page.id, title: page.title, path: page.path, kind: 'language', children: [] });
  });
  const index = pages['language:index'];
  return [{
    id: index ? index.id : 'language:index',
    title: index ? index.title : 'Встроенный язык', path: 'index', kind: 'language', children: children
  }];
}

function cloneNavigation(nodes) {
  return (nodes || []).map(function (node) {
    const copy = {};
    Object.keys(node).forEach(function (key) {
      if (key != 'children') copy[key] = node[key];
    });
    copy.children = cloneNavigation(node.children);
    return copy;
  });
}

function decorate(candidate) {
  if (candidate.kind == 'context') {
    candidate.navigation = cloneNavigation(candidate.parsed.toc.roots);
    decorateContextNavigation(candidate.navigation, candidate.pages);
  }
  else {
    candidate.navigation = buildLanguageNavigation(candidate.parsed.categoriesText, candidate.pages);
    Object.keys(candidate.pages).forEach(function (key) {
      const page = candidate.pages[key];
      page.context = 'Встроенный язык/' + page.title;
    });
  }
}

function hydrateNavigationLevel(candidate, nodes) {
  if (candidate.kind != 'context') return nodes || [];
  (nodes || []).forEach(function (node) {
    if (node.titleHydrated) return;
    const path = normalizePath(node.path);
    const page = path ? candidate.pages['context:' + path] : null;
    let resolved = node.tocTitle || '';
    if (!resolved && page) {
      const html = decodeUtf8(candidate.storage.extract(page.entry));
      resolved = htmlTitle(html, '');
      if (resolved) {
        page.title = resolved;
        page.titleResolved = true;
      }
    }
    resolved = resolved || node.tocAlias || inferGroupTitle(node)
      || (page && page.title) || fallbackTitle(path);
    node.title = resolved;
    node.titleHydrated = true;
  });
  decorateContextNavigation(nodes, candidate.pages);
  return nodes || [];
}

function hydrateNavigationChildren(candidate, tocId) {
  const node = findNavigationNode(candidate.navigation, tocId);
  if (!node)
    throw new Error('HBK: узел оглавления не найден');
  if (!node.childrenHydrated) {
    hydrateNavigationLevel(candidate, node.children);
    node.childrenHydrated = true;
  }
  return node.children;
}

function visibleItems(candidate) {
  return Object.keys(candidate.pages).map(function (key) {
    const page = candidate.pages[key];
    return { id: page.id, title: page.title, path: page.path, kind: page.kind, context: page.context || '' };
  });
}

function rebuildPrefix(candidate) {
  let items = visibleItems(candidate);
  if (candidate.nativeIndex)
    items = items.concat(candidate.nativePrefixItems(candidate.nativeIndex, candidate.pages));
  candidate.index = preparePrefixIndex(items);
}

function baseCandidate(parsed, strategy, pages, generation) {
  return {
    strategy: strategy, kind: parsed.kind, parsed: parsed, storage: parsed.storage,
    pages: pages, documents: [], navigation: [], index: [], cursor: 0, complete: false,
    nativeIndex: null, nativePrefixItems: null, pageCount: 0,
    generation: generation || 0,
    zipEntries: parsed.storage.entries.length,
    tocNodes: parsed.toc ? parsed.toc.count : 0
  };
}

/** Единственная стратегия, импортируемая production-worker. */
function createTocLazyCandidate(parsed, generation) {
  const candidate = baseCandidate(parsed, STRATEGY_TOC_LAZY, catalogPages(parsed), generation);
  if (candidate.kind == 'context') {
    candidate.navigation = cloneNavigation(candidate.parsed.toc.roots);
    hydrateNavigationLevel(candidate, candidate.navigation);
  }
  else decorate(candidate);
  rebuildPrefix(candidate);
  candidate.pageCount = Object.keys(candidate.pages).length;
  return candidate;
}

function indexOne(candidate, entry) {
  const data = candidate.storage.extract(entry); // Полная проверка размера и CRC.
  const path = normalizePath(entry.name);
  if (!isPage(candidate.kind, path)) return;
  const html = decodeUtf8(data);
  if (!/<html\b|<body\b|<h1\b/i.test(html)) return;
  const id = candidate.kind + ':' + path;
  let page = candidate.pages[id];
  if (!page) {
    page = pageFromEntry(candidate.kind, entry, candidate.cursor - 1);
    candidate.pages[id] = page;
  }
  page.title = htmlTitle(html, page.title || fallbackTitle(path));
  page.titleResolved = true;
  const searchPage = {
    id: page.id, kind: page.kind, path: page.path,
    title: page.title, alias: page.alias || '', text: htmlText(html), ordinal: page.ordinal
  };
  candidate.documents.push(buildSearchDocument(searchPage));
}

function finishPackage(candidate) {
  decorate(candidate);
  function markComplete(nodes) {
    (nodes || []).forEach(function (node) {
      node.titleHydrated = true;
      node.childrenHydrated = true;
      markComplete(node.children);
    });
  }
  markComplete(candidate.navigation);
  rebuildPrefix(candidate);
  candidate.pageCount = Object.keys(candidate.pages).length;
  candidate.tocNodes = candidate.parsed.toc ? candidate.parsed.toc.count
    : (candidate.navigation[0] ? candidate.navigation[0].children.length : 0);
  candidate.complete = true;
  return candidate;
}

/** Выполняет часть полной проверки. Возвращает true после завершения. */
function indexPackageBatch(candidate, budgetMs) {
  const started = Date.now();
  const budget = budgetMs === undefined ? Infinity : Math.max(1, budgetMs);
  while (candidate.cursor < candidate.storage.entries.length) {
    indexOne(candidate, candidate.storage.entries[candidate.cursor++]);
    if (Date.now() - started >= budget) return false;
  }
  finishPackage(candidate);
  return true;
}

function indexPackage(candidate) {
  indexPackageBatch(candidate, Infinity);
  return candidate;
}

function packageSummary(candidate) {
  return {
    kind: candidate.kind, pages: candidate.pageCount, generation: candidate.generation,
    navigation: candidate.navigation, index: candidate.index,
    stats: {
      strategy: candidate.strategy, zipEntries: candidate.zipEntries,
      htmlPages: candidate.pageCount, tocNodes: candidate.tocNodes
    }
  };
}

export {
  STRATEGY_TOC_LAZY, htmlText, htmlTitle,
  catalogPages, baseCandidate, decorate, rebuildPrefix, createTocLazyCandidate,
  hydrateNavigationLevel, hydrateNavigationChildren, finishPackage,
  indexPackageBatch, indexPackage, packageSummary
};
