const START_WORDS = [
    'если', '#если', 'для', 'пока', 'функция', 'процедура', 'попытка',
    'if', '#if', 'for', 'while', 'function', 'procedure', 'try'
];

const STOP_WORDS = [
    'конецесли', '#конецесли', 'конеццикла', 'конецфункции', 'конецпроцедуры', 'конецпопытки',
    'endif', '#endif', 'enddo', 'endfunction', 'endprocedure', 'endtry'
];

const COMPLEX_WORDS = [
    'исключение', 'иначе', 'иначеесли', '#иначе', '#иначеесли',
    'except', 'else', 'elseif', 'elsif', '#else', '#elseif', '#elsif'
];

const CONTROL_FLOW_MARKERS = {
    'если': 'тогда',
    'иначеесли': 'тогда',
    'if': 'then',
    'elseif': 'then',
    'elsif': 'then',
    'пока': 'цикл',
    'для': 'цикл',
    'while': 'do',
    'for': 'do'
};

const CONTROL_FLOW_END_WORDS = ['конецесли', 'endif', 'конеццикла', 'enddo'];

const BLOCK_MARKER_WORDS = CONTROL_FLOW_MARKERS;

const BLOCK_DECLARATION_WORDS = ['функция', 'процедура', 'function', 'procedure'];
const BLOCK_SIMPLE_WORDS = ['иначе', 'else', 'попытка', 'try', 'исключение', 'except'];
const BLOCK_END_WORDS = [
    'конецфункции', 'конецпроцедуры', 'endfunction', 'endprocedure',
    'конеццикла', 'enddo', 'конецесли', 'endif', 'конецпопытки', 'endtry'
];
const BLOCK_BOUNDARY_WORDS = Object.keys(BLOCK_MARKER_WORDS)
    .concat(BLOCK_DECLARATION_WORDS, BLOCK_SIMPLE_WORDS, BLOCK_END_WORDS);

function createState(source) {
    source = source || {};
    return {
        inString: Boolean(source.inString),
        parenthesisDepth: source.parenthesisDepth || 0,
        bracketDepth: source.bracketDepth || 0
    };
}

function isWordStart(character) {
    return /[A-Za-zА-Яа-яЁё_]/.test(character || '');
}

function isWordPart(character) {
    return /[A-Za-zА-Яа-яЁё_0-9]/.test(character || '');
}

function scanLine(line, initialState) {
    const state = createState(initialState);
    const startState = createState(state);
    const mask = new Array(line.length).fill(false);
    let commentStart = -1;

    for (let index = 0; index < line.length; index++) {
        const character = line[index];

        if (state.inString) {
            if (character == '"') {
                if (line[index + 1] == '"') {
                    index++;
                }
                else {
                    state.inString = false;
                }
            }
            continue;
        }

        if (character == '/' && line[index + 1] == '/') {
            commentStart = index;
            break;
        }

        if (character == '"') {
            state.inString = true;
            continue;
        }

        mask[index] = true;

        if (character == '(')
            state.parenthesisDepth++;
        else if (character == ')')
            state.parenthesisDepth = Math.max(0, state.parenthesisDepth - 1);
        else if (character == '[')
            state.bracketDepth++;
        else if (character == ']')
            state.bracketDepth = Math.max(0, state.bracketDepth - 1);
    }

    return { mask: mask, state: state, startState: startState, commentStart: commentStart };
}

function scanLines(lines, initialState) {
    let state = createState(initialState);
    const result = [];

    lines.forEach(line => {
        const analysis = scanLine(line, state);
        result.push({
            line: line,
            mask: analysis.mask,
            commentStart: analysis.commentStart,
            startState: createState(state),
            endState: createState(analysis.state)
        });
        state = analysis.state;
    });

    return { lines: result, state: state };
}

function getWords(line, mask) {
    const words = [];
    let index = 0;

    while (index < line.length) {
        if (!mask[index] || !isWordStart(line[index])) {
            index++;
            continue;
        }

        const start = index;
        index++;
        while (index < line.length && mask[index] && isWordPart(line[index]))
            index++;

        words.push({ start: start, end: index, value: line.substring(start, index) });
    }

    return words;
}

function getStructuralWords(line, mask) {
    const words = getWords(line, mask).map(word => word.value.toLowerCase());
    const trimmed = line.trimStart();

    if (trimmed[0] == '#' && words.length)
        words[0] = '#' + words[0];

    return words;
}

