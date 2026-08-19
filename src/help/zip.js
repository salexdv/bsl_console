import { inflateRaw } from 'pako/browser/inflate';

const CRC_TABLE = (function () {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++)
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
}());

function fail(message) {
  throw new Error(message);
}

function bytes(value) {
  if (value instanceof Uint8Array)
    return value;
  if (value instanceof ArrayBuffer)
    return new Uint8Array(value);
  if (value && value.buffer instanceof ArrayBuffer)
    return new Uint8Array(value.buffer, value.byteOffset || 0, value.byteLength);
  fail('Ожидался бинарный буфер');
}

function u16(data, offset) {
  if (offset < 0 || offset + 2 > data.length)
    fail('ZIP: чтение за границей буфера');
  return data[offset] | (data[offset + 1] << 8);
}

function u32(data, offset) {
  if (offset < 0 || offset + 4 > data.length)
    fail('ZIP: чтение за границей буфера');
  return (data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16)
    | (data[offset + 3] << 24)) >>> 0;
}

function crc32(value) {
  const data = bytes(value);
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++)
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function decodeName(data, utf8) {
  let decoder;
  try {
    decoder = new TextDecoder(utf8 ? 'utf-8' : 'windows-1251');
    return decoder.decode(data);
  }
  catch (error) {
    let result = '';
    for (let i = 0; i < data.length; i++)
      result += String.fromCharCode(data[i]);
    return result;
  }
}

function hasZip64Extra(data, offset, length) {
  const end = offset + length;
  let pos = offset;
  while (pos + 4 <= end) {
    const type = u16(data, pos);
    const size = u16(data, pos + 2);
    pos += 4;
    if (pos + size > end)
      fail('ZIP: повреждено extra-поле');
    if (type == 1)
      return true;
    pos += size;
  }
  if (pos != end)
    fail('ZIP: повреждено extra-поле');
  return false;
}

function validateFlags(flags) {
  if (flags & 1)
    fail('ZIP: шифрование не поддерживается');
  if (flags & 8)
    fail('ZIP: data descriptor не поддерживается');
}

function inflateEntry(archive, entry) {
  const source = archive.data.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize);
  return inflatePayload(source, entry);
}

function inflatePayload(value, entry) {
  const source = bytes(value);
  let result;
  if (entry.method == 0)
    result = new Uint8Array(source);
  else if (entry.method == 8)
    result = inflateRaw(source);
  else
    fail('ZIP: неизвестный метод сжатия ' + entry.method);

  if (result.length != entry.uncompressedSize)
    fail('ZIP: неверный распакованный размер ' + entry.name);
  if (crc32(result) != entry.crc)
    fail('ZIP: ошибка CRC ' + entry.name);
  return result;
}

function readLocalHeader(data, localOffset, expected) {
  if (u32(data, localOffset) != 0x04034b50)
    fail('ZIP: неверная сигнатура local header');
  const flags = u16(data, localOffset + 6);
  const method = u16(data, localOffset + 8);
  const crc = u32(data, localOffset + 14);
  const compressedSize = u32(data, localOffset + 18);
  const uncompressedSize = u32(data, localOffset + 22);
  const nameLength = u16(data, localOffset + 26);
  const extraLength = u16(data, localOffset + 28);
  validateFlags(flags);
  if (compressedSize == 0xffffffff || uncompressedSize == 0xffffffff)
    fail('ZIP: Zip64 не поддерживается');
  const nameOffset = localOffset + 30;
  const extraOffset = nameOffset + nameLength;
  const dataOffset = extraOffset + extraLength;
  if (dataOffset > data.length || dataOffset + compressedSize > data.length)
    fail('ZIP: запись выходит за границы архива');
  if (hasZip64Extra(data, extraOffset, extraLength))
    fail('ZIP: Zip64 не поддерживается');
  const name = decodeName(data.subarray(nameOffset, extraOffset), !!(flags & 0x800));
  if (expected) {
    if (name != expected.name || method != expected.method || crc != expected.crc
      || compressedSize != expected.compressedSize || uncompressedSize != expected.uncompressedSize)
      fail('ZIP: local и central header расходятся для ' + expected.name);
  }
  if (method != 0 && method != 8)
    fail('ZIP: неизвестный метод сжатия ' + method);
  return {
    name: name,
    flags: flags,
    method: method,
    crc: crc,
    compressedSize: compressedSize,
    uncompressedSize: uncompressedSize,
    dataOffset: dataOffset,
    localOffset: localOffset
  };
}

function findEndRecord(data) {
  for (let pos = data.length - 22; 0 <= pos; pos--) {
    if (u32(data, pos) != 0x06054b50)
      continue;
    const commentLength = u16(data, pos + 20);
    if (pos + 22 + commentLength <= data.length)
      return pos;
  }
  fail('ZIP: не найден end of central directory');
}

