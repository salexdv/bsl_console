function normalizeName(value) {
    return (value || '').toLowerCase();
}

function isIdentifierPart(char) {
    return !!char && /[A-Za-z0-9_\u0410-\u044F\u0401\u0451]/.test(char);
}

function offsetAt(document, lineNumber, column) {
    let lineStarts = document && document.lineStarts ? document.lineStarts : [0];
    let lineStart = lineStarts[Math.max(0, lineNumber - 1)] || 0;
    return lineStart + Math.max(0, column - 1);
}

function rangeFromOffsets(document, start, end) {
    let lineStarts = document && document.lineStarts ? document.lineStarts : [0];

    function positionAt(offset) {
        let low = 0;
        let high = lineStarts.length - 1;

        while (low <= high) {
            let middle = Math.floor((low + high) / 2);
            if (lineStarts[middle] <= offset) {
                if (middle == lineStarts.length - 1 || offset < lineStarts[middle + 1]) {
                    return {
                        lineNumber: middle + 1,
                        column: offset - lineStarts[middle] + 1
                    };
                }
                low = middle + 1;
            }
            else
                high = middle - 1;
        }

        return { lineNumber: 1, column: 1 };
    }

    let startPosition = positionAt(Math.max(0, start));
    let endPosition = positionAt(Math.max(start, end));
    return {
        startLineNumber: startPosition.lineNumber,
        startColumn: startPosition.column,
        endLineNumber: endPosition.lineNumber,
        endColumn: endPosition.column
    };
}

function rangeContainsOffset(document, range, offset) {
    if (!range)
        return false;

    let start = offsetAt(document, range.startLineNumber, range.startColumn);
    let end = offsetAt(document, range.endLineNumber, range.endColumn);
    return start <= offset && offset <= end;
}

function identifierRanges(document, text, start, end) {
    let ranges = [];
    let cursor = Math.max(0, start);
    let limit = Math.min(text.length, Math.max(cursor, end));

    while (cursor < limit) {
        if (!isIdentifierPart(text[cursor]) || /[0-9]/.test(text[cursor])) {
            cursor++;
            continue;
        }

        let identifierStart = cursor;
        cursor++;
        while (cursor < limit && isIdentifierPart(text[cursor]))
            cursor++;

        ranges.push({
            name: text.slice(identifierStart, cursor),
            start: identifierStart,
            end: cursor,
            range: rangeFromOffsets(document, identifierStart, cursor)
        });
    }

    return ranges;
}

function wordAt(document, text, offset) {
    let probe = Math.max(0, Math.min(text.length, offset));

    if (!isIdentifierPart(text[probe]) && 0 < probe && isIdentifierPart(text[probe - 1]))
        probe--;

    if (!isIdentifierPart(text[probe]))
        return null;

    let start = probe;
    let end = probe + 1;

    while (0 < start && isIdentifierPart(text[start - 1]))
        start--;
    while (end < text.length && isIdentifierPart(text[end]))
        end++;

    return {
        name: text.slice(start, end),
        normalized: normalizeName(text.slice(start, end)),
        start: start,
        end: end,
        range: rangeFromOffsets(document, start, end)
    };
}

function lastIdentifierRange(document, text, range) {
    if (!range)
        return null;

    let start = offsetAt(document, range.startLineNumber, range.startColumn);
    let end = offsetAt(document, range.endLineNumber, range.endColumn);
    let identifiers = identifierRanges(document, text, start, end);
    return identifiers.length ? identifiers[identifiers.length - 1].range : range;
}

function selectItemName(item, index) {
    let name = item && (item.alias && item.alias.name || item.name || item.expression && item.expression.text) || '';
    name = name.replace(/\s+/g, ' ').trim();

    if (80 < name.length)
        name = name.slice(0, 77) + '...';

    return name || 'Поле ' + (index + 1);
}

function selectItemSelectionRange(document, text, item) {
    if (item.alias && item.alias.range)
        return item.alias.range;

    let references = item.references || item.expression && item.expression.references || [];
    if (references.length && references[references.length - 1].range)
        return lastIdentifierRange(document, text, references[references.length - 1].range);

    if (item.expression && item.expression.range)
        return item.expression.range;

    return item.range;
}

function keywordSelectionRange(document, text, start, fallbackRange) {
    let identifiers = identifierRanges(document, text, start, Math.min(text.length, start + 20));
    return identifiers.length ? identifiers[0].range : fallbackRange;
}

function createFieldSymbols(document, text, branch, kinds) {
    let items = branch && branch.select && branch.select.items || [];
    return items.map((item, index) => ({
        name: selectItemName(item, index),
        detail: '',
        kind: kinds.Field,
        range: item.range,
        selectionRange: selectItemSelectionRange(document, text, item),
        children: []
    }));
}

