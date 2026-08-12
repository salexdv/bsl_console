#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const puppeteer = require('puppeteer-core');

const DIST = path.resolve(__dirname, '..', 'dist');
const PORT = 9011;

function findBrowser() {
  return [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ].filter(Boolean).find(function (candidate) { return fs.existsSync(candidate); });
}

function crc32(data) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function localRecord(name, text) {
  const nameBytes = Buffer.from(name, 'utf8');
  const data = Buffer.isBuffer(text) ? text : Buffer.from(text, 'utf8');
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x800, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt32LE(crc32(data), 14);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(nameBytes.length, 26);
  return Buffer.concat([header, nameBytes, data]);
}

function makeZip(files) {
  const locals = [];
  const central = [];
  let offset = 0;
  files.forEach(function (file) {
    const name = Buffer.from(file.name, 'utf8');
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data, 'utf8');
    const local = localRecord(file.name, data);
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4); header.writeUInt16LE(20, 6); header.writeUInt16LE(0x800, 8);
    header.writeUInt32LE(crc32(data), 16); header.writeUInt32LE(data.length, 20); header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(name.length, 28); header.writeUInt32LE(offset, 42);
    locals.push(local); central.push(Buffer.concat([header, name])); offset += local.length;
  });
  const localData = Buffer.concat(locals);
  const centralData = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralData.length, 12); end.writeUInt32LE(localData.length, 16);
  return Buffer.concat([localData, centralData, end]);
}

function writeHexField(buffer, offset, value) {
  buffer.write(value.toString(16).padStart(8, '0') + ' ', offset, 'ascii');
}

function makeContainer(entities) {
  const records = [];
  let bodyAddress = 1024;
  entities.forEach(function (entity, index) {
    const data = Buffer.isBuffer(entity.data) ? entity.data : Buffer.from(entity.data);
    records.push({ name: entity.name, data: data, headerAddress: 512 + index * 128, bodyAddress: bodyAddress });
    bodyAddress += 31 + data.length + 64;
  });
  const result = Buffer.alloc(bodyAddress);
  writeHexField(result, 18, records.length * 12); writeHexField(result, 27, 512);
  records.forEach(function (record, index) {
    const table = 47 + index * 12;
    result.writeUInt32LE(record.headerAddress, table); result.writeUInt32LE(record.bodyAddress, table + 4);
    result.writeUInt32LE(0x7fffffff, table + 8);
    const name = Buffer.from(record.name, 'utf16le');
    writeHexField(result, record.headerAddress + 2, name.length + 24); name.copy(result, record.headerAddress + 51);
    writeHexField(result, record.bodyAddress + 2, record.data.length); record.data.copy(result, record.bodyAddress + 31);
  });
  return result;
}

function makeContextHbk() {
  const pagePath = 'objects/TestObject/TestObject/methods/Execute.html';
  const secondPath = 'objects/TestObject/methods/ExecuteBatch.html';
  const overviewPath = 'objects/TestObject/TestObject.html';
  const html = '<html><body><h1 class="V8SH_pagetitle">Выполнить</h1><p>Первая синтетическая статья.</p>'
    + '<div style="height:700px"></div><h2 id="syntax">Синтаксис выполнения</h2></body></html>';
  const secondHtml = '<html><body><h1 class="V8SH_pagetitle">ВыполнитьПакет</h1><p>Вторая синтетическая статья.</p></body></html>';
  const overviewHtml = '<html><body><h1 class="V8SH_pagetitle">ТестовыйОбъект</h1>'
    + '<a id="relative-context" href="TestObject\\methods\\Execute.html?mode=full#syntax">Выполнить</a></body></html>';
  const toc = '{3,{1,0,0,{1,1,{1,2,{"ru","Выполнить"},{"en","Execute"}},"' + pagePath + '"}}'
    + ',{2,0,0,{1,1,{1,2,{"ru","ВыполнитьПакет"},{"en","ExecuteBatch"}},"' + secondPath + '"}}'
    + ',{3,0,0,{1,1,{1,2,{"ru","ТестовыйОбъект"},{"en","TestObject"}},"' + overviewPath + '"}}}';
  return makeContainer([
    { name: 'FileStorage', data: makeZip([
      { name: pagePath, data: html }, { name: secondPath, data: secondHtml }, { name: overviewPath, data: overviewHtml }
    ]) },
    { name: 'PackBlock', data: localRecord('0', toc) }
  ]);
}

