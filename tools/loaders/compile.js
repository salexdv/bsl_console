// Origin https://github.com/peterschussheim/monaco-editor/blob/master/loaders/compile.js
// MIT License Copyright (c) 2018 Peter Schussheim
// Порт webpack5-версии из Pr-Mex/VAEditor (BSD-3-Clause, (c) 2020 Pautov Leonid).
//
// Компилирует worker в отдельную child compilation и возвращает source-код для
// последующей упаковки в blob URL (см. blobUrl loader). Worker никогда не пишется в dist.

const webpack = require('webpack')
const WebWorkerTemplatePlugin = require('webpack/lib/webworker/WebWorkerTemplatePlugin')
const EntryPlugin = require('webpack/lib/EntryPlugin')

// Полифилы внутри blob-воркера: у воркера СВОЙ глобальный контекст, src/polyfills.js
// из main-бандла туда не доезжает. Движок 1С (~Safari 11.x) лишён этих рантайм-API,
// а monaco ≥0.45 использует их в worker-коде (globalThis/WeakRef/flat и пр.) при
// загрузке/работе → ReferenceError/TypeError убивают воркер (а main-поток виснет,
// ожидая его ответа). Баннер (raw) встаёт раньше webpack-бутстрапа. Только pure-JS
// (DOM-полифилы — matchMedia/ResizeObserver/Clipboard — воркеру не нужны).
const WORKER_POLYFILL = [
  'if(typeof globalThis==="undefined"){self.globalThis=self;}',
  'if(typeof queueMicrotask!=="function"){var __qmt=Promise.resolve();self.queueMicrotask=function(cb){__qmt.then(cb).catch(function(e){setTimeout(function(){throw e},0)})};}',
  'if(typeof WeakRef!=="function"){self.WeakRef=function(t){this._t=t};self.WeakRef.prototype.deref=function(){return this._t};}',
  'if(typeof FinalizationRegistry!=="function"){self.FinalizationRegistry=function(){};self.FinalizationRegistry.prototype.register=function(){};self.FinalizationRegistry.prototype.unregister=function(){return false};}',
  'if(typeof Array.prototype.flat!=="function"){Object.defineProperty(Array.prototype,"flat",{value:function(d){d=d===undefined?1:Number(d);return d<1?Array.prototype.slice.call(this):Array.prototype.reduce.call(this,function(a,v){return a.concat(Array.isArray(v)&&d>1?v.flat(d-1):v)},[])},writable:true,configurable:true});}',
  'if(typeof Array.prototype.flatMap!=="function"){Object.defineProperty(Array.prototype,"flatMap",{value:function(cb,t){return Array.prototype.map.call(this,cb,t).flat()},writable:true,configurable:true});}',
  'if(typeof Object.fromEntries!=="function"){Object.fromEntries=function(it){var o={},a=Array.from(it);for(var i=0;i<a.length;i++){o[a[i][0]]=a[i][1]}return o};}',
  'if(typeof Promise.allSettled!=="function"){Promise.allSettled=function(ps){return Promise.all(Array.from(ps).map(function(p){return Promise.resolve(p).then(function(v){return{status:"fulfilled",value:v}},function(r){return{status:"rejected",reason:r}})}))};}',
  'if(typeof String.prototype.replaceAll!=="function"){Object.defineProperty(String.prototype,"replaceAll",{value:function(s,r){return s instanceof RegExp?String.prototype.replace.call(this,s,r):this.split(s).join(r)},writable:true,configurable:true});}',
  'if(typeof Array.prototype.at!=="function"){Object.defineProperty(Array.prototype,"at",{value:function(n){n=Math.trunc(n)||0;if(n<0)n+=this.length;return n<0||n>=this.length?undefined:this[n]},writable:true,configurable:true});}',
  'if(typeof String.prototype.at!=="function"){Object.defineProperty(String.prototype,"at",{value:function(n){n=Math.trunc(n)||0;if(n<0)n+=this.length;return n<0||n>=this.length?undefined:this.charAt(n)},writable:true,configurable:true});}',
  'if(typeof String.prototype.matchAll!=="function"){Object.defineProperty(String.prototype,"matchAll",{value:function(re){var rx=re instanceof RegExp?new RegExp(re.source,re.flags.indexOf("g")>=0?re.flags:re.flags+"g"):new RegExp(re,"g");var str=String(this),out=[],m;while((m=rx.exec(str))!==null){out.push(m);if(m[0]==="")rx.lastIndex++}return out[Symbol.iterator]()},writable:true,configurable:true});}',
  'if(typeof String.prototype.trimStart!=="function"){Object.defineProperty(String.prototype,"trimStart",{value:function(){return String(this).replace(/^\\s+/,"")},writable:true,configurable:true});String.prototype.trimLeft=String.prototype.trimStart;}',
  'if(typeof String.prototype.trimEnd!=="function"){Object.defineProperty(String.prototype,"trimEnd",{value:function(){return String(this).replace(/\\s+$/,"")},writable:true,configurable:true});String.prototype.trimRight=String.prototype.trimEnd;}',
  'if(typeof Object.hasOwn!=="function"){Object.hasOwn=function(o,k){return Object.prototype.hasOwnProperty.call(o,k)};}',
  'if(typeof Array.prototype.findLast!=="function"){Object.defineProperty(Array.prototype,"findLast",{value:function(cb,t){for(var i=this.length-1;i>=0;i--){if(cb.call(t,this[i],i,this))return this[i]}return undefined},writable:true,configurable:true});}',
  'if(typeof Array.prototype.findLastIndex!=="function"){Object.defineProperty(Array.prototype,"findLastIndex",{value:function(cb,t){for(var i=this.length-1;i>=0;i--){if(cb.call(t,this[i],i,this))return i}return -1},writable:true,configurable:true});}'
].join('')

