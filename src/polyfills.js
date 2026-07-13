// Полифилы рантайма для встроенного WebKit «Поля HTML документа» 1С:Предприятие
// (старее Safari 13.1). Перенос из Pr-Mex/VAEditor (BSD-3-Clause, (c) 2020 Pautov
// Leonid), src/polyfills.ts — единственный проверенный в бою рецепт Monaco 0.55.1
// в поле 1С (Win/Linux/mac, платформа 8.3.14+). Конвертирован TS→JS (наш стек — babel).
//
// ОБЯЗАТЕЛЬНО импортировать ПЕРВЫМ — до любого кода monaco, потому что часть API
// нужна уже на стадии загрузки/инициализации редактора:
//
//  - queueMicrotask (Safari 12.1): зовётся безусловно при загрузке бандла
//    (AsyncIterableObject.EMPTY, vs/base/common/async.js) начиная с monaco ≥0.32.
//  - ResizeObserver (Safari 13.1): monaco ≥0.32 удалил guard+fallback из
//    ElementSizeObserver, а editor.create() у нас с automaticLayout:true → падение.
//
// globalThis НЕ используем намеренно — он сам ES2020 (Safari 12.1) и в этом движке
// отсутствует ровно там же, где queueMicrotask. Точка опоры — self (совпадает с
// output.globalObject:'self' в webpack.config.js).
import { ResizeObserver as ResizeObserverPolyfill } from '@juggle/resize-observer';

var _self = self;

// globalThis (ES2020, Safari 12.1) — движок 1С его лишён, а monaco >=0.45 ссылается
// на ГОЛЫЙ globalThis при загрузке модулей → ReferenceError убивает бандл. Определяем
// как свойство глобального объекта (self == output.globalObject), тогда голая ссылка
// globalThis резолвится. typeof на undeclared безопасен.
if (typeof _self.globalThis === 'undefined') {
  _self.globalThis = _self;
}

// monaco при dispose/отмене реджектит pending-промисы CancellationError'ом
// (name==='Canceled') — это штатное управление потоком, monaco сам его игнорит
// (onUnexpectedError). Но необработанный reject доходит до window и в 1С каскадит
// ошибкой формы. Гасим именно Canceled (capture+первый листенер). До загрузки monaco.
if (typeof _self.addEventListener === 'function') {
  _self.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    if (r && (r.name === 'Canceled' || r.message === 'Canceled')) {
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      if (e.preventDefault) e.preventDefault();
    }
  }, true);
}

// WeakRef / FinalizationRegistry (ES2021, Safari 14.1) — движок 1С их лишён, а monaco
// >=0.45 использует WeakRef при создании модели/редактора (_attachModel) без guard'а →
// ReferenceError убивает editor.create(). Семантически (GC) не полифилятся; ставим
// функциональные стабы: WeakRef держит СИЛЬНУЮ ссылку (deref всегда возвращает значение —
// теряется только GC-оптимизация), FinalizationRegistry — no-op. Для кэшей monaco безопасно.
// Примечание: RegExp-флаг 'd' (hasIndices, Safari 15) из monaco 0.55 срезается точечно
// через replace-strings в webpack.config.js. Глобальную обёртку RegExp НЕ ставим: она
// реконструирует regex через .source, а конструктор старого WebKit 1С отвергает
// именованные группы (?<name>) (литерал-парсер — принимает).
if (typeof _self.WeakRef !== 'function') {
  _self.WeakRef = function (target) { this._t = target; };
  _self.WeakRef.prototype.deref = function () { return this._t; };
}
if (typeof _self.FinalizationRegistry !== 'function') {
  _self.FinalizationRegistry = function (_cb) {};
  _self.FinalizationRegistry.prototype.register = function () {};
  _self.FinalizationRegistry.prototype.unregister = function () { return false; };
}

