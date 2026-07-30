#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const babel = require('@babel/core');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_QUERIES_DIR = path.join(__dirname, 'queries');
const queryModelPath = path.join(ROOT, 'src', 'query_model.js');

const KEYWORDS = {
    select: new Set(['select', 'выбрать']),
    union: new Set(['union', 'объединить']),
    all: new Set(['all', 'все']),
    from: new Set(['from', 'из']),
    where: new Set(['where', 'где']),
    group: new Set(['group', 'сгруппировать']),
    having: new Set(['having', 'имеющие']),
    order: new Set(['order', 'упорядочить'])
};

const KNOWN_TEXT_EXTENSIONS = new Set([
    '.bsl',
    '.os',
    '.sdbl',
    '.query',
    '.sql',
    '.txt',
    '.md'
]);

function parseArgs(argv) {
    let args = {
        queriesDir: DEFAULT_QUERIES_DIR,
        strictErrors: false,
        strictStructure: false,
        includeAllFiles: false
    };

    for (let i = 2; i < argv.length; i++) {
        let arg = argv[i];

        if (arg == '--strict-errors') {
            args.strictErrors = true;
            continue;
        }

        if (arg == '--strict-structure') {
            args.strictStructure = true;
            continue;
        }

        if (arg == '--all-files') {
            args.includeAllFiles = true;
            continue;
        }

        if (arg == '--help' || arg == '-h') {
            printUsage();
            process.exit(0);
        }

        args.queriesDir = path.resolve(process.cwd(), arg);
    }

    return args;
}

function printUsage() {
    console.log([
        'Usage:',
        '  node tests/query_model_corpus_test.js [queriesDirOrFile] [--strict-errors] [--strict-structure] [--all-files]',
        '',
        'Default queriesDir: tests/queries',
        '',
        'Checks:',
        '  - query_model.parse() does not throw',
        '  - top-level SELECT/ВЫБРАТЬ branches count matches model branches',
        '  - statement-level SELECT/ВЫБРАТЬ count matches selectStatement count',
        '  - top-level FROM/ИЗ, WHERE/ГДЕ, GROUP BY, HAVING, ORDER BY counts match model clauses',
        '  - UNION branches have the same number of selected fields',
        '',
        'Structural discrepancies are warnings for the tolerant corpus.',
        'Use --strict-structure to treat them as failures.'
    ].join('\n'));
}

function loadQueryModel() {
    let source = fs.readFileSync(queryModelPath, 'utf8');
    let transformed = babel.transformSync(source, {
        filename: queryModelPath,
        babelrc: false,
        configFile: false,
        presets: [
            [require.resolve('@babel/preset-env'), {
                targets: { node: 'current' },
                modules: 'commonjs'
            }]
        ]
    }).code;
    let sandbox = {
        console: {
            log: function () {},
            warn: console.warn,
            error: console.error
        },
        Date: Date,
        performance: typeof performance != 'undefined' && performance
            ? performance
            : { now: function () { return Date.now(); } },
        module: { exports: {} },
        exports: {},
        require: require
    };

    sandbox.exports = sandbox.module.exports;

    vm.createContext(sandbox);
    vm.runInContext(transformed, sandbox, {
        filename: queryModelPath
    });

    let queryModel = sandbox.module.exports.default || sandbox.module.exports;

    if (!queryModel || typeof queryModel.parse != 'function')
        throw new Error('Не удалось загрузить src/query_model.js');

    return queryModel;
}

function readFilesRecursive(dir, includeAllFiles) {
    if (!fs.existsSync(dir))
        return [];

    let stat = fs.statSync(dir);

    if (stat.isFile())
        return includeAllFiles || KNOWN_TEXT_EXTENSIONS.has(path.extname(dir).toLowerCase()) ? [dir] : [];

    let result = [];
    let entries = fs.readdirSync(dir, { withFileTypes: true });

    for (let entry of entries) {
        let fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            result = result.concat(readFilesRecursive(fullPath, includeAllFiles));
            continue;
        }

        if (!entry.isFile())
            continue;

        if (!includeAllFiles && !KNOWN_TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
            continue;

        result.push(fullPath);
    }

    return result;
}

function isWordStart(ch) {
    return /[A-Za-zА-Яа-яЁё_]/.test(ch);
}

function isWordPart(ch) {
    return /[A-Za-zА-Яа-яЁё0-9_]/.test(ch);
}

function normalizeWord(word) {
    return word.toLowerCase().replace(/ё/g, 'е');
}