module.exports.pitch = function pitch (remainingRequest) {
  this.cacheable(false)

  const currentCompilation = this._compilation
  const childCompiler = currentCompilation.createChildCompiler('worker', {
    filename: 'worker.js',
    // monaco 0.52 дробит worker через import() на async-чанки. Blob-воркер не
    // может догрузить отдельные файлы (нет сети) → воркер ломается. asyncChunks:
    // false инлайнит все dynamic import в единственный чанк (воркер = 1 блоб).
    // Заодно убирает коллизию имён при runAsChild-мердже в parent.
    asyncChunks: false,
    publicPath: currentCompilation.outputOptions.publicPath
  }, [
    new WebWorkerTemplatePlugin(),
    // 0.52: monaco дробит worker на несколько чанков (dynamic import). Воркер обязан
    // быть ОДНИМ инлайн-блобом → схлопываем в 1 чанк.
    new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }),
    new EntryPlugin(this.context, '!!' + remainingRequest, { name: 'main' })
  ])

  // Глушим запись на диск: нам нужен только source-код в памяти
  childCompiler.outputFileSystem = {
    mkdir: (_p, cb) => cb(),
    writeFile: (_p, _c, cb) => cb(),
    stat: (_p, cb) => cb(new Error('ENOENT'))
  }

  const callback = this.async()
  const beforeAssets = new Set(Object.keys(currentCompilation.assets))

  childCompiler.runAsChild((error, entries, compilation) => {
    if (error) { return callback(error) }
    const mainFilename = entries && entries[0] && Array.from(entries[0].files)[0]
    if (!mainFilename) { return callback(null, null) }
    const asset = compilation.assets[mainFilename] || currentCompilation.assets[mainFilename]
    const source = asset ? asset.source() : ''
    // Удаляем все ассеты, которые child compilation добавила в parent
    for (const name of Object.keys(currentCompilation.assets)) {
      if (!beforeAssets.has(name)) currentCompilation.deleteAsset(name)
    }
    // Префиксуем полифилы в исходник воркера (а не через BannerPlugin — тот в
    // child-compilation не доезжает до этого asset'а).
    callback(null, source ? WORKER_POLYFILL + '\n' + source : source)
  })
}
