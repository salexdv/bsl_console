// Публикует глобальный `monaco` на window ДО загрузки нашего кода, который его
// использует как bare-глобал (bsl_helper ~8.5 т. строк, finder). Импортируется в
// boot.js ПЕРЕД `import './bsl_language'`: порядок ESM-импортов гарантирует, что
// window.monaco установлен раньше, чем bsl_language/bsl_helper начнут исполняться.
// (ESM-сборка Monaco с 0.22 не определяет глобальный monaco сама — нужно явно.)
import * as monaco from 'monaco-editor';

window.monaco = monaco;

export default monaco;
