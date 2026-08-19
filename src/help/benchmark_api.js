import { readHbk, decodeUtf8 } from './hbk-reader';
import {
  indexPackage, packageSummary
} from './package_builder';
import { prefixSearch, searchDocuments } from './search';
import {
  STRATEGY_EAGER, STRATEGY_TOC_LAZY, STRATEGY_NATIVE_LAZY, createBenchmarkCandidate
} from './benchmark_strategies';

function now() {
  return typeof performance != 'undefined' && performance.now ? performance.now() : Date.now();
}

function firstPage(candidate) {
  const keys = Object.keys(candidate.pages);
  return keys.length ? candidate.pages[keys[0]] : null;
}

function resultSignature(items) {
  let hash = 2166136261;
  items.forEach(function (item) {
    const value = item.id + ':' + item.title;
    for (let index = 0; index < value.length; index++) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  });
  return (hash >>> 0).toString(16);
}

function benchmarkBuffer(value, strategy) {
  const started = now();
  const parsed = readHbk(value);
  const parsedAt = now();
  const candidate = createBenchmarkCandidate(parsed, strategy);
  const initialAt = now();
  let articleMs = null;
  if (strategy != STRATEGY_EAGER) {
    const page = firstPage(candidate);
    if (page) {
      const articleAt = now();
      decodeUtf8(candidate.storage.extract(page.entry));
      articleMs = now() - articleAt;
    }
  }
  indexPackage(candidate);
  const completeAt = now();
  if (articleMs === null) {
    const page = firstPage(candidate);
    if (page) {
      const articleAt = now();
      decodeUtf8(candidate.storage.extract(page.entry));
      articleMs = now() - articleAt;
    }
  }
  const prefixAt = now();
  const prefix = prefixSearch(candidate.index, 'стр', 1000);
  const prefixMs = now() - prefixAt;
  const searchAt = now();
  const search = searchDocuments(candidate.documents, 'строка', 1000);
  const searchMs = now() - searchAt;
  const summary = packageSummary(candidate);
  return {
    strategy: strategy, kind: candidate.kind,
    parseMs: parsedAt - started,
    navigationReadyMs: (strategy == STRATEGY_EAGER ? completeAt : initialAt) - started,
    initialBuildMs: initialAt - parsedAt,
    firstArticleMs: articleMs,
    fullReadyMs: completeAt - started,
    prefixSearchMs: prefixMs, fullTextSearchMs: searchMs,
    pages: summary.pages, zipEntries: summary.stats.zipEntries,
    tocNodes: summary.stats.tocNodes, prefixMatches: prefix.total,
    prefixSignature: resultSignature(prefix.items),
    searchMatches: search.total,
    nativeRecords: candidate.nativeIndex ? candidate.nativeIndex.records.length : 0,
    lookupEntries: candidate.nativeIndex ? candidate.nativeIndex.lookup.length : 0
  };
}

export {
  STRATEGY_EAGER, STRATEGY_TOC_LAZY, STRATEGY_NATIVE_LAZY, benchmarkBuffer
};
