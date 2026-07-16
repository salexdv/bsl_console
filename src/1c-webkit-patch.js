// Точечные патчи DOM/поведения под встроенный WebKit «Поля HTML документа» 1С.
// Вызывать ПОСЛЕ создания редактора (в конце boot.js/editor.js). Перенос из
// Pr-Mex/VAEditor (BSD-3-Clause, (c) 2020 Pautov Leonid), src/1c-webkit-patch.js,
// адаптирован под bsl_console (без VanessaTabs).

export function patchWebKit1C() {
  // 1С инжектирует свой стиль скроллбара — снимаем, чтобы не конфликтовал с monaco.
  var standardScrollbarStyle = document.getElementById('1C_scrollbar_12704CA4-9C01-461B-8383-F4CD6283CB75');
  if (standardScrollbarStyle !== null) standardScrollbarStyle.remove();

  // Отключаем автоскролл по средней кнопке мыши (мешает в поле 1С).
  document.body.onmousedown = function (e) { if (e.button === 1) return false; };

  // macOS-WebKit поля 1С: keypress спец-клавиш, не погашенный на keydown, вставляет в
  // textarea редактора управляющий символ (стрелка → U+001D, F12 → U+0010 — легаси-маковские
  // коды клавиш), и Monaco принимает его за ввод — в документ пишется невидимый мусор.
  // Давим одиночные C0/DEL/Apple-PUA символы на beforeinput: легитимный текст таким не
  // бывает (\t не трогаем, переводы строк идут отдельным inputType=insertLineBreak).
  // Полевой лог-доказательство: kbdiag 2026-07-16, `beforeinput insertText` с data=U+001D.
  document.addEventListener('beforeinput', function (e) {
    if (e.inputType !== 'insertText' || !e.data || e.data.length !== 1) return;
    var c = e.data.charCodeAt(0);
    if ((c < 32 && c !== 9) || c === 127 || (c >= 0xF700 && c <= 0xF8FF)) e.preventDefault();
  }, true);

  // Node.prototype.isConnected перенесён в polyfills.js — он нужен ДО top-level createEditor
  // (editor.js), а эта функция вызывается лишь в конце файла.
  // TODO (Этап 4/5): перехват keydown по keyCode для клавиш, которые перехватывает форма
  // 1С (Ctrl+S / Ctrl+цифры / Esc / PgUp / PgDn), — адаптировать под наш набор EVENT_*
  // (у VAEditor завязан на VanessaTabs, которого у нас нет).
}
