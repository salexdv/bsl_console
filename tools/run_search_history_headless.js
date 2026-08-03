// Headless-смоук issue #303 поверх development-сборки и реального DOM Monaco 0.20.
// Использует только Node 22 и установленный Chrome/Edge, без библиотек автоматизации браузера.

const childProcess = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const HTTP_PORT = 9013;
const DEBUG_PORT = 9014;

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium'
  ].filter(Boolean);

  return candidates.find(candidate => {
    try { return fs.existsSync(candidate); }
    catch (error) { return false; }
  });
}

function contentType(file) {
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.ttf': 'font/ttf'
  };
  return types[path.extname(file)] || 'application/octet-stream';
}

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const requestPath = decodeURIComponent(request.url.split('?')[0]);
      const relative = requestPath == '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
      const file = path.resolve(DIST, relative);
      if (!file.startsWith(DIST + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        response.statusCode = 404;
        response.end('not found');
        return;
      }
      response.setHeader('Content-Type', contentType(file));
      fs.createReadStream(file).pipe(response);
    });
    server.once('error', reject);
    server.listen(HTTP_PORT, '127.0.0.1', () => resolve(server));
  });
}

function stopBrowser(browserProcess) {
  return new Promise(resolve => {
    if (browserProcess.exitCode !== null) {
      resolve();
      return;
    }

    const timeout = setTimeout(resolve, 3000);
    browserProcess.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    browserProcess.kill();
  });
}

async function waitForDebugEndpoint(timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch('http://127.0.0.1:' + DEBUG_PORT + '/json/version');
      if (response.ok)
        return;
    }
    catch (error) {
      // Chrome ещё запускается.
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Chrome не открыл порт DevTools за ' + timeoutMs + ' мс');
}

async function createTarget(url) {
  const response = await fetch(
    'http://127.0.0.1:' + DEBUG_PORT + '/json/new?' + encodeURIComponent(url),
    { method: 'PUT' }
  );
  if (!response.ok)
    throw new Error('Не удалось создать вкладку Chrome: HTTP ' + response.status);
  return response.json();
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(this.url);
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
      this.socket.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        if (!message.id) {
          if (message.method == 'Runtime.exceptionThrown' || message.method == 'Network.loadingFailed')
            this.events.push(message);
          return;
        }
        if (!this.pending.has(message.id))
          return;
        const callbacks = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error)
          callbacks.reject(new Error(message.error.message));
        else
          callbacks.resolve(message.result);
      });
    });
  }

  send(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve, reject: reject });
      this.socket.send(JSON.stringify({ id: id, method: method, params: params || {} }));
    });
  }

  async evaluate(expression, awaitPromise = false) {
    const response = await this.send('Runtime.evaluate', {
      expression: expression,
      awaitPromise: awaitPromise,
      returnByValue: true
    });
    if (response.exceptionDetails) {
      const description = response.exceptionDetails.exception && response.exceptionDetails.exception.description;
      throw new Error(description || response.exceptionDetails.text);
    }
    return response.result.value;
  }

  async waitFor(expression, timeoutMs) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (await this.evaluate('Boolean(' + expression + ')'))
        return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Не выполнено условие: ' + expression);
  }

  close() {
    if (this.socket)
      this.socket.close();
  }
}

