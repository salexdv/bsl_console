#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const Module = require('module');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const STRATEGIES = ['eager-html', 'toc-lazy', 'native-index-lazy'];

function loadApi() {
  const entry = path.join(ROOT, 'src', 'help', 'benchmark_api.js');
  const output = esbuild.buildSync({
    entryPoints: [entry], bundle: true, platform: 'node', target: 'node22', format: 'cjs', write: false
  }).outputFiles[0].text;
  const instance = new Module(entry, module);
  instance.filename = entry;
  instance.paths = module.paths;
  instance._compile(output, entry);
  return instance.exports;
}

function option(name, fallback) {
  const at = process.argv.indexOf(name);
  return at < 0 ? fallback : process.argv[at + 1];
}

function percentile(values, part) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * part) - 1)];
}

function summary(runs) {
  const fields = ['parseMs', 'navigationReadyMs', 'firstArticleMs', 'fullReadyMs', 'prefixSearchMs', 'fullTextSearchMs'];
  const result = {};
  fields.forEach(field => {
    const values = runs.map(run => run[field]);
    result[field] = { median: percentile(values, .5), p95: percentile(values, .95) };
  });
  return result;
}

const runsCount = Number(option('--runs', '7'));
const warmup = Number(option('--warmup', '1'));
const reportPath = option('--report', '');
const skipped = new Set(['--runs', '--warmup', '--report'].flatMap(name => {
  const at = process.argv.indexOf(name); return at < 0 ? [] : [at, at + 1];
}));
const files = process.argv.slice(2).filter((value, index) => !skipped.has(index + 2));
if (!files.length) {
  console.error('Usage: node tools/benchmark_help_hbk.js [--warmup 1] [--runs 7] [--report file.md] <file.hbk> [...]');
  process.exit(2);
}

const api = loadApi();
const output = { engine: 'node ' + process.version, warmup, runs: runsCount, files: [] };
files.forEach(fileName => {
  const absolute = path.resolve(fileName);
  const readAt = performance.now();
  const data = fs.readFileSync(absolute);
  const readMs = performance.now() - readAt;
  const fileResult = { file: absolute, bytes: data.length, readMs, strategies: [] };
  STRATEGIES.forEach(strategy => {
    const runs = [];
    for (let index = 0; index < warmup + runsCount; index++) {
      const run = api.benchmarkBuffer(data, strategy);
      if (index >= warmup) runs.push(run);
    }
    fileResult.strategies.push({ strategy, sample: runs[0], summary: summary(runs) });
  });
  output.files.push(fileResult);
});

console.log(JSON.stringify(output, null, 2));
if (reportPath) {
  const lines = ['# Замеры загрузки HBK (Node)', '', `Движок: ${output.engine}; прогревов: ${warmup}; запусков: ${runsCount}.`, '',
    '| Файл | Стратегия | Контейнер, median/p95 | Навигация, median/p95 | Первая статья, median/p95 | Полная готовность, median/p95 | Prefix-поиск, median/p95 | Полнотекстовый поиск, median/p95 |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |'];
  output.files.forEach(file => file.strategies.forEach(item => {
    const s = item.summary;
    const fmt = value => value.toFixed(1) + ' мс';
    const label = path.basename(path.dirname(path.dirname(file.file))) + '/' + path.basename(file.file);
    lines.push(`| ${label} | ${item.strategy} | ${fmt(s.parseMs.median)} / ${fmt(s.parseMs.p95)} | ${fmt(s.navigationReadyMs.median)} / ${fmt(s.navigationReadyMs.p95)} | ${fmt(s.firstArticleMs.median)} / ${fmt(s.firstArticleMs.p95)} | ${fmt(s.fullReadyMs.median)} / ${fmt(s.fullReadyMs.p95)} | ${fmt(s.prefixSearchMs.median)} / ${fmt(s.prefixSearchMs.p95)} | ${fmt(s.fullTextSearchMs.median)} / ${fmt(s.fullTextSearchMs.p95)} |`);
  }));
  fs.writeFileSync(path.resolve(reportPath), lines.join('\n') + '\n');
}
