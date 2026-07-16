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

  // macOS-поле 1С (wxWebViewWebKit + WebKitLegacy): после ухода фокуса в форму (клик по
  // меню/кнопке) хост НЕ возвращает WebView first responder по клику в редактор — клавиатура
  // мертва, хотя изнутри всё выглядит сфокусированным (activeElement=textarea, textFocus=true;
  // повторный focus() на уже-активном элементе — no-op, focusin не стреляет, активация не
  // запрашивается). Лечение: blur/focus-цикл скрытой textarea по клику — настоящий focusin
  // заставляет хост реактивировать вью. window.focus() в общем случае НЕ зовём: полевой
  // эксперимент (kbdiag v6, 2026-07-16) показал, что каскад window.focus() из поля вешает
  // ВЕСЬ клиент 1С (вплоть до SIGSEGV в wxWebViewWebKit::~wxWebViewWebKit при выходе) —
  // оставлен только как разовая эскалация на эпизод, если цикл не вернул фокус окна.
  // Гейт по сигнатуре мак-поля (UA без токена Safari) — Windows/Linux/браузеры не затронуты.
  var isMacField = /Macintosh/.test(navigator.userAgent) && !/Safari\//.test(navigator.userAgent);
  if (isMacField) {
    var lastCycle = 0;
    var escalated = false;
    document.addEventListener('mousedown', function (e) {
      if (document.hasFocus()) { escalated = false; return; }
      var t = e.target;
      if (!t || !t.closest || !t.closest('.monaco-editor')) return; // только клики в редактор
      if (t.closest('.find-widget')) return;                        // не воевать с поиском
      var now = Date.now();
      if (now - lastCycle < 500) return;
      lastCycle = now;
      var ta = document.querySelector('textarea.inputarea');
      if (!ta) return;
      var ae = document.activeElement;
      try { if (ae && ae.blur) ae.blur(); } catch (e1) { /* best-effort */ }
      setTimeout(function () {
        try { ta.focus(); } catch (e2) { /* best-effort */ }
        setTimeout(function () {
          if (!document.hasFocus() && !escalated) {
            escalated = true; // не чаще раза на эпизод потери фокуса
            try { window.focus(); } catch (e3) { /* best-effort */ }
          }
        }, 250);
      }, 0);
    }, true);
  }

  // Node.prototype.isConnected перенесён в polyfills.js — он нужен ДО top-level createEditor
  // (editor.js), а эта функция вызывается лишь в конце файла.
  // TODO (Этап 4/5): перехват keydown по keyCode для клавиш, которые перехватывает форма
  // 1С (Ctrl+S / Ctrl+цифры / Esc / PgUp / PgDn), — адаптировать под наш набор EVENT_*
  // (у VAEditor завязан на VanessaTabs, которого у нас нет).
}
