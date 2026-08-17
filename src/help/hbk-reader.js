import { bytes, readZip, scanLocalRecords, readLocalRecords, u16, u32 } from './zip';
import { parseToc } from './toc';

function asciiHex(data, offset) {
  if (offset + 9 > data.length)
    throw new Error('HBK: обрезано поле длины');
  let source = '';
  for (let i = 0; i < 8; i++)
    source += String.fromCharCode(data[offset + i]);
  if (!/^[0-9a-fA-F]{8}$/.test(source))
    throw new Error('HBK: неверное поле длины');
  return { value: parseInt(source, 16), next: offset + 9 };
}

function decodeUtf16(data) {
  try {
    return new TextDecoder('utf-16le').decode(data);
  }
  catch (error) {
    let result = '';
    for (let i = 0; i + 1 < data.length; i += 2)
      result += String.fromCharCode(data[i] | (data[i + 1] << 8));
    return result;
  }
}

function decodeUtf8(data) {
  return new TextDecoder('utf-8').decode(data).replace(/^\ufeff/, '');
}

const MISSING_ADDRESS = 0x7fffffff;

function blockField(data, offset) {
  try { return asciiHex(data, offset).value; }
  catch (error) { return null; }
}

/**
 * Читает логический документ контейнера 1С. Обычно сущность занимает один блок —
 * тогда возвращается subarray без копирования. Для цепочки блоков результат собирается
 * в новый Uint8Array.
 */
function readBlockDocument(data, address, title) {
  if (address == MISSING_ADDRESS)
    return null;
  if (address < 0 || address + 31 > data.length)
    throw new Error('HBK: адрес ' + title + ' выходит за границы');

  const documentSize = blockField(data, address + 2);
  if (documentSize === null)
    throw new Error('HBK: повреждён заголовок ' + title);

  const firstBlockSize = blockField(data, address + 11);
  const firstNext = blockField(data, address + 20);
  // Старые синтетические fixtures содержали только первое поле заголовка.
  if (firstBlockSize === null || firstNext === null) {
    if (address + 31 + documentSize > data.length)
      throw new Error('HBK: ' + title + ' выходит за границы');
    return data.subarray(address + 31, address + 31 + documentSize);
  }

  let cursor = address;
  let remaining = documentSize;
  const chunks = [];
  const visited = {};
  while (remaining) {
    if (visited[cursor])
      throw new Error('HBK: цикл блоков ' + title);
    visited[cursor] = true;
    if (cursor + 31 > data.length)
      throw new Error('HBK: обрезан блок ' + title);
    const size = blockField(data, cursor + 11);
    const next = blockField(data, cursor + 20);
    if (size === null || next === null || !size)
      throw new Error('HBK: повреждён блок ' + title);
    const used = Math.min(size, remaining);
    if (cursor + 31 + used > data.length)
      throw new Error('HBK: повреждён блок ' + title);
    chunks.push(data.subarray(cursor + 31, cursor + 31 + used));
    remaining -= used;
    if (!remaining) {
      if (next != MISSING_ADDRESS && next != 0)
        throw new Error('HBK: лишний следующий блок ' + title);
      break;
    }
    if (next == MISSING_ADDRESS || next == 0)
      throw new Error('HBK: преждевременно завершена цепочка ' + title);
    cursor = next;
  }
  if (chunks.length == 1)
    return chunks[0];
  const result = new Uint8Array(documentSize);
  let at = 0;
  chunks.forEach(function (chunk) { result.set(chunk, at); at += chunk.length; });
  return result;
}

function extractEntities(value) {
  const data = bytes(value);
  if (data.length < 64)
    throw new Error('HBK: файл слишком короткий');
  let pos = 18;
  const payload = asciiHex(data, pos); pos = payload.next;
  const block = asciiHex(data, pos); pos = block.next;
  pos += 11;
  if (payload.value % 12 || pos + payload.value > data.length || pos + block.value > data.length)
    throw new Error('HBK: повреждена таблица файлов');
  const entities = {};
  for (let i = 0; i < payload.value; i += 12) {
    const headerAddress = u32(data, pos + i);
    const bodyAddress = u32(data, pos + i + 4);
    const reserved = u32(data, pos + i + 8);
    if (reserved != MISSING_ADDRESS)
      throw new Error('HBK: повреждена запись таблицы файлов');
    if (headerAddress == MISSING_ADDRESS || bodyAddress == MISSING_ADDRESS)
      continue;
    const header = readBlockDocument(data, headerAddress, 'имени сущности');
    if (!header || header.length < 20)
      throw new Error('HBK: повреждено имя сущности');
    // Первые 20 байт логического документа имени — служебные, последние четыре
    // байта длины в старых контейнерах не относятся к UTF-16 имени.
    const nameEnd = Math.max(20, header.length - 4);
    const name = decodeUtf16(header.subarray(20, nameEnd)).replace(/\0+$/, '');
    if (!name)
      throw new Error('HBK: пустое имя сущности');
    entities[name] = readBlockDocument(data, bodyAddress, 'тела сущности ' + name);
  }
  return entities;
}

function normalizePath(path) {
  return String(path || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function readContext(data, entities) {
  if (!entities.FileStorage || !entities.PackBlock)
    return null;
  const fileStorage = entities.FileStorage;
  if (fileStorage.length < 30 || u32(fileStorage, 0) != 0x04034b50)
    return null;
  const firstNameLength = u16(fileStorage, 26);
  let firstName = '';
  for (let i = 0; i < firstNameLength && 30 + i < fileStorage.length; i++)
    firstName += String.fromCharCode(fileStorage[30 + i]);
  if (!/^objects\//i.test(firstName))
    return null;
  const storage = readZip(fileStorage);
  const looksContext = storage.entries.some(function (entry) {
    return /^objects\//i.test(normalizePath(entry.name));
  });
  if (!looksContext)
    return null;
  let pack;
  try { pack = readLocalRecords(entities.PackBlock); }
  catch (error) { pack = scanLocalRecords(entities.PackBlock); }
  if (!pack.entries.length)
    throw new Error('HBK: PackBlock не содержит оглавление');
  const tocEntry = pack.byName['0'] || pack.entries[0];
  const toc = parseToc(decodeUtf8(pack.extract(tocEntry)));
  return { kind: 'context', storage: storage, toc: toc, entities: entities, pageCountHint: toc.count };
}

function readLanguage(data) {
  const storage = scanLocalRecords(data);
  if (!storage.byName.__categories__ || !storage.byName.index)
    return null;
  return {
    kind: 'language',
    storage: storage,
    categoriesText: decodeUtf8(storage.extract('__categories__'))
  };
}

function readHbk(value) {
  const data = bytes(value);
  let entities;
  try {
    entities = extractEntities(data);
  }
  catch (error) {
    throw new Error('HBK: повреждён контейнер: ' + error.message.replace(/^HBK:\s*/, ''));
  }
  const context = readContext(data, entities);
  if (context)
    return context;
  const language = readLanguage(data);
  if (language)
    return language;
  throw new Error('HBK: неизвестный пакет (ожидался shcntx или shlang)');
}

export { readHbk, extractEntities, readBlockDocument, normalizePath, decodeUtf8, MISSING_ADDRESS };
