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
      try {
        acorn.parse(first.value, { ecmaVersion: 2018, sourceType: 'script' });
      }
      catch (error) {
        throw new Error('Blob-worker #' + count + ' не совместим с ES2018: ' + error.message);
      }
    }
    position = Math.max(position + 9, expression.end);
  }
  if (!count)
    throw new Error('В ' + fileName + ' не найдены application/javascript Blob-worker');
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
