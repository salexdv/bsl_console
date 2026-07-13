// Пост-обработка обычной сборки в single-file: инлайнит внешний console.js прямо в
// dist/index.html и удаляет отдельные файлы. Результат — ровно dist/index.html
// (self-contained), пригодный для загрузки в «Поле HTML документа» 1С как текст
// (обход предупреждения 8.3.27+ об открытии локального файла).
//
// Каркасная версия (Этап 1 спайка): у «голого» редактора внешним остаётся только
// console.js — воркер уже blob (строка внутри console.js), шрифты/иконки — data:.
// Полноценный webpack `--env single`-таргет (иконки дерева через require.context и т.п.)
// — Этап 6. Запускается после `webpack --mode production` (см. npm run build:single).
//
// Без внешних зависимостей (Node built-ins) — переносимо на Windows/Linux/CI.

const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, '..', 'dist');
const htmlPath = path.join(distDir, 'index.html');
const jsName = 'console.js';
const jsPath = path.join(distDir, jsName);

if (!fs.existsSync(htmlPath) || !fs.existsSync(jsPath)) {
  console.error('[make:single] Нет dist/index.html или dist/console.js — сначала `npm run build`.');
  process.exit(1);
}

let html = fs.readFileSync(htmlPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');

// HtmlWebpackPlugin 5 инжектит <script defer src="console.js"></script> (defer — по
// умолчанию). Заменяем весь тег на инлайн (defer у инлайна не нужен: тег стоит в конце
// body, #container уже разобран → порядок исполнения корректный).
const tagRe = /<script\b[^>]*\bsrc\s*=\s*["']?[^"'>]*console\.js["']?[^>]*><\/script>/i;
if (!tagRe.test(html)) {
  console.error('[make:single] В index.html не найден внешний тег <script src="console.js"> — инлайн не выполнен.');
  process.exit(1);
}
// '$' в содержимом JS не должен интерпретироваться как спецпаттерн replace — передаём функцию.
html = html.replace(tagRe, function () { return '<script>' + js + '</script>'; });

fs.writeFileSync(htmlPath, html, 'utf8');

// Удаляем ставший ненужным внешний JS и его LICENSE-выписку.
for (const f of [jsName, jsName + '.LICENSE.txt']) {
  const p = path.join(distDir, f);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

const sizeMb = (fs.statSync(htmlPath).size / (1024 * 1024)).toFixed(2);
console.log('[make:single] OK: dist/index.html инлайнен (' + sizeMb + ' МБ), console.js удалён.');
