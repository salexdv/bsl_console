import { decodeCleanBase64 } from './base64';

function removeWhitespace(value) {
  return /\s/.test(value) ? value.replace(/\s/g, '') : value;
}

function validatePadding(source, prefixLength) {
  const paddingStart = source.indexOf('=');
  if (paddingStart < 0) return;

  let paddingEnd = paddingStart;
  while (paddingEnd < source.length && source.charAt(paddingEnd) == '=')
    paddingEnd++;
  if (paddingEnd != source.length)
    throw new Error('Данные после padding Base64 в одной порции недопустимы');

  const paddingLength = paddingEnd - paddingStart;
  if (paddingLength > 2)
    throw new Error('Некорректная строка Base64');

  // Незавершённый padding (например, "TQ=") остаётся в carry до следующего push.
  if (prefixLength != source.length) {
    if (paddingStart < prefixLength)
      throw new Error('Некорректная строка Base64');
    return;
  }

  if (!((paddingLength == 1 && paddingStart % 4 == 3)
    || (paddingLength == 2 && paddingStart % 4 == 2)))
    throw new Error('Некорректная строка Base64');
}

function createBase64TransferManager(blobFactory) {
  const makeBlob = blobFactory || function (parts) {
    return new Blob(parts, { type: 'application/octet-stream' });
  };
  let active = null;
  let ready = null;

  function begin(name) {
    if (typeof name != 'string' || !name.trim())
      throw new Error('beginBase64Transfer принимает непустое имя данных');
    active = { name: name.trim(), parts: [], carry: '', bytes: 0 };
  }

  function push(chunk) {
    if (!active)
      throw new Error('Сначала вызовите beginBase64Transfer');
    if (typeof chunk != 'string')
      throw new Error('pushBase64Chunk принимает строку Base64');

    const source = removeWhitespace(chunk);
    if (!source.length) return;
    if (!/^[A-Za-z0-9+/=]+$/.test(source))
      throw new Error('Некорректная строка Base64');

    const combined = active.carry ? active.carry + source : source;
    const prefixLength = combined.length - combined.length % 4;
    validatePadding(combined, prefixLength);
    const remainder = prefixLength == combined.length ? '' : combined.slice(prefixLength);

    if (prefixLength) {
      const complete = prefixLength == combined.length ? combined : combined.slice(0, prefixLength);
      const bytes = decodeCleanBase64(complete);
      if (bytes.length) active.parts.push(bytes);
      active.bytes += bytes.length;
    }
    active.carry = remainder;
  }

  function end() {
    if (!active)
      throw new Error('Нет активной передачи Base64');
    if (active.carry.length)
      throw new Error('Неполная последняя группа Base64');
    if (!active.bytes)
      throw new Error('Передача Base64 пуста');

    const parts = active.parts.slice();
    const completed = {
      name: active.name,
      blob: makeBlob(parts),
      size: active.bytes
    };
    ready = completed;
    active = null;
  }

  return {
    begin: begin,
    push: push,
    end: end,
    hasActive: function () { return !!active; },
    getReady: function () { return ready; },
    clear: function () { active = null; ready = null; }
  };
}

export { createBase64TransferManager };
