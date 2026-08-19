#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const DIST = path.resolve(__dirname, '..', 'dist');
const PORT = 9012;
const STRATEGIES = ['eager-html', 'toc-lazy', 'native-index-lazy'];
const WORKER_MODES = [0, 1, 2, 3];

function browserPath() {
  return [process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ].filter(Boolean).find(file => fs.existsSync(file));
}

function option(name, fallback) {
  const at = process.argv.indexOf(name);
  return at < 0 ? fallback : process.argv[at + 1];
}

function filesFromArguments() {
  const optionPositions = new Set();
  ['--runs', '--warmup', '--report'].forEach(name => {
    const at = process.argv.indexOf(name);
    if (0 <= at) { optionPositions.add(at); optionPositions.add(at + 1); }
  });
  const workersOnlyAt = process.argv.indexOf('--workers-only');
  if (0 <= workersOnlyAt) optionPositions.add(workersOnlyAt);
  return process.argv.slice(2).filter((value, index) => !optionPositions.has(index + 2)).map(file => path.resolve(file));
}

function percentile(values, part) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * part) - 1)];
}

function summarize(runs) {
  const result = {};
  ['parseMs', 'navigationReadyMs', 'firstArticleMs', 'fullReadyMs', 'prefixSearchMs', 'fullTextSearchMs']
    .forEach(field => {
      const values = runs.map(run => run[field]);
      result[field] = { median: percentile(values, .5), p95: percentile(values, .95) };
    });
  return result;
}

function serve(files) {
  return new Promise(resolve => {
    const server = http.createServer((request, response) => {
      const url = request.url.split('?')[0];
      const match = /^\/hbk\/(\d+)$/.exec(url);
      if (match) {
        const file = files[Number(match[1])];
        if (!file) { response.statusCode = 404; response.end(); return; }
        response.setHeader('Content-Type', 'application/octet-stream');
        fs.createReadStream(file).pipe(response); return;
      }
      const relative = url == '/' ? 'help_benchmark.html' : decodeURIComponent(url.slice(1));
      const file = path.resolve(DIST, relative);
      if (!file.startsWith(DIST) || !fs.existsSync(file)) { response.statusCode = 404; response.end(); return; }
      response.setHeader('Content-Type', path.extname(file) == '.html' ? 'text/html; charset=utf-8' : 'text/javascript');
      fs.createReadStream(file).pipe(response);
    });
    server.listen(PORT, () => resolve(server));
  });
}

function chooseWinner(files) {
  const large = files.filter(file => file.bytes > 10 * 1024 * 1024);
  const score = {};
  STRATEGIES.forEach(strategy => {
    const values = large.map(file => file.strategies.find(item => item.strategy == strategy).summary.navigationReadyMs.median);
    score[strategy] = Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length);
  });
  const ordered = STRATEGIES.slice().sort((a, b) => score[a] - score[b]);
  let winner = ordered[0];
  if ((score[ordered[1]] - score[winner]) / score[winner] < .05) {
    const full = strategy => large.reduce((sum, file) => sum
      + file.strategies.find(item => item.strategy == strategy).summary.fullReadyMs.median, 0);
    if (full(ordered[1]) < full(winner)) winner = ordered[1];
  }
  const eagerP95 = Math.max.apply(null, large.map(file => file.strategies[0].summary.fullReadyMs.p95));
  const winnerP95 = Math.max.apply(null, large.map(file => file.strategies.find(item => item.strategy == winner).summary.fullReadyMs.p95));
  return { winner, navigationScoreMs: score, eligible: winner == 'eager-html' || winnerP95 <= eagerP95 * 1.2 };
}

function geometric(values) {
  return Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length);
}

