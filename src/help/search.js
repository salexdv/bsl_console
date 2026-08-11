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
    matches.push({ id: document.id, title: document.title, path: document.path, kind: document.kind, score: score });
  });
  matches.sort(function (a, b) {
    return b.score - a.score || a.title.localeCompare(b.title);
  });
  return { total: matches.length, items: matches.slice(0, max), terms: terms };
}

function prefixSearch(items, query, limit) {
  const prefix = normalize(query);
  const max = limit === undefined ? 1000 : limit;
  if (!prefix)
    return { total: items.length, items: items.slice(0, max) };
  const found = items.filter(function (item) { return normalize(item.title).indexOf(prefix) == 0; });
  return { total: found.length, items: found.slice(0, max) };
}

export { normalize, words, buildSearchDocument, searchDocuments, prefixSearch };
