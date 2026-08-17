#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const Module = require('module');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');

function loadModule(entry) {
  const output = esbuild.buildSync({
    entryPoints: [entry], bundle: true, platform: 'node', target: 'node22', format: 'cjs', write: false
  }).outputFiles[0].text;
  const instance = new Module(entry, module);
  instance.filename = entry;
  instance.paths = module.paths;
  instance._compile(output, entry);
  return instance.exports;
}

const transferMode = process.argv[2] == '--base64-chunks' ? 'base64-chunks'
  : (process.argv[2] == '--base64-binary-chunks' ? 'base64-binary-chunks' : 'binary');
const chunked = transferMode != 'binary';
const paths = process.argv.slice(chunked ? 3 : 2);
if (!paths.length) {
  console.error('Usage: node tools/smoke_help_hbk.js [--base64-chunks|--base64-binary-chunks] <file.hbk> [...]');
  process.exit(2);
}

const reader = loadModule(path.join(ROOT, 'src', 'help', 'hbk-reader.js'));
const navigation = loadModule(path.join(ROOT, 'src', 'help', 'navigation.js'));
const links = loadModule(path.join(ROOT, 'src', 'help', 'links.js'));
const transferModule = chunked ? loadModule(path.join(ROOT, 'src', 'base64_transfer.js')) : null;

async function readFile(fileName) {
  const data = fs.readFileSync(fileName);
  if (!chunked) return data;
  const manager = transferModule.createBase64TransferManager();
  manager.begin(path.basename(fileName));
  if (transferMode == 'base64-binary-chunks') {
    const binaryChunkSize = 1024 * 1024; // точный размер порции из кода 1С, не кратен трём
    for (let pos = 0; pos < data.length; pos += binaryChunkSize)
      manager.push(data.subarray(pos, pos + binaryChunkSize).toString('base64'));
  }
  else {
    const encoded = data.toString('base64');
    const chunkSize = 262141; // намеренно не кратен четырём
    for (let pos = 0; pos < encoded.length; pos += chunkSize)
      manager.push(encoded.slice(pos, pos + chunkSize));
  }
  manager.end();
  return Buffer.from(await manager.getReady().blob.arrayBuffer());
}

(async function () {
  let failed = false;
  for (const fileName of paths) {
    try {
    const started = Date.now();
    const parsed = reader.readHbk(await readFile(fileName));
    let html = 0;
    const pages = {};
    parsed.storage.entries.forEach(function (entry) {
      parsed.storage.extract(entry);
      const name = reader.normalizePath(entry.name);
      if (parsed.kind == 'context' ? /\.html$/i.test(name)
        : (!/\.st$/i.test(name) && name != '__categories__' && !/^IndexPackLookup(?:Temp)?$/i.test(name))) {
        const text = reader.decodeUtf8(parsed.storage.extract(entry));
        if (/<html\b|<body\b|<h1\b/i.test(text)) {
          html++;
          if (parsed.kind == 'context') {
            const id = 'context:' + name;
            pages[id] = { id: id, kind: 'context', path: name, title: name.split('/').pop().replace(/\.html$/i, ''), entry: entry };
          }
        }
      }
    });
    let navigationChecks = null;
    if (parsed.kind == 'context') {
      navigation.decorateContextNavigation(parsed.toc.roots, pages);
      const all = [];
      function collect(nodes) {
        nodes.forEach(function (node) { all.push(node); collect(node.children || []); });
      }
      collect(parsed.toc.roots);
      const query = all.find(function (node) {
        if (node.title != 'Запрос') return false;
        const titles = (node.children || []).map(function (child) { return child.title; });
        return titles.indexOf('Свойства') >= 0 && titles.indexOf('Методы') >= 0
          && titles.indexOf('Конструкторы') >= 0;
      });
      if (!query) throw new Error('Real HBK: у объекта «Запрос» не восстановлены группы');
      const select = Object.keys(pages).map(function (key) { return pages[key]; }).find(function (page) {
        return page.context && page.context.indexOf('СправочникМенеджер.') == 0
          && page.context.indexOf('/Методы/Выбрать') > 0;
      });
      if (!select) throw new Error('Real HBK: не найден контекст индекса для «Выбрать»');
      const resolved = navigation.resolvePage(pages, 'context', select.path, 'context:unknown-toc-id');
      const article = resolved && reader.decodeUtf8(parsed.storage.extract(resolved.entry));
      if (!resolved || !/<html\b|<body\b|<h1\b/i.test(article))
        throw new Error('Real HBK: fallback kind + path не открыл статью');
      const queryPage = pages['context:' + reader.normalizePath(query.path)];
      if (!queryPage) throw new Error('Real HBK: не найдена обзорная статья «Запрос»');
      const queryHtml = reader.decodeUtf8(parsed.storage.extract(queryPage.entry));
      const resolvedLinks = [];
      const hrefPattern = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi;
      let hrefMatch;
      while ((hrefMatch = hrefPattern.exec(queryHtml))) {
        const target = links.resolveHelpLink(hrefMatch[1], queryPage);
        if (target && target.type == 'internal') {
          const targetPage = navigation.resolvePage(pages, target.kind, target.path, null);
          if (targetPage) resolvedLinks.push(targetPage.path);
        }
      }
      const expectedLinks = {
        text: /\/properties\/Text\d*\.html$/i,
        parameters: /\/properties\/Parameters\d*\.html$/i,
        execute: /\/methods\/Execute\d*\.html$/i,
        constructor: /\/ctors\/[^/]+\.html$/i
      };
      Object.keys(expectedLinks).forEach(function (name) {
        if (!resolvedLinks.some(function (target) { return expectedLinks[name].test(target); }))
          throw new Error('Real HBK: ссылка «Запрос» не разрешилась: ' + name);
      });
      navigationChecks = {
        queryGroups: query.children.map(function (child) { return child.title; }).filter(Boolean),
        selectContext: select.context,
        articleFallback: true,
        queryArticleLinks: Object.keys(expectedLinks)
      };
    }
    console.log(JSON.stringify({
      file: path.resolve(fileName), kind: parsed.kind, zipEntries: parsed.storage.entries.length,
      htmlPages: html, tocNodes: parsed.toc ? parsed.toc.count : null,
      navigation: navigationChecks, transfer: transferMode, bytes: fs.statSync(fileName).size, elapsedMs: Date.now() - started
    }));
    }
    catch (error) {
      failed = true;
      console.error(fileName + ': ' + (error && error.stack || error));
    }
  }
  process.exit(failed ? 1 : 0);
}());
