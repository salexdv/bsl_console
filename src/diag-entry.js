// Точка входа диагностической сборки (--env diag). editor.js импортирован первым в
// entry-массиве (webpack.config.js) — к этому моменту редактор создан и функции моста
// window.* определены. Ставим оверлей инструментации.
import { installDiag } from './diag';

installDiag();