function getStructureChange(line, mask) {
    const words = getStructuralWords(line, mask);
    const firstWord = words.length ? words[0] : '';
    const closes = STOP_WORDS.includes(firstWord);
    const complex = COMPLEX_WORDS.includes(firstWord);
    const opens = words.some(word => START_WORDS.includes(word));

    return {
        before: closes || complex ? -1 : 0,
        after: complex || (opens && !closes) ? 1 : 0
    };
}

function getCodeText(line, mask) {
    let result = '';
    for (let index = 0; index < line.length; index++)
        result += mask[index] ? line[index] : ' ';
    return result;
}

function buildCanonicalMap(values) {
    const result = {};
    (values || []).forEach(value => {
        if (value)
            result[String(value).toLowerCase()] = String(value);
    });
    return result;
}

function addNamedEntry(map, key, value) {
    const canonicalName = value && value.name ? value.name : key;
    if (canonicalName)
        map[String(key).toLowerCase()] = canonicalName;
    if (value && value.name)
        map[String(value.name).toLowerCase()] = value.name;
    if (value && value.name_en)
        map[String(value.name_en).toLowerCase()] = value.name_en;
}

function buildPlatformNameMaps(globals) {
    const result = { globalFunctions: {}, classes: {}, methods: {} };
    if (!globals)
        return result;

    Object.entries(globals.globalfunctions || {}).forEach(([key, value]) => {
        addNamedEntry(result.globalFunctions, key, value);
    });

    Object.entries(globals.classes || {}).forEach(([key, value]) => {
        addNamedEntry(result.classes, key, value);
        Object.entries((value && value.methods) || {}).forEach(([methodKey, method]) => {
            addNamedEntry(result.methods, methodKey, method);
        });
    });

    return result;
}

function previousNonWhitespaceIndex(line, mask, index) {
    index--;
    while (0 <= index) {
        if (mask[index] && !/\s/.test(line[index]))
            return index;
        index--;
    }
    return -1;
}

function nextNonWhitespaceIndex(line, mask, index) {
    while (index < line.length) {
        if (mask[index] && !/\s/.test(line[index]))
            return index;
        if (!mask[index] && !/\s/.test(line[index]))
            return index;
        index++;
    }
    return -1;
}

function previousWord(line, mask, index) {
    let end = previousNonWhitespaceIndex(line, mask, index);
    if (end < 0 || !isWordPart(line[end]))
        return '';

    let start = end;
    while (0 < start && mask[start - 1] && isWordPart(line[start - 1]))
        start--;
    return line.substring(start, end + 1);
}

function canonicalizeLine(line, analysis, options, keywordMap) {
    const platformNames = options.platformNames;
    const replacements = [];

    getWords(line, analysis.mask).forEach(word => {
        const lowerWord = word.value.toLowerCase();
        let replacement = keywordMap[lowerWord];

        if (!replacement && platformNames) {
            const previousIndex = previousNonWhitespaceIndex(line, analysis.mask, word.start);
            const nextIndex = nextNonWhitespaceIndex(line, analysis.mask, word.end);
            const previousToken = previousWord(line, analysis.mask, word.start).toLowerCase();

            if ((options.formatCanonicalKeywords || options.formatCanonicalPlatformNames)
                && (previousToken == 'новый' || previousToken == 'new'))
                replacement = platformNames.classes[lowerWord];
            else if (options.formatCanonicalPlatformNames
                && 0 <= previousIndex && line[previousIndex] == '.' && 0 <= nextIndex && line[nextIndex] == '(')
                replacement = platformNames.methods[lowerWord];
            else if (options.formatCanonicalPlatformNames
                && 0 <= nextIndex && line[nextIndex] == '(' && (previousIndex < 0 || line[previousIndex] != '.'))
                replacement = platformNames.globalFunctions[lowerWord];
        }

        if (replacement && replacement != word.value)
            replacements.push({ start: word.start, end: word.end, text: replacement });
    });

    for (let index = replacements.length - 1; 0 <= index; index--) {
        const replacement = replacements[index];
        line = line.substring(0, replacement.start) + replacement.text + line.substring(replacement.end);
    }

    return line;
}

