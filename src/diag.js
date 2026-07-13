// Диагностический оверлей для ПОЛЕВОЙ отладки (только сборка `npm run build:diag`).
// Оборачивает ключевые функции моста window.* и показывает на экране лог вызовов +
// состояние языка/режима/темы. Владелец кликает кнопки консоли / печатает в поле 1С,
// скриншотит панель и возвращает данные — так ловим то, что не воспроизводится в браузере
// (#2 переключение режима запроса, #3 пустой блок автодополнения). Всё ES5 (старый WebKit).
//
// Панель — pointer-events:none (клики проходят сквозь неё в редактор). НЕ меняет поведение:
// обёртки вызывают оригинал и логируют. В обычную сборку не входит.

export function installDiag() {

  var log = [];
  var panel = document.createElement('div');
  panel.id = 'bsl-diag';
  panel.style.cssText = [
    'position:fixed', 'top:0', 'right:0', 'width:540px', 'max-height:62%', 'overflow:auto',
    'z-index:2147483647', 'background:rgba(18,18,28,.93)', 'color:#9ece6a',
    "font:11px/1.4 Consolas,'Courier New',monospace", 'padding:6px 8px', 'white-space:pre-wrap',
    'border:1px solid #3b3b57', 'border-radius:0 0 0 6px', 'pointer-events:none'
  ].join(';') + ';';

  function mount() { if (document.body && !document.getElementById('bsl-diag')) document.body.appendChild(panel); }
  function render() { panel.textContent = 'BSL DIAG · Monaco 0.55 spike\n' + log.slice(-46).join('\n'); }
  function t2(n) { return (n < 10 ? '0' : '') + n; }
  function add(msg) { var d = new Date(); log.push(t2(d.getHours()) + ':' + t2(d.getMinutes()) + ':' + t2(d.getSeconds()) + ' ' + msg); mount(); render(); }
  window.__diag = add;

  function short(x) {
    var s;
    try { s = (typeof x === 'string') ? x : JSON.stringify(x); } catch (e) { s = String(x); }
    if (s === undefined) s = 'undefined';
    return (s && s.length > 40) ? s.slice(0, 40) + '…' : s;
  }
  function argstr(a) { return Array.prototype.map.call(a, short).join(', '); }
  function state() {
    try {
      var l = window.getCurrentLanguageId ? window.getCurrentLanguageId() : '?';
      var th; try { th = window.editor._themeService.getColorTheme().themeName; } catch (e) { th = '?'; }
      return 'lang=' + l + ' queryMode=' + window.queryMode + ' DCS=' + window.DCSMode + ' theme=' + th;
    } catch (e) { return 'state?: ' + e.message; }
  }

  function wrap(name, withState) {
    var orig = window[name];
    if (typeof orig !== 'function') { add('НЕТ window.' + name); return; }
    window[name] = function () {
      var res;
      try { res = orig.apply(this, arguments); }
      catch (e) { add('✗ ' + name + '(' + argstr(arguments) + ') БРОСИЛ: ' + e.message); throw e; }
      add('> ' + name + '(' + argstr(arguments) + ')' + (withState ? '\n     ' + state() : ''));
      return res;
    };
  }

  mount();

  // editor.js (первым в entry-массиве) уже определил window.* синхронно — оборачиваем ДО
  // вызовов из консоли 1С. withState=true для функций, меняющих язык/тему.
  var fns = ['init', 'setLanguageMode', 'setText', 'updateText', 'setContent', 'setTheme',
    'setOption', 'updateMetadata', 'setReadOnly', 'enableQuickSuggestions', 'triggerSuggestions',
    'isQueryMode', 'isDCSMode', 'eraseText'];
  for (var i = 0; i < fns.length; i++) wrap(fns[i], fns[i] === 'init' || fns[i] === 'setLanguageMode' || fns[i] === 'setTheme');

  add('диагностика включена');
  add(state());
  add('мост: setLanguageMode=' + (typeof window.setLanguageMode) + ' updateText=' + (typeof window.updateText) + ' getCurrentLanguageId=' + (typeof window.getCurrentLanguageId));

  // Ловим смену языка модели ЛЮБЫМ путём (даже если консоль зовёт monaco.editor.setModelLanguage
  // напрямую, минуя setLanguageMode) — так узнаём, переключается ли режим вообще (#2).
  try {
    var last = null;
    setInterval(function () {
      try {
        var l = window.getCurrentLanguageId();
        if (l !== last) { add('★ язык модели → ' + l + ' | ' + state()); last = l; }
      } catch (e) { /* редактор ещё не готов */ }
    }, 400);
  } catch (e) { /* ignore */ }
}
