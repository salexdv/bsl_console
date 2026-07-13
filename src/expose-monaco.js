// Публикует глобальный `monaco` на window ДО загрузки нашего кода, который его
// использует как bare-глобал (bsl_helper ~8.5 т. строк, finder). Импортируется в
// boot.js ПЕРЕД `import './bsl_language'`: порядок ESM-импортов гарантирует, что
// window.monaco установлен раньше, чем bsl_language/bsl_helper начнут исполняться.
// (ESM-сборка Monaco с 0.22 не определяет глобальный monaco сама — нужно явно.)
// bare 'monaco-editor' алиасится на edcore.main (узкий entry — см. webpack.config.js): без
// basic-languages и css/html/json/ts-сервисов. XML нужен для подсветки в режиме сравнения
// (compare(), editor.js) — единственный basic-language, который мы используем; возвращаем точечно.
import * as monaco from 'monaco-editor';
import 'monaco-editor/esm/vs/basic-languages/xml/xml.contribution';

window.monaco = monaco;

export default monaco;
