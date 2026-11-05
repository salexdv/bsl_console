#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const queryFieldKeysSmoke = require('./query_field_keys_smoke');

const DIST = path.resolve(__dirname, '..', 'dist');
const PORT = 9014;

function findBrowser() {
  return [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ].filter(Boolean).find(function (candidate) { return fs.existsSync(candidate); });
}

function contentType(file) {
  let extension = path.extname(file).toLowerCase();
  if (extension == '.html' || !extension) return 'text/html; charset=utf-8';
  if (extension == '.css') return 'text/css; charset=utf-8';
  if (extension == '.png') return 'image/png';
  if (extension == '.ttf') return 'font/ttf';
  return 'text/javascript; charset=utf-8';
}

function serve() {
  return new Promise(function (resolve) {
    const server = http.createServer(function (request, response) {
      let fileName = decodeURIComponent(request.url.split('?')[0]);
      if (fileName == '/favicon.ico') { response.statusCode = 204; response.end(); return; }
      if (fileName == '/') fileName = '/test';
      const file = path.join(DIST, fileName);
      if (!file.startsWith(DIST) || !fs.existsSync(file)) { response.statusCode = 404; response.end(); return; }
      response.setHeader('Content-Type', contentType(file));
      fs.createReadStream(file).pipe(response);
    });
    server.listen(PORT, function () { resolve(server); });
  });
}

(async function () {
  const executablePath = findBrowser();
  if (!executablePath) throw new Error('Chrome/Edge не найден');
  for (const name of ['test', 'test_query']) {
    if (!fs.existsSync(path.join(DIST, name))) throw new Error('Сначала выполните npm run build:test');
  }

  const server = await serve();
  const browser = await puppeteer.launch({ executablePath: executablePath, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];

  page.on('pageerror', function (error) { errors.push('pageerror: ' + (error.stack || error.message)); });
  page.on('console', function (message) {
    if (message.type() == 'error') errors.push('console: ' + message.text());
  });

  try {
    for (const name of ['test', 'test_query']) {
      errors.length = 0;
      await page.goto('http://127.0.0.1:' + PORT + '/' + name, { waitUntil: 'load', timeout: 60000 });
      await page.waitForFunction(name == 'test_query'
        ? 'window.queryTestsComplete != null'
        : 'window.mochaRunner && window.mochaRunner.state == "stopped"', { timeout: 120000 });

      const result = await page.evaluate(function (name) {
        const stats = name == 'test_query' ? window.queryTestsComplete : window.mochaRunner.stats;
        return {
          failures: stats.failures,
          passes: stats.passes,
          pending: stats.pending || 0,
          failedTests: Array.prototype.map.call(document.querySelectorAll('#mocha-report .test.fail'), function (node) {
            return node.innerText;
          })
        };
      }, name);

      if (name == 'test_query') {
        try {
          await queryFieldKeysSmoke(page);
          console.log('Alt+↑/↓: проверка клавиатурой пройдена');
        } catch (error) {
          errors.push('Alt+↑/↓: ' + error.message);
        }
      }
      result.failedTests = result.failedTests.concat(errors);
      console.log(name + ': ' + result.passes + ' passed, ' + result.failures + ' failed, ' + result.pending + ' pending');
      if (result.failedTests.length)
        console.error(result.failedTests.join('\n\n'));
      if (result.failures || errors.length)
        process.exitCode = 1;
    }
  }
  finally {
    await browser.close();
    await new Promise(function (resolve) { server.close(resolve); });
  }
})().catch(function (error) {
  console.error(error.stack || error.message);
  process.exit(1);
});