function addSpaceAfterCommas(line, analysis) {
    let result = '';

    for (let index = 0; index < line.length; index++) {
        if (!analysis.mask[index] || line[index] != ',') {
            result += line[index];
            continue;
        }

        result = result.replace(/[ \t]+$/, '') + ',';
        let nextIndex = index + 1;
        while (nextIndex < line.length && analysis.mask[nextIndex] && /[ \t]/.test(line[nextIndex]))
            nextIndex++;

        if (nextIndex < line.length && line[nextIndex] != ')' && line[nextIndex] != ']')
            result += ' ';

        index = nextIndex - 1;
    }

    return result;
}

function transformNamesAndCommas(lines, initialState, options) {
    let state = createState(initialState);
    const keywordMap = options.formatCanonicalKeywords ? buildCanonicalMap(options.keywords) : {};

    return lines.map(line => {
        let analysis = scanLine(line, state);
        let result = canonicalizeLine(line, analysis, options, keywordMap);
        analysis = scanLine(result, state);
        if (options.formatSpaceAfterComma)
            result = addSpaceAfterCommas(result, analysis);
        state = scanLine(result, state).state;
        return result;
    });
}

function splitStatements(lines, initialState) {
    let state = createState(initialState);
    const result = [];

    lines.forEach(line => {
        const analysis = scanLine(line, state);
        const splitPositions = [];
        let parenthesisDepth = state.parenthesisDepth;
        let bracketDepth = state.bracketDepth;

        for (let index = 0; index < line.length; index++) {
            if (!analysis.mask[index])
                continue;

            const character = line[index];
            if (character == '(')
                parenthesisDepth++;
            else if (character == ')')
                parenthesisDepth = Math.max(0, parenthesisDepth - 1);
            else if (character == '[')
                bracketDepth++;
            else if (character == ']')
                bracketDepth = Math.max(0, bracketDepth - 1);
            else if (character == ';' && parenthesisDepth == 0 && bracketDepth == 0) {
                let nextIndex = index + 1;
                while (nextIndex < line.length && (!analysis.mask[nextIndex] || /\s/.test(line[nextIndex])))
                    nextIndex++;
                if (nextIndex < line.length)
                    splitPositions.push(index + 1);
            }
        }

        if (!splitPositions.length) {
            result.push(line);
        }
        else {
            const indent = (line.match(/^[ \t]*/) || [''])[0];
            let start = 0;
            splitPositions.forEach(position => {
                result.push((start == 0 ? '' : indent) + line.substring(start, position).trimStart());
                start = position;
            });
            result.push(indent + line.substring(start).trimStart());
        }

        state = analysis.state;
    });

    return result;
}

function isControlFlowEnding(code) {
    const words = code.trim().replace(/;\s*$/, '').trim().split(/\s+/);
    return words.length == 1 && CONTROL_FLOW_END_WORDS.includes(words[0].toLowerCase());
}

function splitControlFlowEndings(line, analysis) {
    let parenthesisDepth = analysis.startState.parenthesisDepth;
    let bracketDepth = analysis.startState.bracketDepth;
    const segments = [];
    let start = 0;
    let segmentTopLevel = parenthesisDepth == 0 && bracketDepth == 0 && !analysis.startState.inString;

    for (let index = 0; index < line.length; index++) {
        if (!analysis.mask[index])
            continue;

        const character = line[index];
        if (character == '(')
            parenthesisDepth++;
        else if (character == ')')
            parenthesisDepth = Math.max(0, parenthesisDepth - 1);
        else if (character == '[')
            bracketDepth++;
        else if (character == ']')
            bracketDepth = Math.max(0, bracketDepth - 1);
        else if (character == ';' && parenthesisDepth == 0 && bracketDepth == 0) {
            segments.push({
                text: line.substring(start, index + 1),
                code: getCodeText(line.substring(start, index + 1), analysis.mask.slice(start, index + 1)),
                topLevel: segmentTopLevel
            });
            start = index + 1;
            segmentTopLevel = true;
        }
    }

    if (start < line.length) {
        const tail = {
            text: line.substring(start),
            code: getCodeText(line.substring(start), analysis.mask.slice(start)),
            topLevel: segmentTopLevel
        };
        if (!tail.code.trim() && segments.length)
            segments[segments.length - 1].text += tail.text;
        else
            segments.push(tail);
    }

    if (!segments.some(segment => segment.topLevel && isControlFlowEnding(segment.code)))
        return [line];

    const result = [];
    let ordinary = '';

    segments.forEach(segment => {
        if (segment.topLevel && isControlFlowEnding(segment.code)) {
            if (ordinary.trim())
                result.push(ordinary.trimEnd());
            ordinary = '';
            result.push(segment.text.trim());
        }
        else {
            ordinary += segment.text;
        }
    });

    if (ordinary.trim())
        result.push(ordinary.trim());

    return result;
}

