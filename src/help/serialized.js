/** Парсер текстового сериализованного значения 1С: числа, строки и вложенные массивы. */
function parseSerialized(source, title) {
  const name = title || 'значение';
  let pos = source.charCodeAt(0) == 0xfeff ? 1 : 0;

  function whitespace() {
    while (pos < source.length && /\s/.test(source.charAt(pos))) pos++;
  }

  function parseString() {
    let value = '';
    pos++;
    while (pos < source.length) {
      const character = source.charAt(pos++);
      if (character != '"') { value += character; continue; }
      if (source.charAt(pos) == '"') { value += '"'; pos++; continue; }
      return value;
    }
    throw new Error(name + ': незакрытая строка');
  }

  function parseNumber() {
    const match = /^-?\d+/.exec(source.slice(pos));
    if (!match)
      throw new Error(name + ': ожидалось число в позиции ' + pos);
    pos += match[0].length;
    return Number(match[0]);
  }

  function parseValue() {
    whitespace();
    if (source.charAt(pos) == '"') return parseString();
    if (source.charAt(pos) != '{') return parseNumber();
    pos++;
    const result = [];
    whitespace();
    if (source.charAt(pos) == '}') { pos++; return result; }
    while (pos < source.length) {
      result.push(parseValue());
      whitespace();
      const separator = source.charAt(pos++);
      if (separator == '}') return result;
      if (separator != ',')
        throw new Error(name + ': ожидалась запятая в позиции ' + (pos - 1));
    }
    throw new Error(name + ': незакрытый массив');
  }

  const result = parseValue();
  whitespace();
  if (pos != source.length)
    throw new Error(name + ': неожиданный хвост');
  return result;
}

export { parseSerialized };
