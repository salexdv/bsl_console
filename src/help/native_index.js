import { decodeUtf8, normalizePath } from './hbk-reader';
import { parseSerialized } from './serialized';
import { readLocalRecords, u32 } from './zip';

function parsePackLookup(entities) {
  if (!entities.PackLookup || !entities.MainData)
    return [];
  const declared = Math.max(0, u32(entities.MainData, 0) - 1);
  if (declared * 8 > entities.PackLookup.length)
    throw new Error('HBK: повреждён PackLookup');
  const result = [];
  for (let index = 0; index < declared; index++)
    result.push(u32(entities.PackLookup, index * 8));
  return result;
}

function parseIndexRecord(record) {
  if (!Array.isArray(record) || record.length < 4)
    throw new Error('HBK: повреждена запись IndexPackBlock');
  const languageCount = Number(record[2]);
  if (!isFinite(languageCount) || languageCount < 0)
    throw new Error('HBK: неверное число языков IndexPackBlock');
  const names = [];
  let at = 3;
  for (let index = 0; index < languageCount; index++) {
    if (at + 8 >= record.length)
      throw new Error('HBK: обрезан язык IndexPackBlock');
    const language = record[at + 6];
    const value = record[at + 7];
    if (typeof language == 'string' && typeof value == 'string' && value)
      names.push({ language: language, value: value });
    at += 9;
  }
  const paths = [];
  for (; at < record.length; at++) {
    if (typeof record[at] == 'string' && /^[\\/]/.test(record[at]))
      paths.push(normalizePath(record[at]));
  }
  return { id: Number(record[0]), names: names, paths: paths };
}

function parseNativeIndex(entities) {
  if (!entities.IndexPackBlock)
    return { records: [], lookup: parsePackLookup(entities) };
  const archive = readLocalRecords(entities.IndexPackBlock);
  const records = [];
  archive.entries.forEach(function (entry) {
    if (!/^\d+$/.test(entry.name))
      return;
    const value = parseSerialized(decodeUtf8(archive.extract(entry)), 'IndexPackBlock');
    const declared = Number(value[0]);
    if (!isFinite(declared) || declared != value.length - 1)
      throw new Error('HBK: неверное количество записей IndexPackBlock');
    for (let index = 1; index < value.length; index++)
      records.push(parseIndexRecord(value[index]));
  });
  return { records: records, lookup: parsePackLookup(entities) };
}

function nativePrefixItems(nativeIndex, pages) {
  const result = [];
  const seen = {};
  nativeIndex.records.forEach(function (record) {
    const page = record.paths.map(function (path) { return pages['context:' + path]; }).filter(Boolean)[0];
    if (!page) return;
    record.names.forEach(function (name) {
      const key = page.id + '\n' + name.language + '\n' + name.value;
      if (seen[key]) return;
      seen[key] = true;
      result.push({
        id: page.id, kind: page.kind, path: page.path,
        title: name.value, context: page.context || '', alias: name.language
      });
    });
  });
  return result;
}

export { parsePackLookup, parseNativeIndex, nativePrefixItems };