const uiScenario = String.raw`(async function () {
  const errors = [];
  const restored = window.restoreSearchHistory('[]');
  if (restored !== true)
    errors.push('restoreSearchHistory не вернул true');

  window.openSearchWidget();
  await new Promise(resolve => setTimeout(resolve, 100));

  const button = document.querySelector('.find-widget.visible .bsl-find-history-button');
  const controller = window.editor.getContribution('editor.contrib.findController');
  const widget = controller && controller._widget;
  const inputBox = widget && widget._findInput && widget._findInput.inputBox;
  if (!button || !controller || !widget || !inputBox)
    return { errors: ['не найдены button/controller/widget/inputBox'] };

  function buttonVisualState() {
    const style = getComputedStyle(button);
    const rect = button.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      display: style.display,
      alignItems: style.alignItems,
      justifyContent: style.justifyContent,
      padding: style.padding,
      borderWidth: style.borderWidth,
      backgroundColor: style.backgroundColor,
      boxShadow: style.boxShadow
    };
  }

  const disabledBeforeEnter = button.disabled;
  const disabledVisual = buttonVisualState();
  widget._findInput.setValue('добавлено-по-enter');
  inputBox.inputElement.focus();
  inputBox.inputElement.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Enter', keyCode: 13, bubbles: true
  }));
  const savedByEnter = JSON.parse(window.saveSearchHistory());
  const enabledAfterEnter = !button.disabled;
  const enabledVisual = buttonVisualState();
  const iconVisualStable = disabledVisual.width === enabledVisual.width
    && disabledVisual.height === enabledVisual.height
    && disabledVisual.display === 'flex'
    && enabledVisual.display === 'flex'
    && disabledVisual.alignItems === 'center'
    && enabledVisual.alignItems === 'center'
    && disabledVisual.justifyContent === 'center'
    && enabledVisual.justifyContent === 'center'
    && disabledVisual.padding === '0px'
    && enabledVisual.padding === '0px'
    && disabledVisual.borderWidth === '0px'
    && enabledVisual.borderWidth === '0px'
    && disabledVisual.backgroundColor === 'rgba(0, 0, 0, 0)'
    && enabledVisual.backgroundColor === 'rgba(0, 0, 0, 0)'
    && disabledVisual.boxShadow === 'none'
    && enabledVisual.boxShadow === 'none';

  window.restoreSearchHistory(JSON.stringify(['второй', 'первый']));
  widget._findInput.setValue('добавлено-по-blur');
  inputBox.inputElement.focus();
  await new Promise(resolve => setTimeout(resolve, 650));
  const beforeBlur = JSON.parse(window.saveSearchHistory());
  button.focus();

  const saved = JSON.parse(window.saveSearchHistory());
  const monacoHistory = inputBox.history._elements.slice();
  const replaceHistoryIntact = widget._replaceInput.inputBox.addToHistory !== inputBox.addToHistory;
  button.click();
  const items = Array.from(widget._domNode.querySelectorAll('.bsl-find-history-item'));
  const menu = widget._domNode.querySelector('.bsl-find-history-menu');
  const widgetRect = widget._domNode.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const menuOpened = items.length === 3 && !menu.hidden;
  const openedWithoutActiveItem = document.activeElement === button
    && !items.some(item => document.activeElement === item);
  const menuAttached = Math.abs(menuRect.top - widgetRect.bottom) <= 2
    && Math.abs(menuRect.left - widgetRect.left) <= 2
    && Math.abs(menuRect.right - widgetRect.right) <= 2;
  const itemsHitTestable = items.every(item => {
    const rect = item.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hit === item || item.contains(hit);
  });

  button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));
  const keyboardStarted = document.activeElement === items[0];
  items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));
  const keyboardMoved = document.activeElement === items[1];
  items[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));

  if (!disabledBeforeEnter || !enabledAfterEnter || savedByEnter.join('|') !== 'добавлено-по-enter')
    errors.push('Enter не добавил запрос или не активировал кнопку');
  if (!button.classList.contains('codicon-history') || button.classList.contains('codicon-chevron-down'))
    errors.push('кнопка не использует codicon-history');
  if (!iconVisualStable)
    errors.push('геометрия иконки меняется или у кнопки остаётся фон/рамка');
  if (saved[0] !== 'добавлено-по-blur' || saved.length !== 3)
    errors.push('blur не обновил MRU');
  if (beforeBlur.join('|') !== 'второй|первый')
    errors.push('промежуточное значение записалось до blur');
  if (!replaceHistoryIntact)
    errors.push('переопределена история строки замены');
  if (monacoHistory.join('|') !== 'первый|второй|добавлено-по-blur')
    errors.push('HistoryNavigator Monaco 0.20 не синхронизирован');
  if (!menuOpened || !openedWithoutActiveItem || !menuAttached || !itemsHitTestable
    || !keyboardStarted || !keyboardMoved)
    errors.push('меню обрезано, не примыкает к виджету или клавиатурная навигация не сработала');
  if (controller.getState().searchString !== 'второй' || !menu.hidden)
    errors.push('выбор значения не закрыл меню или не запустил поиск');

  window.compare(window.getText() + '\n// Проверка общей истории', false, true);
  await new Promise(resolve => setTimeout(resolve, 150));
  const modified = window.editor.getModifiedEditor();
  modified.trigger('', 'actions.find');
  await new Promise(resolve => setTimeout(resolve, 100));
  const diffController = modified.getContribution('editor.contrib.findController');
  const diffInputBox = diffController && diffController._widget && diffController._widget._findInput.inputBox;
  const diffHistory = diffInputBox && diffInputBox.history._elements.slice();
  const savedAfterDiffSwitch = JSON.parse(window.saveSearchHistory());
  if (!diffHistory || diffHistory.join('|') !== savedAfterDiffSwitch.slice().reverse().join('|'))
    errors.push('общий MRU не применился в diff-редакторе');

  return {
    errors: errors,
    saved: saved,
    monacoHistory: monacoHistory,
    diffHistory: diffHistory,
    iconVisualStable: iconVisualStable,
    menuAttached: menuAttached,
    itemsHitTestable: itemsHitTestable
  };
})()`;