function isolateControlFlowEndings(lines, initialState) {
    let state = createState(initialState);
    const result = [];

    lines.forEach(line => {
        const analysis = scanLine(line, state);
        result.push.apply(result, splitControlFlowEndings(line, analysis));
        state = analysis.state;
    });

    return result;
}

function joinControlFlowMarkers(lines, initialState) {
    const analyses = scanLines(lines, initialState).lines;
    const result = [];

    for (let index = 0; index < lines.length; index++) {
        const current = analyses[index];
        const currentCode = getCodeText(current.line, current.mask).trim();
        const marker = currentCode.toLowerCase();
        const isMarker = ['тогда', 'then', 'цикл', 'do'].includes(marker);

        if (isMarker && current.commentStart < 0 && result.length && index > 0) {
            const previous = analyses[index - 1];
            const previousCode = getCodeText(previous.line, previous.mask).trim();
            const previousWords = getWords(previous.line, previous.mask);
            const firstWord = previousWords.length ? previousWords[0].value.toLowerCase() : '';
            const expectedMarker = CONTROL_FLOW_MARKERS[firstWord];
            const alreadyHasMarker = previousWords.some(word => word.value.toLowerCase() == marker);
            const balanced = previous.startState.parenthesisDepth == previous.endState.parenthesisDepth
                && previous.startState.bracketDepth == previous.endState.bracketDepth
                && !previous.endState.inString;

            if (expectedMarker == marker && !alreadyHasMarker && previous.commentStart < 0
                && balanced && previousCode) {
                result[result.length - 1] = result[result.length - 1].trimEnd() + ' ' + currentCode;
                continue;
            }
        }

        result.push(lines[index]);
    }

    return result;
}

function formatControlFlow(lines, initialState) {
    return joinControlFlowMarkers(isolateControlFlowEndings(lines, initialState), initialState);
}

function getTopLevelSegments(line, analysis) {
    let parenthesisDepth = analysis.startState.parenthesisDepth;
    let bracketDepth = analysis.startState.bracketDepth;
    const segments = [];
    let start = 0;
    let segmentTopLevel = parenthesisDepth == 0 && bracketDepth == 0 && !analysis.startState.inString;

    for (let index = 0; index < line.length; index++) {
        if (!analysis.mask[index])
            continue;

        const character = line[index];
        if (character == '(')
            parenthesisDepth++;
        else if (character == ')')
            parenthesisDepth = Math.max(0, parenthesisDepth - 1);
        else if (character == '[')
            bracketDepth++;
        else if (character == ']')
            bracketDepth = Math.max(0, bracketDepth - 1);
        else if (character == ';' && parenthesisDepth == 0 && bracketDepth == 0) {
            segments.push({ start: start, end: index + 1, topLevel: segmentTopLevel });
            start = index + 1;
            segmentTopLevel = true;
        }
    }

    if (start < line.length) {
        if (segments.length && !getCodeText(line.substring(start), analysis.mask.slice(start)).trim())
            segments[segments.length - 1].end = line.length;
        else
            segments.push({ start: start, end: line.length, topLevel: segmentTopLevel });
    }

    return segments;
}

function getBoundaryWord(line, mask) {
    const words = getWords(line, mask);
    if (!words.length || line.trimStart()[0] == '#')
        return '';
    return words[0].value.toLowerCase();
}

function getMarkerEnd(words, marker) {
    for (let index = 1; index < words.length; index++) {
        if (words[index].value.toLowerCase() == marker)
            return words[index].end;
    }
    return -1;
}

