// Смоук-проверка single-file сборки: в dist/ должен остаться РОВНО один файл index.html.
//
// Почему именно счёт файлов, а не греп по тексту: webpack эмитит любой неинлайненный ассет
// (чанк, картинку, шрифт, воркер) отдельным файлом в dist/. Если в dist/ ничего кроме index.html —
// значит грузить с диска нечего, и предупреждение 1С 8.3.27+ об открытии локального файла не возникнет.
// Греп по html ненадёжен: минифицированный инлайн-JS содержит строки вида src="/url( внутри кода
// (шаблоны рендера дерева и т.п.) — это ложные срабатывания, а не реальные внешние ссылки.
//
// Без внешних зависимостей (Node built-ins) — переносимо на Windows/Linux/CI.

const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, '..', 'dist');
const EXPECTED = 'index.html';

function listFiles(dir, base) {
  base = base || dir;
  let out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out = out.concat(listFiles(full, base));
    } else {
      out.push(path.relative(base, full).split(path.sep).join('/'));
    }
  }
  return out;
}

if (!fs.existsSync(distDir)) {
  console.error('[check:single] dist/ не найдена — сначала запустите сборку (npm run build:single).');
  process.exit(1);
}

const files = listFiles(distDir).sort();
const extra = files.filter((f) => f !== EXPECTED);

if (files.length === 0) {
  console.error('[check:single] dist/ пуста.');
  process.exit(1);
}

if (extra.length > 0) {
  console.error('[check:single] ПРОВАЛ: в dist/ остались внешние файлы кроме ' + EXPECTED + ':');
  extra.forEach((f) => console.error('  - ' + f));
  console.error('[check:single] Ожидается ровно один self-contained файл ' + EXPECTED + '.');
  console.error('[check:single] Проверьте: maxChunks=1, asset/inline для картинок, отключение CopyWebpackPlugin, inline worker-loader.');
  process.exit(1);
}

const sizeMb = (fs.statSync(path.join(distDir, EXPECTED)).size / (1024 * 1024)).toFixed(2);
console.log('[check:single] OK: dist/ = один файл ' + EXPECTED + ' (' + sizeMb + ' МБ), внешних файлов нет.');
process.exit(0);