function readZip(value) {
  const data = bytes(value);
  const eocd = findEndRecord(data);
  const disk = u16(data, eocd + 4);
  const centralDisk = u16(data, eocd + 6);
  const diskCount = u16(data, eocd + 8);
  const count = u16(data, eocd + 10);
  const centralSize = u32(data, eocd + 12);
  const centralOffset = u32(data, eocd + 16);
  if (disk || centralDisk || diskCount != count)
    fail('ZIP: многодисковый архив не поддерживается');
  if (count == 0xffff || centralSize == 0xffffffff || centralOffset == 0xffffffff)
    fail('ZIP: Zip64 не поддерживается');
  const centralStart = eocd - centralSize;
  const base = centralStart - centralOffset;
  if (base < 0 || centralStart < 0)
    fail('ZIP: неверное смещение central directory');

  const entries = [];
  const byName = {};
  let pos = centralStart;
  for (let i = 0; i < count; i++) {
    if (u32(data, pos) != 0x02014b50)
      fail('ZIP: неверная сигнатура central header');
    const flags = u16(data, pos + 8);
    const method = u16(data, pos + 10);
    const crc = u32(data, pos + 16);
    const compressedSize = u32(data, pos + 20);
    const uncompressedSize = u32(data, pos + 24);
    const nameLength = u16(data, pos + 28);
    const extraLength = u16(data, pos + 30);
    const commentLength = u16(data, pos + 32);
    const localRelative = u32(data, pos + 42);
    validateFlags(flags);
    if (compressedSize == 0xffffffff || uncompressedSize == 0xffffffff || localRelative == 0xffffffff)
      fail('ZIP: Zip64 не поддерживается');
    const nameOffset = pos + 46;
    const extraOffset = nameOffset + nameLength;
    const next = extraOffset + extraLength + commentLength;
    if (next > eocd)
      fail('ZIP: central header выходит за границы');
    if (hasZip64Extra(data, extraOffset, extraLength))
      fail('ZIP: Zip64 не поддерживается');
    const entry = {
      name: decodeName(data.subarray(nameOffset, extraOffset), !!(flags & 0x800)),
      flags: flags,
      method: method,
      crc: crc,
      compressedSize: compressedSize,
      uncompressedSize: uncompressedSize
    };
    const local = readLocalHeader(data, base + localRelative, entry);
    entry.dataOffset = local.dataOffset;
    entry.localOffset = local.localOffset;
    entries.push(entry);
    if (!Object.prototype.hasOwnProperty.call(byName, entry.name))
      byName[entry.name] = entry;
    pos = next;
  }
  if (pos != eocd)
    fail('ZIP: неверный размер central directory');
  return {
    data: data,
    entries: entries,
    byName: byName,
    prefixSize: base,
    tailSize: data.length - (eocd + 22 + u16(data, eocd + 20)),
    extract: function (entryOrName) {
      const entry = typeof entryOrName == 'string' ? byName[entryOrName] : entryOrName;
      if (!entry)
        fail('ZIP: запись не найдена');
      return inflateEntry(this, entry);
    }
  };
}

function scanLocalRecords(value) {
  const data = bytes(value);
  const entries = [];
  const byName = {};
  const archive = { data: data };
  for (let pos = 0; pos + 30 <= data.length; pos++) {
    if (u32(data, pos) != 0x04034b50)
      continue;
    try {
      const entry = readLocalHeader(data, pos);
      inflateEntry(archive, entry);
      if (!Object.prototype.hasOwnProperty.call(byName, entry.name)) {
        entries.push(entry);
        byName[entry.name] = entry;
      }
    }
    catch (error) {
      // Сигнатура могла встретиться в сжатых данных; принимается только запись с валидным CRC.
    }
  }
  return {
    data: data,
    entries: entries,
    byName: byName,
    extract: function (entryOrName) {
      const entry = typeof entryOrName == 'string' ? byName[entryOrName] : entryOrName;
      if (!entry)
        fail('ZIP: запись не найдена');
      return inflateEntry(this, entry);
    }
  };
}

/** Читает плотную последовательность local ZIP records без побайтового поиска сигнатур. */
function readLocalRecords(value) {
  const data = bytes(value);
  const entries = [];
  const byName = {};
  const archive = { data: data };
  let pos = 0;
  while (pos + 30 <= data.length) {
    if (u32(data, pos) != 0x04034b50)
      break;
    const entry = readLocalHeader(data, pos);
    const next = entry.dataOffset + entry.compressedSize;
    if (next <= pos)
      fail('ZIP: local record не продвигает позицию');
    entries.push(entry);
    if (!Object.prototype.hasOwnProperty.call(byName, entry.name))
      byName[entry.name] = entry;
    pos = next;
  }
  if (!entries.length)
    fail('ZIP: не найдена последовательность local records');
  return {
    data: data,
    entries: entries,
    byName: byName,
    trailingSize: data.length - pos,
    extract: function (entryOrName) {
      const entry = typeof entryOrName == 'string' ? byName[entryOrName] : entryOrName;
      if (!entry)
        fail('ZIP: запись не найдена');
      return inflateEntry(this, entry);
    }
  };
}

export { crc32, inflatePayload, readZip, scanLocalRecords, readLocalRecords, bytes, u16, u32 };
