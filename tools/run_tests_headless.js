// Headless-раннер сборки спайка Monaco 0.55 (T2 из specs/monaco-0.55/analysis.md §4.3).
//
// Этап 1 (сейчас): грузит dist/index.html в системный Chrome/Edge (puppeteer-core),
// ждёт готовности редактора (window.__spikeReady), ловит ошибки консоли/страницы и
// внешние файловые запросы, печатает в редактор через API и читает назад. Нон-зеро
// exit при любом провале — годится как CI-гейт.
//
// Этап 3 (потом): если на странице есть window.mochaResults — раннер дождётся его и
// провалится при failures>0 (те же 123 mocha-кейса в headless-браузере).
//
// Зависимость — puppeteer-core + СИСТЕМНЫЙ Chrome/Edge (без скачивания Chromium).
// Путь к браузеру: CHROME_PATH или автоопределение ниже.

const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const localeArg = process.argv.find((arg) => arg.indexOf('--locale=') === 0);
const EXPECTED_MONACO_LOCALE = localeArg ? localeArg.substring('--locale='.length) : 'ru';
if (EXPECTED_MONACO_LOCALE !== 'ru' && EXPECTED_MONACO_LOCALE !== 'en') {
  console.error('Неизвестная ожидаемая локаль Monaco: ' + EXPECTED_MONACO_LOCALE + '. Допустимы ru и en.');
  process.exit(2);
}

const DIST = path.resolve(__dirname, '..', 'dist');
const PORT = 9007;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.ttf': 'font/ttf', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.gif': 'image/gif', '.wasm': 'application/wasm'
};

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium'
  ].filter(Boolean);
  return candidates.find((c) => { try { return fs.existsSync(c); } catch (e) { return false; } }) || null;
}

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/favicon.ico') { res.statusCode = 204; res.end(); return; }
      if (p === '/') p = '/index.html';
      const file = path.join(DIST, p);
      if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.statusCode = 404; res.end('not found'); return;
      }
      res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
      fs.createReadStream(file).pipe(res);
    });
    server.listen(PORT, () => resolve(server));
  });
}

async function checkModernPointerDrag(browser, errors) {
  const page = await browser.newPage();
  try {
    await page.bringToFront();
    await page.goto('http://localhost:' + PORT + '/index.html', { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction('!!window.editor && typeof window.monaco !== "undefined"', { timeout: 30000 });

    const dimensions = await page.evaluate(async () => {
    const editor = window.editor;
    const longTail = new Array(300).join('ДлиннаяСтрока');
    const lines = [];
    for (let i = 0; i < 300; i++) lines.push('Строка' + i + ' = "' + longTail + '";');
    editor.setValue(lines.join('\n'));
    editor.updateOptions({ wordWrap: 'off' });
    editor.layout();
    editor.setPosition({ lineNumber: 1, column: editor.getModel().getLineMaxColumn(1) });
    editor.revealPosition(editor.getPosition());
    editor.render(true);
    await new Promise((resolve) => setTimeout(resolve, 50));
    editor.setScrollPosition({ scrollTop: 0, scrollLeft: 0 });
    return {
      pointerEvent: typeof window.PointerEvent,
      scrollWidth: editor.getScrollWidth()
    };
    });

    async function drag(selector, deltaX, deltaY) {
      const slider = await page.$(selector);
      if (!slider) return false;
      const rect = await slider.boundingBox();
      if (!rect) return false;
      const startX = rect.x + Math.max(1, Math.min(rect.width / 2, rect.width - 1));
      const startY = rect.y + Math.max(1, Math.min(rect.height / 2, rect.height - 1));
      await page.mouse.move(startX, startY);
      await page.mouse.down({ button: 'left' });
      await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 4 });
      await page.mouse.up({ button: 'left' });
      return true;
    }

    const verticalFound = await drag('.monaco-scrollable-element > .scrollbar.vertical > .slider', 0, 80);
    const scrollTop = await page.evaluate(() => window.editor.getScrollTop());
    await page.evaluate(() => window.editor.setScrollPosition({ scrollTop: 0, scrollLeft: 0 }));
    const horizontalFound = await drag('.monaco-scrollable-element > .scrollbar.horizontal > .slider', 80, 0);
    const scrollLeft = await page.evaluate(() => window.editor.getScrollLeft());

    if (dimensions.pointerEvent !== 'function') errors.push('modern pointer smoke: PointerEvent недоступен в Chrome');
    if (!verticalFound || !(scrollTop > 0)) errors.push('modern pointer smoke: вертикальный slider не перетаскивается');
    if (!horizontalFound || !(scrollLeft > 0)) errors.push('modern pointer smoke: горизонтальный slider не перетаскивается');
    console.log('[headless] modern scrollbar drag:',
      'vertical=' + scrollTop, '| horizontal=' + scrollLeft,
      '| scrollWidth=' + dimensions.scrollWidth, '| PointerEvent=' + dimensions.pointerEvent);
  } catch (e) {
    errors.push('modern pointer smoke threw: ' + ((e && e.stack) || (e && e.message) || e));
  } finally {
    await page.close();
  }
}

