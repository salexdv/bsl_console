import { decodeBase64 } from './base64';

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

    const source = chunk.replace(/\s/g, '');
    if (!source.length) return;
    if (!/^[A-Za-z0-9+/=]+$/.test(source))
      throw new Error('Некорректная строка Base64');

    const combined = active.carry + source;
    const prefixLength = Math.floor(combined.length / 4) * 4;
    for (let pos = 0; pos < prefixLength; pos += 4) {
      const quartet = combined.slice(pos, pos + 4);
      if (!/^(?:[A-Za-z0-9+/]{4}|[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)$/.test(quartet))
        throw new Error('Некорректная строка Base64');
      if (0 <= quartet.indexOf('=') && pos + 4 != combined.length)
        throw new Error('Данные после padding Base64 в одной порции недопустимы');
    }
    const remainder = combined.slice(prefixLength);
    if (0 <= remainder.indexOf('=') && !/^[A-Za-z0-9+/]{0,2}={0,2}$/.test(remainder))
      throw new Error('Некорректная строка Base64');

    if (prefixLength) {
      const bytes = decodeBase64(combined.slice(0, prefixLength));
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
