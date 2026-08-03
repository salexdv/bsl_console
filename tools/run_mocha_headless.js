// Headless-раннер mocha-тестов (T1/T2 из specs/monaco-0.55/analysis.md §4.3) — Этап 3c.
//
// Гоняет браузерные кейсы (src/test.js + src/test_formatter_browser.js + src/test_query.js) поверх реального
// editor.js на Monaco 0.55.1, в системном Chrome/Edge (puppeteer-core). Требует ПРЕДварительной
// тест-сборки: `npm run build:test` (webpack --env test) → dist/test.html + dist/test_query.html
// (каждая инжектит свой чанк [editor.js + кейсы]; mocha/chai подтягиваются скрипт-тегами из
// node_modules — раннер их отдаёт). Каждая страница по завершении прогона ставит
// window.mochaResults (runner.stats) и window.mochaFailures (см. адаптер в конце test*.js).
//
// Нон-зеро exit при любом провале/ошибке — годится как CI-гейт. НЕ заменяет прогон в поле 1С
// (T3): headless проверяет только API-совместимость, старый WebKit — только реальное поле.

const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = 9008;
const PAGES = ['test.html', 'test_query.html'];
const RESULT_TIMEOUT_MS = 120000; // тесты создают много моделей + задержка setTimeout(1000)

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.ttf': 'font/ttf', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.gif': 'image/gif', '.wasm': 'application/wasm', '.map': 'application/json'
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
      if (p === '/') p = '/test.html';
      // /node_modules/... (mocha/chai) — из корня проекта; остальное — из dist/.
      const base = p.startsWith('/node_modules/') ? ROOT : DIST;
      const file = path.join(base, p);
      if (!file.startsWith(base) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.statusCode = 404; res.end('not found: ' + p); return;
      }
      res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
      fs.createReadStream(file).pipe(res);
    });
    server.listen(PORT, () => resolve(server));
  });
}

async function runPage(browser, url, pageName) {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push('pageerror: ' + ((err && err.message) || err)));
  page.on('requestfailed', (req) => {
    const u = req.url();
    if (u.indexOf('favicon') >= 0) return;
    pageErrors.push('requestfailed: ' + u + ' — ' + (req.failure() && req.failure().errorText));
  });

  let stats = null, failures = [], timedOut = false;
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction('window.mochaResults != null', { timeout: RESULT_TIMEOUT_MS });
    stats = await page.evaluate(() => window.mochaResults);
    failures = await page.evaluate(() => window.mochaFailures || []);
  } catch (e) {
    timedOut = true;
    pageErrors.push('НЕ дождались window.mochaResults за ' + (RESULT_TIMEOUT_MS / 1000) + 'с: ' + ((e && e.message) || e));
  } finally {
    await page.close();
  }
  return { pageName, stats, failures, pageErrors, timedOut };
}

(async () => {
  const exe = findBrowser();
  if (!exe) { console.error('Не найден Chrome/Edge. Задайте переменную окружения CHROME_PATH.'); process.exit(2); }
  for (const pg of PAGES) {
    if (!fs.existsSync(path.join(DIST, pg))) {
      console.error('Нет dist/' + pg + ' — сначала соберите тесты: npm run build:test');
      process.exit(2);
    }
  }

  const server = await serve();
  const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  let totalFail = 0, totalPass = 0, hardError = false;
  try {
    console.log('[mocha] browser:', exe.split(/[\\/]/).pop());
    for (const pg of PAGES) {
      const r = await runPage(browser, 'http://localhost:' + PORT + '/' + pg, pg);
      if (r.stats) {
        totalPass += r.stats.passes || 0;
        totalFail += r.stats.failures || 0;
        console.log('[mocha] ' + pg + ': ' + r.stats.passes + ' passed, ' + r.stats.failures + ' failed, ' +
          (r.stats.pending || 0) + ' pending (из ' + r.stats.tests + ', ' + Math.round((r.stats.duration || 0) / 1000) + 'с)');
      } else {
        hardError = true;
        console.error('[mocha] ' + pg + ': РЕЗУЛЬТАТА НЕТ');
      }
      r.failures.forEach((f, i) => console.error('    ✗ [' + pg + '] ' + f.title + '\n        → ' + f.error));
      r.pageErrors.forEach((e) => { hardError = true; console.error('    ! [' + pg + '] ' + e); });
    }
    console.log('[mocha] ИТОГО: ' + totalPass + ' passed, ' + totalFail + ' failed');
  } finally {
    await browser.close();
    server.close();
  }
  process.exit((totalFail > 0 || hardError) ? 1 : 0);
})().catch((e) => { console.error('runner fatal:', (e && e.stack) || e); process.exit(3); });