function chooseWorkerWinner(files) {
  const score = {};
  WORKER_MODES.forEach(workers => {
    score[workers] = geometric(files.map(file => file.workers.find(item => item.workers == workers).summary.fullReadyMs.median));
  });
  const baseline = score[0];
  const eligible = WORKER_MODES.filter(workers => workers > 0).filter(workers => {
    if (score[workers] > baseline * .9) return false;
    return files.every(file => {
      const base = file.workers.find(item => item.workers == 0);
      const item = file.workers.find(value => value.workers == workers);
      const same = ['pages', 'navigationSignature', 'prefixSignature', 'searchSignature', 'searchMatches']
        .every(field => item.sample[field] == base.sample[field]);
      return same
        && item.summary.fullReadyMs.p95 <= base.summary.fullReadyMs.p95 * 1.05
        && item.summary.navigationReadyMs.p95 <= base.summary.navigationReadyMs.p95 * 1.10
        && item.summary.firstArticleMs.p95 <= base.summary.firstArticleMs.p95 * 1.20;
    });
  }).sort((a, b) => score[a] - score[b]);
  let winner = eligible.length ? eligible[0] : 0;
  eligible.forEach(workers => {
    if (workers < winner && score[workers] <= score[winner] * 1.05) winner = workers;
  });
  return { winner, fullReadyScoreMs: score, eligible: eligible };
}

function markdown(output) {
  const lines = [output.selection ? '# Замеры стратегий загрузки HBK' : '# Замеры параллельной индексации HBK', '',
    `Chrome/Edge: ${output.browser}; прогревов: ${output.warmup}; запусков: ${output.runs}.`];
  const fmt = value => value.toFixed(1) + ' мс';
  if (output.selection) {
    const eagerScore = output.selection.navigationScoreMs['eager-html'];
    const winnerScore = output.selection.navigationScoreMs[output.selection.winner];
    const speedup = eagerScore / winnerScore;
    lines.push('', `Выбрана стратегия **${output.selection.winner}**: геометрическое среднее навигационной готовности ${winnerScore.toFixed(1)} мс против ${eagerScore.toFixed(1)} мс у \`eager-html\`, ускорение **${speedup.toFixed(2)}×**. `
      + (output.selection.eligible ? 'Ограничение p95 полной готовности +20% соблюдено.' : 'Ограничение p95 полной готовности +20% не соблюдено.'), '',
    '| Пакет | Стратегия | Контейнер median / p95 | Навигация median / p95 | Первая статья median / p95 | Полная готовность median / p95 | Prefix-поиск median / p95 | Полнотекстовый поиск median / p95 |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |');
    output.files.forEach(file => file.strategies.forEach(item => {
      const s = item.summary;
      lines.push(`| ${file.label} | ${item.strategy} | ${fmt(s.parseMs.median)} / ${fmt(s.parseMs.p95)} | ${fmt(s.navigationReadyMs.median)} / ${fmt(s.navigationReadyMs.p95)} | ${fmt(s.firstArticleMs.median)} / ${fmt(s.firstArticleMs.p95)} | ${fmt(s.fullReadyMs.median)} / ${fmt(s.fullReadyMs.p95)} | ${fmt(s.prefixSearchMs.median)} / ${fmt(s.prefixSearchMs.p95)} | ${fmt(s.fullTextSearchMs.median)} / ${fmt(s.fullTextSearchMs.p95)} |`);
    }));
  }
  if (output.channels && output.channels.length) {
    lines.push('', '## Каналы передачи', '',
      'Измеряется браузерное преобразование уже полученных данных в бинарный буфер; стоимость вызовов моста 1С не включена.', '',
      '| Канал | median / p95 |', '| --- | ---: |');
    output.channels.forEach(item => lines.push(`| ${item.channel} | ${fmt(item.median)} / ${fmt(item.p95)} |`));
  }
  if (output.workerFiles && output.workerFiles.length) {
    lines.push('', '## Параллельная индексация', '',
      '| Пакет | Index-worker | Навигация median / p95 | Полная готовность median / p95 | Первая статья median / p95 |',
      '| --- | ---: | ---: | ---: | ---: |');
    output.workerFiles.forEach(file => file.workers.forEach(item => {
      const s = item.summary;
      lines.push(`| ${file.label} | ${item.workers} | ${fmt(s.navigationReadyMs.median)} / ${fmt(s.navigationReadyMs.p95)} | ${fmt(s.fullReadyMs.median)} / ${fmt(s.fullReadyMs.p95)} | ${fmt(s.firstArticleMs.median)} / ${fmt(s.firstArticleMs.p95)} |`);
    }));
    const baseline = output.workerSelection.fullReadyScoreMs[0];
    const selected = output.workerSelection.fullReadyScoreMs[output.workerSelection.winner];
    lines.push('', `Выбрано index-worker: **${output.workerSelection.winner}**. Геометрическое среднее медиан полной готовности — ${fmt(selected)} против ${fmt(baseline)} у координатора, ускорение **${(baseline / selected).toFixed(2)}×**.`, '',
      `Все пороги прошли конфигурации: ${output.workerSelection.eligible.length ? output.workerSelection.eligible.join(', ') : 'нет'}. Режимы с меньшей медианой, но нарушившие ограничения p95, в production не включаются.`);
  }
  lines.push('', 'Пути к локальным HBK в отчёт не записываются; команда принимает их аргументами.');
  return lines.join('\n') + '\n';
}

