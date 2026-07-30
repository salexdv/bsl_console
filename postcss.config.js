const autoprefixer = require('autoprefixer')

// Удаляет cursor: -webkit-image-set(...) из monaco-editor — старый WebKit «Поля HTML
// документа» 1С эту форму не поддерживает, иначе курсор не отображается при mouse over.
// monaco пишет такое правило в base/browser/ui/mouseCursor/mouseCursor.css.
// Перенос из Pr-Mex/VAEditor (BSD-3-Clause, (c) 2020 Pautov Leonid).
const removeWebkitImageSet = () => ({
  postcssPlugin: 'remove-webkit-image-set',
  Declaration: {
    cursor: (decl) => {
      if (decl.value.includes('-webkit-image-set')) decl.remove()
    }
  }
})
removeWebkitImageSet.postcss = true

module.exports = {
  plugins: [
    autoprefixer({
      overrideBrowserslist: ['safari >= 11', 'chrome >= 63', '> 1%'],
      extensions: ['.css']
    }),
    removeWebkitImageSet()
  ]
}