// ClipboardItem (Safari 13.1) + async navigator.clipboard — движок 1С их лишён. monaco
// на WebKit-пути (isSafari/isWebkitWebView) в BrowserClipboardService.installWebKitWrite-
// TextWorkaround зовёт navigator.clipboard.write([new ClipboardItem(...)]) СРАЗУ при
// создании сервиса → ReferenceError убивает editor.create() (только в WebKit; в Chrome
// isSafari=false — путь не берётся). monaco 0.55 на paste читает navigator.clipboard.readText(),
// а copy/cut пишут через DOM execCommand. No-op readText() → пустая вставка. Держим свой
// in-memory буфер и пишем в него из ВСЕХ путей monaco: writeText, write([ClipboardItem])
// и перехват DOM copy/cut; readText отдаёт буфер.
var _clipboard = { text: '' };
function _grabClipboardItems(items) {
  for (var k in items) {
    var v = items[k];
    if (v && typeof v.then === 'function') {
      v.then(function (val) {
        if (typeof val === 'string') _clipboard.text = val;
        else if (val && typeof val.text === 'function') { try { val.text().then(function (t) { _clipboard.text = String(t); }, function () {}); } catch (e) {} }
      }, function () {});
    } else if (typeof v === 'string') {
      _clipboard.text = v;
    }
  }
}
if (typeof _self.ClipboardItem !== 'function') {
  _self.ClipboardItem = function (items) { this.items = items; _grabClipboardItems(items); };
}
try {
  var _nav = _self.navigator;
  if (_nav) {
    if (!_nav.clipboard) {
      try { _nav.clipboard = {}; } catch (e) { Object.defineProperty(_nav, 'clipboard', { value: {}, configurable: true }); }
    }
    var _clip = _nav.clipboard;
    if (_clip) {
      if (typeof _clip.write !== 'function') _clip.write = function (data) {
        try { for (var i = 0; i < (data || []).length; i++) { var it = data[i]; if (it && it.items) _grabClipboardItems(it.items); } } catch (e) { /* ignore */ }
        return Promise.resolve();
      };
      if (typeof _clip.writeText !== 'function') _clip.writeText = function (t) { _clipboard.text = (t == null ? '' : String(t)); return Promise.resolve(); };
      if (typeof _clip.readText !== 'function') _clip.readText = function () { return Promise.resolve(_clipboard.text); };
    }
  }
} catch (e) { /* ignore */ }
// Мост DOM copy/cut → in-memory буфер. monaco кладёт скопированный текст в
// ClipboardEvent.clipboardData в обработчике textarea; перехватываем на всплытии
// (document, bubble — после обработчика редактора) и дублируем в буфер.
if (typeof _self.addEventListener === 'function') {
  var _grabClipboardEvent = function (e) {
    try {
      var cd = e && e.clipboardData;
      var t = cd && typeof cd.getData === 'function' ? cd.getData('text/plain') : '';
      if (t) _clipboard.text = t;
    } catch (err) { /* ignore */ }
  };
  _self.addEventListener('copy', _grabClipboardEvent, false);
  _self.addEventListener('cut', _grabClipboardEvent, false);
}

if (typeof _self.queueMicrotask !== 'function') {
  var _resolved = Promise.resolve();
  _self.queueMicrotask = function (callback) {
    _resolved.then(callback).catch(function (e) {
      setTimeout(function () { throw e; }, 0);
    });
  };
}

if (typeof _self.ResizeObserver !== 'function') {
  _self.ResizeObserver = ResizeObserverPolyfill;
}

// MediaQueryList.addEventListener('change', …) появился только в Safari 14. monaco ≥0.32
// зовёт matchMedia(q).addEventListener("change", …) при создании сервисов (тема/доступность)
// ещё на StandaloneServices.get() → это убивает бандл до создания редактора. В движке 1С
// есть только legacy addListener/removeListener, причём глобальный конструктор MediaQueryList
// НЕ выставлен — патчим прототип через инстанс matchMedia(), и дублируем обёрткой.
(function () {
  var mm = _self.matchMedia;
  if (typeof mm !== 'function') return;
  var delegateAdd = function (type, listener) { if (type === 'change') this.addListener(listener); };
  var delegateRemove = function (type, listener) { if (type === 'change') this.removeListener(listener); };
  try {
    var probe = mm.call(_self, '(min-width: 0px)');
    var proto = probe && Object.getPrototypeOf(probe);
    if (proto && typeof proto.addEventListener !== 'function' && typeof proto.addListener === 'function') {
      proto.addEventListener = delegateAdd;
      proto.removeEventListener = delegateRemove;
    }
  } catch (e) { /* ignore */ }
  _self.matchMedia = function (q) {
    var mql = mm.call(_self, q);
    if (mql && typeof mql.addEventListener !== 'function' && typeof mql.addListener === 'function') {
      mql.addEventListener = delegateAdd;
      mql.removeEventListener = delegateRemove;
    }
    return mql;
  };
})();