function getDeclarationEnd(line, mask) {
    let depth = 0;
    let opened = false;
    let end = -1;

    for (let index = 0; index < line.length; index++) {
        if (!mask[index])
            continue;
        if (line[index] == '(') {
            depth++;
            opened = true;
        }
        else if (line[index] == ')' && opened) {
            depth = Math.max(0, depth - 1);
            if (depth == 0) {
                end = index + 1;
                break;
            }
        }
    }

    if (end < 0)
        return -1;

    const tailWords = getWords(line.substring(end), mask.slice(end));
    if (tailWords.length && ['экспорт', 'export'].includes(tailWords[0].value.toLowerCase()))
        end += tailWords[0].end;
    return end;
}

function splitBoundarySegment(text, mask) {
    const boundaryWord = getBoundaryWord(text, mask);
    if (!BLOCK_BOUNDARY_WORDS.includes(boundaryWord))
        return null;

    let boundaryEnd = text.length;
    const words = getWords(text, mask);
    if (BLOCK_MARKER_WORDS[boundaryWord]) {
        const markerEnd = getMarkerEnd(words, BLOCK_MARKER_WORDS[boundaryWord]);
        if (0 < markerEnd)
            boundaryEnd = markerEnd;
        else if (/;\s*$/.test(getCodeText(text, mask).trim()))
            return null;
    }
    else if (BLOCK_SIMPLE_WORDS.includes(boundaryWord)) {
        boundaryEnd = words[0].end;
    }
    else if (BLOCK_END_WORDS.includes(boundaryWord)) {
        boundaryEnd = words[0].end;
        while (boundaryEnd < text.length && /\s/.test(text[boundaryEnd]))
            boundaryEnd++;
        if (text[boundaryEnd] == ';')
            boundaryEnd++;
    }
    else if (BLOCK_DECLARATION_WORDS.includes(boundaryWord)) {
        const declarationEnd = getDeclarationEnd(text, mask);
        if (0 < declarationEnd)
            boundaryEnd = declarationEnd;
        else if (/;\s*$/.test(getCodeText(text, mask).trim()))
            return null;
    }

    const tailCode = getCodeText(text.substring(boundaryEnd), mask.slice(boundaryEnd)).trim();
    if (!tailCode)
        return { boundary: text.trim(), tail: '' };

    if (BLOCK_END_WORDS.includes(boundaryWord))
        return null;

    if (boundaryEnd == text.length)
        return { boundary: text.trim(), tail: '' };

    return {
        boundary: text.substring(0, boundaryEnd).trim(),
        tail: text.substring(boundaryEnd).trimStart()
    };
}

function splitBlockBoundaryLine(line, analysis) {
    const segments = getTopLevelSegments(line, analysis);
    const result = [];
    let ordinary = '';
    let foundBoundary = false;

    segments.forEach(segment => {
        const text = line.substring(segment.start, segment.end);
        const mask = analysis.mask.slice(segment.start, segment.end);
        const split = segment.topLevel ? splitBoundarySegment(text, mask) : null;

        if (!split) {
            ordinary += text;
            return;
        }

        foundBoundary = true;
        if (ordinary.trim())
            result.push(ordinary.trim());
        ordinary = '';
        result.push(split.boundary);
        if (split.tail)
            ordinary = split.tail;
    });

    if (ordinary.trim())
        result.push(ordinary.trim());

    return foundBoundary ? result : [line];
}

function isolateBlockBoundaries(lines, initialState) {
    let state = createState(initialState);
    const result = [];

    lines.forEach(line => {
        const analysis = scanLine(line, state);
        result.push.apply(result, splitBlockBoundaryLine(line, analysis));
        state = analysis.state;
    });

    return result;
}

function hasStandaloneMarker(line, analysis, marker) {
    const code = getCodeText(line, analysis.mask).trim().replace(/;\s*$/, '').trim();
    return code.toLowerCase() == marker;
}

function hasMarkerAtEnd(line, analysis, marker) {
    const words = getWords(line, analysis.mask);
    for (let index = 0; index < words.length; index++) {
        if (words[index].value.toLowerCase() != marker)
            continue;
        const tail = getCodeText(line.substring(words[index].end), analysis.mask.slice(words[index].end)).trim();
        if (!tail)
            return true;
    }
    return false;
}

