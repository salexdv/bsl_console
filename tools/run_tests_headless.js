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
