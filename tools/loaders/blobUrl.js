// Origin https://github.com/peterschussheim/monaco-editor/blob/master/loaders/blobUrl.js
// MIT License Copyright (c) 2018 Peter Schussheim
// Порт из Pr-Mex/VAEditor (BSD-3-Clause, (c) 2020 Pautov Leonid).
//
// Оборачивает source worker в Blob URL с MIME application/javascript. URL живёт
// вместе с HTML-документом: старый Linux WebKit может читать worker уже после
// возврата из new Worker(), поэтому немедленный revokeObjectURL здесь недопустим.

module.exports = function blobUrl(source) {
  return `module.exports = URL.createObjectURL(new Blob([${JSON.stringify(source)}], { type: 'application/javascript' }));`
}
