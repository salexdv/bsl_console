const { setLocaleData } = require('monaco-editor-nls');
const ruLocale = require('monaco-editor-nls/locale/ru');
const editorWorkerUrl = require('blob-url-loader!compile-loader!monaco-editor/esm/vs/editor/editor.worker');

setLocaleData(ruLocale);

if (typeof window !== 'undefined') {
  window.MonacoEnvironment = {
    getWorker: function () {
      return new Worker(editorWorkerUrl);
    }
  };
}

// editor.api создаёт глобальный self.monaco, который basic-languages contributions
// используют непосредственно во время регистрации языка.
const monaco = require('monaco-editor/esm/vs/editor/editor.api');

// monaco-editor-webpack-plugin 1.9 подключал все editor features и только XML.
// Подключаем тот же набор явно, чтобы сохранить Monaco 0.20 и убрать зависимость от Webpack 4.
require('monaco-editor/esm/vs/editor/editor.all');
require('monaco-editor/esm/vs/editor/standalone/browser/accessibilityHelp/accessibilityHelp');
require('monaco-editor/esm/vs/editor/standalone/browser/quickOpen/gotoLine');
require('monaco-editor/esm/vs/editor/standalone/browser/iPadShowKeyboard/iPadShowKeyboard');
require('monaco-editor/esm/vs/editor/standalone/browser/inspectTokens/inspectTokens');
require('monaco-editor/esm/vs/editor/standalone/browser/quickOpen/quickCommand');
require('monaco-editor/esm/vs/editor/standalone/browser/quickOpen/quickOutline');
require('monaco-editor/esm/vs/editor/standalone/browser/referenceSearch/standaloneReferenceSearch');
require('monaco-editor/esm/vs/editor/standalone/browser/toggleHighContrast/toggleHighContrast');
require('monaco-editor/esm/vs/basic-languages/xml/xml.contribution');

module.exports = monaco;
