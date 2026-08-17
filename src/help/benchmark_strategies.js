import {
  STRATEGY_TOC_LAZY, catalogPages, baseCandidate, decorate, rebuildPrefix,
  createTocLazyCandidate
} from './package_builder';
import { parseNativeIndex, nativePrefixItems } from './native_index';

const STRATEGY_EAGER = 'eager-html';
const STRATEGY_NATIVE_LAZY = 'native-index-lazy';

function createBenchmarkCandidate(parsed, strategy) {
  const selected = strategy || STRATEGY_TOC_LAZY;
  if (selected == STRATEGY_TOC_LAZY)
    return createTocLazyCandidate(parsed);
  if (selected == STRATEGY_EAGER)
    return baseCandidate(parsed, selected, {});
  if (selected != STRATEGY_NATIVE_LAZY)
    throw new Error('Неизвестная стратегия HBK: ' + selected);
  const candidate = baseCandidate(parsed, selected, catalogPages(parsed));
  if (parsed.kind == 'context') {
    candidate.nativeIndex = parseNativeIndex(parsed.entities || {});
    candidate.nativePrefixItems = nativePrefixItems;
  }
  decorate(candidate);
  rebuildPrefix(candidate);
  candidate.pageCount = Object.keys(candidate.pages).length;
  return candidate;
}

export { STRATEGY_EAGER, STRATEGY_TOC_LAZY, STRATEGY_NATIVE_LAZY, createBenchmarkCandidate };