function createSymbolChildren(document, text, statement, kinds) {
    let branches = statement.branches || [];

    if (branches.length < 2)
        return branches.length ? createFieldSymbols(document, text, branches[0], kinds) : [];

    return branches.map((branch, index) => ({
        name: 'Ветка ' + (index + 1),
        detail: '',
        kind: kinds.Namespace,
        range: branch.range,
        selectionRange: keywordSelectionRange(document, text, branch.start, branch.range),
        children: createFieldSymbols(document, text, branch, kinds)
    }));
}

function getIntoTable(statement) {
    let firstBranch = statement && statement.branches && statement.branches[0];
    return firstBranch && firstBranch.into && firstBranch.into.table || null;
}

function provideDocumentSymbols(document, text, kinds) {
    if (!document || !document.statements)
        return [];

    let selectStatements = document.statements.filter(statement => statement.kind == 'selectStatement');
    let resultStatements = selectStatements.filter(statement => !getIntoTable(statement));
    let resultNumber = 0;
    let symbols = [];

    selectStatements.forEach(statement => {
        let intoTable = getIntoTable(statement);
        let name = '';
        let kind = kinds.Object;
        let selectionRange = keywordSelectionRange(document, text, statement.start, statement.range);

        if (intoTable) {
            name = intoTable.name;
            kind = kinds.Struct;
            selectionRange = intoTable.range;
        }
        else {
            resultNumber++;
            name = 'Результат запроса';
            if (1 < resultStatements.length)
                name += ' ' + resultNumber;
        }

        symbols.push({
            name: name,
            detail: '',
            kind: kind,
            range: statement.range,
            selectionRange: selectionRange,
            children: createSymbolChildren(document, text, statement, kinds)
        });
    });

    return symbols;
}

function getSourceAtoms(branch) {
    let result = [];
    let sources = branch && branch.from && branch.from.sources || [];

    sources.forEach(source => {
        if (source.base)
            result.push(source.base);
        (source.joins || []).forEach(join => {
            if (join.source)
                result.push(join.source);
        });
    });

    return result;
}

function sourceNameRange(document, text, source) {
    let end = source.alias ? source.alias.start : source.end;
    let identifiers = identifierRanges(document, text, source.start, end);

    if (!identifiers.length)
        return source.range;

    let partsCount = source.name ? source.name.split('.').length : identifiers.length;
    let sourceIdentifiers = identifiers.slice(0, Math.min(partsCount, identifiers.length));
    return rangeFromOffsets(document, sourceIdentifiers[0].start, sourceIdentifiers[sourceIdentifiers.length - 1].end);
}

function activeTempTablesBefore(document, statement) {
    let active = {};

    for (let index = 0; index < document.statements.length; index++) {
        let current = document.statements[index];
        if (current === statement || statement && statement.start <= current.start)
            break;

        if (current.kind == 'dropStatement') {
            delete active[normalizeName(current.table && current.table.trim())];
            continue;
        }

        if (current.kind == 'selectStatement') {
            let table = getIntoTable(current);
            if (table && table.name)
                active[normalizeName(table.name)] = current;
        }
    }

    return active;
}

function matchingSelectItems(statement, name) {
    let firstBranch = statement && statement.branches && statement.branches[0];
    let items = firstBranch && firstBranch.select && firstBranch.select.items || [];
    return items.filter((item, index) => normalizeName(selectItemName(item, index)) == normalizeName(name));
}

function targetForTempTable(document, text, statement) {
    let table = getIntoTable(statement);
    return table ? {
        targetRange: statement.range,
        targetSelectionRange: table.range
    } : null;
}

function targetForSelectItem(document, text, item) {
    return {
        targetRange: item.range,
        targetSelectionRange: selectItemSelectionRange(document, text, item)
    };
}

function targetForSource(document, text, source) {
    let selectionRange = source.alias && source.alias.range || lastIdentifierRange(document, text, sourceNameRange(document, text, source));
    return {
        targetRange: source.range,
        targetSelectionRange: selectionRange
    };
}

function withOrigin(target, originRange) {
    if (!target)
        return null;

    return {
        originSelectionRange: originRange,
        targetRange: target.targetRange,
        targetSelectionRange: target.targetSelectionRange
    };
}

function findStatementAt(document, offset) {
    let statements = document && document.statements || [];
    return statements.find(statement => statement.start <= offset && offset <= statement.end) || null;
}

function findBranchAt(statement, offset) {
    let branches = statement && statement.branches || [];
    return branches.find(branch => branch.start <= offset && offset <= branch.end) || null;
}

function findSourceByAlias(branch, name) {
    let matches = getSourceAtoms(branch).filter(source => {
        let sourceAlias = source.alias && source.alias.name;
        let implicitAlias = !sourceAlias && source.name && source.name.split('.').pop();
        return normalizeName(sourceAlias || implicitAlias) == normalizeName(name);
    });
    return matches.length == 1 ? matches[0] : null;
}

