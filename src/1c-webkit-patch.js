// Точечные патчи DOM/поведения под встроенный WebKit «Поля HTML документа» 1С.
// Вызывать ПОСЛЕ создания редактора (в конце boot.js/editor.js). Перенос из
// Pr-Mex/VAEditor (BSD-3-Clause, (c) 2020 Pautov Leonid), src/1c-webkit-patch.js,
// адаптирован под bsl_console (без VanessaTabs).

export function patchWebKit1C() {
  // 1С инжектирует свой стиль скроллбара — снимаем, чтобы не конфликтовал с monaco.
  var standardScrollbarStyle = document.getElementById('1C_scrollbar_12704CA4-9C01-461B-8383-F4CD6283CB75');
  if (standardScrollbarStyle !== null) standardScrollbarStyle.remove();

  // Node.prototype.isConnected (Safari 10) — в движке 1С отсутствует, monaco его
  // проверяет при работе с DOM-узлами → достаточно вернуть true.
  if (!('isConnected' in Node.prototype)) {
    Object.defineProperty(Node.prototype, 'isConnected', {
      configurable: true,
      get: function () { return true; }
    });
  }

  // Отключаем автоскролл по средней кнопке мыши (мешает в поле 1С).
  document.body.onmousedown = function (e) { if (e.button === 1) return false; };

  // TODO (Этап 4): перехват keydown по keyCode для клавиш, которые перехватывает форма
  // 1С (Ctrl+S / Ctrl+цифры / Esc / PgUp / PgDn), — адаптировать под наш набор EVENT_*
  // (у VAEditor завязан на VanessaTabs, которого у нас нет).
}
