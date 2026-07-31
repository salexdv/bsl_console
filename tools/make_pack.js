// Пост-обработка сборки в СЖАТЫЙ single-file: gzip(console.js) → base64 внутри HTML +
// inline-инфлейтер pako, который на стороне поля 1С распаковывает бандл и исполняет его.
//
// Зачем: обычный single-file инлайнит 14 МБ JS текстом — столько 1С и маршалит в WebKit
// («ПолеHTMLДокумента» читает макет single ~14 МБ → ЭтотОбъект.HTML). Сжатый вариант кладёт
// в HTML ~2.7 МБ (gzip+base64), поле читает/маршалит впятеро меньше, затем pako.ungzip → eval.
// Парсинг 14 МБ после распаковки тот же — выигрыш на чтении/маршалинге строки в поле и на
// размере .epf. Идея владельца форка @vandalsvq (техника из его ветки single-pack).
//
// Linux: для загрузки в «Поле HTML документа» 1С используйте npm run build:single.
// Сборка npm run build:pack в этом окружении работает некорректно: 
// JavaScript-обработчик клика выполняется, но событие ПолеHTMLПриНажатии в 1С не генерируется.
// Причина пока не установлена, поэтому build:pack на Linux считается экспериментальной и не поддерживается.
//
// Запуск после `webpack --mode production` (см. npm run build:pack). Pako 3 возвращает
// Uint8Array по умолчанию; для UTF-8 JavaScript используем его штатную опцию toText: true.
// Сам bootstrap остаётся на ES5-синтаксисе (var/function).

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

const distDir = path.resolve(__dirname, '..', 'dist');
const htmlPath = path.join(distDir, 'index.html');
console.error(htmlPath);
const jsName = 'console.js';
const jsPath = path.join(distDir, jsName);
const pakoPath = require.resolve('pako/browser/inflate');

if (!fs.existsSync(htmlPath) || !fs.existsSync(jsPath)) {
  console.error('[make:pack] Нет dist/index.html или dist/console.js — сначала `npm run build`.');
  process.exit(1);
}
if (!fs.existsSync(pakoPath)) {
  console.error('[make:pack] Не найден browser/inflate bundle пакета pako — `npm i -D pako`.');
  process.exit(1);
}

let html = fs.readFileSync(htmlPath, 'utf8');
const jsBuf = fs.readFileSync(jsPath);           // бандл (Buffer)
const pako = fs.readFileSync(pakoPath, 'utf8');  // инфлейтер (ES5 UMD → global pako)

const gz = zlib.gzipSync(jsBuf, { level: 9 });
const b64 = gz.toString('base64');

// Бутстрап (ES5): base64 → бинарная строка → Uint8Array → pako.ungzip(to:'string') → <script>.
// Промежуточные буферы обнуляем, чтобы снизить пиковую память в поле. Динамически вставленный
// inline-<script> исполняется синхронно при appendChild — в том же global (window), что и бутстрап.
const scriptContent =
  'var __P=' + JSON.stringify(b64) + ';' +
  '(function(){' +
    'var b=atob(__P);__P=null;' +
    'var n=b.length,u=new Uint8Array(n);' +
    'for(var i=0;i<n;i++){u[i]=b.charCodeAt(i)&255;}' +
    'b=null;' +
    'var js=pako.ungzip(u,{toText:true});u=null;' +
    'var s=document.createElement("script");' +
    's.text=js;js=null;' +
    'document.body.appendChild(s);' +
  '})();';

const replacement = '<script>' + pako + '</script>\n<script>' + scriptContent + '</script>';

// Выполняем ровно тот UMD-код pako и bootstrap, которые попадут в HTML. Фальшивый DOM
// перехватывает динамический <script>, после чего сравниваем его содержимое с console.js.
// Это ловит несовместимые изменения browser API pako до удаления исходного bundle.
let unpackedScript = null;
const sandbox = {
  Uint8Array,
  TextDecoder,
  atob: function (value) {
    return Buffer.from(value, 'base64').toString('binary');
  },
  document: {
    createElement: function (tagName) {
      if (tagName !== 'script') throw new Error('Unexpected element: ' + tagName);
      return { text: '' };
    },
    body: {
      appendChild: function (element) {
        unpackedScript = element.text;
      }
    }
  }
};
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;

try {
  vm.runInNewContext(pako, sandbox, { timeout: 10000, filename: 'pako_inflate.umd.min.js' });
  vm.runInNewContext(scriptContent, sandbox, { timeout: 10000, filename: 'pack-bootstrap.js' });
} catch (error) {
  console.error('[make:pack] Bootstrap не исполняется: ' + error.message);
  process.exit(1);
}

const expectedScript = jsBuf.toString('utf8');
if (typeof unpackedScript !== 'string' || unpackedScript !== expectedScript) {
  console.error('[make:pack] Bootstrap распаковал console.js некорректно.');
  process.exit(1);
}

// HtmlWebpackPlugin 5 инжектит <script defer src="console.js"></script> — заменяем на pako+бутстрап.
const tagRe = /<script\b[^>]*\bsrc\s*=\s*["']?[^"'>]*console\.js["']?[^>]*><\/script>/i;
if (!tagRe.test(html)) {
  console.error('[make:pack] В index.html не найден внешний тег <script src="console.js"> — упаковка не выполнена.');
  process.exit(1);
}
html = html.replace(tagRe, function () { return replacement; });
fs.writeFileSync(htmlPath, html, 'utf8');

for (const f of [jsName, jsName + '.LICENSE.txt']) {
  const p = path.join(distDir, f);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

const rawMb = (jsBuf.length / (1024 * 1024)).toFixed(2);
const gzMb = (gz.length / (1024 * 1024)).toFixed(2);
const htmlMb = (fs.statSync(htmlPath).size / (1024 * 1024)).toFixed(2);
console.log('[make:pack] OK: console.js ' + rawMb + ' МБ → gzip ' + gzMb + ' МБ → dist/index.html ' + htmlMb + ' МБ (сжатый single-file, pako-инфлейт в поле).');
