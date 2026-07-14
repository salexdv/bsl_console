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
    'isQueryMode', 'isDCSMode', 'eraseText', 'showStatusBar'];
  for (var i = 0; i < fns.length; i++) wrap(fns[i], fns[i] === 'init' || fns[i] === 'setLanguageMode' || fns[i] === 'setTheme');

  add('диагностика включена');
  add(state());
  add('мост: setLanguageMode=' + (typeof window.setLanguageMode) + ' updateText=' + (typeof window.updateText) + ' getCurrentLanguageId=' + (typeof window.getCurrentLanguageId));

  // Хук onDidSuggest: КАЖДЫЙ вызов автодополнения — сколько элементов + тип триггера. Ключ для #3
  // (виден каждый триггер, включая пустые пере-триггеры; параллельно работает guard в editor.js).
  try {
    var sc = window.editor.getContribution('editor.contrib.suggestController');
    if (sc && sc.model && typeof sc.model.onDidSuggest === 'function') {
      sc.model.onDidSuggest(function (ev) {
        try {
          var n = (ev && ev.completionModel && ev.completionModel.items) ? ev.completionModel.items.length : '?';
          var o = (ev && ev.triggerOptions) || {};
          add('· onDidSuggest: элементов=' + n + ' триггер=' + o.triggerKind + (o.auto ? '/auto' : '/manual') + (o.shy ? '/shy' : '') + (o.retrigger ? '/retrig' : ''));
        } catch (er) { /* ignore */ }
      });
      add('хук onDidSuggest установлен');
    } else { add('НЕТ suggestController.model.onDidSuggest'); }
  } catch (e) { add('хук onDidSuggest ошибка: ' + e.message); }

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

  // ── Глубокая выгрузка состояния suggest-виджета (пиксельный уровень) + «пинок» перерисовки ──
  // #3: строки ЕСТЬ в DOM с текстом (model=23, видно="…"), но бокс визуально пуст в поле 1С.
  // Фикс transform:none у .monaco-list-rows в поле НЕ помог → причина не в слое контейнера.
  // Нужны реальные computed-стили/геометрия САМИХ строк и текста (белое-на-белом? offscreen?
  // opacity/visibility? свой transform у строки?), которых в браузере не видно. Дампим ОДИН раз
  // на каждое появление виджета, ДО пинка (чтобы поймать пустое состояние).
  function _rect(el) { var r = el.getBoundingClientRect(); return Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height); }
  function _css(el, props) { var cs; try { cs = getComputedStyle(el); } catch (e) { return 'css?'; } var o = []; for (var i = 0; i < props.length; i++) o.push(props[i] + '=' + cs[props[i]]); return o.join(' '); }
  function deepDump() {
    try {
      var sw = document.querySelector('.suggest-widget');
      if (!sw) { add('DUMP: нет .suggest-widget'); return; }
      add('DUMP widget ' + _rect(sw) + ' | ' + _css(sw, ['transform', 'opacity', 'visibility', 'backgroundColor', 'color', 'zIndex']));
      var scr = sw.querySelector('.monaco-scrollable-element');
      if (scr) add('DUMP scroll ' + _rect(scr) + ' | ' + _css(scr, ['transform', 'overflow', 'contain']));
      var rc = sw.querySelector('.monaco-list-rows');
      if (rc) add('DUMP rowsC ' + _rect(rc) + ' | ' + _css(rc, ['transform', 'willChange', 'contain', 'overflow', 'height', 'top']));
      var row = sw.querySelector('.monaco-list-row');
      if (row) {
        add('DUMP row0 ' + _rect(row) + ' | ' + _css(row, ['transform', 'top', 'left', 'position', 'opacity', 'visibility', 'display', 'color', 'backgroundColor', 'contain']));
        var lbl = row.querySelector('.label-name') || row.querySelector('.monaco-icon-label') || row.querySelector('.contents') || row.querySelector('span');
        if (lbl) add('DUMP row0.lbl "' + ((lbl.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 16)) + '" ' + _rect(lbl) + ' | ' + _css(lbl, ['color', 'opacity', 'visibility', 'transform', 'fontFamily']));
      } else add('DUMP: нет .monaco-list-row');
    } catch (e) { add('DUMP ошибка: ' + e.message); }
  }
  // Обход предков suggest-виджета вверх до корня: КТО создаёт залипший compositing-слой
  // (transform / will-change / filter / opacity<1 / position:fixed / isolation / perspective /
  // backface). display-reflow строк не разбудил перерисовку → слой, возможно, на ПРЕДКЕ, а не на
  // .monaco-list-rows. Печать чинит, т.к. re-layout трогает сам виджет. Логируем цепочку слоёв.
  function layerAncestors() {
    try {
      var el = document.querySelector('.suggest-widget'); var out = []; var depth = 0;
      while (el && depth < 16) {
        var cs; try { cs = getComputedStyle(el); } catch (e) { break; }
        var f = [];
        if (cs.transform && cs.transform !== 'none') f.push('tf=' + String(cs.transform).slice(0, 22));
        if (cs.willChange && cs.willChange !== 'auto') f.push('wc=' + cs.willChange);
        if (cs.filter && cs.filter !== 'none') f.push('filter=' + String(cs.filter).slice(0, 16));
        if (cs.opacity && cs.opacity !== '1') f.push('op=' + cs.opacity);
        if (cs.position === 'fixed') f.push('pos=fixed');
        if (cs.isolation === 'isolate') f.push('isolate');
        if (cs.perspective && cs.perspective !== 'none') f.push('persp');
        if (cs.backfaceVisibility === 'hidden') f.push('backface');
        if (cs.webkitOverflowScrolling === 'touch') f.push('wk-scroll-touch');
        if (f.length) out.push((el.className || el.tagName || '?').toString().slice(0, 24).replace(/\s+/g, '.') + '{' + f.join(' ') + '}');
        el = el.parentElement; depth++;
      }
      add('LAYERS: ' + (out.length ? out.join('  ') : 'слой-свойств до корня НЕТ'));
    } catch (e) { add('LAYERS ошибка: ' + e.message); }
  }

  // КАНДИДАТ-ФИКС v2 (КРОСС-КАДРОВЫЙ). Прошлый провал доказал: синхронный display:none→рефлоу→назад
  // НЕ будит перерисовку. Причина: offsetHeight форсит только LAYOUT, а PAINT — на границе кадра;
  // итоговое computed-состояние == исходному → старый WebKit схлопывает в один крас (залипший тайл).
  // Печать чинит, т.к. растянута на НЕСКОЛЬКО кадров. Значит мутируем через ДВА кадра: прячем весь
  // виджет на кадр N (rAF), возвращаем на кадр N+1 — WebKit обязан покрасить дважды (без строк → со
  // строками). Тогглим ВЕСЬ .suggest-widget (сильнее всего; фон виджета красится, а строки — нет →
  // поддерево строк надо пере-растеризовать целиком). _fixing защищает от гонки повторных вызовов.
  var _fixing = false;
  function applyFix() {
    if (_fixing) return;
    try {
      var sw = document.querySelector('.suggest-widget');
      if (!sw || sw.className.indexOf('visible') < 0) return;
      _fixing = true;
      var d = sw.style.display;
      sw.style.display = 'none'; void sw.offsetHeight;                 // кадр N: поддерево убрано
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {                            // кадр N+1: вернули → форс-перекрас
          try { sw.style.display = d; void sw.offsetHeight; add('⟳ FIX xframe widget-display'); } catch (e) { }
          _fixing = false;
        });
      });
    } catch (e) { _fixing = false; add('FIX ошибка: ' + e.message); }
  }
  // «РЕНТГЕН» стека: что РЕАЛЬНО сверху в точке, где должна быть строка. Кросс-кадровый тоггл всего
  // виджета не разбудил краску → вероятно, строки красятся, но их НАКРЫВАЕТ оверлей (или предок со
  // залипшим слоем). elementFromPoint назовёт топ-элемент по пикселю: если это сама строка/label —
  // баг краски; если что-то другое — вот виновник. Плюс счётчики (не два ли виджета мы толкаем).
  function stackAt(cx, cy) {
    try {
      var els = document.elementsFromPoint ? document.elementsFromPoint(cx, cy) : [document.elementFromPoint(cx, cy)];
      var s = [];
      for (var i = 0; i < els.length && i < 7; i++) { var e = els[i]; if (!e) continue; var c = (e.className && e.className.toString ? e.className.toString() : e.tagName) || '?'; s.push(c.slice(0, 20).replace(/\s+/g, '.')); }
      return s.join(' › ') || '(пусто)';
    } catch (e) { return 'ERR ' + e.message; }
  }
  function stackProbe() {
    try {
      var all = document.querySelectorAll('.suggest-widget');
      var sw = null;
      for (var i = 0; i < all.length; i++) { var rr = all[i].getBoundingClientRect(); if (all[i].className.indexOf('visible') >= 0 && rr.width > 1 && rr.height > 1) { sw = all[i]; break; } }
      if (!sw) sw = all[0];
      if (!sw) { add('STACK: нет .suggest-widget'); return; }
      var r = sw.getBoundingClientRect();
      var cx = Math.round(r.left + Math.min(60, r.width / 2));
      add('STACK row0@' + cx + ',' + Math.round(r.top + 10) + ': ' + stackAt(cx, Math.round(r.top + 10)));
      add('STACK mid@' + cx + ',' + Math.round(r.top + r.height / 2) + ': ' + stackAt(cx, Math.round(r.top + r.height / 2)));
      add('счётчики: suggest-widget=' + all.length + ' monaco-editor=' + document.querySelectorAll('.monaco-editor').length + ' rows=' + sw.querySelectorAll('.monaco-list-row').length);
    } catch (e) { add('STACK ошибка: ' + e.message); }
  }
  window.__dump = deepDump; window.__layers = layerAncestors; window.__fix = applyFix; window.__stack = stackProbe;
  var _dumpedThisShow = false;

  // Штатный хук показа виджета (suggestWidget.js:426, дебаунс 100мс после паузы печати) — самый
  // точный момент «бокс устаканился». Сюда же встанет боевой фикс в editor.js, если подтвердится.
  try {
    var scw = window.editor.getContribution('editor.contrib.suggestController');
    var wv = scw && scw.widget && scw.widget.value;
    if (wv && typeof wv.onDidShow === 'function') {
      wv.onDidShow(function () { setTimeout(stackProbe, 0); });
      add('хук onDidShow(widget) установлен');
    } else { add('НЕТ widget.onDidShow'); }
  } catch (e) { add('хук onDidShow ошибка: ' + e.message); }

  // Монитор виджетов (suggest/param-hints/hover): когда всплывают — ЧТО внутри. Ключевое для #3
  // (пустой блок): видно, есть ли элементы в модели/списке, или блок реально пуст.
  try {
    var lastWidgetKey = '';
    setInterval(function () {
      try {
        var parts = [];
        var suggestVisibleNow = false;
        var sw = document.querySelector('.suggest-widget');
        if (sw) {
          var swr = sw.getBoundingClientRect();
          if (sw.className.indexOf('visible') >= 0 && swr.width > 1 && swr.height > 1) {
            suggestVisibleNow = true;
            var rows = sw.querySelectorAll('.monaco-list-row');
            var msg = sw.querySelector('.message');
            var msgTxt = (msg && msg.offsetParent) ? (msg.innerText || '') : '';
            var ml = -1;
            try {
              var c = window.editor.getContribution('editor.contrib.suggestController');
              if (c && c.widget && c.widget.isInitialized && c.widget.value._completionModel) ml = c.widget.value._completionModel.items.length;
            } catch (e) { /* ignore */ }
            var rText = rows.length ? (rows[0].textContent || '').replace(/\s+/g, ' ').trim().slice(0, 20) : '';
            var rAria = rows.length ? (rows[0].getAttribute('aria-label') || '').slice(0, 20) : '';
            parts.push('SUGGEST[' + Math.round(swr.width) + 'x' + Math.round(swr.height) + ' строк=' + rows.length + ' model=' + ml + ' msg="' + msgTxt + '" видно="' + rText + '" data="' + rAria + '"]');
          }
        }
        var sd = document.querySelector('.suggest-details-container') || document.querySelector('.suggest-details');
        if (sd) { var sdr = sd.getBoundingClientRect(); if (sdr.width > 1 && sdr.height > 1) parts.push('DETAILS[' + Math.round(sdr.width) + 'x' + Math.round(sdr.height) + ' текст="' + ((sd.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 28)) + '"]'); }
        var ph = document.querySelector('.parameter-hints-widget');
        if (ph && ph.className.indexOf('visible') >= 0) parts.push('PARAM-HINTS["' + ((ph.innerText || '').replace(/\s+/g, ' ').slice(0, 44)) + '"]');
        var hv = document.querySelector('.monaco-hover');
        if (hv && hv.offsetParent) parts.push('HOVER');
        var sb = document.querySelector('.statusbar-widget');
        if (sb) parts.push((sb.textContent || '').replace(/\s/g, '') ? 'STATUSBAR:"' + (sb.textContent || '').trim() + '"' : 'STATUSBAR:ПУСТО');
        var key = parts.join(' ');
        if (key !== lastWidgetKey) { if (key) add('* ' + key); else if (lastWidgetKey) add('* виджеты скрыты'); lastWidgetKey = key; }
        // Переход «suggest появился» → один раз выгрузить состояние и пнуть перерисовку.
        if (suggestVisibleNow && !_dumpedThisShow) {
          _dumpedThisShow = true;
          deepDump();
          layerAncestors();
          stackProbe();   // РЕНТГЕН: кто реально сверху по пикселю строки (оверлей?)
          // applyFix НЕ зовём — оставляем бокс в естественном пустом виде для видео/анализа
        } else if (!suggestVisibleNow) {
          _dumpedThisShow = false;
        }
      } catch (e) { /* ignore */ }
    }, 350);
  } catch (e) { /* ignore */ }
}
