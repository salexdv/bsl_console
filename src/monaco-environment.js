// MonacoEnvironment: задаётся ДО загрузки monaco (импортируется в boot.js перед
// `import 'monaco-editor'`). Порядок ESM-импортов гарантирует, что self.MonacoEnvironment
// установлен раньше, чем инициализируется editor.main.
//
//  - globalAPI: true — monaco публикует глобальный API (совместно с явным
//    `window.monaco = monaco` в boot.js/editor.js; bsl_helper использует bare-глобал `monaco`).
//  - getWorkerUrl — воркер как blob-URL (без сети/внешних файлов, важно для поля 1С и
//    single-file). Собирается лоадерами blobUrl+compile (child compilation, emit=false).
//    BSL-консоли достаточно editor.worker (css/json/html/ts-воркеры не используются).

self.MonacoEnvironment = {
  globalAPI: true,
  getWorkerUrl: function (moduleId, label) {
    return require('blob-url-loader?type=application/javascript!compile-loader?target=worker&emit=false!monaco-editor/esm/vs/editor/editor.worker');
  }
};
