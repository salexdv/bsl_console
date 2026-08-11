function tokenize(source) {
  const tokens = [];
  let pos = source.charCodeAt(0) == 0xfeff ? 1 : 0;
  while (pos < source.length) {
    const c = source.charAt(pos);
    if (/\s/.test(c)) {
      pos++;
      continue;
    }
    if (c == '{' || c == '}' || c == ',') {
      tokens.push(c);
      pos++;
      continue;
    }
    if (c == '"') {
      let value = '';
      pos++;
      let closed = false;
      while (pos < source.length) {
        if (source.charAt(pos) != '"') {
          value += source.charAt(pos++);
          continue;
        }
        if (source.charAt(pos + 1) == '"') {
          value += '"';
          pos += 2;
          continue;
        }
        pos++;
        closed = true;
        break;
      }
      if (!closed)
        throw new Error('TOC: незакрытая строка');
      tokens.push({ string: value });
      continue;
    }
    const match = /^\d+/.exec(source.slice(pos));
    if (!match)
      throw new Error('TOC: неожиданный символ в позиции ' + pos);
    tokens.push({ number: Number(match[0]) });
    pos += match[0].length;
  }
  return tokens;
}

function parseToc(source) {
  const tokens = tokenize(source);
  let pos = 0;
  function literal(value) {
    if (tokens[pos++] != value)
      throw new Error('TOC: ожидалось «' + value + '»');
  }
  function number() {
    const token = tokens[pos++];
    if (!token || token.number === undefined)
      throw new Error('TOC: ожидалось число');
    return token.number;
  }
  function string() {
    const token = tokens[pos++];
    if (!token || token.string === undefined)
      throw new Error('TOC: ожидалась строка');
    return token.string;
  }
  function properties() {
    literal('{');
    number(); literal(','); number(); literal(','); literal('{');
    number(); literal(','); const nameCount = number();
    const names = {};
    for (let i = 0; i < nameCount; i++) {
      literal(','); literal('{');
      const lang = string(); literal(','); names[lang] = string(); literal('}');
    }
    literal('}'); literal(','); const path = string(); literal('}');
    return { names: names, path: path.replace(/^[/\\]+/, '').replace(/\\/g, '/') };
  }

  literal('{');
  const declaredCount = number();
  const records = [];
  const byId = {};
  while (tokens[pos] == ',') {
    pos++;
    literal('{');
    const id = number(); literal(','); const parentId = number(); literal(',');
    const childCount = number();
    const childIds = [];
    for (let i = 0; i < childCount; i++) {
      literal(','); childIds.push(number());
    }
    literal(',');
    const props = properties();
    literal('}');
    if (Object.prototype.hasOwnProperty.call(byId, id))
      throw new Error('TOC: повторный id ' + id);
    const record = { id: id, parentId: parentId, childIds: childIds, names: props.names, path: props.path };
    records.push(record);
    byId[id] = record;
  }
  literal('}');
  if (pos != tokens.length || records.length != declaredCount)
    throw new Error('TOC: неверное количество узлов');

  records.forEach(function (record) {
    record.children = record.childIds.map(function (id) {
      const child = byId[id];
      if (!child)
        throw new Error('TOC: неверная ссылка на дочерний узел ' + id);
      if (child.parentId != record.id)
        throw new Error('TOC: расходится родитель узла ' + id);
      return child;
    });
  });

  const state = {};
  function visit(record) {
    if (state[record.id] == 1)
      throw new Error('TOC: цикл у узла ' + record.id);
    if (state[record.id] == 2)
      return;
    state[record.id] = 1;
    record.children.forEach(visit);
    state[record.id] = 2;
  }
  records.forEach(visit);

  function publicNode(record) {
    return {
      id: 'context:' + record.id,
      title: record.names.ru || record.names.en || '',
      alias: record.names.en || '',
      path: record.path,
      kind: 'context',
      children: record.children.map(publicNode)
    };
  }
  return {
    count: records.length,
    records: records,
    roots: records.filter(function (record) { return record.parentId == 0; }).map(publicNode)
  };
}

export { parseToc };
