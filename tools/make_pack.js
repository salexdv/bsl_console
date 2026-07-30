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
// Запуск после `webpack --mode production` (см. npm run build:pack). pako_inflate.min.js — ES5,
// работает в старом WebKit поля (Safari 11+); терсер даёт ASCII-only console.js → распаковка
// строкой (to:'string', для ASCII UTF-8-декод тождествен). Всё в бутстрапе — ES5 (var/function).

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const distDir = path.resolve(__dirname, '..', 'dist');
const htmlPath = path.join(distDir, 'index.html');
console.error(htmlPath);
const jsName = 'console.js';
const jsPath = path.join(distDir, jsName);
const pakoPath = path.resolve(__dirname, '..', 'node_modules', 'pako', 'dist', 'pako_inflate.min.js');

if (!fs.existsSync(htmlPath) || !fs.existsSync(jsPath)) {
  console.error('[make:pack] Нет dist/index.html или dist/console.js — сначала `npm run build`.');
  process.exit(1);
}
if (!fs.existsSync(pakoPath)) {
  console.error('[make:pack] Нет node_modules/pako/dist/pako_inflate.min.js — `npm i -D pako`.');
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
    'var js=pako.ungzip(u,{to:"string"});u=null;' +
    'var s=document.createElement("script");' +
    's.text=js;js=null;' +
    'document.body.appendChild(s);' +
  '})();';

const replacement = '<script>' + pako + '</script>\n<script>' + scriptContent + '</script>';

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