(async function () {
  const executablePath = browserPath();
  if (!executablePath) throw new Error('Chrome/Edge не найден');
  const files = filesFromArguments();
  if (!files.length) throw new Error('Передайте хотя бы один HBK');
  const runsCount = Number(option('--runs', '7'));
  const warmup = Number(option('--warmup', '1'));
  const report = option('--report', '');
  const workersOnly = process.argv.indexOf('--workers-only') >= 0;
  const server = await serve(files);
  const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  const output = { browser: '', warmup, runs: runsCount, files: [] };
  try {
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:' + PORT + '/help_benchmark.html', { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction('typeof window.runHelpHbkBenchmark == "function"');
    output.browser = await page.evaluate(() => navigator.userAgent);
    if (!workersOnly) {
      for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
        await page.evaluate(async index => {
          window.__hbkBenchmarkBuffer = await fetch('/hbk/' + index).then(response => response.arrayBuffer());
        }, fileIndex);
        const fileResult = {
          label: path.basename(path.dirname(path.dirname(files[fileIndex]))) + '/' + path.basename(files[fileIndex]),
          bytes: fs.statSync(files[fileIndex]).size, strategies: []
        };
        for (const strategy of STRATEGIES) {
          const runs = [];
          for (let index = 0; index < warmup + runsCount; index++) {
            const value = await page.evaluate(selected => window.runHelpHbkBenchmark(window.__hbkBenchmarkBuffer, selected), strategy);
            if (index >= warmup) runs.push(value);
          }
          fileResult.strategies.push({ strategy, sample: runs[0], summary: summarize(runs) });
        }
        output.files.push(fileResult);
      }
      const largestAt = output.files.reduce((best, file, index) => file.bytes > output.files[best].bytes ? index : best, 0);
      await page.evaluate(async index => {
        const buffer = await fetch('/hbk/' + index).then(response => response.arrayBuffer());
        window.prepareHelpTransferBenchmark(buffer);
      }, largestAt);
      output.channels = [];
      for (const channel of ['file-blob', 'whole-base64', 'base64-fragments', 'binary-base64-chunks']) {
        const values = [];
        for (let index = 0; index < warmup + runsCount; index++) {
          const value = await page.evaluate(selected => window.runHelpTransferBenchmark(selected), channel);
          if (index >= warmup) values.push(value);
        }
        output.channels.push({ channel, median: percentile(values, .5), p95: percentile(values, .95) });
      }
      output.selection = chooseWinner(output.files);
    }
    output.workerFiles = [];
    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      if (fs.statSync(files[fileIndex]).size <= 10 * 1024 * 1024) continue;
      await page.evaluate(async index => {
        window.__hbkBenchmarkBuffer = await fetch('/hbk/' + index).then(response => response.arrayBuffer());
      }, fileIndex);
      const fileResult = {
        label: path.basename(path.dirname(path.dirname(files[fileIndex]))) + '/' + path.basename(files[fileIndex]),
        bytes: fs.statSync(files[fileIndex]).size, workers: []
      };
      for (const workers of WORKER_MODES) {
        const runs = [];
        for (let index = 0; index < warmup + runsCount; index++) {
          const value = await page.evaluate(count => window.runHelpWorkerBenchmark(window.__hbkBenchmarkBuffer, count), workers);
          if (index >= warmup) runs.push(value);
        }
        fileResult.workers.push({ workers, sample: runs[0], summary: summarize(runs) });
      }
      output.workerFiles.push(fileResult);
    }
    output.workerSelection = chooseWorkerWinner(output.workerFiles);
    console.log(JSON.stringify(output, null, 2));
    if (report) fs.writeFileSync(path.resolve(report), markdown(output));
  }
  finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error.stack || error); process.exit(1); });