function findReferenceAt(document, branch, offset) {
    let references = [];

    function add(source) {
        (source || []).forEach(reference => references.push(reference));
    }

    let selectItems = branch && branch.select && branch.select.items || [];
    selectItems.forEach(item => add(item.references));

    getSourceAtoms(branch).forEach(source => add(source.references));
    let sources = branch && branch.from && branch.from.sources || [];
    sources.forEach(source => (source.joins || []).forEach(join => add(join.condition && join.condition.references)));

    ['where', 'groupBy', 'having', 'orderBy', 'indexBy', 'forUpdate'].forEach(key => {
        let clause = branch && branch[key];
        add(clause && clause.references);
        add(clause && clause.expression && clause.expression.references);
        (clause && clause.items || []).forEach(item => {
            add(item && item.references);
            add(item && item.expression && item.expression.references);
        });
    });

    return references.find(reference => rangeContainsOffset(document, reference.range, offset)) || null;
}

function isAliasDeclaration(document, branch, offset) {
    if (getSourceAtoms(branch).some(source => source.alias && rangeContainsOffset(document, source.alias.range, offset)))
        return true;

    let items = branch && branch.select && branch.select.items || [];
    return items.some(item => item.alias && rangeContainsOffset(document, item.alias.range, offset));
}

function definitionForReference(document, text, statement, branch, reference, word) {
    if (!reference || reference.kind != 'column')
        return null;

    let identifiers = identifierRanges(
        document,
        text,
        offsetAt(document, reference.range.startLineNumber, reference.range.startColumn),
        offsetAt(document, reference.range.endLineNumber, reference.range.endColumn)
    );
    let componentIndex = identifiers.findIndex(identifier => identifier.start <= word.start && word.end <= identifier.end);
    let source = findSourceByAlias(branch, reference.sourceName);

    if (componentIndex == 0 && source) {
        if (source.alias)
            return withOrigin(targetForSource(document, text, source), word.range);

        let active = activeTempTablesBefore(document, statement);
        return withOrigin(targetForTempTable(document, text, active[normalizeName(source.name)]), word.range);
    }

    if (componentIndex < 1 || !source)
        return null;

    let active = activeTempTablesBefore(document, statement);
    let definition = active[normalizeName(source.name)];
    if (!definition)
        return null;

    let matches = matchingSelectItems(definition, reference.fieldName);
    return matches.length == 1 ? withOrigin(targetForSelectItem(document, text, matches[0]), word.range) : null;
}

function definitionForSourceName(document, text, statement, branch, word) {
    let matches = getSourceAtoms(branch).filter(source => {
        let range = sourceNameRange(document, text, source);
        return rangeContainsOffset(document, range, word.start);
    });

    if (matches.length != 1)
        return null;

    let active = activeTempTablesBefore(document, statement);
    let definition = active[normalizeName(matches[0].name)];
    return withOrigin(targetForTempTable(document, text, definition), word.range);
}

function definitionForBareWord(document, text, statement, branch, word) {
    if (isAliasDeclaration(document, branch, word.start))
        return null;

    let selectItems = branch && branch.select && branch.select.items || [];
    let outputMatches = selectItems.filter((item, index) => normalizeName(selectItemName(item, index)) == word.normalized);
    if (outputMatches.length == 1 && !rangeContainsOffset(document, outputMatches[0].range, word.start))
        return withOrigin(targetForSelectItem(document, text, outputMatches[0]), word.range);
    if (1 < outputMatches.length)
        return null;

    let sourceMatches = getSourceAtoms(branch).filter(source => {
        let alias = source.alias && source.alias.name;
        return alias && normalizeName(alias) == word.normalized;
    });
    if (sourceMatches.length == 1)
        return withOrigin(targetForSource(document, text, sourceMatches[0]), word.range);
    if (1 < sourceMatches.length)
        return null;

    let active = activeTempTablesBefore(document, statement);
    let fieldTargets = [];
    getSourceAtoms(branch).forEach(source => {
        let definition = active[normalizeName(source.name)];
        if (!definition)
            return;

        matchingSelectItems(definition, word.name).forEach(item => fieldTargets.push(item));
    });

    return fieldTargets.length == 1 ? withOrigin(targetForSelectItem(document, text, fieldTargets[0]), word.range) : null;
}

function provideDefinition(document, text, lineNumber, column) {
    if (!document || !document.statements)
        return null;

    let offset = offsetAt(document, lineNumber, column);
    let word = wordAt(document, text, offset);
    let statement = findStatementAt(document, offset);
    let branch = findBranchAt(statement, offset);

    if (!word || !statement || statement.kind != 'selectStatement' || !branch)
        return null;

    let sourceDefinition = definitionForSourceName(document, text, statement, branch, word);
    if (sourceDefinition)
        return sourceDefinition;

    let reference = findReferenceAt(document, branch, word.start);
    if (reference)
        return definitionForReference(document, text, statement, branch, reference, word);

    return definitionForBareWord(document, text, statement, branch, word);
}

const queryNavigation = {
    provideDocumentSymbols: provideDocumentSymbols,
    provideDefinition: provideDefinition
};

export default queryNavigation;