(async () => {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.error('[headless] Нет dist/index.html — сначала выполните npm run build:headless.');
    process.exit(2);
  }

  const browser = findBrowser();
  if (!browser) {
    console.error('[headless] Не найден Chrome/Edge. Задайте CHROME_PATH.');
    process.exit(2);
  }

  const server = await startServer();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bsl-console-search-history-'));
  const browserProcess = childProcess.spawn(browser, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--remote-allow-origins=*',
    '--remote-debugging-port=' + DEBUG_PORT,
    '--user-data-dir=' + userDataDir,
    'about:blank'
  ], { stdio: 'ignore' });

  let client;
  try {
    await waitForDebugEndpoint(15000);
    const target = await createTarget('http://127.0.0.1:' + HTTP_PORT + '/index.html');
    client = new CdpClient(target.webSocketDebuggerUrl);
    await client.connect();
    await client.send('Runtime.enable');
    await client.send('Network.enable');
    try {
      await client.waitFor(
        'window.editor && typeof window.saveSearchHistory == "function" && typeof window.restoreSearchHistory == "function"',
        15000
      );
    }
    catch (error) {
      const diagnostics = await client.evaluate(`({
        href: location.href,
        readyState: document.readyState,
        editor: typeof window.editor,
        saveSearchHistory: typeof window.saveSearchHistory,
        restoreSearchHistory: typeof window.restoreSearchHistory,
        scripts: Array.from(document.scripts).map(item => item.src || '[inline]'),
        resources: performance.getEntriesByType('resource').map(item => item.name)
      })`);
      console.error('[headless] diagnostics:', JSON.stringify(diagnostics));
      console.error('[headless] browser events:', JSON.stringify(client.events));
      throw error;
    }
    const result = await client.evaluate(uiScenario, true);
    console.log('[headless] search history:', JSON.stringify(result));
    if (result.errors.length) {
      result.errors.forEach(error => console.error('[headless] ' + error));
      process.exitCode = 1;
    }
    else {
      console.log('[headless] OK: мост, MRU, normal/diff, мышь, клавиатура и CSS проверены.');
    }
  }
  finally {
    if (client)
      client.close();
    server.close();
    await stopBrowser(browserProcess);
    fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
})().catch(error => {
  console.error('[headless] fatal:', error && error.stack || error);
  process.exit(3);
});