function makePendingContextHbk() {
  const pagePath = 'objects/TestObject/methods/DeferredMethod.html';
  const html = '<html><body><h1 class="V8SH_pagetitle">ОтложенныйМетод</h1><p>Статья загружена после команды.</p></body></html>';
  const toc = '{1,{1,0,0,{1,1,{1,2,{"ru","ОтложенныйМетод"},{"en","DeferredMethod"}},"' + pagePath + '"}}}';
  return makeContainer([
    { name: 'FileStorage', data: makeZip([{ name: pagePath, data: html }]) },
    { name: 'PackBlock', data: localRecord('0', toc) }
  ]);
}

function makeLanguageHbk() {
  const index = '<html><body><h1 class="V8SH_pagetitle">Общее описание</h1>'
    + '<script>window.__helpUnsafe=1</script><img src="data:text/html,bad" onerror="window.__helpUnsafe=2">'
    + '<a id="internal" href="v8help://SyntaxHelperLanguage/topic">К строке</a>'
    + '<a id="external" href="https://example.com/help">Сайт</a></body></html>';
  const topic = '<html><body><h1 class="V8SH_pagetitle">Строка (String)</h1><p>Unicode ёлка строка.</p>'
    + '<a href="v8help://SyntaxHelperLanguage/other">Дальше</a></body></html>';
  const other = '<html><body><h1 class="V8SH_pagetitle">Число</h1><p>Числовое значение.</p></body></html>';
  const categories = '{2,"topic",0,{},"other",0,{}}';
  const storage = Buffer.concat([
    localRecord('index', index), localRecord('__categories__', categories),
    localRecord('topic', topic), localRecord('other', other)
  ]);
  const headerAddress = 512;
  const bodyAddress = 1024;
  const bodyStart = bodyAddress + 31;
  const result = Buffer.alloc(bodyStart + storage.length + 32);
  writeHexField(result, 18, 12);
  writeHexField(result, 27, 512);
  result.writeUInt32LE(headerAddress, 47);
  result.writeUInt32LE(bodyAddress, 51);
  result.writeUInt32LE(0x7fffffff, 55);
  const name = Buffer.from('FileStorage', 'utf16le');
  writeHexField(result, headerAddress + 2, name.length + 24);
  name.copy(result, headerAddress + 51);
  writeHexField(result, bodyAddress + 2, storage.length);
  storage.copy(result, bodyStart);
  return result;
}

function serve() {
  return new Promise(function (resolve) {
    const server = http.createServer(function (request, response) {
      let fileName = decodeURIComponent(request.url.split('?')[0]);
      if (fileName == '/favicon.ico') { response.statusCode = 204; response.end(); return; }
      if (fileName == '/') fileName = '/index.html';
      const file = path.join(DIST, fileName);
      if (!file.startsWith(DIST) || !fs.existsSync(file)) { response.statusCode = 404; response.end(); return; }
      response.setHeader('Content-Type', path.extname(file) == '.html' ? 'text/html; charset=utf-8' : 'text/javascript');
      fs.createReadStream(file).pipe(response);
    });
    server.listen(PORT, function () { resolve(server); });
  });
}

