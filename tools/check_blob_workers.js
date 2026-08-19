#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

function propertyValue(node, name) {
  if (!node || node.type != 'ObjectExpression') return null;
  const property = node.properties.find(function (item) {
    return item.key && (item.key.name == name || item.key.value == name);
  });
  return property && property.value && property.value.value;
}

function checkWorkerSource(source, count) {
  try {
    acorn.parse(source, { ecmaVersion: 2018, sourceType: 'script' });
  }
  catch (error) {
    throw new Error('Blob-worker #' + count + ' не совместим с ES2018: ' + error.message);
  }
}

function literalValue(node) {
  if (!node) return null;
  if (typeof node.value == 'string') return node.value;
  if (node.type == 'TemplateLiteral' && !node.expressions.length)
    return node.quasis[0].value.cooked;
  return null;
}

function checkBlobWorkers(source, fileName) {
  let position = 0;
  let count = 0;
  while ((position = source.indexOf('new Blob([', position)) >= 0) {
    let expression;
    try {
      expression = acorn.parseExpressionAt(source, position, { ecmaVersion: 'latest' });
    }
    catch (error) {
      position += 9;
      continue;
    }
    const parts = expression.arguments[0];
    const options = expression.arguments[1];
    const first = parts && parts.type == 'ArrayExpression' && parts.elements[0];
    if (first && typeof first.value == 'string'
      && propertyValue(options, 'type') == 'application/javascript') {
      count++;
      checkWorkerSource(first.value, count);
    }
    position = Math.max(position + 9, expression.end);
  }

  // worker-loader 3 в production передаёт исходник общему Blob-helper как
  // template literal. Helper может находиться в соседнем чанке, поэтому здесь
  // проверяется переданный ему исходник, а не только непосредственный new Blob.
  const workerLoader = /exports=function\(\)\{return\s+[A-Za-z_$][\w$]*\(/g;
  let match;
  while ((match = workerLoader.exec(source))) {
    const callPosition = match.index + match[0].lastIndexOf('return') + 6;
    let expression;
    try {
      expression = acorn.parseExpressionAt(source, callPosition, { ecmaVersion: 'latest' });
    }
    catch (error) {
      continue;
    }
    const workerSource = literalValue(expression.arguments && expression.arguments[0]);
    const constructorName = literalValue(expression.arguments && expression.arguments[1]);
    if (workerSource != null && constructorName == 'Worker') {
      count++;
      checkWorkerSource(workerSource, count);
    }
    workerLoader.lastIndex = Math.max(workerLoader.lastIndex, expression.end);
  }
  if (!count)
    throw new Error('В ' + fileName + ' не найдены inline Blob-worker');
  return count;
}

function defaultBundle() {
  const dist = path.resolve(__dirname, '..', 'dist');
  const javascript = path.join(dist, 'console.js');
  return fs.existsSync(javascript) ? javascript : path.join(dist, 'index.html');
}

if (require.main === module) {
  try {
    const fileName = path.resolve(process.argv[2] || defaultBundle());
    const count = checkBlobWorkers(fs.readFileSync(fileName, 'utf8'), fileName);
    console.log('[check:workers] OK: ' + count + ' Blob-worker совместимы с ES2018.');
  }
  catch (error) {
    console.error('[check:workers] ПРОВАЛ: ' + (error && error.message || error));
    process.exit(1);
  }
}

module.exports = { checkBlobWorkers };
