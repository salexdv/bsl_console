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
  const childPath = 'objects/TestObject/methods/DeferredChild.html';
  const html = '<html><body><h1 class="V8SH_pagetitle">ОтложенныйМетод</h1><p>Статья загружена после команды.</p></body></html>';
  const childHtml = '<html><body><h1 class="V8SH_pagetitle">Дочерний раздел</h1><p>Гидратация при раскрытии.</p></body></html>';
  const toc = '{2,{1,0,1,2,{1,1,{1,0},"' + pagePath + '"}}'
    + ',{2,1,0,{1,1,{1,0},"' + childPath + '"}}}';
  const files = [{ name: pagePath, data: html }, { name: childPath, data: childHtml }];
  // Достаточно большой хвост удерживает Promise полной CRC-проверки незавершённым,
  // пока предварительное дерево и первая статья уже доступны.
  for (let index = 0; index < 3000; index++)
    files.push({ name: 'objects/Filler/Page' + index + '.html', data: '<html><h1>Страница ' + index + '</h1><p>Фоновая проверка</p></html>' });
  return makeContainer([
    { name: 'FileStorage', data: makeZip(files) },
    { name: 'PackBlock', data: localRecord('0', toc) }
  ]);
}

function makeLanguageHbk() {
  const index = '<html><body><h1 class="V8SH_pagetitle">Общее описание</h1>'
    + '<script>window.__helpUnsafe=1</script><img src="data:text/html,bad" onerror="window.__helpUnsafe=2">'
    + '<a id="internal" href="v8help://SyntaxHelperLanguage/topic">К строке</a>'
    + '<a id="external" href="https://example.com/help">Сайт</a></body></html>';
  const topic = '<html><head><style>.V8SH_section { font-weight: bold; }</style></head><body>'
    + '<h1 class="V8SH_pagetitle">Строка (String)</h1><p class="V8SH_section">Синтаксис:</p>'
    + '<p>Unicode ёлка строка.</p><p class="V8SH_section">Параметры:</p><p>Обычный текст статьи.</p>'
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

function makeBookHbk(bookName, pageName, pageTitle, articleText, scheme) {
  const html = '<html><body><h1 class="V8SH_pagetitle">' + pageTitle + '</h1><p>' + articleText + '</p>'
    + '<a id="self-book-link" href="v8help://' + scheme + '/' + pageName + '#details">Эта статья</a>'
    + '<h2 id="details">Подробности</h2></body></html>';
  const toc = '{2,{1,0,1,2,{1,1,{1,0},""}}'
    + ',{2,1,0,{1,1,{1,1,{"ru","' + pageTitle + '"}},"/' + pageName + '"}}}';
  return makeContainer([
    { name: 'Book', data: Buffer.from('\ufeff{2,"' + bookName + '"}', 'utf8') },
    { name: 'FileStorage', data: makeZip([
      { name: pageName, data: html }, { name: '__categories__', data: '{0}' }
    ]) },
    { name: 'PackBlock', data: localRecord('1', toc) }
  ]);
}

function makeQueryHbk() {
  return makeBookHbk('SyntaxHelperQueries', 'SELECTSection', 'ВЫБРАТЬ',
    'Профильная справка языка запросов.', 'SyntaxHelperQueries');
}

function makeDcsHbk() {
  return makeBookHbk('dcsui', 'SKD_Function', 'СКДФункция',
    'Профильная справка системы компоновки данных.', 'dcsui');
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
      + ' && typeof window.getHelpState == "function"'
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
        if (name == 'EVENT_ON_GET_HELP' || name == 'EVENT_ON_LINK_CLICK')
          window.__capturedHelpEvents.push({ event: name, params: params });
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
      const stateEmpty = window.getHelpState();
      const failed = await window.parseHelp(new Blob([new Uint8Array([1, 2, 3])]));
      window.editor.trigger('headless', 'bsl.showHelp');
      return {
        disabled: disabled,
        emptyVisible: emptyVisible,
        emptyEvents: emptyEvents,
        stateEmpty: stateEmpty,
        failed: failed,
        state: window.getHelpState(),
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
    if (unavailableShortcut.stateEmpty.ready || unavailableShortcut.stateEmpty.status != 'empty')
      errors.push('getHelpState before load: ' + JSON.stringify(unavailableShortcut.stateEmpty));
    if (unavailableShortcut.state.ready || unavailableShortcut.state.status != 'error')
      errors.push('getHelpState after failed load: ' + JSON.stringify(unavailableShortcut.state));

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
      return { missing: missing, unfinished: unfinished, during: during, parsed: parsed, repeated: repeated, state: window.getHelpState() };
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
    if (!result.state.ready || result.state.status != 'ready' || result.state.kinds.indexOf('language') < 0)
      errors.push('getHelpState after load: ' + JSON.stringify(result.state));

    const queryHelp = await page.evaluate(function () {
      if (document.querySelector('.bsl-help-overlay').classList.contains('visible'))
        document.querySelector('.bsl-help-close').click();
      window.showHelp('Строка');
      const active = document.querySelector('.bsl-help-tab.active');
      return {
        opened: document.querySelector('.bsl-help-overlay').classList.contains('visible'),
        tab: active && active.dataset.tab,
        indexValue: document.querySelector('.bsl-help-panel[data-tab="index"] input').value
      };
    });
    await page.waitForFunction('document.querySelector(".bsl-help-article h1")'
      + ' && document.querySelector(".bsl-help-article h1").textContent.indexOf("Строка") >= 0');
    const queryTitle = await page.$eval('.bsl-help-article h1', function (node) { return node.textContent; });
    if (!queryHelp.opened || queryHelp.tab != 'index' || queryHelp.indexValue != 'Строка'
      || queryTitle.indexOf('Строка') < 0)
      errors.push('showHelp(query): ' + JSON.stringify(queryHelp) + ', title: ' + queryTitle);
    await page.evaluate(function () { document.querySelector('.bsl-help-close').click(); });

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

    const emptyProfile = await page.evaluate(function () {
      const overlay = document.querySelector('.bsl-help-overlay');
      if (overlay.classList.contains('visible')) document.querySelector('.bsl-help-close').click();
      window.setLanguageMode('bsl_query');
      window.showHelp();
      const explicit = {
        visible: overlay.classList.contains('visible'),
        message: document.querySelector('.bsl-help-message').textContent
      };
      document.querySelector('.bsl-help-close').click();
      window.showHelp('ВЫБРАТЬ');
      const queried = { visible: overlay.classList.contains('visible') };
      if (queried.visible) document.querySelector('.bsl-help-close').click();
      window.__capturedHelpEvents.length = 0;
      window.setOption('generateGetHelpEvent', true);
      window.editor.setValue('ВЫБРАТЬ');
      window.editor.setPosition({ lineNumber: 1, column: 3 });
      window.editor.focus();
      window.editor.trigger('headless', 'bsl.showHelp');
      const shortcut = {
        visible: overlay.classList.contains('visible'),
        events: window.__capturedHelpEvents.slice()
      };
      window.setLanguageMode('bsl');
      return { explicit: explicit, queried: queried, shortcut: shortcut };
    });
    if (!emptyProfile.explicit.visible || emptyProfile.explicit.message.indexOf('не загружена') < 0
      || emptyProfile.queried.visible
      || emptyProfile.shortcut.visible || emptyProfile.shortcut.events.length != 1
      || emptyProfile.shortcut.events[0].params.word != 'выбрать')
      errors.push('empty profile help: ' + JSON.stringify(emptyProfile));

    const dual = await page.evaluate(async function (contextBase64, languageBase64, queryBase64, dcsBase64) {
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
      const previousSendEvent = window.sendEvent;
      window.__capturedReadyEvents = [];
      window.sendEvent = function (name, params) {
        if (name == 'EVENT_ON_HELP_READY')
          window.__capturedReadyEvents.push({ event: name, params: params });
        return previousSendEvent(name, params);
      };
      function readyEvents() { return window.__capturedReadyEvents; }
      window.events_queue.length = 0;
      const contextPromise = transfer('shcntx', bytes(contextBase64), 17);
      const languagePromise = transfer('shlang', bytes(languageBase64), 16);
      const queryPromise = transfer('shquery', bytes(queryBase64), 15);
      const dcsPromise = transfer('dcsui', bytes(dcsBase64), 14);
      window.showHelp();
      const parsed = await Promise.all([contextPromise, languagePromise, queryPromise, dcsPromise]);
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
        locateDisabled: document.querySelector('.bsl-help-locate').disabled,
        titles: Array.prototype.map.call(document.querySelectorAll('.bsl-help-tree-title'), function (node) {
          return node.textContent;
        })
      };
    }, makeContextHbk().toString('base64'), makeLanguageHbk().toString('base64'),
      makeQueryHbk().toString('base64'), makeDcsHbk().toString('base64'));
    if (!dual.parsed[0].ok || dual.parsed[0].kind != 'context'
      || !dual.parsed[1].ok || dual.parsed[1].kind != 'language'
      || !dual.parsed[2].ok || dual.parsed[2].kind != 'query'
      || !dual.parsed[3].ok || dual.parsed[3].kind != 'dcs')
      errors.push('four queued HBK: ' + JSON.stringify(dual));
    if (!dual.repeatedContext.ok || dual.eventsAfterFirst != 1 || dual.eventsAfterRepeat != 2
      || dual.eventsAfterFailure != 2 || dual.failedContext.ok || !dual.repeatedLanguage.ok
      || dual.readyEvents.length != 2 || dual.readyEvents.some(function (event) { return event.hasParams; }))
      errors.push('EVENT_ON_HELP_READY: ' + JSON.stringify(dual));
    if (!dual.locateDisabled || dual.titles.indexOf('Выполнить') < 0 || dual.titles.indexOf('Общее описание') < 0)
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

    await page.$eval('.bsl-help-panel[data-tab=index] .bsl-help-input', function (input) {
      input.value = 'Строка';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction('document.querySelector(".bsl-help-panel[data-tab=index] .bsl-help-list-title").textContent.indexOf("Строка") == 0');
    await page.click('.bsl-help-panel[data-tab=index] .bsl-help-list-row');
    await page.waitForFunction('document.querySelector(".bsl-help-article").textContent.indexOf("Обычный текст статьи") >= 0');
    const sectionFormatting = await page.evaluate(function () {
      const article = document.querySelector('.bsl-help-article');
      const titles = Array.prototype.map.call(article.querySelectorAll('.bsl-help-section-title'), function (node) {
        return { text: node.textContent, weight: getComputedStyle(node).fontWeight };
      });
      const ordinary = Array.prototype.filter.call(article.querySelectorAll('p'), function (node) {
        return node.textContent == 'Обычный текст статьи.';
      })[0];
      return {
        titles: titles,
        ordinaryWeight: ordinary && getComputedStyle(ordinary).fontWeight,
        styles: article.querySelectorAll('style').length
      };
    });
    if (sectionFormatting.titles.length != 2
      || sectionFormatting.titles.some(function (title) { return title.weight != '700'; })
      || sectionFormatting.ordinaryWeight == '700' || sectionFormatting.styles)
      errors.push('section title formatting: ' + JSON.stringify(sectionFormatting));
    await page.click('.bsl-help-icon');
    await page.waitForFunction('document.querySelector(".bsl-help-article").textContent.indexOf("Первая синтетическая статья") >= 0');

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
      input.value = 'Строка встроенный';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction('document.querySelector(".bsl-help-panel[data-tab=index] .bsl-help-meta").textContent == "Найдено: 1"'
      + ' && document.querySelector(".bsl-help-panel[data-tab=index] .bsl-help-list-title").textContent.indexOf("Строка") == 0');
    await page.$eval('.bsl-help-panel[data-tab="index"] .bsl-help-input', function (input) {
      input.value = 'встроенный';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction('document.querySelector(".bsl-help-panel[data-tab=index] .bsl-help-meta").textContent == "Найдено: 0"');
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

    await page.$eval('.bsl-help-tree', function (tree) {
      tree.style.height = '35px';
      tree.style.flex = '0 0 35px';
    });
    if (await page.$eval('.bsl-help-locate', function (button) { return button.disabled; }))
      errors.push('locate current article is disabled');
    await page.click('.bsl-help-locate');
    await page.waitForFunction('document.querySelector(".bsl-help-panel[data-tab=contents].active")'
      + ' && document.querySelectorAll(".bsl-help-tree-title.current[aria-current=true]").length == 1'
      + ' && document.activeElement == document.querySelector(".bsl-help-tree-title.current")');
    const located = await page.evaluate(function () {
      const tree = document.querySelector('.bsl-help-tree');
      const current = document.querySelector('.bsl-help-tree-title.current');
      const viewport = tree.getBoundingClientRect();
      const row = current.getBoundingClientRect();
      const result = {
        title: current.textContent,
        expanded: document.querySelectorAll('.bsl-help-tree-children.open').length,
        scrollTop: tree.scrollTop,
        visible: row.top >= viewport.top - 1 && row.bottom <= viewport.bottom + 1,
        article: document.querySelector('.bsl-help-article-content').textContent
      };
      tree.style.height = '';
      tree.style.flex = '';
      return result;
    });
    if (located.title.indexOf('Строка') != 0 || located.expanded < 1 || located.scrollTop <= 0
      || !located.visible || located.article.indexOf('Unicode') < 0)
      errors.push('locate current article: ' + JSON.stringify(located));

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
        href: document.querySelector('.bsl-help-article #external').getAttribute('href'),
        target: document.querySelector('.bsl-help-article #external').getAttribute('target'),
        rel: document.querySelector('.bsl-help-article #external').getAttribute('rel')
      };
    });
    if (security.scripts || security.handlers || security.imageSource
      || security.href != 'https://example.com/help' || security.target || security.rel)
      errors.push('sanitizer: ' + JSON.stringify(security));
    await page.evaluate(function () { window.__capturedHelpEvents.length = 0; });
    const externalUrlBefore = page.url();
    const externalPagesBefore = (await browser.pages()).length;
    await page.click('.bsl-help-article #external');
    await page.waitForFunction('window.__capturedHelpEvents.length == 1');
    await new Promise(function (resolve) { setTimeout(resolve, 100); });
    const externalLink = await page.evaluate(function () {
      return { url: location.href, events: window.__capturedHelpEvents.slice() };
    });
    const externalEvent = externalLink.events[0];
    if (externalLink.url != externalUrlBefore || (await browser.pages()).length != externalPagesBefore
      || !externalEvent || externalEvent.event != 'EVENT_ON_LINK_CLICK'
      || externalEvent.params.label != 'Сайт' || externalEvent.params.href != 'https://example.com/help')
      errors.push('external help link: ' + JSON.stringify(externalLink));
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

    const switchedPanel = await page.evaluate(function () {
      function state() {
        return {
          visible: document.querySelector('.bsl-help-overlay').classList.contains('visible'),
          titles: Array.prototype.map.call(document.querySelectorAll('.bsl-help-tree-title'), function (node) {
            return node.textContent;
          }),
          article: document.querySelector('.bsl-help-article-content').textContent,
          backDisabled: document.querySelector('.bsl-help-icon').disabled,
          locateDisabled: document.querySelector('.bsl-help-locate').disabled,
          currentTreeItems: document.querySelectorAll('.bsl-help-tree-title.current').length,
          index: document.querySelector('.bsl-help-panel[data-tab=index] .bsl-help-input').value,
          search: document.querySelector('.bsl-help-panel[data-tab=search] .bsl-help-input').value
        };
      }
      window.setLanguageMode('bsl_query');
      const query = state();
      window.setLanguageMode('dcs_query');
      const dcs = state();
      window.setLanguageMode('bsl');
      return { query: query, dcs: dcs };
    });
    if (!switchedPanel.query.visible || switchedPanel.query.titles.indexOf('ВЫБРАТЬ') < 0
      || switchedPanel.query.titles.indexOf('Строка (String)') >= 0 || switchedPanel.query.article
      || !switchedPanel.query.backDisabled || !switchedPanel.query.locateDisabled || switchedPanel.query.currentTreeItems
      || switchedPanel.query.index || switchedPanel.query.search
      || switchedPanel.dcs.titles.indexOf('СКДФункция') < 0
      || switchedPanel.dcs.titles.indexOf('ВЫБРАТЬ') >= 0 || switchedPanel.dcs.article
      || !switchedPanel.dcs.locateDisabled || switchedPanel.dcs.currentTreeItems)
      errors.push('open panel mode switch: ' + JSON.stringify(switchedPanel));

    async function shortcutFor(mode, diffSide) {
      const expected = mode == 'query'
        ? { word: 'ВЫБРАТЬ', article: 'Профильная справка языка запросов.' }
        : (mode == 'dcs'
          ? { word: 'СКДФункция', article: 'Профильная справка системы компоновки данных.' }
          : { word: 'Строка', article: 'Unicode' });
      await page.evaluate(function (requestedMode, requestedSide, requestedWord) {
        document.querySelector('.bsl-help-close').click();
        window.__capturedHelpEvents.length = 0;
        if (window.editor.navi) window.compare();
        window.setLanguageMode(requestedMode == 'query' ? 'bsl_query'
          : (requestedMode == 'dcs' ? 'dcs_query' : 'bsl'));
        window.editor.setValue(requestedWord + '()');
        if (requestedMode == 'diff') window.compare(requestedWord + '()\n// diff');
        const target = window.editor.navi
          ? (requestedSide == 'original' ? window.editor.getOriginalEditor() : window.editor.getModifiedEditor())
          : window.editor;
        target.setPosition({ lineNumber: 1, column: 3 });
        target.focus();
      }, mode, diffSide, expected.word);
      if (mode == 'diff') await new Promise(function (resolve) { setTimeout(resolve, 80); });
      await page.keyboard.down('Control'); await page.keyboard.press('F1'); await page.keyboard.up('Control');
      await page.waitForFunction(function (word, article) {
        return document.querySelector('.bsl-help-overlay.visible')
          && document.querySelector('.bsl-help-panel[data-tab=index].active')
          && document.querySelector('.bsl-help-panel[data-tab=index] .bsl-help-input').value == word
          && document.querySelector('.bsl-help-article').textContent.indexOf(article) >= 0;
      }, {}, expected.word, expected.article);
      const shortcutState = await page.evaluate(function () {
        function editorState(editor) {
          const position = editor.getPosition();
          return {
            focused: editor.hasTextFocus(),
            position: position,
            word: position ? editor.getModel().getWordAtPosition(position) : null,
            action: !!editor.getAction('bsl.showHelp')
          };
        }
        return {
          events: window.__capturedHelpEvents.slice(),
          generateGetHelpEvent: window.getOption('generateGetHelpEvent'),
          normal: window.editor.navi ? null : editorState(window.editor),
          original: window.editor.navi ? editorState(window.editor.getOriginalEditor()) : null,
          modified: window.editor.navi ? editorState(window.editor.getModifiedEditor()) : null
        };
      });
      const shortcutEvents = shortcutState.events;
      if (shortcutEvents.length != 1 || shortcutEvents[0].event != 'EVENT_ON_GET_HELP'
        || shortcutEvents[0].params.word != expected.word.toLocaleLowerCase())
        errors.push('Ctrl+F1 event in ' + mode + '/' + (diffSide || '') + ': ' + JSON.stringify(shortcutState));
      await page.keyboard.press('Escape');
    }
    await shortcutFor('normal');
    await shortcutFor('query');
    await shortcutFor('dcs');
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
      window.__pendingHelpResolved = false;
      window.__pendingHelpParse = window.parseHelp(contextBase64);
      window.__pendingHelpParse.then(function () { window.__pendingHelpResolved = true; });
      window.editor.trigger('headless', 'bsl.showHelp');
      return {
        visible: document.querySelector('.bsl-help-overlay').classList.contains('visible'),
        events: window.__capturedHelpEvents.slice()
      };
    }, makePendingContextHbk().toString('base64'));
    if (pendingStarted.visible || pendingStarted.events.length != 1
      || pendingStarted.events[0].params.word != 'отложенныйметод')
      errors.push('pending Ctrl+F1 start: ' + JSON.stringify(pendingStarted));
    await page.waitForFunction('!window.__pendingHelpResolved'
      + ' && Array.prototype.some.call(document.querySelectorAll(".bsl-help-tree-title"), function (node) {'
      + ' return node.textContent.indexOf("ОтложенныйМетод") >= 0; })', { timeout: 30000 });
    await page.evaluate(function () { window.showHelp(); });
    await page.evaluate(function () { document.querySelector('.bsl-help-tree-toggle').click(); });
    await page.waitForFunction('!window.__pendingHelpResolved'
      + ' && Array.prototype.some.call(document.querySelectorAll(".bsl-help-tree-title"), function (node) {'
      + ' return node.textContent == "Дочерний раздел"; })'
      + ' && !Array.prototype.some.call(document.querySelectorAll(".bsl-help-tree-title"), function (node) {'
      + ' return /^catalog\\d+$/i.test(node.textContent); })', { timeout: 30000 });
    await page.evaluate(function () { window.editor.trigger('headless', 'bsl.showHelp'); });
    await page.waitForFunction('document.querySelector(".bsl-help-overlay.visible")'
      + ' && document.querySelector(".bsl-help-article").textContent.indexOf("Статья загружена после команды") >= 0');
    const pendingResult = await page.evaluate(function () { return window.__pendingHelpParse; });
    if (!pendingResult.ok || pendingResult.kind != 'context')
      errors.push('pending Ctrl+F1 result: ' + JSON.stringify(pendingResult));
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
  console.log('[help-headless] file loader, Base64 chunks, help-ready event, docked UI, index/search, tree locating, links, history, sanitizer and Ctrl+F1 word lookup: OK');
}()).catch(function (error) { console.error('[help-headless] fatal:', error && error.stack || error); process.exit(2); });