(async function () {
  const executablePath = findBrowser();
  if (!executablePath) throw new Error('Chrome/Edge не найден');
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('Сначала выполните npm run build');
  const server = await serve();
  const browser = await puppeteer.launch({ executablePath: executablePath, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const testHbkPath = path.join(os.tmpdir(), 'bsl-console-help-' + process.pid + '.hbk');
  fs.writeFileSync(testHbkPath, makeLanguageHbk());
  const errors = [];
  page.on('pageerror', function (error) { errors.push('pageerror: ' + (error.stack || error.message)); });
  page.on('console', function (message) { if (message.type() == 'error') errors.push('console: ' + message.text()); });
  try {
    await page.goto('http://127.0.0.1:' + PORT + '/index.html', { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction('window.editor && window.monaco && typeof window.parseHelp == "function"'
      + ' && typeof window.showHelp == "function" && typeof window.showHelpLoader == "function"'
      + ' && typeof window.beginBase64Transfer == "function"'
      + ' && typeof window.pushBase64Chunk == "function" && typeof window.endBase64Transfer == "function"'
      + ' && window.bslHelper && window.bslMetadata', { timeout: 30000 });

    const loaderInitiallyHidden = await page.$eval('#help-file-loader', function (node) {
      return node.hidden && getComputedStyle(node).display == 'none';
    });
    if (!loaderInitiallyHidden) errors.push('help file loader is visible by default');
    await page.evaluate(function () { window.showHelpLoader(); });
    const loaderVisible = await page.$eval('#help-file-loader', function (node) {
      return !node.hidden && getComputedStyle(node).display != 'none';
    });
    if (!loaderVisible) errors.push('showHelpLoader did not show the loader');

    await page.evaluate(function () { window.editor.focus(); window.showHelp(); });
    await page.waitForSelector('.bsl-help-overlay.visible');
    const layout = await page.evaluate(function () {
      const workspace = document.getElementById('editor-workspace').getBoundingClientRect();
      const editor = document.getElementById('container').getBoundingClientRect();
      const help = document.querySelector('.bsl-help-overlay').getBoundingClientRect();
      const navigation = document.querySelector('.bsl-help-navigation').getBoundingClientRect();
      const article = document.querySelector('.bsl-help-article').getBoundingClientRect();
      return {
        workspaceWidth: workspace.width, editorWidth: editor.width, editorRight: editor.right,
        helpWidth: help.width, helpLeft: help.left, navigationBottom: navigation.bottom, articleTop: article.top
      };
    });
    if (layout.editorWidth < 300 || layout.helpLeft < layout.editorRight
      || layout.helpWidth / layout.workspaceWidth < .27 || layout.helpWidth / layout.workspaceWidth > .33)
      errors.push('docked layout: ' + JSON.stringify(layout));
    if (layout.navigationBottom > layout.articleTop)
      errors.push('navigation is not above article: ' + JSON.stringify(layout));

    const dockBox = await page.$eval('.bsl-help-dock-separator', function (node) {
      const rect = node.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    await page.mouse.move(dockBox.x + dockBox.width / 2, dockBox.y + dockBox.height / 2);
    await page.mouse.down(); await page.mouse.move(dockBox.x - 80, dockBox.y + dockBox.height / 2); await page.mouse.up();
    const resizedHelp = await page.$eval('.bsl-help-overlay', function (node) { return node.getBoundingClientRect().width; });
    if (resizedHelp < layout.helpWidth + 60) errors.push('dock separator did not resize help');

    const horizontalBox = await page.$eval('.bsl-help-separator', function (node) {
      const rect = node.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    const navigationBefore = await page.$eval('.bsl-help-navigation', function (node) { return node.getBoundingClientRect().height; });
    await page.mouse.move(horizontalBox.x + horizontalBox.width / 2, horizontalBox.y + horizontalBox.height / 2);
    await page.mouse.down(); await page.mouse.move(horizontalBox.x + horizontalBox.width / 2, horizontalBox.y + 50); await page.mouse.up();
    const navigationAfter = await page.$eval('.bsl-help-navigation', function (node) { return node.getBoundingClientRect().height; });
    if (navigationAfter < navigationBefore + 35) errors.push('horizontal separator did not resize navigation');
    let status = await page.$eval('.bsl-help-message', function (node) { return node.textContent; });
    if (status.indexOf('не загружена') < 0) errors.push('empty state: ' + status);
    await page.keyboard.press('Escape');

    const unavailableShortcut = await page.evaluate(async function () {
      const originalSendEvent = window.sendEvent;
      window.__capturedHelpEvents = [];
      window.sendEvent = function (name, params) {
        if (name == 'EVENT_ON_GET_HELP') window.__capturedHelpEvents.push({ event: name, params: params });
        return originalSendEvent(name, params);
      };
      window.editor.setValue('ОбщийМодуль.Метод()');
      window.editor.setPosition({ lineNumber: 1, column: 16 });
      window.editor.focus();
      window.setOption('generateGetHelpEvent', false);
      window.editor.trigger('headless', 'bsl.showHelp');
      const disabled = window.__capturedHelpEvents.length;
      window.setOption('generateGetHelpEvent', true);
      window.editor.trigger('headless', 'bsl.showHelp');
      const emptyVisible = document.querySelector('.bsl-help-overlay').classList.contains('visible');
      const emptyEvents = window.__capturedHelpEvents.slice();
      const failed = await window.parseHelp(new Blob([new Uint8Array([1, 2, 3])]));
      window.editor.trigger('headless', 'bsl.showHelp');
      return {
        disabled: disabled,
        emptyVisible: emptyVisible,
        emptyEvents: emptyEvents,
        failed: failed,
        errorVisible: document.querySelector('.bsl-help-overlay').classList.contains('visible'),
        errorEvents: window.__capturedHelpEvents.slice()
      };
    });
    const firstHelpEvent = unavailableShortcut.emptyEvents[0];
    if (unavailableShortcut.disabled || unavailableShortcut.emptyVisible || unavailableShortcut.emptyEvents.length != 1
      || !firstHelpEvent || firstHelpEvent.event != 'EVENT_ON_GET_HELP'
      || firstHelpEvent.params.word != 'метод' || firstHelpEvent.params.expression != 'общиймодуль.метод'
      || firstHelpEvent.params.line != 1 || firstHelpEvent.params.column != 16
      || !Array.isArray(firstHelpEvent.params.expression_array))
      errors.push('Ctrl+F1 empty/event: ' + JSON.stringify(unavailableShortcut));
    if (unavailableShortcut.failed.ok || unavailableShortcut.errorVisible || unavailableShortcut.errorEvents.length != 2)
      errors.push('Ctrl+F1 error/event: ' + JSON.stringify(unavailableShortcut));

    const fileInput = await page.$('#help-file-input');
    if (!fileInput) {
      errors.push('file loader input not found');
    }
    else {
      await fileInput.uploadFile(testHbkPath);
      await page.waitForFunction('!document.getElementById("help-file-load").disabled');
      await page.click('#help-file-load');
      await page.waitForFunction('document.getElementById("help-file-status").textContent.indexOf("Готово:") >= 0', { timeout: 30000 });
      const fileStatus = await page.$eval('#help-file-status', function (node) { return node.textContent; });
      if (fileStatus.indexOf('language, страниц: 3') < 0) errors.push('file loader result: ' + fileStatus);
      await page.click('#help-file-show');
      await page.waitForSelector('.bsl-help-overlay.visible');
      await page.keyboard.press('Escape');
    }

    const hbk = makeLanguageHbk().toString('base64');
    const result = await page.evaluate(async function (base64) {
      const missing = await window.parseHelp();
      window.beginBase64Transfer('shlang');
      window.pushBase64Chunk(base64.slice(0, 1));
      const unfinished = await window.parseHelp();
      let pos = 1;
      const sizes = [2, 5, 17, 64, 3];
      let part = 0;
      while (pos < base64.length) {
        const size = sizes[part++ % sizes.length];
        window.pushBase64Chunk(base64.slice(pos, pos + size) + (part % 4 == 0 ? '\n' : ''));
        pos += size;
      }
      window.endBase64Transfer();
      const promise = window.parseHelp();
      window.showHelp();
      const during = document.querySelector('.bsl-help-message').textContent;
      const parsed = await promise;
      const repeated = await window.parseHelp();
      return { missing: missing, unfinished: unfinished, during: during, parsed: parsed, repeated: repeated };
    }, hbk);
    if (result.missing.ok || result.missing.error.indexOf('Нет завершённой') < 0)
      errors.push('missing staged transfer: ' + JSON.stringify(result.missing));
    if (result.unfinished.ok || result.unfinished.error.indexOf('не завершена') < 0)
      errors.push('unfinished transfer: ' + JSON.stringify(result.unfinished));
    if (result.during.indexOf('Загрузка') < 0) errors.push('loading state: ' + result.during);
    if (!result.parsed.ok || result.parsed.kind != 'language' || result.parsed.pages != 3)
      errors.push('parseHelp result: ' + JSON.stringify(result.parsed));
    if (!result.repeated.ok || result.repeated.kind != 'language' || result.repeated.pages != 3)
      errors.push('repeated staged parseHelp: ' + JSON.stringify(result.repeated));

    const deferredError = await page.evaluate(async function () {
      let thrown = null;
      window.beginBase64Transfer('broken');
      try { window.pushBase64Chunk('AQ$D'); }
      catch (error) { thrown = error && error.message || String(error); }
      window.endBase64Transfer();
      const first = await window.parseHelp();
      const repeated = await window.parseHelp();
      return { thrown: thrown, first: first, repeated: repeated };
    });
    if (deferredError.thrown || deferredError.first.ok
      || deferredError.first.error.indexOf('Некорректная') < 0
      || deferredError.repeated.error != deferredError.first.error)
      errors.push('deferred Base64 error: ' + JSON.stringify(deferredError));

    const heartbeat = await page.evaluate(async function () {
      let ticks = 0;
      const timer = setInterval(function () { ticks++; }, 0);
      window.beginBase64Transfer('large-invalid-hbk');
      window.pushBase64Chunk('A'.repeat(8 * 1024 * 1024));
      window.endBase64Transfer();
      const before = ticks;
      const parsed = await window.parseHelp();
      clearInterval(timer);
      return { before: before, after: ticks, parsed: parsed };
    });
    if (heartbeat.parsed.ok || heartbeat.after <= heartbeat.before)
      errors.push('Base64 worker heartbeat: ' + JSON.stringify(heartbeat));

    const dual = await page.evaluate(async function (contextBase64, languageBase64) {
      function bytes(value) {
        const raw = atob(value);
        const result = new Uint8Array(raw.length);
        for (let index = 0; index < raw.length; index++) result[index] = raw.charCodeAt(index);
        return result;
      }
      function encode(value) {
        let raw = '';
        for (let index = 0; index < value.length; index++) raw += String.fromCharCode(value[index]);
        return btoa(raw);
      }
      function transfer(name, value, chunkSize) {
        window.beginBase64Transfer(name);
        for (let position = 0; position < value.length; position += chunkSize)
          window.pushBase64Chunk(encode(value.subarray(position, position + chunkSize)));
        window.endBase64Transfer();
        return window.parseHelp();
      }
      function readyEvents() {
        return window.events_queue.filter(function (item) { return item.event == 'EVENT_ON_HELP_READY'; });
      }
      window.events_queue.length = 0;
      const contextPromise = transfer('shcntx', bytes(contextBase64), 17);
      const languagePromise = transfer('shlang', bytes(languageBase64), 16);
      window.showHelp();
      const parsed = await Promise.all([contextPromise, languagePromise]);
      const eventsAfterFirst = readyEvents().length;
      const repeatedContext = await window.parseHelp(contextBase64);
      const eventsAfterRepeat = readyEvents().length;
      const failedContext = await window.parseHelp(new Blob([new Uint8Array([1, 2, 3])]));
      const eventsAfterFailure = readyEvents().length;
      const repeatedLanguage = await window.parseHelp(languageBase64);
      const ready = readyEvents();
      return {
        parsed: parsed,
        repeatedContext: repeatedContext,
        failedContext: failedContext,
        repeatedLanguage: repeatedLanguage,
        eventsAfterFirst: eventsAfterFirst,
        eventsAfterRepeat: eventsAfterRepeat,
        eventsAfterFailure: eventsAfterFailure,
        readyEvents: ready.map(function (item) { return { event: item.event, hasParams: item.params !== undefined }; }),
        titles: Array.prototype.map.call(document.querySelectorAll('.bsl-help-tree-title'), function (node) {
          return node.textContent;
        })
      };
    }, makeContextHbk().toString('base64'), makeLanguageHbk().toString('base64'));
    if (!dual.parsed[0].ok || dual.parsed[0].kind != 'context' || !dual.parsed[1].ok || dual.parsed[1].kind != 'language')
      errors.push('two queued HBK: ' + JSON.stringify(dual));
    if (!dual.repeatedContext.ok || dual.eventsAfterFirst != 1 || dual.eventsAfterRepeat != 2
      || dual.eventsAfterFailure != 2 || dual.failedContext.ok || !dual.repeatedLanguage.ok
      || dual.readyEvents.length != 2 || dual.readyEvents.some(function (event) { return event.hasParams; }))
      errors.push('EVENT_ON_HELP_READY: ' + JSON.stringify(dual));
    if (dual.titles.indexOf('Выполнить') < 0 || dual.titles.indexOf('Общее описание') < 0)
      errors.push('two package navigation: ' + JSON.stringify(dual.titles));

    await page.evaluate(function () {
      window.__capturedHelpEvents.length = 0;
      window.__indexMetaMutations = 0;
      window.__indexMetaObserver = new MutationObserver(function (records) { window.__indexMetaMutations += records.length; });
      window.__indexMetaObserver.observe(document.querySelector('.bsl-help-panel[data-tab=index] .bsl-help-meta'), { childList: true, characterData: true, subtree: true });
      window.editor.setValue('Выполнить()');
      window.editor.setPosition({ lineNumber: 1, column: 3 });
      window.editor.focus();
    });
    await page.keyboard.down('Control'); await page.keyboard.press('F1'); await page.keyboard.up('Control');
    await page.waitForFunction('document.querySelector(".bsl-help-panel[data-tab=index].active")'
      + ' && document.querySelector(".bsl-help-panel[data-tab=index] .bsl-help-input").value == "Выполнить"'
      + ' && document.querySelector(".bsl-help-article").textContent.indexOf("Первая синтетическая статья") >= 0',
      { timeout: 5000 }).catch(function () {});
    const multipleLookup = await page.evaluate(function () {
      window.__indexMetaObserver.disconnect();
      return {
        active: document.querySelector('.bsl-help-panel[data-tab=index]').classList.contains('active'),
        input: document.querySelector('.bsl-help-panel[data-tab=index] .bsl-help-input').value,
        meta: document.querySelector('.bsl-help-panel[data-tab=index] .bsl-help-meta').textContent,
        titles: Array.prototype.map.call(document.querySelectorAll('.bsl-help-panel[data-tab=index] .bsl-help-list-title'), function (node) {
          return node.textContent;
        }),
        article: document.querySelector('.bsl-help-article').textContent,
        events: window.__capturedHelpEvents.slice(), indexRenders: window.__indexMetaMutations
      };
    });
    if (!multipleLookup.active || multipleLookup.input != 'Выполнить' || multipleLookup.titles.length < 2
      || multipleLookup.titles[0] != 'Выполнить'
      || multipleLookup.titles[1] != 'ВыполнитьПакет' || multipleLookup.article.indexOf('ВыполнитьПакет') >= 0
      || multipleLookup.indexRenders != 1
      || multipleLookup.events.length != 1 || multipleLookup.events[0].event != 'EVENT_ON_GET_HELP'
      || multipleLookup.events[0].params.word != 'выполнить')
      errors.push('Ctrl+F1 first prefix result: ' + JSON.stringify(multipleLookup));

    await page.click('.bsl-help-tab[data-tab="search"]');
    await page.click('.bsl-help-close');
    await page.evaluate(function () {
      window.__capturedHelpEvents.length = 0;
      window.editor.setValue('()');
      window.editor.setPosition({ lineNumber: 1, column: 1 });
      window.editor.focus();
    });
    await page.keyboard.down('Control'); await page.keyboard.press('F1'); await page.keyboard.up('Control');
    await page.waitForSelector('.bsl-help-overlay.visible');
    if (!await page.$eval('.bsl-help-panel[data-tab="search"]', function (node) { return node.classList.contains('active'); }))
      errors.push('Ctrl+F1 without word changed the active tab');
    if (await page.evaluate(function () { return window.__capturedHelpEvents.length; }))
      errors.push('Ctrl+F1 without word generated EVENT_ON_GET_HELP');
    await page.click('.bsl-help-close');

    await page.evaluate(function () {
      window.editor.setValue('НесуществующееСлово()');
      window.editor.setPosition({ lineNumber: 1, column: 3 });
      window.editor.focus();
    });
    await page.keyboard.down('Control'); await page.keyboard.press('F1'); await page.keyboard.up('Control');
    await page.waitForFunction('document.querySelector(".bsl-help-panel[data-tab=index] .bsl-help-meta").textContent == "Найдено: 0"');
    const noMatchArticle = await page.$eval('.bsl-help-article', function (node) { return node.textContent; });
    if (noMatchArticle.indexOf('Первая синтетическая статья') < 0)
      errors.push('Ctrl+F1 no-match replaced the current article');

    await page.click('.bsl-help-tab[data-tab="index"]');
    await page.$eval('.bsl-help-panel[data-tab="index"] .bsl-help-input', function (input) {
      window.__indexMetaMutations = 0;
      window.__indexMetaObserver = new MutationObserver(function (records) { window.__indexMetaMutations += records.length; });
      window.__indexMetaObserver.observe(document.querySelector('.bsl-help-panel[data-tab=index] .bsl-help-meta'), { childList: true, characterData: true, subtree: true });
      ['С', 'СТ', 'СТР'].forEach(function (value) {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
    await page.waitForFunction('document.querySelector(".bsl-help-panel[data-tab=index] .bsl-help-input").value == "СТР" && document.querySelectorAll(".bsl-help-panel[data-tab=index] .bsl-help-list-row").length > 0');
    const indexTyping = await page.evaluate(function () {
      window.__indexMetaObserver.disconnect();
      const row = document.querySelector('.bsl-help-panel[data-tab="index"] .bsl-help-list-row');
      const context = row.querySelector('.bsl-help-list-context');
      return { context: { text: context && context.textContent, title: row.title, color: context && getComputedStyle(context).color }, renders: window.__indexMetaMutations };
    });
    if (indexTyping.renders != 1 || !indexTyping.context.text || indexTyping.context.text.indexOf('(Встроенный язык/') < 0 || !indexTyping.context.title)
      errors.push('index input/context: ' + JSON.stringify(indexTyping));
    await page.$eval('.bsl-help-panel[data-tab="index"] .bsl-help-input', function (input) {
      input.value = 'ЧИ'; input.dispatchEvent(new Event('input', { bubbles: true }));
      input.value = 'Ч'; input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction('document.querySelector(".bsl-help-panel[data-tab=index] .bsl-help-input").value == "Ч" && document.querySelector(".bsl-help-panel[data-tab=index] .bsl-help-list-title").textContent == "Число"');
    await page.$eval('.bsl-help-panel[data-tab="index"] .bsl-help-input', function (input) {
      input.value = 'СТР'; input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction('document.querySelector(".bsl-help-panel[data-tab=index] .bsl-help-list-title").textContent.indexOf("Строка") == 0');
    await page.click('.bsl-help-panel[data-tab="index"] .bsl-help-list-row');
    await page.waitForFunction('document.querySelector(".bsl-help-article").textContent.indexOf("Unicode") >= 0');

    await page.click('.bsl-help-tab[data-tab="search"]');
    await page.type('.bsl-help-panel[data-tab="search"] .bsl-help-input', 'ЕЛКА строка');
    await page.waitForFunction('document.querySelector(".bsl-help-panel[data-tab=search] .bsl-help-meta").textContent.indexOf("1") >= 0');
    await page.click('.bsl-help-panel[data-tab="search"] .bsl-help-list-row');
    await page.waitForFunction('document.querySelectorAll(".bsl-help-article mark").length >= 2');

    await page.click('.bsl-help-tab[data-tab="contents"]');
    await page.evaluate(function () {
      const titles = document.querySelectorAll('.bsl-help-tree-title');
      for (let index = 0; index < titles.length; index++) {
        if (titles[index].textContent == 'Общее описание') { titles[index].click(); return; }
      }
    });
    await page.waitForSelector('.bsl-help-article #internal');
    const security = await page.evaluate(function () {
      return {
        scripts: document.querySelectorAll('.bsl-help-article script').length,
        handlers: document.querySelectorAll('.bsl-help-article [onerror]').length,
        imageSource: document.querySelector('.bsl-help-article img') && document.querySelector('.bsl-help-article img').getAttribute('src'),
        target: document.querySelector('.bsl-help-article #external').getAttribute('target'),
        rel: document.querySelector('.bsl-help-article #external').getAttribute('rel')
      };
    });
    if (security.scripts || security.handlers || security.imageSource || security.target != '_blank' || security.rel.indexOf('noopener') < 0)
      errors.push('sanitizer: ' + JSON.stringify(security));
    await page.click('.bsl-help-article #internal');
    await page.waitForFunction('document.querySelector(".bsl-help-article").textContent.indexOf("Unicode") >= 0');
    if (await page.$eval('.bsl-help-icon', function (button) { return button.disabled; })) errors.push('history back disabled');
    await page.click('.bsl-help-icon');
    await page.waitForSelector('.bsl-help-article #internal');

    await page.click('.bsl-help-tab[data-tab="contents"]');
    await page.evaluate(function () {
      const titles = document.querySelectorAll('.bsl-help-tree-title');
      for (let index = 0; index < titles.length; index++) {
        if (titles[index].textContent == 'ТестовыйОбъект') { titles[index].click(); return; }
      }
    });
    await page.waitForSelector('.bsl-help-article #relative-context');
    await page.click('.bsl-help-article #relative-context');
    await page.waitForFunction('document.querySelector(".bsl-help-article").textContent.indexOf("Синтаксис выполнения") >= 0');
    const relativeTarget = await page.evaluate(function () {
      return {
        title: document.querySelector('.bsl-help-article h1').textContent,
        anchor: document.querySelector('.bsl-help-article #syntax') !== null,
        scrollTop: document.querySelector('.bsl-help-article').scrollTop,
        backDisabled: document.querySelector('.bsl-help-icon').disabled
      };
    });
    if (relativeTarget.title != 'Выполнить' || !relativeTarget.anchor || relativeTarget.scrollTop <= 0
      || relativeTarget.backDisabled)
      errors.push('relative context link: ' + JSON.stringify(relativeTarget));
    await page.click('.bsl-help-icon');
    await page.waitForSelector('.bsl-help-article #relative-context');

    async function shortcutFor(mode, diffSide) {
      await page.evaluate(function (requestedMode, requestedSide) {
        document.querySelector('.bsl-help-close').click();
        window.__capturedHelpEvents.length = 0;
        if (window.editor.navi) window.compare();
        window.setLanguageMode(requestedMode == 'query' ? 'bsl_query' : 'bsl');
        window.editor.setValue('Строка()');
        if (requestedMode == 'diff') window.compare('Строка()\n// diff');
        const target = window.editor.navi
          ? (requestedSide == 'original' ? window.editor.getOriginalEditor() : window.editor.getModifiedEditor())
          : window.editor;
        target.setPosition({ lineNumber: 1, column: 3 });
        target.focus();
      }, mode, diffSide);
      if (mode == 'diff') await new Promise(function (resolve) { setTimeout(resolve, 80); });
      await page.keyboard.down('Control'); await page.keyboard.press('F1'); await page.keyboard.up('Control');
      await page.waitForFunction('document.querySelector(".bsl-help-overlay.visible")'
        + ' && document.querySelector(".bsl-help-panel[data-tab=index].active")'
        + ' && document.querySelector(".bsl-help-panel[data-tab=index] .bsl-help-input").value == "Строка"'
        + ' && document.querySelector(".bsl-help-article").textContent.indexOf("Unicode") >= 0');
      const shortcutEvents = await page.evaluate(function () { return window.__capturedHelpEvents.slice(); });
      if (shortcutEvents.length != 1 || shortcutEvents[0].event != 'EVENT_ON_GET_HELP'
        || shortcutEvents[0].params.word != 'строка')
        errors.push('Ctrl+F1 event in ' + mode + '/' + (diffSide || '') + ': ' + JSON.stringify(shortcutEvents));
      await page.keyboard.press('Escape');
    }
    await shortcutFor('normal');
    await shortcutFor('query');
    await shortcutFor('diff', 'modified');
    await shortcutFor('diff', 'original');
    const focusReturned = await page.evaluate(function () {
      return {
        original: window.editor.getOriginalEditor().hasTextFocus(),
        modified: window.editor.getModifiedEditor().hasTextFocus(),
        activeTag: document.activeElement && document.activeElement.tagName,
        activeClass: document.activeElement && document.activeElement.className
      };
    });
    if (!focusReturned.original) errors.push('focus did not return to the active diff editor: ' + JSON.stringify(focusReturned));

    const pendingStarted = await page.evaluate(function (contextBase64) {
      if (window.editor.navi) window.compare();
      window.setLanguageMode('bsl');
      window.editor.setValue('ОтложенныйМетод()');
      window.editor.setPosition({ lineNumber: 1, column: 3 });
      window.editor.focus();
      window.__capturedHelpEvents.length = 0;
      window.__pendingHelpParse = window.parseHelp(contextBase64);
      window.editor.trigger('headless', 'bsl.showHelp');
      return {
        visible: document.querySelector('.bsl-help-overlay').classList.contains('visible'),
        events: window.__capturedHelpEvents.slice()
      };
    }, makePendingContextHbk().toString('base64'));
    if (pendingStarted.visible || pendingStarted.events.length != 1
      || pendingStarted.events[0].params.word != 'отложенныйметод')
      errors.push('pending Ctrl+F1 start: ' + JSON.stringify(pendingStarted));
    const pendingResult = await page.evaluate(function () { return window.__pendingHelpParse; });
    if (!pendingResult.ok || pendingResult.kind != 'context')
      errors.push('pending Ctrl+F1 result: ' + JSON.stringify(pendingResult));
    if (await page.$eval('.bsl-help-overlay', function (node) { return node.classList.contains('visible'); }))
      errors.push('pending Ctrl+F1 opened help after parse completion');
    await page.evaluate(function () { window.editor.trigger('headless', 'bsl.showHelp'); });
    await page.waitForFunction('document.querySelector(".bsl-help-overlay.visible")'
      + ' && document.querySelector(".bsl-help-article").textContent.indexOf("Статья загружена после команды") >= 0');
  }
  finally {
    await browser.close();
    server.close();
    try { fs.unlinkSync(testHbkPath); } catch (ignore) { /* noop */ }
  }
  if (errors.length) {
    console.error('[help-headless] ОШИБКИ:'); errors.forEach(function (error) { console.error('  • ' + error); });
    process.exit(1);
  }
  console.log('[help-headless] file loader, Base64 chunks, help-ready event, docked UI, index/search, links, history, sanitizer and Ctrl+F1 word lookup: OK');
}()).catch(function (error) { console.error('[help-headless] fatal:', error && error.stack || error); process.exit(2); });