// Прототипные методы Array/String, которых лишён движок 1С (~Safari 11.x) и которые
// monaco 0.55 зовёт при создании редактора / рендере markdown / bracket-pair colorization.
// esbuild рантайм-методы не полифилит. defineProperty(enumerable:false) — не светить в for..in.
(function () {
  function def(proto, name, fn) {
    if (typeof proto[name] !== 'function') {
      Object.defineProperty(proto, name, { value: fn, writable: true, configurable: true, enumerable: false });
    }
  }
  // Array.prototype.flat / flatMap (ES2019, Safari 12) — monaco зовёт xs.map(...).flat().
  def(Array.prototype, 'flat', function (depth) {
    var d = depth === undefined ? 1 : Number(depth);
    return d < 1
      ? Array.prototype.slice.call(this)
      : Array.prototype.reduce.call(this, function (acc, val) {
          return acc.concat(Array.isArray(val) && d > 1 ? val.flat(d - 1) : val);
        }, []);
  });
  def(Array.prototype, 'flatMap', function (cb, thisArg) {
    return Array.prototype.map.call(this, cb, thisArg).flat();
  });
  // String.prototype.replaceAll (ES2021, Safari 13.1) — monaco зовёт в getCSS (тема).
  def(String.prototype, 'replaceAll', function (search, replace) {
    if (Object.prototype.toString.call(search) === '[object RegExp]') {
      return String.prototype.replace.call(this, search, replace);
    }
    var escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return String.prototype.replace.call(this, new RegExp(escaped, 'g'), replace);
  });
  // Array/String.prototype.at (ES2022, Safari 15.4) — monaco зовёт listCodeEditors().at(...).
  def(Array.prototype, 'at', function (n) {
    n = Math.trunc(n) || 0; if (n < 0) n += this.length;
    return (n < 0 || n >= this.length) ? undefined : this[n];
  });
  def(String.prototype, 'at', function (n) {
    n = Math.trunc(n) || 0; if (n < 0) n += this.length;
    return (n < 0 || n >= this.length) ? undefined : this.charAt(n);
  });
  // String.prototype.matchAll (ES2020, Safari 13) — monaco зовёт r.matchAll(e).
  def(String.prototype, 'matchAll', function (re) {
    var rx = (re instanceof RegExp)
      ? new RegExp(re.source, re.flags.indexOf('g') >= 0 ? re.flags : re.flags + 'g')
      : new RegExp(re, 'g');
    var str = String(this), out = [], m;
    while ((m = rx.exec(str)) !== null) { out.push(m); if (m[0] === '') rx.lastIndex++; }
    return out[Symbol.iterator]();
  });
  // String.prototype.trimStart/trimEnd (ES2019, Safari 12) — marked (markdown monaco 0.55)
  // зовёт line.trimEnd() в list-токенизаторе → TypeError рушит renderMarkdown.
  def(String.prototype, 'trimStart', function () { return String(this).replace(/^\s+/, ''); });
  def(String.prototype, 'trimEnd', function () { return String(this).replace(/\s+$/, ''); });
  def(String.prototype, 'trimLeft', String.prototype.trimStart);
  def(String.prototype, 'trimRight', String.prototype.trimEnd);
  // Array.prototype.findLast / findLastIndex (ES2023, Safari 15.4) — monaco зовёт в
  // bracket-pair colorization (включена по умолчанию) → TypeError.
  def(Array.prototype, 'findLast', function (cb, thisArg) {
    for (var i = this.length - 1; i >= 0; i--) { if (cb.call(thisArg, this[i], i, this)) return this[i]; }
    return undefined;
  });
  def(Array.prototype, 'findLastIndex', function (cb, thisArg) {
    for (var i = this.length - 1; i >= 0; i--) { if (cb.call(thisArg, this[i], i, this)) return i; }
    return -1;
  });
})();

// Object.fromEntries (ES2019, Safari 12.1) / Promise.allSettled (ES2020, Safari 13) —
// движок 1С их лишён; monaco может использовать. Проактивные полифилы.
if (typeof Object.fromEntries !== 'function') {
  Object.fromEntries = function (entries) {
    var o = {}; var arr = Array.from(entries);
    for (var i = 0; i < arr.length; i++) { o[arr[i][0]] = arr[i][1]; }
    return o;
  };
}
if (typeof Promise.allSettled !== 'function') {
  Promise.allSettled = function (ps) {
    return Promise.all(Array.from(ps).map(function (p) {
      return Promise.resolve(p).then(
        function (v) { return { status: 'fulfilled', value: v }; },
        function (r) { return { status: 'rejected', reason: r }; });
    }));
  };
}
// Object.hasOwn (ES2022, Safari 15.4) — monaco 0.55 зовёт в AmbiguousCharacters._getData
// (unicode-подсветка: кириллица = ambiguous → путь активен на RU-фичах) → TypeError.
if (typeof Object.hasOwn !== 'function') {
  Object.hasOwn = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
}