function scanTopLevelKeywords(text) {
    let tokens = [];
    let depth = 0;
    let line = 1;
    let column = 1;

    for (let i = 0; i < text.length;) {
        let ch = text[i];
        let next = text[i + 1];

        if (ch == '\r') {
            i++;
            continue;
        }

        if (ch == '\n') {
            line++;
            column = 1;
            i++;
            continue;
        }

        if (ch == '/' && next == '/') {
            while (i < text.length && text[i] != '\n') {
                i++;
                column++;
            }
            continue;
        }

        if (ch == '\'' || ch == '"') {
            let quote = ch;
            i++;
            column++;

            while (i < text.length) {
                ch = text[i];

                if (ch == '\r') {
                    i++;
                    continue;
                }

                if (ch == '\n') {
                    line++;
                    column = 1;
                    i++;
                    continue;
                }

                if (ch == quote) {
                    if (text[i + 1] == quote) {
                        i += 2;
                        column += 2;
                        continue;
                    }

                    i++;
                    column++;
                    break;
                }

                i++;
                column++;
            }

            continue;
        }

        if (ch == '{') {
            let braceDepth = 0;

            while (i < text.length) {
                ch = text[i];
                next = text[i + 1];

                if (ch == '\r') {
                    i++;
                    continue;
                }

                if (ch == '\n') {
                    line++;
                    column = 1;
                    i++;
                    continue;
                }

                if (ch == '/' && next == '/') {
                    while (i < text.length && text[i] != '\n') {
                        i++;
                        column++;
                    }
                    continue;
                }

                if (ch == '\'' || ch == '"') {
                    let quote = ch;
                    i++;
                    column++;

                    while (i < text.length) {
                        ch = text[i];

                        if (ch == '\r') {
                            i++;
                            continue;
                        }

                        if (ch == '\n') {
                            line++;
                            column = 1;
                            i++;
                            continue;
                        }

                        if (ch == quote) {
                            if (text[i + 1] == quote) {
                                i += 2;
                                column += 2;
                                continue;
                            }

                            i++;
                            column++;
                            break;
                        }

                        i++;
                        column++;
                    }

                    continue;
                }

                if (ch == '{')
                    braceDepth++;
                else if (ch == '}') {
                    braceDepth--;

                    if (braceDepth <= 0) {
                        i++;
                        column++;
                        break;
                    }
                }

                i++;
                column++;
            }

            continue;
        }

        if (ch == '(') {
            depth++;
            i++;
            column++;
            continue;
        }

        if (ch == ')') {
            if (depth > 0)
                depth--;

            i++;
            column++;
            continue;
        }

        if (isWordStart(ch)) {
            let start = i;
            let startLine = line;
            let startColumn = column;

            while (i < text.length && isWordPart(text[i])) {
                i++;
                column++;
            }

            tokens.push({
                value: text.slice(start, i),
                normalized: normalizeWord(text.slice(start, i)),
                depth: depth,
                line: startLine,
                column: startColumn
            });
            continue;
        }

        i++;
        column++;
    }

    return tokens.filter(token => token.depth == 0);
}

function isKeyword(token, name) {
    return token && KEYWORDS[name] && KEYWORDS[name].has(token.normalized);
}

function countExpectedClauses(tokens) {
    let result = {
        selectStatements: 0,
        selectBranches: 0,
        from: 0,
        where: 0,
        groupBy: 0,
        having: 0,
        orderBy: 0
    };

    for (let i = 0; i < tokens.length; i++) {
        let token = tokens[i];

        if (isKeyword(token, 'select')) {
            result.selectBranches++;

            let prev = tokens[i - 1];
            let prevPrev = tokens[i - 2];
            let isUnionBranch = isKeyword(prev, 'union') || (isKeyword(prev, 'all') && isKeyword(prevPrev, 'union'));

            if (!isUnionBranch)
                result.selectStatements++;
        }

        if (isKeyword(token, 'from'))
            result.from++;

        if (isKeyword(token, 'where'))
            result.where++;

        if (isKeyword(token, 'group'))
            result.groupBy++;

        if (isKeyword(token, 'having'))
            result.having++;

        if (isKeyword(token, 'order'))
            result.orderBy++;
    }

    return result;
}

function getSelectStatements(document) {
    return (document.statements || []).filter(statement => statement.kind == 'selectStatement');
}

function getBranches(document) {
    let branches = [];

    for (let statement of getSelectStatements(document))
        branches = branches.concat(statement.branches || []);

    return branches;
}

function countModelClauses(document) {
    let branches = getBranches(document);

    return {
        selectStatements: getSelectStatements(document).length,
        selectBranches: branches.length,
        from: branches.filter(branch => !!branch.from).length,
        where: branches.filter(branch => !!branch.where).length,
        groupBy: branches.filter(branch => !!branch.groupBy).length,
        having: branches.filter(branch => !!branch.having).length,
        orderBy: branches.filter(branch => !!branch.orderBy).length
    };
}

