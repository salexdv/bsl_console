function normalize(value) {
  return String(value || '').toLocaleLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9_]+/gi, ' ').trim();
}

function words(value) {
  const text = normalize(value);
  return text ? text.split(/\s+/) : [];
}

function buildSearchDocument(page) {
  return {
    id: page.id,
    title: page.title,
    path: page.path,
    kind: page.kind,
    ordinal: page.ordinal === undefined ? 0 : page.ordinal,
    titleText: normalize(page.title + ' ' + (page.alias || '')),
    bodyText: normalize(page.text || '')
  };
}

function searchDocuments(documents, query, limit) {
  const terms = words(query);
  const max = limit === undefined ? 1000 : limit;
  if (!terms.length)
    return { total: 0, items: [], terms: [] };
  const matches = [];
  documents.forEach(function (document) {
    let score = 0;
    for (let i = 0; i < terms.length; i++) {
      const term = terms[i];
      const titleAt = document.titleText.indexOf(term);
      const bodyAt = document.bodyText.indexOf(term);
      if (titleAt < 0 && bodyAt < 0)
        return;
      if (0 <= titleAt)
        score += 10000 - Math.min(titleAt, 1000);
      if (0 <= bodyAt)
        score += 1000 - Math.min(bodyAt, 900);
    }
    matches.push({ id: document.id, title: document.title, path: document.path, kind: document.kind,
      score: score, ordinal: document.ordinal });
  });
  matches.sort(function (a, b) {
    return b.score - a.score || a.title.localeCompare(b.title) || a.ordinal - b.ordinal;
  });
  return { total: matches.length, items: matches.slice(0, max), terms: terms };
}

function comparePrefixEntries(a, b) {
  if (a.key < b.key) return -1;
  if (b.key < a.key) return 1;
  return 0;
}

function preparePrefixIndex(items) {
  return (items || []).map(function (item, order) {
    return { key: normalize(item.title), ctx: normalize(item.context), item: item, order: order };
  }).sort(function (a, b) {
    return comparePrefixEntries(a, b) || a.order - b.order;
  }).map(function (entry) {
    return { key: entry.key, ctx: entry.ctx, item: entry.item };
  });
}

function mergePrefixIndexes(left, right) {
  const first = left || [];
  const second = right || [];
  const result = [];
  let leftAt = 0;
  let rightAt = 0;
  while (leftAt < first.length && rightAt < second.length) {
    if (comparePrefixEntries(first[leftAt], second[rightAt]) <= 0)
      result.push(first[leftAt++]);
    else
      result.push(second[rightAt++]);
  }
  while (leftAt < first.length) result.push(first[leftAt++]);
  while (rightAt < second.length) result.push(second[rightAt++]);
  return result;
}

function lowerPrefixBound(entries, value) {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (entries[middle].key < value) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** Каждое из слов должно быть префиксом слова нормализованного контекста. */
function contextMatchesWords(ctx, terms) {
  const value = ctx || '';
  for (let i = 0; i < terms.length; i++) {
    const term = terms[i];
    if (value.indexOf(term) != 0 && value.indexOf(' ' + term) < 0)
      return false;
  }
  return true;
}

function prefixSearch(items, query, limit) {
  const prefix = normalize(query);
  const max = limit === undefined ? 1000 : limit;
  const entries = items && items.length && typeof items[0].key == 'string' && items[0].item
    ? items : preparePrefixIndex(items);
  let first = 0;
  let last = entries.length;
  if (prefix) {
    first = lowerPrefixBound(entries, prefix);
    last = lowerPrefixBound(entries, prefix + '\uffff');
  }
  const visible = Math.min(last, first + max);
  if (!prefix) {
    const result = [];
    for (let i = first; i < visible; i++) result.push(entries[i].item);
    return { total: entries.length, items: result };
  }
  const terms = prefix.split(' ');
  if (terms.length < 2) {
    const result = [];
    for (let i = first; i < visible; i++) result.push(entries[i].item);
    return { total: last - first, items: result };
  }
  // Запрос из нескольких слов: первое слово — префикс заголовка,
  // остальные — префиксы слов контекста; строки с полным префиксом
  // заголовка включаются без проверки контекста.
  const wordLast = lowerPrefixBound(entries, terms[0] + '\uffff');
  const rest = terms.slice(1);
  const result = [];
  let total = 0;
  for (let i = lowerPrefixBound(entries, terms[0]); i < wordLast; i++) {
    if ((i < first || i >= last) && !contextMatchesWords(entries[i].ctx, rest))
      continue;
    total++;
    if (result.length < max) result.push(entries[i].item);
  }
  return { total: total, items: result };
}

export { normalize, words, buildSearchDocument, searchDocuments, preparePrefixIndex, mergePrefixIndexes, prefixSearch };
