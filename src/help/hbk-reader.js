import { bytes, readZip, scanLocalRecords, u16, u32 } from './zip';
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
    if (reserved != 0x7fffffff)
      throw new Error('HBK: повреждена запись таблицы файлов');
    if (headerAddress + 51 > data.length || bodyAddress + 31 > data.length)
      throw new Error('HBK: адрес записи выходит за границы');
    let cursor = headerAddress + 2;
    const nameLength = asciiHex(data, cursor); cursor = nameLength.next + 40;
    if (nameLength.value < 24 || cursor + nameLength.value - 24 > data.length)
      throw new Error('HBK: повреждено имя сущности');
    const name = decodeUtf16(data.subarray(cursor, cursor + nameLength.value - 24));
    cursor = bodyAddress + 2;
    const bodyLength = asciiHex(data, cursor); cursor = bodyLength.next + 20;
    if (cursor + bodyLength.value > data.length)
      throw new Error('HBK: тело сущности выходит за границы');
    if (name == 'FileStorage' || name == 'PackBlock')
      entities[name] = data.subarray(cursor, cursor + bodyLength.value);
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
  const pack = scanLocalRecords(entities.PackBlock);
  if (!pack.entries.length)
    throw new Error('HBK: PackBlock не содержит оглавление');
  const tocEntry = pack.byName['0'] || pack.entries[0];
  const toc = parseToc(decodeUtf8(pack.extract(tocEntry)));
  return { kind: 'context', storage: storage, toc: toc, pageCountHint: toc.count };
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

export { readHbk, extractEntities, normalizePath, decodeUtf8 };
