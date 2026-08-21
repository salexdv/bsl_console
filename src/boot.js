// ── Каркас спайка Monaco 0.55 — Этап 2: язык (грамматика BSL/запросов/СКД) + темы ──
// Провайдеры (автодополнение/hover/подсказки/…) подключаются на Этапе 3 — здесь только
// регистрация языков, Monarch-грамматика, языковая конфигурация и 6 тем: доказать подсветку.
//
// Порядок импортов критичен (ESM исполняет модули по порядку, каждый — полностью до следующего):
//   1) polyfills          — рантайм-API старого WebKit ДО любого кода monaco
//   2) monaco-ui-locale   — выбранная сборкой NLS-таблица ДО любого кода monaco
//   3) monaco-environment — self.MonacoEnvironment (globalAPI + worker) ДО monaco
//   4) product-service    — registerSingleton(IProductService) ДО StandaloneServices
//   5) expose-monaco      — import monaco + window.monaco ДО bsl_language (bare-глобал)
//   6) bsl_language       — определения языков (грамматика + темы), тянет bsl_helper/finder
import './polyfills';
import 'monaco-ui-locale';
import './monaco-environment';
import './product-service';
import monaco from './expose-monaco';
import languages from './bsl_language';
import { patchWebKit1C } from './1c-webkit-patch';

// Регистрация языков: id + Monarch-грамматика + языковая конфигурация.
for (var key in languages) {
  if (!Object.prototype.hasOwnProperty.call(languages, key)) continue;
  var lang = languages[key];
  var def = lang.languageDef;
  monaco.languages.register({ id: def.id });
  monaco.languages.setMonarchTokensProvider(def.id, def.rules);
  // 0.55: два setLanguageConfiguration подряд — второй ЗАМЕЩАЕТ первый (не мержит),
  // поэтому indentationRules + brackets/autoClosingPairs сливаем в один вызов (analysis §1.3).
  // colorizedBracketPairs:[] — гасим bracket-pair colorization 0.55 (наши токены скобок свои, по И4).
  var cfg = { brackets: lang.brackets, autoClosingPairs: lang.autoClosingPairs, colorizedBracketPairs: [] };
  if (lang.autoIndentation && lang.indentationRules) cfg.indentationRules = lang.indentationRules;
  monaco.languages.setLanguageConfiguration(def.id, cfg);
}

// 6 тем bsl: белая/тёмная (± подсветка запросов) + EDT-белая/тёмная.
var bslThemes = languages.bsl.languageDef.themes;
for (var tk in bslThemes) {
  if (!Object.prototype.hasOwnProperty.call(bslThemes, tk)) continue;
  monaco.editor.defineTheme(bslThemes[tk].name, bslThemes[tk]);
}

var container = document.getElementById('container');
if (container) {
  var editor = monaco.editor.create(container, {
    value: [
      '// Каркас спайка Monaco 0.55.1 — Этап 2: подсветка BSL.',
      'Процедура ПриветМир(Имя) Экспорт',
      '\tЕсли Имя = Неопределено Тогда',
      '\t\tВозврат;',
      '\tКонецЕсли;',
      '\tСообщить("Привет, " + Имя + "!");',
      'КонецПроцедуры',
      ''
    ].join('\n'),
    language: 'bsl',
    theme: 'bsl-white',
    automaticLayout: true,
    // Кириллица иначе подсвечивается как «неоднозначные символы» (unicode highlight 0.37+).
    unicodeHighlight: { ambiguousCharacters: false, invisibleCharacters: false, nonBasicASCII: false }
  });
  window.editor = editor;
}

patchWebKit1C();

// Диагностика для браузер-смоука и headless-раннера.
window.__spikeReady = !!window.editor;
try {
  var ids = monaco.languages.getLanguages().map(function (l) { return l.id; });
  console.log('[spike] Этап 2 — languages:', ids.join(','), '| editor:', !!window.editor);
} catch (e) { /* ignore */ }
