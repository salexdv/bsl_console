// Origin https://github.com/wang12124468/monaco-editor-esm-webpack-plugin/blob/master/src/loader.js
// MIT License Copyright (c) xiaoyong <454926339@qq.com>
// Порт из Pr-Mex/VAEditor (BSD-3-Clause, (c) 2020 Pautov Leonid).
//
// Дописывает путь модуля первым аргументом в call-sites localize( и localize2(
// (0.45: добавился localize2 -> ILocalizedString). Lookbehind исключает объявления
// `function localize(` / `function localize2(`. Лоадер выполняется в Node — lookbehind тут ок.
// Используется только на фолбэк-пути NLS-шима (NormalModuleReplacementPlugin в webpack.config.js).

module.exports = function (content, map, meta) {
  if (/monaco-editor[\\/]esm[\\/]vs.+\.js$/.test(this.resourcePath)) {
    const vsPath = this.resourcePath.split(/monaco-editor[\\/]esm[\\/]/).pop()
    if (vsPath) {
      const path = vsPath.replace(/\\/g, '/').replace('.js', '')
      return content.replace(/(?<!function )(localize2?)\(/g, `$1('${path}', `)
    }
  }
  return content
}