async function checkLegacyPointerDrag(browser, errors) {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') pageErrors.push('console.error: ' + msg.text()); });
  page.on('pageerror', (err) => pageErrors.push('pageerror: ' + ((err && err.stack) || (err && err.message) || err)));

  // Эмулируем WebKit поля 1С: PointerEvent отсутствует, а жест приходит как
  // mousedown/mousemove/mouseup. События отправляем программно, чтобы Chromium не
  // добавлял собственную нативную pointer-последовательность.
  await page.evaluateOnNewDocument(() => { delete window.PointerEvent; });

  try {
    await page.bringToFront();
    await page.goto('http://localhost:' + PORT + '/index.html', { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction('!!window.editor && typeof window.monaco !== "undefined"', { timeout: 30000 });

    const result = await page.evaluate(async () => {
      const editor = window.editor;
      const longTail = new Array(300).join('ДлиннаяСтрока');
      const lines = [];
      for (let i = 0; i < 300; i++) lines.push('Строка' + i + ' = "' + longTail + '";');
      editor.setValue(lines.join('\n'));
      editor.updateOptions({ wordWrap: 'off' });
      editor.layout();
      editor.setPosition({ lineNumber: 1, column: editor.getModel().getLineMaxColumn(1) });
      editor.revealPosition(editor.getPosition());
      editor.render(true);
      await new Promise((resolve) => setTimeout(resolve, 50));
      editor.setScrollPosition({ scrollTop: 0, scrollLeft: 0 });

      function drag(selector, deltaX, deltaY) {
        const slider = document.querySelector(selector);
        if (!slider) return { found: false };
        const rect = slider.getBoundingClientRect();
        const startX = rect.left + Math.max(1, Math.min(rect.width / 2, rect.width - 1));
        const startY = rect.top + Math.max(1, Math.min(rect.height / 2, rect.height - 1));
        const eventOptions = {
          bubbles: true,
          cancelable: true,
          view: window,
          button: 0,
          buttons: 1,
          clientX: startX,
          clientY: startY
        };
        slider.dispatchEvent(new MouseEvent('mousedown', eventOptions));
        slider.dispatchEvent(new MouseEvent('mousemove', Object.assign({}, eventOptions, {
          clientX: startX + deltaX,
          clientY: startY + deltaY
        })));
        slider.dispatchEvent(new MouseEvent('mouseup', Object.assign({}, eventOptions, {
          button: 0,
          buttons: 0,
          clientX: startX + deltaX,
          clientY: startY + deltaY
        })));
        return { found: true, width: rect.width, height: rect.height };
      }

      const vertical = drag('.monaco-scrollable-element > .scrollbar.vertical > .slider', 0, 80);
      const scrollTop = editor.getScrollTop();
      editor.setScrollPosition({ scrollTop: 0, scrollLeft: 0 });
      const horizontal = drag('.monaco-scrollable-element > .scrollbar.horizontal > .slider', 80, 0);
      const scrollLeft = editor.getScrollLeft();

      return {
        pointerEvent: typeof window.PointerEvent,
        verticalFound: vertical.found,
        horizontalFound: horizontal.found,
        horizontalSliderWidth: horizontal.width,
        scrollWidth: editor.getScrollWidth(),
        contentWidth: editor.getLayoutInfo().contentWidth,
        lineMaxColumn: editor.getModel().getLineMaxColumn(1),
        wordWrap: editor.getOption(window.monaco.editor.EditorOption.wordWrap),
        scrollTop: scrollTop,
        scrollLeft: scrollLeft
      };
    });

    if (result.pointerEvent !== 'undefined') errors.push('legacy pointer smoke: window.PointerEvent не отключён');
    if (!result.verticalFound) errors.push('legacy pointer smoke: не найден вертикальный slider Monaco');
    if (!result.horizontalFound) errors.push('legacy pointer smoke: не найден горизонтальный slider Monaco');
    if (!(result.scrollTop > 0)) errors.push('legacy pointer smoke: вертикальный slider не изменил scrollTop');
    if (!(result.scrollLeft > 0)) errors.push('legacy pointer smoke: горизонтальный slider не изменил scrollLeft');
    pageErrors.forEach((e) => errors.push('legacy pointer smoke: ' + e));
    console.log('[headless] legacy WebKit scrollbar drag:',
      'vertical=' + result.scrollTop, '| horizontal=' + result.scrollLeft,
      '| scrollWidth=' + result.scrollWidth, '| contentWidth=' + result.contentWidth,
      '| lineMaxColumn=' + result.lineMaxColumn, '| wordWrap=' + result.wordWrap,
      '| horizontalSlider=' + result.horizontalSliderWidth,
      '| PointerEvent=' + result.pointerEvent);
  } catch (e) {
    errors.push('legacy pointer smoke threw: ' + ((e && e.stack) || (e && e.message) || e));
  } finally {
    await page.close();
  }
}

(async () => {
  const exe = findBrowser();
  if (!exe) { console.error('Не найден Chrome/Edge. Задайте переменную окружения CHROME_PATH.'); process.exit(2); }
  if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.error('Нет dist/index.html — сначала соберите (npm run build).'); process.exit(2); }

  const server = await serve();
  const errors = [];
  const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  try {
    const page = await browser.newPage();
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push('console.error: ' + msg.text()); });
    page.on('pageerror', (err) => errors.push('pageerror: ' + ((err && err.stack) || (err && err.message) || err)));
    page.on('requestfailed', (req) => {
      const u = req.url();
      if (u.indexOf('favicon') >= 0) return;
      errors.push('requestfailed: ' + u + ' — ' + (req.failure() && req.failure().errorText));
    });

    await page.goto('http://localhost:' + PORT + '/index.html', { waitUntil: 'load', timeout: 60000 });
    // Готовность: реальный editor.js создаёт window.editor синхронно в module-eval
    // (boot.js-каркас — тоже); ждём его + глобальный monaco. (Раньше ждали window.__spikeReady
    // каркаса boot.js — editor.js его не ставит.)
    await page.waitForFunction('!!window.editor && typeof window.monaco !== "undefined"', { timeout: 30000 });

    // Печать: вставляем строку через API и читаем назад — доказательство «редактор печатает».
    const typed = await page.evaluate(() => {
      var ed = window.editor, model = ed.getModel(), last = model.getLineCount();
      ed.executeEdits('smoke', [{ range: new window.monaco.Range(last, 1, last, 1), text: 'СмоукПечать = Истина;\n' }]);
      return model.getValue().indexOf('СмоукПечать') >= 0;
    });
    if (!typed) errors.push('print smoke: не удалось вставить/прочитать текст в редакторе');

    const info = await page.evaluate(() => ({ monaco: !!window.monaco, editor: !!window.editor, ua: navigator.userAgent }));
    console.log('[headless] browser:', exe.split(/[\\/]/).pop());
    console.log('[headless] editor ready:', info.editor, '| window.monaco:', info.monaco);
    console.log('[headless] print smoke:', typed ? 'ok' : 'FAIL');

    // Сборочная локаль Monaco: таблица NLS должна загрузиться до регистрации editor actions,
    // поэтому проверяем и исходное сообщение панели inline-подсказок, и готовое действие.
    const localeDiag = await page.evaluate(() => {
      const messages = window._VSCODE_NLS_MESSAGES || [];
      const action = window.editor.getAction('editor.action.inlineSuggest.acceptNextWord');
      return {
        language: window._VSCODE_NLS_LANGUAGE || 'en',
        toolbarAcceptWord: messages[1175],
        actionLabel: action && action.label
      };
    });
    const expectedLocaleStrings = EXPECTED_MONACO_LOCALE === 'ru'
      ? { toolbarAcceptWord: 'Принять слово', actionLabel: 'Принять следующее слово встроенного предложения' }
      : { toolbarAcceptWord: 'Accept Word', actionLabel: 'Accept Next Word Of Inline Suggestion' };
    if (localeDiag.language !== EXPECTED_MONACO_LOCALE)
      errors.push('NLS language: ожидался ' + EXPECTED_MONACO_LOCALE + ', получен ' + localeDiag.language);
    if (localeDiag.toolbarAcceptWord !== expectedLocaleStrings.toolbarAcceptWord)
      errors.push('inline toolbar NLS: ожидалось «' + expectedLocaleStrings.toolbarAcceptWord + '», получено «' + localeDiag.toolbarAcceptWord + '»');
    if (localeDiag.actionLabel !== expectedLocaleStrings.actionLabel)
      errors.push('inline action label: ожидалось «' + expectedLocaleStrings.actionLabel + '», получено «' + localeDiag.actionLabel + '»');
    console.log('[headless] Monaco UI locale:', localeDiag.language, '| inline action:', localeDiag.actionLabel);

    // Этап 2: языки зарегистрированы и BSL реально токенизируется (грамматика подключилась).
    const langDiag = await page.evaluate(() => {
      const ids = window.monaco.languages.getLanguages().map((l) => l.id);
      let kw = [];
      try { kw = (window.monaco.editor.tokenize('Если Истина Тогда КонецЕсли;', 'bsl')[0] || []).map((t) => t.type); } catch (e) {}
      return { ids: ids, hasBsl: ids.indexOf('bsl') >= 0, hasQuery: ids.indexOf('bsl_query') >= 0, hasDcs: ids.indexOf('dcs_query') >= 0, kwTokened: kw.some((t) => t.indexOf('keyword') >= 0) };
    });
    if (langDiag.hasBsl) {
      console.log('[headless] языки bsl/bsl_query/dcs_query:', langDiag.hasBsl, langDiag.hasQuery, langDiag.hasDcs, '| BSL keyword токенизируется:', langDiag.kwTokened);
      if (!langDiag.hasQuery || !langDiag.hasDcs) errors.push('не все языки зарегистрированы (bsl_query/dcs_query)');
      if (!langDiag.kwTokened) errors.push('BSL-грамматика не токенизирует ключевые слова');
    } else {
      console.log('[headless] язык bsl не зарегистрирован (голый каркас Этапа 1) — пропускаю проверку грамматики');
    }

    // Bridge-смоук (Этап 4, analysis §4.4): window.init + ключевые функции моста не бросают.
    // Только для реального editor.js (у смоук-каркаса boot.js нет window.init).
    const hasInit = await page.evaluate(() => typeof window.init === 'function');
    if (hasInit) {
      // bslHelper подгружается асинхронно (import в onDidCreateEditor) — дождёмся.
      try { await page.waitForFunction('typeof window.bslHelper !== "undefined"', { timeout: 15000 }); }
      catch (e) { errors.push('window.bslHelper не загрузился за 15с'); }
      const bridge = await page.evaluate(() => {
        const out = { steps: [], errors: [] };
        const step = (name, fn) => {
          try { fn(); out.steps.push(name); }
          catch (e) { out.errors.push(name + ' threw: ' + ((e && e.stack) || (e && e.message) || e)); throw e; }
        };
        try {
          step('init', () => window.init('8.3.18.1'));
          step('setText', () => window.setText('Процедура Тест() КонецПроцедуры', undefined, false));
          step('getText', () => { if (window.getText().indexOf('Процедура Тест') < 0) out.errors.push('setText/getText не сходятся'); });
          step('getCurrentLanguageId', () => { out.lang = window.getCurrentLanguageId(); });
          step('setTheme', () => window.setTheme('bsl-dark'));
          step('setLanguageMode(bsl_query)', () => window.setLanguageMode('bsl_query'));
          step('checkLang', () => { if (window.getCurrentLanguageId() !== 'bsl_query') out.errors.push('setLanguageMode не переключил на bsl_query'); });
          step('setLanguageMode(bsl)', () => window.setLanguageMode('bsl'));
          step('isSuggestWidgetVisible', () => window.isSuggestWidgetVisible());
          step('isParameterHintsWidgetVisible', () => window.isParameterHintsWidgetVisible());
          step('compare(default options)', () => {
            window.compare(window.getText() + '\n// Изменение', false, true);
            const options = window.editor._options._options.get();
            const hideUnchangedRegions = options.hideUnchangedRegions && options.hideUnchangedRegions.enabled;
            if (options.renderMarginRevertIcon !== false || hideUnchangedRegions !== false)
              out.errors.push('опции compare по умолчанию не равны false');
          });
          step('setOption(compare options)', () => {
            window.setOption('renderMarginRevertIcon', true);
            window.setOption('hideUnchangedRegions', true);
            const options = window.editor._options._options.get();
            const hideUnchangedRegions = options.hideUnchangedRegions && options.hideUnchangedRegions.enabled;
            if (options.renderMarginRevertIcon !== true || hideUnchangedRegions !== true)
              out.errors.push('setOption не обновил опции открытого compare');
          });
        } catch (e) { /* остановились на первом бросившем шаге; он уже в out.errors */ }
        return out;
      });
      console.log('[headless] bridge шаги ok: ' + bridge.steps.join(', ') + ' | lang=' + bridge.lang);
      bridge.errors.forEach((e) => errors.push('bridge: ' + e));

      // Issue #303: история поиска доступна через window-мост, записывается по blur и
      // использует один и тот же MRU-список в обычном/diff-редакторе.
      try {
        await new Promise((resolve) => setTimeout(resolve, 100));
        await page.evaluate(() => {
          if (window.editor.navi) window.compare();
        });
        await page.waitForFunction('!window.editor.navi', { timeout: 5000 });

        const restored = await page.evaluate(() => window.restoreSearchHistory('[]'));
        if (restored !== true) errors.push('restoreSearchHistory не вернул true');

        await page.evaluate(() => window.openSearchWidget());
        await page.waitForSelector('.find-widget.visible .bsl-find-history-button', { timeout: 5000 });
        await page.waitForFunction(() => Array.from(document.querySelectorAll('.find-widget.visible .bsl-find-history-button'))
          .some((item) => {
            const rect = item.getBoundingClientRect();
            return rect.right > 0 && rect.left < window.innerWidth
              && rect.bottom > 0 && rect.top < window.innerHeight;
          }), { timeout: 5000 });

        const searchHistory = await page.evaluate(async () => {
          const buttonCandidates = Array.from(document.querySelectorAll('.find-widget.visible .bsl-find-history-button'));
          const button = buttonCandidates.find((item) => {
              const rect = item.getBoundingClientRect();
              return rect.right > 0 && rect.left < window.innerWidth
                && rect.bottom > 0 && rect.top < window.innerHeight;
            });
          const editors = window.editor.navi
            ? [window.editor.getOriginalEditor(), window.editor.getModifiedEditor()]
            : [window.editor];
          const controllers = editors.map((editor) => editor.getContribution('editor.contrib.findController'));
          const controller = controllers.find((item) => item && item._widget && item._widget._domNode.contains(button));
          const widget = controller && controller._widget;
          const inputBox = widget && widget._findInput && widget._findInput.inputBox;
          if (!button || !controller || !inputBox)
            return {
              error: 'не найдены button/controller/inputBox',
              navi: !!window.editor.navi,
              buttons: buttonCandidates.map((item) => {
                const rect = item.getBoundingClientRect();
                return [rect.left, rect.top, rect.right, rect.bottom];
              })
            };

          const getButtonVisualState = () => {
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
          };
          const disabledBeforeEnter = button.disabled;
          const disabledVisualState = getButtonVisualState();
          widget._findInput.setValue('добавлено-по-enter');
          inputBox.inputElement.focus();
          inputBox.inputElement.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter', keyCode: 13, bubbles: true
          }));
          const savedByEnter = JSON.parse(window.saveSearchHistory());
          const enabledAfterEnter = !button.disabled;
          const enabledVisualState = getButtonVisualState();
          const iconVisualStable = disabledVisualState.width === enabledVisualState.width
            && disabledVisualState.height === enabledVisualState.height
            && disabledVisualState.display === 'flex'
            && enabledVisualState.display === 'flex'
            && disabledVisualState.alignItems === 'center'
            && enabledVisualState.alignItems === 'center'
            && disabledVisualState.justifyContent === 'center'
            && enabledVisualState.justifyContent === 'center'
            && disabledVisualState.padding === '0px'
            && enabledVisualState.padding === '0px'
            && disabledVisualState.borderWidth === '0px'
            && enabledVisualState.borderWidth === '0px'
            && disabledVisualState.backgroundColor === 'rgba(0, 0, 0, 0)'
            && enabledVisualState.backgroundColor === 'rgba(0, 0, 0, 0)'
            && disabledVisualState.boxShadow === 'none'
            && enabledVisualState.boxShadow === 'none';
          const historyIcon = button.classList.contains('codicon-history')
            && !button.classList.contains('codicon-chevron-down');

          window.restoreSearchHistory(JSON.stringify(['второй', 'первый']));
          widget._findInput.setValue('добавлено-по-blur');
          inputBox.inputElement.focus();
          await new Promise((resolve) => setTimeout(resolve, 650));
          const beforeBlur = JSON.parse(window.saveSearchHistory());
          button.focus();

          const saved = JSON.parse(window.saveSearchHistory());
          const monacoHistory = inputBox.history.getHistory().slice();
          const replaceHistoryIntact = widget._replaceInput.inputBox.addToHistory !== inputBox.addToHistory;
          button.click();
          const items = Array.from(widget._domNode.querySelectorAll('.bsl-find-history-item'));
          const menu = widget._domNode.querySelector('.bsl-find-history-menu');
          const menuOpened = items.length === 3 && !menu.hidden;
          const widgetRect = widget._domNode.getBoundingClientRect();
          const menuRect = menu.getBoundingClientRect();
          const openedWithoutActiveItem = document.activeElement === button
            && !items.some((item) => document.activeElement === item);
          const menuAttached = Math.abs(menuRect.top - widgetRect.bottom) <= 2
            && Math.abs(menuRect.left - widgetRect.left) <= 2
            && Math.abs(menuRect.right - widgetRect.right) <= 2;
          const itemsHitTestable = items.every((item) => {
            const rect = item.getBoundingClientRect();
            const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
            return hit === item || item.contains(hit);
          });
          const hitDiagnostics = items.map((item) => {
            const rect = item.getBoundingClientRect();
            const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
            return {
              item: item.textContent,
              rect: [rect.left, rect.top, rect.right, rect.bottom],
              hit: hit ? hit.tagName + '.' + hit.className : null
            };
          });

          button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));
          const keyboardStarted = document.activeElement === items[0];
          items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));
          const keyboardMoved = document.activeElement === items[1];
          items[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));

          return {
            disabledBeforeEnter: disabledBeforeEnter,
            disabledVisualState: disabledVisualState,
            savedByEnter: savedByEnter,
            enabledAfterEnter: enabledAfterEnter,
            enabledVisualState: enabledVisualState,
            iconVisualStable: iconVisualStable,
            historyIcon: historyIcon,
            saved: saved,
            beforeBlur: beforeBlur,
            monacoHistory: monacoHistory,
            replaceHistoryIntact: replaceHistoryIntact,
            menuOpened: menuOpened,
            openedWithoutActiveItem: openedWithoutActiveItem,
            menuAttached: menuAttached,
            itemsHitTestable: itemsHitTestable,
            hitDiagnostics: hitDiagnostics,
            keyboardStarted: keyboardStarted,
            keyboardMoved: keyboardMoved,
            selected: controller.getState().searchString,
            menuClosed: widget._domNode.querySelector('.bsl-find-history-menu').hidden
          };
        });

        if (searchHistory.error) errors.push('search history: ' + searchHistory.error);
        else {
          if (!searchHistory.disabledBeforeEnter || !searchHistory.enabledAfterEnter
            || searchHistory.savedByEnter.join('|') !== 'добавлено-по-enter')
            errors.push('search history: Enter не добавил запрос или не активировал кнопку');
          if (!searchHistory.historyIcon)
            errors.push('search history: кнопка не использует codicon-history');
          if (!searchHistory.iconVisualStable)
            errors.push('search history: геометрия иконки меняется или у кнопки остаётся фон/рамка');
          if (searchHistory.saved[0] !== 'добавлено-по-blur' || searchHistory.saved.length !== 3)
            errors.push('search history: blur не обновил MRU');
          if (searchHistory.beforeBlur.join('|') !== 'второй|первый')
            errors.push('search history: промежуточное значение записалось до blur');
          if (!searchHistory.replaceHistoryIntact)
            errors.push('search history: переопределена история строки замены');
          if (searchHistory.monacoHistory.join('|') !== 'первый|второй|добавлено-по-blur')
            errors.push('search history: Monaco HistoryNavigator не синхронизирован');
          if (!searchHistory.menuOpened || !searchHistory.openedWithoutActiveItem
            || !searchHistory.menuAttached || !searchHistory.itemsHitTestable
            || !searchHistory.keyboardStarted || !searchHistory.keyboardMoved)
            errors.push('search history: меню не примыкает к виджету, обрезано или клавиатурная навигация не сработала');
          if (searchHistory.selected !== 'второй' || !searchHistory.menuClosed)
            errors.push('search history: выбор значения не закрыл меню/не запустил поиск');
        }

        console.log('[headless] search history UI:', JSON.stringify(searchHistory));

        await page.evaluate(() => window.compare(window.getText() + '\n// Проверка общей истории', false, true));
        await page.waitForFunction('window.editor.navi && typeof window.editor.diffCount === "number"', { timeout: 5000 });
        await page.evaluate(() => window.editor.getModifiedEditor().trigger('', 'actions.find'));
        await page.waitForFunction(() => {
          const controller = window.editor.getModifiedEditor().getContribution('editor.contrib.findController');
          const inputBox = controller && controller._widget && controller._widget._findInput
            && controller._widget._findInput.inputBox;
          return !!inputBox;
        }, { timeout: 5000 });
        await new Promise((resolve) => setTimeout(resolve, 100));
        searchHistory.diffHistory = await page.evaluate(() => {
          const controller = window.editor.getModifiedEditor().getContribution('editor.contrib.findController');
          return controller._widget._findInput.inputBox.history.getHistory().slice();
        });
        searchHistory.savedAfterDiffSwitch = await page.evaluate(() => JSON.parse(window.saveSearchHistory()));
        const expectedDiffHistory = searchHistory.savedAfterDiffSwitch.slice().reverse();
        if (searchHistory.diffHistory.join('|') !== expectedDiffHistory.join('|'))
          errors.push('search history: общий MRU не применился в diff-редакторе');

        console.log('[headless] search history:', JSON.stringify(searchHistory));
      } catch (e) {
        errors.push('search history threw: ' + ((e && e.stack) || e));
      }

      // Встроенный diff-виджет создаётся отдельным путём через setOriginalText + клик по diff-navi.
      try {
        await page.waitForFunction('window.editor.navi && typeof window.editor.diffCount === "number"', { timeout: 5000 });
        await page.evaluate(() => {
          window.compare();
          window.setText('Значение = 2;', undefined, false);
          window.setOption('renderMarginRevertIcon', false);
          window.setOption('hideUnchangedRegions', false);
          window.setOriginalText('Значение = 1;');
        });
        await page.waitForSelector('.diff-navi', { timeout: 5000 });
        await page.evaluate(() => {
          const element = document.querySelector('.diff-navi');
          window.editor._onMouseDown.fire({
            event: { leftButton: false, ctrlKey: false, detail: 1 },
            target: { element: element, position: new window.monaco.Position(1, 1) }
          });
        });
        await page.waitForFunction('!!window.inlineDiffEditor', { timeout: 5000 });
        const inlineDiffOptions = await page.evaluate(() => {
          const options = window.inlineDiffEditor._options._options.get();
          return {
            renderMarginRevertIcon: options.renderMarginRevertIcon,
            hideUnchangedRegions: options.hideUnchangedRegions && options.hideUnchangedRegions.enabled
          };
        });
        if (inlineDiffOptions.renderMarginRevertIcon !== false || inlineDiffOptions.hideUnchangedRegions !== false)
          errors.push('createDiffWidget не применил опции compare');
        console.log('[headless] createDiffWidget options:', JSON.stringify(inlineDiffOptions));
      } catch (e) {
        errors.push('createDiffWidget check threw: ' + ((e && e.stack) || (e && e.message) || e));
      }
    }

    await checkModernPointerDrag(browser, errors);
    await checkLegacyPointerDrag(browser, errors);

    // Если появился mochaResults (этап 3) — учтём failures.
    const mocha = await page.evaluate(() => window.mochaResults || null);
    if (mocha) {
      console.log('[headless] mocha: ' + mocha.passes + ' passed, ' + mocha.failures + ' failed');
      if (mocha.failures > 0) errors.push('mocha: ' + mocha.failures + ' провалившихся кейсов');
    }

    if (errors.length) { console.error('[headless] ОШИБКИ (' + errors.length + '):'); errors.forEach((e) => console.error('  • ' + e)); }
    else console.log('[headless] консоль чистая, внешних файловых запросов/ошибок нет');
  } finally {
    await browser.close();
    server.close();
  }
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error('runner fatal:', e && e.stack || e); process.exit(3); });
