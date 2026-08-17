// Origin https://github.com/peterschussheim/monaco-editor/blob/master/loaders/compile.js
// MIT License Copyright (c) 2018 Peter Schussheim
// Порт webpack5-версии из Pr-Mex/VAEditor (BSD-3-Clause, (c) 2020 Pautov Leonid).
//
// Компилирует worker в отдельной child compilation и возвращает его source-код
// для последующей упаковки в Blob URL. Worker не записывается в dist.

const webpack = require('webpack')
const WebWorkerTemplatePlugin = require('webpack/lib/webworker/WebWorkerTemplatePlugin')
const EntryPlugin = require('webpack/lib/EntryPlugin')

module.exports.pitch = function pitch(remainingRequest) {
  this.cacheable(false)

  const currentCompilation = this._compilation
  const childCompiler = currentCompilation.createChildCompiler('worker', {
    filename: 'worker.js',
    asyncChunks: false,
    publicPath: currentCompilation.outputOptions.publicPath,
    // Наследуем environment от target: ['web', 'es2015'] родительской сборки.
    environment: currentCompilation.outputOptions.environment
  }, [
    new WebWorkerTemplatePlugin(),
    // Blob-worker должен быть одним бандлом и не может догружать чанки по сети.
    new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }),
    // Точку входа тоже транспилируем явно: !! отключает обычные rules.
    new EntryPlugin(
      this.context,
      '!!' + require.resolve('esbuild-loader') + '?target=es2015&charset=utf8!' + remainingRequest,
      { name: 'main' }
    )
  ])

  // Нужен только source-код из памяти; дочерние ассеты не пишем на диск.
  childCompiler.outputFileSystem = {
    mkdir: (_path, callback) => callback(),
    writeFile: (_path, _content, callback) => callback(),
    stat: (_path, callback) => callback(new Error('ENOENT'))
  }

  const callback = this.async()
  const beforeAssets = new Set(Object.keys(currentCompilation.assets))

  childCompiler.runAsChild((error, entries, compilation) => {
    if (error) return callback(error)

    const mainFilename = entries && entries[0] && Array.from(entries[0].files)[0]
    if (!mainFilename) return callback(null, null)

    const asset = compilation.assets[mainFilename] || currentCompilation.assets[mainFilename]
    const source = asset ? asset.source() : ''

    for (const name of Object.keys(currentCompilation.assets)) {
      if (!beforeAssets.has(name)) currentCompilation.deleteAsset(name)
    }

    callback(null, source)
  })
}
