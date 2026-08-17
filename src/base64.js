function cleanBase64(value) {
  if (typeof value != 'string')
    throw new Error('Ожидалась строка Base64');

  let source = value.replace(/^\s+|\s+$/g, '');
  if (/^data:/i.test(source)) {
    const comma = source.indexOf(',');
    if (comma < 0 || !/;base64$/i.test(source.slice(0, comma)))
      throw new Error('Некорректный data URL Base64');
    source = source.slice(comma + 1);
  }
  source = source.replace(/\s/g, '');
  if (!source.length)
    throw new Error('Строка Base64 пуста');
  if (source.length % 4 != 0)
    throw new Error('Некорректная строка Base64');
  let contentLength = source.length;
  if (source.charAt(contentLength - 1) == '=') contentLength--;
  if (source.charAt(contentLength - 1) == '=') contentLength--;
  if (contentLength % 4 == 1)
    throw new Error('Некорректная строка Base64');
  for (let index = 0; index < contentLength; index++) {
    const code = source.charCodeAt(index);
    if (!((65 <= code && code <= 90) || (97 <= code && code <= 122)
      || (48 <= code && code <= 57) || code == 43 || code == 47))
      throw new Error('Некорректная строка Base64');
  }
  for (let index = contentLength; index < source.length; index++) {
    if (source.charAt(index) != '=')
      throw new Error('Некорректная строка Base64');
  }
  return source;
}

function base64Value(code) {
  if (65 <= code && code <= 90) return code - 65;
  if (97 <= code && code <= 122) return code - 71;
  if (48 <= code && code <= 57) return code + 4;
  return code == 43 ? 62 : 63;
}

function decodeBase64Manually(source) {
  const padding = source.slice(-2) == '==' ? 2 : (source.charAt(source.length - 1) == '=' ? 1 : 0);
  const bytes = new Uint8Array(source.length / 4 * 3 - padding);
  let output = 0;
  for (let pos = 0; pos < source.length; pos += 4) {
    const a = base64Value(source.charCodeAt(pos));
    const b = base64Value(source.charCodeAt(pos + 1));
    const c = source.charAt(pos + 2) == '=' ? 0 : base64Value(source.charCodeAt(pos + 2));
    const d = source.charAt(pos + 3) == '=' ? 0 : base64Value(source.charCodeAt(pos + 3));
    const block = a << 18 | b << 12 | c << 6 | d;
    if (output < bytes.length) bytes[output++] = block >> 16 & 255;
    if (output < bytes.length) bytes[output++] = block >> 8 & 255;
    if (output < bytes.length) bytes[output++] = block & 255;
  }
  return bytes;
}

// source уже очищен и проверен вызывающей стороной. Это позволяет порционному
// мосту не прогонять большой чанк через регулярные выражения второй раз.
function decodeCleanBase64(source) {
  if (typeof atob == 'function') {
    try {
      const binary = atob(source);
      const bytes = new Uint8Array(binary.length);
      for (let pos = 0; pos < binary.length; pos++)
        bytes[pos] = binary.charCodeAt(pos);
      return bytes;
    }
    catch (_error) {
      // В старом WebKit atob может отсутствовать или отвергать большой аргумент.
      // Проверенная строка в этом случае декодируется совместимым JS-кодом ниже.
    }
  }
  return decodeBase64Manually(source);
}

function decodeBase64(value) {
  return decodeCleanBase64(cleanBase64(value));
}

export { cleanBase64, decodeCleanBase64, decodeBase64 };
