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
    acorn.parse(source, { ecmaVersion: 2015, sourceType: 'script' });
  }
  catch (error) {
    throw new Error('Blob-worker #' + count + ' не совместим с ES2015: ' + error.message);
  }
}

function literalValue(node) {
  if (!node) return null;
  if (typeof node.value == 'string') return node.value;
  if (node.type == 'TemplateLiteral' && !node.expressions.length)
    return node.quasis[0].value.cooked;
  return null;
}

function checkBlobWorkers(source, fileName, allowEmpty) {
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
    const workerSource = literalValue(first);
    if (workerSource != null && propertyValue(options, 'type') == 'application/javascript') {
      count++;
      checkWorkerSource(workerSource, count);
    }
    position = Math.max(position + 9, expression.end);
  }

  if (!count && !allowEmpty)
    throw new Error('В ' + fileName + ' не найдены inline Blob-worker');
  return count;
}

function defaultBundles() {
  const dist = path.resolve(__dirname, '..', 'dist');
  return fs.readdirSync(dist)
    .filter(function (name) { return /\.js$/i.test(name) || name == 'index.html'; })
    .map(function (name) { return path.join(dist, name); });
}

if (require.main === module) {
  try {
    const explicitFile = process.argv[2] && path.resolve(process.argv[2]);
    const files = explicitFile ? [explicitFile] : defaultBundles();
    let count = 0;
    files.forEach(function (fileName) {
      count += checkBlobWorkers(fs.readFileSync(fileName, 'utf8'), fileName, !explicitFile);
    });
    if (!count)
      throw new Error('В сборке не найдены inline Blob-worker');
    console.log('[check:workers] OK: ' + count + ' Blob-worker совместимы с ES2015.');
  }
  catch (error) {
    console.error('[check:workers] ПРОВАЛ: ' + (error && error.message || error));
    process.exit(1);
  }
}

module.exports = { checkBlobWorkers };