function isValidBoundaryLine(line, analysis, boundaryWord) {
    const code = getCodeText(line, analysis.mask).trim();
    const words = getWords(line, analysis.mask);

    if (BLOCK_END_WORDS.includes(boundaryWord))
        return words.length == 1
            && code.replace(/;\s*$/, '').trim().toLowerCase() == boundaryWord;

    if (BLOCK_MARKER_WORDS[boundaryWord]
        && getMarkerEnd(words, BLOCK_MARKER_WORDS[boundaryWord]) < 0
        && /;\s*$/.test(code))
        return false;

    if (BLOCK_DECLARATION_WORDS.includes(boundaryWord)
        && getDeclarationEnd(line, analysis.mask) < 0
        && /;\s*$/.test(code))
        return false;

    return true;
}

function getBoundaryRanges(lines, initialState) {
    const analyses = scanLines(lines, initialState).lines;
    const ranges = [];

    for (let index = 0; index < lines.length; index++) {
        const analysis = analyses[index];
        if (analysis.startState.inString || analysis.startState.parenthesisDepth || analysis.startState.bracketDepth)
            continue;

        const boundaryWord = getBoundaryWord(lines[index], analysis.mask);
        if (!BLOCK_BOUNDARY_WORDS.includes(boundaryWord)
            || !isValidBoundaryLine(lines[index], analysis, boundaryWord))
            continue;

        let end = index;
        const marker = BLOCK_MARKER_WORDS[boundaryWord];
        const words = getWords(lines[index], analysis.mask);

        if (marker && getMarkerEnd(words, marker) < 0) {
            for (let markerIndex = index + 1; markerIndex < lines.length; markerIndex++) {
                const markerAnalysis = analyses[markerIndex];
                if (hasStandaloneMarker(lines[markerIndex], markerAnalysis, marker)
                    || hasMarkerAtEnd(lines[markerIndex], markerAnalysis, marker)) {
                    end = markerIndex;
                    break;
                }

                const code = getCodeText(lines[markerIndex], markerAnalysis.mask).trim();
                const nextBoundary = getBoundaryWord(lines[markerIndex], markerAnalysis.mask);
                if (code && BLOCK_BOUNDARY_WORDS.includes(nextBoundary))
                    break;
                if (code && /;\s*$/.test(code))
                    break;
            }
        }
        else if (BLOCK_DECLARATION_WORDS.includes(boundaryWord)) {
            const baseParenthesisDepth = analysis.startState.parenthesisDepth;
            const baseBracketDepth = analysis.startState.bracketDepth;
            while (end + 1 < lines.length && (analyses[end].endState.inString
                || analyses[end].endState.parenthesisDepth != baseParenthesisDepth
                || analyses[end].endState.bracketDepth != baseBracketDepth))
                end++;
        }

        let start = index;
        if (BLOCK_DECLARATION_WORDS.includes(boundaryWord)) {
            while (0 < start && lines[start - 1].trim()
                && (/^\s*\/\//.test(lines[start - 1]) || /^\s*&/.test(lines[start - 1])))
                start--;
        }

        ranges.push({ start: start, end: end });
        index = end;
    }

    return ranges;
}

function formatBlockSpacing(lines, initialState) {
    lines = isolateBlockBoundaries(lines, initialState);
    const ranges = getBoundaryRanges(lines, initialState);
    const starts = {};
    const ends = {};
    const rangeByLine = {};

    ranges.forEach((range, rangeIndex) => {
        starts[range.start] = true;
        ends[range.end] = true;
        for (let index = range.start; index <= range.end; index++)
            rangeByLine[index] = rangeIndex;
    });

    const result = [];
    let index = 0;
    while (index < lines.length) {
        if (!lines[index].trim()) {
            result.push(lines[index]);
            index++;
            continue;
        }

        result.push(lines[index]);
        let next = index + 1;
        while (next < lines.length && !lines[next].trim())
            next++;

        if (next < lines.length) {
            const sameBoundary = rangeByLine[index] !== undefined
                && rangeByLine[index] == rangeByLine[next];
            const needsBlankLine = !sameBoundary && (ends[index] || starts[next]);

            if (needsBlankLine)
                result.push('');
            else if (!sameBoundary)
                for (let blank = index + 1; blank < next; blank++)
                    result.push(lines[blank]);
        }
        else {
            for (let blank = index + 1; blank < next; blank++)
                result.push(lines[blank]);
        }

        index = next;
    }

    return result;
}

function formatIndentation(lines, initialState, initialIndent) {
    let state = createState(initialState);
    let indent = Math.max(0, initialIndent || 0);

    return lines.map(line => {
        const analysis = scanLine(line, state);
        const change = getStructureChange(line, analysis.mask);
        indent = Math.max(0, indent + change.before);

        const content = line.trim();
        const result = content ? '\t'.repeat(indent) + content : '';

        indent = Math.max(0, indent + change.after);
        state = analysis.state;
        return result.trimEnd();
    });
}

function getSimpleAssignment(line, analysis) {
    if (!line.trim() || 0 <= analysis.commentStart || analysis.startState.inString
        || analysis.startState.parenthesisDepth || analysis.startState.bracketDepth)
        return null;

    let parenthesisDepth = 0;
    let bracketDepth = 0;
    const equals = [];

    for (let index = 0; index < line.length; index++) {
        if (!analysis.mask[index])
            continue;

        const character = line[index];
        if (character == '(')
            parenthesisDepth++;
        else if (character == ')')
            parenthesisDepth = Math.max(0, parenthesisDepth - 1);
        else if (character == '[')
            bracketDepth++;
        else if (character == ']')
            bracketDepth = Math.max(0, bracketDepth - 1);
        else if (character == '=' && parenthesisDepth == 0 && bracketDepth == 0)
            equals.push(index);
    }

    if (equals.length != 1)
        return null;

    const equalIndex = equals[0];
    const indent = (line.match(/^[ \t]*/) || [''])[0];
    const left = line.substring(indent.length, equalIndex).trim();
    const right = line.substring(equalIndex + 1).trim();

    if (!/^[A-Za-zА-Яа-яЁё_][A-Za-zА-Яа-яЁё_0-9]*(?:\.[A-Za-zА-Яа-яЁё_][A-Za-zА-Яа-яЁё_0-9]*)*$/.test(left) || !right)
        return null;

    return { indent: indent, left: left, right: right };
}

function alignAssignments(lines, initialState) {
    const analyses = scanLines(lines, initialState).lines;
    const result = lines.slice();
    let index = 0;

    while (index < lines.length) {
        const first = getSimpleAssignment(lines[index], analyses[index]);
        if (!first) {
            index++;
            continue;
        }

        const group = [{ index: index, assignment: first }];
        let nextIndex = index + 1;
        while (nextIndex < lines.length) {
            const assignment = getSimpleAssignment(lines[nextIndex], analyses[nextIndex]);
            if (!assignment || assignment.indent != first.indent)
                break;
            group.push({ index: nextIndex, assignment: assignment });
            nextIndex++;
        }

        if (1 < group.length) {
            const width = Math.max.apply(null, group.map(item => item.assignment.left.length));
            group.forEach(item => {
                result[item.index] = item.assignment.indent
                    + item.assignment.left
                    + ' '.repeat(width - item.assignment.left.length)
                    + ' = '
                    + item.assignment.right;
            });
        }

        index = nextIndex;
    }

    return result;
}

class BslFormatter {

    static buildPlatformNameMaps(globals) {
        return buildPlatformNameMaps(globals);
    }

    static getState(text, initialState) {
        const lines = String(text || '').split(/\r?\n/);
        return scanLines(lines, initialState).state;
    }

    static getIndentLevel(text, initialState) {
        const lines = String(text || '').split(/\r?\n/);
        let state = createState(initialState);
        let indent = 0;

        lines.forEach(line => {
            const analysis = scanLine(line, state);
            const change = getStructureChange(line, analysis.mask);
            indent = Math.max(0, indent + change.before + change.after);
            state = analysis.state;
        });

        return indent;
    }

    static format(text, range, options) {
        options = options || {};
        text = String(text || '');
        const eolMatch = text.match(/\r\n|\n/);
        const eol = options.eol || (eolMatch ? eolMatch[0] : '\n');
        let lines = text.split(/\r?\n/);
        const initialState = createState(options.initialState);

        if (options.formatSplitStatements)
            lines = splitStatements(lines, initialState);

        lines = transformNamesAndCommas(lines, initialState, options);

        if (options.formatJoinThen)
            lines = formatControlFlow(lines, initialState);

        if (options.formatBlankLinesAroundBlocks)
            lines = formatBlockSpacing(lines, initialState);

        lines = formatIndentation(lines, initialState, options.initialIndent);

        if (options.formatAlignAssignments)
            lines = alignAssignments(lines, initialState);

        return [{ text: lines.join(eol), range: range }];
    }
}

export default BslFormatter;
