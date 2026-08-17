import { benchmarkBuffer } from './benchmark_api';
import { decodeBase64 } from '../base64';
import { createBase64TransferManager } from '../base64_transfer';

// Отдельная development-страница; в production и публичный мост редактора не входит.
window.runHelpHbkBenchmark = function (buffer, strategy) {
  return benchmarkBuffer(buffer, strategy);
};

function bytesBase64(bytes) {
  let binary = '';
  const step = 32768;
  for (let offset = 0; offset < bytes.length; offset += step) {
    const part = bytes.subarray(offset, Math.min(bytes.length, offset + step));
    let text = '';
    for (let index = 0; index < part.length; index++) text += String.fromCharCode(part[index]);
    binary += text;
  }
  return btoa(binary);
}

window.prepareHelpTransferBenchmark = function (buffer) {
  const bytes = new Uint8Array(buffer);
  const encoded = bytesBase64(bytes);
  const binaryChunks = [];
  for (let offset = 0; offset < bytes.length; offset += 1024 * 1024)
    binaryChunks.push(bytesBase64(bytes.subarray(offset, Math.min(bytes.length, offset + 1024 * 1024))));
  window.__helpTransferData = { buffer: buffer, encoded: encoded, binaryChunks: binaryChunks };
};

window.runHelpTransferBenchmark = function (channel) {
  const data = window.__helpTransferData;
  const started = performance.now();
  if (channel == 'file-blob')
    return new Blob([data.buffer]).arrayBuffer().then(function () { return performance.now() - started; });
  if (channel == 'whole-base64') {
    decodeBase64(data.encoded);
    return Promise.resolve(performance.now() - started);
  }
  const manager = createBase64TransferManager();
  manager.begin(channel);
  if (channel == 'base64-fragments') {
    for (let offset = 0; offset < data.encoded.length; offset += 262141)
      manager.push(data.encoded.slice(offset, offset + 262141));
  }
  else {
    data.binaryChunks.forEach(function (chunk) { manager.push(chunk); });
  }
  manager.end();
  return manager.getReady().blob.arrayBuffer().then(function () { return performance.now() - started; });
};