function selectedFieldCount(branch) {
    return branch && branch.select && Array.isArray(branch.select.items)
        ? branch.select.items.length
        : 0;
}

function checkUnionFieldCounts(document) {
    let failures = [];

    for (let statement of getSelectStatements(document)) {
        let branches = statement.branches || [];

        if (branches.length < 2)
            continue;

        let expected = selectedFieldCount(branches[0]);

        for (let i = 1; i < branches.length; i++) {
            let actual = selectedFieldCount(branches[i]);

            if (actual != expected) {
                failures.push(
                    'UNION branch #' + (i + 1) + ' has ' + actual +
                    ' selected fields, expected ' + expected
                );
            }
        }
    }

    return failures;
}

function hasTextContent(buffer) {
    if (buffer.length == 0)
        return false;

    return !buffer.includes(0);
}

function compareCounts(file, expected, actual) {
    let failures = [];
    let checks = [
        ['selectStatements', 'statement-level SELECT/ВЫБРАТЬ'],
        ['selectBranches', 'top-level SELECT/ВЫБРАТЬ branches'],
        ['from', 'top-level FROM/ИЗ'],
        ['where', 'top-level WHERE/ГДЕ'],
        ['groupBy', 'top-level GROUP BY/СГРУППИРОВАТЬ'],
        ['having', 'top-level HAVING/ИМЕЮЩИЕ'],
        ['orderBy', 'top-level ORDER BY/УПОРЯДОЧИТЬ']
    ];

    for (let check of checks) {
        let key = check[0];
        let title = check[1];

        if (expected[key] != actual[key])
            failures.push(title + ': expected ' + expected[key] + ', actual ' + actual[key]);
    }

    return failures;
}

function runFile(queryModel, file, options) {
    let buffer = fs.readFileSync(file);

    if (!hasTextContent(buffer)) {
        return {
            file: file,
            skipped: true,
            reason: 'empty or binary file'
        };
    }

    let text = buffer.toString('utf8');
    let expected = countExpectedClauses(scanTopLevelKeywords(text));
    let document = null;
    let failures = [];
    let warnings = [];

    try {
        document = queryModel.parse(text);
    }
    catch (error) {
        failures.push('queryModel.parse() threw: ' + (error && error.stack ? error.stack : error));
        return {
            file: file,
            failures: failures,
            warnings: warnings
        };
    }

    let actual = countModelClauses(document);
    let structureMessages = compareCounts(file, expected, actual)
        .concat(checkUnionFieldCounts(document));

    if (options.strictStructure)
        failures = failures.concat(structureMessages);
    else
        warnings = warnings.concat(structureMessages);

    if (!document.performance)
        failures.push('document.performance is missing');

    if (document.errors && document.errors.length) {
        let message = 'query_model errors: ' + document.errors.length;

        if (options.strictErrors)
            failures.push(message);
        else
            warnings.push(message);
    }

    return {
        file: file,
        expected: expected,
        actual: actual,
        failures: failures,
        warnings: warnings
    };
}

function formatRelative(file) {
    return path.relative(ROOT, file);
}

function main() {
    let options = parseArgs(process.argv);
    let queryModel = loadQueryModel();
    let files = readFilesRecursive(options.queriesDir, options.includeAllFiles);

    if (!files.length) {
        console.log('No query files found in ' + options.queriesDir);
        console.log('Create files in tests/queries or pass a directory/file path as the first argument.');
        return;
    }

    let failed = [];
    let warned = [];
    let skipped = [];

    for (let file of files) {
        let result = runFile(queryModel, file, options);

        if (result.skipped) {
            skipped.push(result);
            continue;
        }

        if (result.failures && result.failures.length)
            failed.push(result);

        if (result.warnings && result.warnings.length)
            warned.push(result);
    }

    for (let result of failed) {
        console.error('\nFAIL ' + formatRelative(result.file));

        for (let failure of result.failures)
            console.error('  - ' + failure);

        if (result.expected && result.actual) {
            console.error('  expected: ' + JSON.stringify(result.expected));
            console.error('  actual:   ' + JSON.stringify(result.actual));
        }
    }

    for (let result of warned) {
        console.warn('\nWARN ' + formatRelative(result.file));

        for (let warning of result.warnings)
            console.warn('  - ' + warning);
    }

    console.log('\nChecked files: ' + (files.length - skipped.length));

    if (skipped.length)
        console.log('Skipped files: ' + skipped.length);

    if (warned.length)
        console.log('Files with warnings: ' + warned.length);

    if (failed.length) {
        console.error('Failed files: ' + failed.length);
        process.exit(1);
    }

    console.log('All query_model corpus checks passed.');
}

main();
