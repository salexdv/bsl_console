const KEYWORDS = new Set([
        'select', 'выбрать',
        'distinct', 'различные',
        'allowed', 'разрешенные',
        'top', 'первые',
        'into', 'поместить',
        'from', 'из',
        'where', 'где',
        'group', 'сгруппировать',
        'by', 'по',
        'having', 'имеющие',
        'order', 'упорядочить',
        'totals', 'итоги',
        'autoorder', 'автоупорядочивание',
        'index', 'индексировать',
        'union', 'объединить',
        'all', 'все',
        'as', 'как',
        'left', 'левое',
        'right', 'правое',
        'full', 'полное',
        'inner', 'внутреннее',
        'outer', 'внешнее',
        'join', 'соединение',
        'on', 'on',
        'for', 'для',
        'update', 'update',
        'and', 'и',
        'or', 'или',
        'not', 'не',
        'when', 'когда',
        'then', 'тогда',
        'else', 'иначе',
        'end', 'конец',
        'case', 'выбор',
        'asc', 'возр',
        'desc', 'убыв'
    ]);

    const CLAUSE_KEYWORDS = new Set([
        'into', 'поместить',
        'from', 'из',
        'where', 'где',
        'group', 'сгруппировать',
        'having', 'имеющие',
        'order', 'упорядочить',
        'totals', 'итоги',
        'autoorder', 'автоупорядочивание',
        'index', 'индексировать',
        'union', 'объединить',
        'for', 'для'
    ]);

    const JOIN_KEYWORDS = new Set([
        'left', 'левое',
        'right', 'правое',
        'full', 'полное',
        'inner', 'внутреннее',
        'outer', 'внешнее',
        'join', 'соединение'
    ]);

    function isIdentifierStart(char) {
        return /[A-Za-z_\u0410-\u044F\u0401\u0451]/.test(char);
    }

    function isIdentifierPart(char) {
        return /[A-Za-z0-9_\u0410-\u044F\u0401\u0451]/.test(char);
    }

    function buildLineStarts(text) {
        let starts = [0];

        for (let idx = 0; idx < text.length; idx++) {
            if (text[idx] == '\n')
                starts.push(idx + 1);
        }

        return starts;
    }

    function positionAt(offset, lineStarts) {
        let low = 0;
        let high = lineStarts.length - 1;

        while (low <= high) {
            let mid = Math.floor((low + high) / 2);
            if (lineStarts[mid] <= offset) {
                if (mid == lineStarts.length - 1 || offset < lineStarts[mid + 1]) {
                    return {
                        lineNumber: mid + 1,
                        column: offset - lineStarts[mid] + 1
                    };
                }

                low = mid + 1;
            }
            else
                high = mid - 1;
        }

        return { lineNumber: 1, column: 1 };
    }

    function rangeFromOffsets(start, end, lineStarts) {
        return {
            startLineNumber: positionAt(start, lineStarts).lineNumber,
            startColumn: positionAt(start, lineStarts).column,
            endLineNumber: positionAt(Math.max(start, end), lineStarts).lineNumber,
            endColumn: positionAt(Math.max(start, end), lineStarts).column
        };
    }

    function normalizeWord(word) {
        return word ? word.toLowerCase() : '';
    }

    function cloneArray(source) {
        return source ? source.slice(0) : [];
    }

    function nowMs() {
        if (typeof performance != 'undefined' && performance && performance.now)
            return performance.now();

        return Date.now();
    }

    function getBslMetadata() {
        if (typeof self != 'undefined' && self && self.bslMetadata)
            return self.bslMetadata;

        return null;
    }

    function getMetadataSource(fullSourceName) {
        let metadata = getBslMetadata();

        if (!metadata || !fullSourceName)
            return '';

        for (let key in metadata) {
            if (!metadata.hasOwnProperty(key))
                continue;

            let item = metadata[key];

            if (!item)
                continue;

            if (item.query_name && fullSourceName.indexOf(item.query_name) == 0)
                return item.query_name;

            if (item.query_name_en && fullSourceName.indexOf(item.query_name_en) == 0)
                return item.query_name_en;
        }

        return '';
    }

    class QueryTokenizer {

        constructor(text) {
            this.text = text || '';
            this.offset = 0;
            this.length = this.text.length;
            this.tokens = [];
            this.errors = [];
        }

        tokenize() {

            while (this.offset < this.length) {
                let char = this.text[this.offset];
                let nextChar = this.offset + 1 < this.length ? this.text[this.offset + 1] : '';

                if (/\s/.test(char)) {
                    this.offset++;
                    continue;
                }

                if (char == '/' && nextChar == '/') {
                    this.offset += 2;

                    while (this.offset < this.length && this.text[this.offset] != '\n')
                        this.offset++;

                    continue;
                }

                if (char == '\'' || char == '"') {
                    this.tokens.push(this.readString(char));
                    continue;
                }

                if (char == '{') {
                    this.skipBraceBlock();
                    continue;
                }

                if (char == '&') {
                    this.tokens.push(this.readParameter());
                    continue;
                }

                if (/\d/.test(char)) {
                    this.tokens.push(this.readNumber());
                    continue;
                }

                if (isIdentifierStart(char)) {
                    this.tokens.push(this.readWord());
                    continue;
                }

                this.tokens.push(this.readSymbol());
            }

            this.tokens.push({
                type: 'eof',
                value: '',
                start: this.length,
                end: this.length
            });

            return {
                tokens: this.tokens,
                errors: this.errors
            };

        }

        skipBraceBlock() {
            let depth = 0;

            while (this.offset < this.length) {
                let char = this.text[this.offset];
                let nextChar = this.offset + 1 < this.length ? this.text[this.offset + 1] : '';

                if (char == '/' && nextChar == '/') {
                    this.offset += 2;

                    while (this.offset < this.length && this.text[this.offset] != '\n')
                        this.offset++;

                    continue;
                }

                if (char == '\'' || char == '"') {
                    this.readString(char);
                    continue;
                }

                if (char == '{')
                    depth++;
                else if (char == '}') {
                    depth--;

                    if (depth <= 0) {
                        this.offset++;
                        return;
                    }
                }

                this.offset++;
            }
        }

        readString(quote) {
            let start = this.offset;
            this.offset++;

            while (this.offset < this.length) {
                if (this.text[this.offset] == quote) {
                    if (this.offset + 1 < this.length && this.text[this.offset + 1] == quote)
                        this.offset += 2;
                    else {
                        this.offset++;
                        break;
                    }
                }
                else
                    this.offset++;
            }

            return {
                type: 'string',
                value: this.text.slice(start, this.offset),
                start: start,
                end: this.offset
            };
        }

        readParameter() {
            let start = this.offset;
            this.offset++;

            while (this.offset < this.length && isIdentifierPart(this.text[this.offset]))
                this.offset++;

            return {
                type: 'parameter',
                value: this.text.slice(start, this.offset),
                normalized: normalizeWord(this.text.slice(start, this.offset)),
                start: start,
                end: this.offset
            };
        }

        readNumber() {
            let start = this.offset;
            let hasDot = false;

            while (this.offset < this.length) {
                let char = this.text[this.offset];

                if (char == '.' && !hasDot) {
                    hasDot = true;
                    this.offset++;
                }
                else if (/\d/.test(char))
                    this.offset++;
                else
                    break;
            }

            return {
                type: 'number',
                value: this.text.slice(start, this.offset),
                start: start,
                end: this.offset
            };
        }

        readWord() {
            let start = this.offset;
            this.offset++;

            while (this.offset < this.length && isIdentifierPart(this.text[this.offset]))
                this.offset++;

            let value = this.text.slice(start, this.offset);
            let normalized = normalizeWord(value);

            return {
                type: KEYWORDS.has(normalized) ? 'keyword' : 'identifier',
                value: value,
                normalized: normalized,
                start: start,
                end: this.offset
            };
        }

        readSymbol() {
            let start = this.offset;
            let value = this.text[this.offset];
            let nextChar = this.offset + 1 < this.length ? this.text[this.offset + 1] : '';

            if ((value == '<' || value == '>') && nextChar == '=') {
                this.offset += 2;
                return { type: 'symbol', value: value + nextChar, start: start, end: this.offset };
            }

            if (value == '<' && nextChar == '>') {
                this.offset += 2;
                return { type: 'symbol', value: '<>', start: start, end: this.offset };
            }

            this.offset++;

            return {
                type: 'symbol',
                value: value,
                start: start,
                end: this.offset
            };
        }

    }

    class QueryParser {

        constructor(text) {
            this.text = text || '';
            let tokenizeStart = nowMs();
            let tokenization = new QueryTokenizer(this.text).tokenize();
            this.tokens = tokenization.tokens;
            this.tokenizeDurationMs = nowMs() - tokenizeStart;
            this.errors = cloneArray(tokenization.errors);
            this.index = 0;
            this.lineStarts = buildLineStarts(this.text);
            this.nodes = [];
        }

        parse() {
            let parseStart = nowMs();
            let document = this.createNode('queryDocument', 0, this.text.length, {
                statements: [],
                errors: this.errors
            });

            while (!this.isEOF()) {
                this.skipSemicolons();

                if (this.isEOF())
                    break;

                let statement = this.parseStatement();

                if (statement)
                    document.statements.push(statement);
                else {
                    this.errors.push(this.createError('Не удалось определить тип запроса', this.currentToken()));
                    this.advance();
                }

                this.skipSemicolons();
            }

            document.lineStarts = this.lineStarts;
            document.nodes = this.nodes.filter(node => node !== document);

            document.findNodeAt = (lineNumber, column) => {
                let offset = this.offsetAt(lineNumber, column);
                return this.findNodeAtOffset(document, offset);
            };

            document.getContextAt = (lineNumber, column) => {
                let offset = this.offsetAt(lineNumber, column);
                let statement = document.statements.find(item => item.start <= offset && offset <= item.end) || null;
                let branch = null;
                let clause = null;

                if (statement && statement.branches) {
                    branch = statement.branches.find(item => item.start <= offset && offset <= item.end) || null;

                    if (branch) {
                        ['select', 'into', 'from', 'where', 'groupBy', 'having', 'orderBy', 'indexBy', 'forUpdate'].forEach(key => {
                            if (!clause && branch[key] && branch[key].start <= offset && offset <= branch[key].end)
                                clause = branch[key];
                        });
                    }
                }

                return {
                    offset: offset,
                    statement: statement,
                    branch: branch,
                    clause: clause,
                    node: this.findNodeAtOffset(document, offset)
                };
            };

            document.performance = {
                tokenizeMs: this.tokenizeDurationMs,
                parseMs: nowMs() - parseStart,
                totalMs: null,
                tokenCount: this.tokens.length,
                nodeCount: this.nodes.length,
                errorCount: document.errors.length
            };

            return document;
        }

        parseStatement() {
            let token = this.currentToken();

            if (this.isKeyword(token, 'select', 'выбрать'))
                return this.parseSelectStatement();

            if (this.isKeyword(token, 'drop', 'уничтожить'))
                return this.parseDropStatement();

            return null;
        }

        parseDropStatement() {
            let startToken = this.currentToken();
            this.advance();

            let nameTokens = this.readUntilStatementEnd();
            let end = this.getNodeEnd(nameTokens, startToken.end);

            return this.createNode('dropStatement', startToken.start, end, {
                table: this.tokensText(nameTokens).trim()
            });
        }

        parseSelectStatement() {
            let start = this.currentToken().start;
            let branches = [];
            let overallOrderBy = null;
            let overallTotals = null;
            let autoOrder = false;

            let firstBranch = this.parseQueryBranch();
            if (firstBranch)
                branches.push(firstBranch);

            while (this.isKeyword(this.currentToken(), 'union', 'объединить')) {
                let unionToken = this.currentToken();
                this.advance();

                let unionAll = false;

                if (this.isKeyword(this.currentToken(), 'all', 'все')) {
                    unionAll = true;
                    this.advance();
                }

                let branch = this.parseQueryBranch();

                if (branch) {
                    branch.union = {
                        range: this.rangeFromOffsets(unionToken.start, branch.end),
                        all: unionAll
                    };
                    branches.push(branch);
                }
                else {
                    this.errors.push(this.createError('После ОБЪЕДИНИТЬ ожидается запрос', unionToken));
                    break;
                }
            }

            while (!this.isEOF() && !this.isStatementTerminator(this.currentToken())) {
                if (this.isKeyword(this.currentToken(), 'autoorder', 'автоупорядочивание')) {
                    autoOrder = true;
                    this.advance();
                }
                else if (this.isKeyword(this.currentToken(), 'order', 'упорядочить'))
                    overallOrderBy = this.parseOrderBy();
                else if (this.isKeyword(this.currentToken(), 'totals', 'итоги'))
                    overallTotals = this.parseTotals();
                else
                    this.advance();
            }

            let end = branches.length ? branches[branches.length - 1].end : start;

            if (overallTotals)
                end = overallTotals.end;
            else if (overallOrderBy)
                end = overallOrderBy.end;

            return this.createNode('selectStatement', start, end, {
                branches: branches,
                overallOrderBy: overallOrderBy,
                overallTotals: overallTotals,
                autoOrder: autoOrder
            });
        }

        parseQueryBranch() {
            let selectToken = this.currentToken();

            if (!this.isKeyword(selectToken, 'select', 'выбрать'))
                return null;

            this.advance();

            let branch = this.createNode('queryBranch', selectToken.start, selectToken.end, {
                limitations: [],
                select: null,
                into: null,
                from: null,
                where: null,
                groupBy: null,
                having: null,
                orderBy: null,
                indexBy: null,
                forUpdate: null,
                errors: []
            });

            branch.limitations = this.parseLimitations();
            branch.select = this.parseSelectList(branch);

            if (this.isKeyword(this.currentToken(), 'into', 'поместить'))
                branch.into = this.parseInto();

            if (this.isKeyword(this.currentToken(), 'from', 'из'))
                branch.from = this.parseFrom();

            if (this.isKeyword(this.currentToken(), 'where', 'где'))
                branch.where = this.parseClauseExpression('whereClause', ['group', 'сгруппировать', 'having', 'имеющие', 'for', 'для', 'index', 'индексировать', 'order', 'упорядочить', 'union', 'объединить', 'totals', 'итоги', 'autoorder', 'автоупорядочивание']);

            if (this.isKeyword(this.currentToken(), 'group', 'сгруппировать'))
                branch.groupBy = this.parseGroupBy();

            if (this.isKeyword(this.currentToken(), 'having', 'имеющие'))
                branch.having = this.parseClauseExpression('havingClause', ['for', 'для', 'index', 'индексировать', 'order', 'упорядочить', 'union', 'объединить', 'totals', 'итоги', 'autoorder', 'автоупорядочивание']);

            if (this.isKeyword(this.currentToken(), 'for', 'для'))
                branch.forUpdate = this.parseForUpdate();

            if (this.isKeyword(this.currentToken(), 'index', 'индексировать'))
                branch.indexBy = this.parseIndexBy();

            if (this.isKeyword(this.currentToken(), 'order', 'упорядочить'))
                branch.orderBy = this.parseOrderBy();

            this.enrichBranch(branch);
            branch.end = this.getBranchEnd(branch);
            branch.range = this.rangeFromOffsets(branch.start, branch.end);

            return branch;
        }

        parseLimitations() {
            let result = [];

            while (this.isKeyword(this.currentToken(), 'distinct', 'различные', 'allowed', 'разрешенные', 'top', 'первые')) {
                let token = this.currentToken();

                if (this.isKeyword(token, 'top', 'первые')) {
                    this.advance();
                    let countToken = this.currentToken();
                    if (countToken.type == 'number') {
                        result.push(this.createNode('limitation', token.start, countToken.end, {
                            kind: 'top',
                            value: countToken.value
                        }));
                        this.advance();
                    }
                    else {
                        result.push(this.createNode('limitation', token.start, token.end, {
                            kind: 'top',
                            value: null,
                            incomplete: true
                        }));
                    }
                }
                else {
                    result.push(this.createNode('limitation', token.start, token.end, {
                        kind: token.normalized
                    }));
                    this.advance();
                }
            }

            return result;
        }

        parseSelectList(branch) {
            let tokens = this.readUntilClause(['into', 'поместить', 'from', 'из', 'where', 'где', 'group', 'сгруппировать', 'having', 'имеющие', 'for', 'для', 'index', 'индексировать', 'order', 'упорядочить', 'union', 'объединить', 'totals', 'итоги', 'autoorder', 'автоупорядочивание']);
            let items = [];

            this.splitTopLevel(tokens, ',').forEach(itemTokens => {
                if (!itemTokens.length)
                    return;

                items.push(this.parseSelectItem(itemTokens));
            });

            let end = this.getNodeEnd(tokens, branch.start);

            return this.createNode('selectList', branch.start, end, {
                items: items
            });
        }

        parseSelectItem(tokens) {
            let alias = null;
            let aliasIndex = -1;
            let depth = 0;

            for (let idx = 0; idx < tokens.length; idx++) {
                let token = tokens[idx];

                if (token.value == '(')
                    depth++;
                else if (token.value == ')')
                    depth = Math.max(0, depth - 1);
                else if (depth == 0 && this.isKeyword(token, 'as', 'как') && idx + 1 < tokens.length) {
                    aliasIndex = idx;
                }
            }

            let expressionTokens = tokens;

            if (aliasIndex != -1) {
                let aliasTokens = tokens.slice(aliasIndex + 1).filter(token => token.type == 'identifier');
                if (aliasTokens.length)
                    alias = this.createIdentifierNode(aliasTokens[0]);
                expressionTokens = tokens.slice(0, aliasIndex);
            }

            let start = tokens[0].start;
            let end = tokens[tokens.length - 1].end;
            let expressionText = this.tokensText(expressionTokens).trim();
            let references = this.extractColumnReferences(expressionTokens);

            return this.createNode('selectItem', start, end, {
                alias: alias,
                expression: this.createNode('expression', expressionTokens.length ? expressionTokens[0].start : start, expressionTokens.length ? expressionTokens[expressionTokens.length - 1].end : end, {
                    text: expressionText,
                    references: references
                }),
                references: references,
                text: this.text.slice(start, end)
            });
        }

        parseInto() {
            let startToken = this.currentToken();
            this.advance();
            let id = this.readIdentifierChain();
            let end = id ? id.end : startToken.end;

            return this.createNode('intoClause', startToken.start, end, {
                table: id
            });
        }

        parseFrom() {
            let startToken = this.currentToken();
            this.advance();
            let tokens = this.readUntilClause(['where', 'где', 'group', 'сгруппировать', 'having', 'имеющие', 'for', 'для', 'index', 'индексировать', 'order', 'упорядочить', 'union', 'объединить', 'totals', 'итоги', 'autoorder', 'автоупорядочивание']);
            let sources = [];

            this.splitTopLevel(tokens, ',').forEach(chunk => {
                if (chunk.length)
                    sources.push(this.parseSource(chunk));
            });

            return this.createNode('fromClause', startToken.start, this.getNodeEnd(tokens, startToken.end), {
                sources: sources
            });
        }

        parseSource(tokens) {
            let joinIndexes = [];
            let depth = 0;

            for (let idx = 0; idx < tokens.length; idx++) {
                let token = tokens[idx];

                if (token.value == '(')
                    depth++;
                else if (token.value == ')')
                    depth = Math.max(0, depth - 1);
                else if (depth == 0 && this.isJoinStart(tokens, idx))
                    joinIndexes.push(idx);
            }

            let baseTokens = joinIndexes.length ? tokens.slice(0, joinIndexes[0]) : tokens;
            let joins = [];

            for (let idx = 0; idx < joinIndexes.length; idx++) {
                let startIndex = joinIndexes[idx];
                let endIndex = idx + 1 < joinIndexes.length ? joinIndexes[idx + 1] : tokens.length;
                joins.push(this.parseJoin(tokens.slice(startIndex, endIndex)));
            }

            let base = this.parseSourceAtom(baseTokens);

            return this.createNode('source', tokens[0].start, tokens[tokens.length - 1].end, {
                base: base,
                joins: joins
            });
        }

        parseSourceAtom(tokens) {
            let alias = null;
            let aliasIndex = -1;

            for (let idx = tokens.length - 1; 0 <= idx; idx--) {
                let token = tokens[idx];

                if (this.isKeyword(token, 'as', 'как') && idx + 1 < tokens.length && tokens[idx + 1].type == 'identifier') {
                    aliasIndex = idx;
                    alias = this.createIdentifierNode(tokens[idx + 1]);
                    break;
                }
            }

            if (aliasIndex == -1 && 1 < tokens.length) {
                let lastToken = tokens[tokens.length - 1];
                let prevToken = tokens[tokens.length - 2];
                if (lastToken.type == 'identifier' && prevToken.value != '.' && prevToken.value != ')') {
                    aliasIndex = tokens.length - 1;
                    alias = this.createIdentifierNode(lastToken);
                }
            }

            let sourceTokens = aliasIndex == -1 ? tokens : tokens.slice(0, aliasIndex);
            let text = this.tokensText(sourceTokens).trim();
            let kind = 'table';
            let name = null;

            if (!sourceTokens.length)
                kind = 'unknown';
            else if (sourceTokens[0].value == '(')
                kind = this.containsKeyword(sourceTokens, 'select', 'выбрать') ? 'subquerySource' : 'groupSource';
            else if (sourceTokens[0].type == 'parameter')
                kind = 'parameterSource';

            let references = this.extractColumnReferences(sourceTokens);

            if (references.length)
                name = references[0].path;
            else {
                let identifiers = sourceTokens.filter(token => token.type == 'identifier');
                if (identifiers.length)
                    name = identifiers.map(token => token.value).join('.');
            }

            return this.createNode('sourceAtom', sourceTokens.length ? sourceTokens[0].start : tokens[0].start, tokens[tokens.length - 1].end, {
                kind: kind,
                name: name,
                alias: alias,
                text: text,
                references: references
            });
        }

        parseJoin(tokens) {
            let onIndex = -1;

            for (let idx = 0; idx < tokens.length; idx++) {
                let token = tokens[idx];
                if (this.isKeyword(token, 'on', 'по')) {
                    onIndex = idx;
                    break;
                }
            }

            let joinTypeTokens = [];
            let sourceTokens = [];
            let conditionTokens = [];
            let joinKeywordSeen = false;

            for (let idx = 0; idx < tokens.length; idx++) {
                let token = tokens[idx];

                if (!joinKeywordSeen) {
                    joinTypeTokens.push(token);
                    if (this.isKeyword(token, 'join', 'соединение'))
                        joinKeywordSeen = true;
                }
                else if (onIndex == -1 || idx < onIndex)
                    sourceTokens.push(token);
                else if (idx > onIndex)
                    conditionTokens.push(token);
            }

            return this.createNode('join', tokens[0].start, tokens[tokens.length - 1].end, {
                joinType: this.tokensText(joinTypeTokens).trim(),
                source: sourceTokens.length ? this.parseSourceAtom(sourceTokens) : null,
                condition: conditionTokens.length ? this.createExpressionNode(conditionTokens) : null
            });
        }

        enrichBranch(branch) {
            let sourceIndex = {};
            let selectIndex = {};

            if (branch.from && branch.from.sources) {
                branch.from.sources.forEach(source => {
                    if (source.base) {
                        let sourceName = source.base.alias ? source.base.alias.name : source.base.name;
                        if (sourceName)
                            sourceIndex[sourceName.toLowerCase()] = source.base;
                    }

                    if (source.joins) {
                        source.joins.forEach(join => {
                            if (join.source) {
                                let joinName = join.source.alias ? join.source.alias.name : join.source.name;
                                if (joinName)
                                    sourceIndex[joinName.toLowerCase()] = join.source;
                            }
                        });
                    }
                });
            }

            if (branch.select && branch.select.items) {
                branch.select.items.forEach((item, index) => {
                    let itemName = item.alias ? item.alias.name : this.getSelectItemName(item);
                    item.index = index;
                    item.name = itemName;

                    if (itemName)
                        selectIndex[itemName.toLowerCase()] = item;
                });
            }

            branch.sourceIndex = sourceIndex;
            branch.selectIndex = selectIndex;
            this.enrichBranchReferences(branch);
        }

        enrichBranchReferences(branch) {
            if (!branch)
                return;

            if (branch.select && branch.select.items) {
                branch.select.items.forEach(item => {
                    this.enrichReferences(item.references, branch);

                    if (item.expression)
                        this.enrichReferences(item.expression.references, branch);
                });
            }

            if (branch.from && branch.from.sources) {
                branch.from.sources.forEach(source => {
                    if (source.base)
                        this.enrichReferences(source.base.references, branch);

                    if (source.joins) {
                        source.joins.forEach(join => {
                            if (join.source)
                                this.enrichReferences(join.source.references, branch);

                            if (join.condition)
                                this.enrichReferences(join.condition.references, branch);
                        });
                    }
                });
            }

            ['where', 'groupBy', 'having', 'orderBy', 'indexBy', 'forUpdate'].forEach(key => {
                this.enrichClauseReferences(branch[key], branch);
            });
        }

        enrichClauseReferences(clause, branch) {
            if (!clause)
                return;

            this.enrichReferences(clause.references, branch);

            if (clause.expression)
                this.enrichReferences(clause.expression.references, branch);

            if (clause.items) {
                clause.items.forEach(item => {
                    if (!item)
                        return;

                    this.enrichReferences(item.references, branch);

                    if (item.expression)
                        this.enrichReferences(item.expression.references, branch);
                });
            }
        }

        enrichReferences(references, branch) {
            if (!references || !branch || !branch.sourceIndex)
                return;

            references.forEach(reference => {
                if (!reference || reference.kind != 'column' || !reference.sourceName)
                    return;

                let source = branch.sourceIndex[reference.sourceName.toLowerCase()];
                let fullSourceName = source && source.name ? source.name : '';

                reference.fullSourceName = fullSourceName;
                reference.metadataSourse = getMetadataSource(fullSourceName);
            });
        }

        getSelectItemName(item) {
            if (!item)
                return '';

            if (item.alias)
                return item.alias.name;

            if (item.references && item.references.length)
                return item.references[item.references.length - 1].fieldName || item.references[item.references.length - 1].name;

            return item.expression ? item.expression.text : '';
        }

        parseClauseExpression(kind, stopKeywords) {
            let startToken = this.currentToken();
            this.advance();
            let tokens = this.readUntilClause(stopKeywords);
            return this.createNode(kind, startToken.start, this.getNodeEnd(tokens, startToken.end), {
                expression: this.createExpressionNode(tokens),
                references: this.extractColumnReferences(tokens)
            });
        }

        parseGroupBy() {
            let startToken = this.currentToken();
            this.advance();

            if (this.isKeyword(this.currentToken(), 'by', 'по'))
                this.advance();
            else
                this.errors.push(this.createError('После СГРУППИРОВАТЬ ожидается ПО/BY', startToken));

            let tokens = this.readUntilClause(['having', 'имеющие', 'for', 'для', 'index', 'индексировать', 'order', 'упорядочить', 'union', 'объединить', 'totals', 'итоги', 'autoorder', 'автоупорядочивание']);
            let items = this.splitTopLevel(tokens, ',').map(chunk => this.createExpressionNode(chunk)).filter(Boolean);

            return this.createNode('groupByClause', startToken.start, this.getNodeEnd(tokens, startToken.end), {
                items: items
            });
        }

        parseOrderBy() {
            let startToken = this.currentToken();
            this.advance();

            if (this.isKeyword(this.currentToken(), 'by', 'по'))
                this.advance();
            else
                this.errors.push(this.createError('После УПОРЯДОЧИТЬ ожидается ПО/BY', startToken));

            let tokens = this.readUntilClause(['totals', 'итоги', 'autoorder', 'автоупорядочивание', 'union', 'объединить']);
            let items = [];

            this.splitTopLevel(tokens, ',').forEach(chunk => {
                if (!chunk.length)
                    return;

                let direction = null;
                let lastToken = chunk[chunk.length - 1];

                if (this.isKeyword(lastToken, 'asc', 'возр', 'desc', 'убыв')) {
                    direction = lastToken.value;
                    chunk = chunk.slice(0, chunk.length - 1);
                }

                items.push(this.createNode('orderByItem', chunk.length ? chunk[0].start : lastToken.start, chunk.length ? chunk[chunk.length - 1].end : lastToken.end, {
                    expression: this.createExpressionNode(chunk),
                    direction: direction
                }));
            });

            return this.createNode('orderByClause', startToken.start, this.getNodeEnd(tokens, startToken.end), {
                items: items
            });
        }

        parseTotals() {
            let startToken = this.currentToken();
            let tokens = [];
            this.advance();

            while (!this.isEOF() && !this.isStatementTerminator(this.currentToken()))
                tokens.push(this.advance());

            return this.createNode('totalsClause', startToken.start, this.getNodeEnd(tokens, startToken.end), {
                text: this.tokensText(tokens).trim()
            });
        }

        parseIndexBy() {
            let startToken = this.currentToken();
            this.advance();

            if (this.isKeyword(this.currentToken(), 'by', 'по'))
                this.advance();

            let tokens = this.readUntilClause(['order', 'упорядочить', 'union', 'объединить', 'totals', 'итоги', 'autoorder', 'автоупорядочивание']);
            let items = this.splitTopLevel(tokens, ',').map(chunk => this.createExpressionNode(chunk)).filter(Boolean);

            return this.createNode('indexByClause', startToken.start, this.getNodeEnd(tokens, startToken.end), {
                items: items
            });
        }

        parseForUpdate() {
            let startToken = this.currentToken();
            let tokens = [this.advance()];

            while (!this.isEOF() && !this.isStatementTerminator(this.currentToken()) && !this.isClauseStart(this.currentToken()))
                tokens.push(this.advance());

            return this.createNode('forUpdateClause', startToken.start, this.getNodeEnd(tokens, startToken.end), {
                text: this.tokensText(tokens.slice(1)).trim()
            });
        }

        createExpressionNode(tokens) {
            if (!tokens || !tokens.length)
                return null;

            return this.createNode('expression', tokens[0].start, tokens[tokens.length - 1].end, {
                text: this.tokensText(tokens).trim(),
                references: this.extractColumnReferences(tokens)
            });
        }

        extractColumnReferences(tokens) {
            let result = [];
            let idx = 0;

            while (idx < tokens.length) {
                let token = tokens[idx];

                if (token.type == 'parameter') {
                    result.push({
                        kind: 'parameter',
                        name: token.value,
                        path: token.value,
                        range: this.rangeFromOffsets(token.start, token.end)
                    });
                    idx++;
                    continue;
                }

                if (token.type != 'identifier') {
                    idx++;
                    continue;
                }

                let chain = [token];
                let probe = idx + 1;

                while (probe + 1 < tokens.length && tokens[probe].value == '.' && tokens[probe + 1].type == 'identifier') {
                    chain.push(tokens[probe + 1]);
                    probe += 2;
                }

                if (1 < chain.length) {
                    result.push({
                        kind: 'column',
                        sourceName: chain[0].value,
                        fieldName: chain[chain.length - 1].value,
                        path: chain.map(item => item.value).join('.'),
                        range: this.rangeFromOffsets(chain[0].start, chain[chain.length - 1].end)
                    });
                    idx = probe;
                }
                else
                    idx++;
            }

            return result;
        }

        readIdentifierChain() {
            let start = this.index;
            let parts = [];

            while (!this.isEOF()) {
                let token = this.currentToken();
                if (token.type != 'identifier')
                    break;

                parts.push(token);
                this.advance();

                if (this.currentToken().value == '.')
                    this.advance();
                else
                    break;
            }

            if (!parts.length) {
                this.index = start;
                return null;
            }

            return this.createNode('identifier', parts[0].start, parts[parts.length - 1].end, {
                name: parts.map(token => token.value).join('.'),
                parts: parts.map(token => token.value)
            });
        }

        splitTopLevel(tokens, separator) {
            let result = [];
            let current = [];
            let depth = 0;

            tokens.forEach(token => {
                if (token.value == '(')
                    depth++;
                else if (token.value == ')')
                    depth = Math.max(0, depth - 1);

                if (depth == 0 && token.value == separator) {
                    result.push(current);
                    current = [];
                }
                else
                    current.push(token);
            });

            if (current.length)
                result.push(current);

            return result;
        }

        readUntilClause(stopKeywords) {
            let tokens = [];
            let depth = 0;
            let stop = new Set(stopKeywords || []);

            while (!this.isEOF()) {
                let token = this.currentToken();

                if (token.value == '(')
                    depth++;
                else if (token.value == ')') {
                    if (depth == 0)
                        this.errors.push(this.createError('Лишняя закрывающая скобка', token));
                    else
                        depth--;
                }

                if (depth == 0 && (this.isStatementTerminator(token) || this.isKeyword(token, ...stop)))
                    break;

                tokens.push(this.advance());
            }

            return tokens;
        }

        readUntilStatementEnd() {
            let tokens = [];
            let depth = 0;

            while (!this.isEOF()) {
                let token = this.currentToken();

                if (token.value == '(')
                    depth++;
                else if (token.value == ')')
                    depth = Math.max(0, depth - 1);

                if (depth == 0 && this.isStatementTerminator(token))
                    break;

                tokens.push(this.advance());
            }

            return tokens;
        }

        containsKeyword(tokens) {
            let normalized = Array.from(arguments).slice(1);
            return tokens.some(token => this.isKeyword(token, ...normalized));
        }

        isJoinStart(tokens, index) {
            let token = tokens[index];

            if (!this.isKeyword(token, 'left', 'левое', 'right', 'правое', 'full', 'полное', 'inner', 'внутреннее', 'join', 'соединение'))
                return false;

            if (index == 0)
                return false;

            let prev = tokens[index - 1];
            return prev.value != '.' && prev.value != '(';
        }

        isClauseStart(token) {
            return token && token.type == 'keyword' && CLAUSE_KEYWORDS.has(token.normalized);
        }

        isStatementTerminator(token) {
            return token && token.value == ';';
        }

        skipSemicolons() {
            while (this.currentToken().value == ';')
                this.advance();
        }

        getBranchEnd(branch) {
            let end = branch.select ? branch.select.end : branch.start;

            ['into', 'from', 'where', 'groupBy', 'having', 'forUpdate', 'indexBy', 'orderBy'].forEach(key => {
                if (branch[key])
                    end = branch[key].end;
            });

            return end;
        }

        getNodeEnd(tokens, fallback) {
            return tokens && tokens.length ? tokens[tokens.length - 1].end : fallback;
        }

        createIdentifierNode(token) {
            return this.createNode('identifier', token.start, token.end, {
                name: token.value,
                parts: [token.value]
            });
        }

        createNode(kind, start, end, props) {
            let node = Object.assign({
                kind: kind,
                start: start,
                end: end,
                range: this.rangeFromOffsets(start, end)
            }, props || {});

            this.nodes.push(node);
            return node;
        }

        createError(message, token) {
            return {
                message: message,
                offset: token ? token.start : 0,
                range: this.rangeFromOffsets(token ? token.start : 0, token ? token.end : 0)
            };
        }

        tokensText(tokens) {
            if (!tokens || !tokens.length)
                return '';
            return this.text.slice(tokens[0].start, tokens[tokens.length - 1].end);
        }

        rangeFromOffsets(start, end) {
            return rangeFromOffsets(start, end, this.lineStarts);
        }

        offsetAt(lineNumber, column) {
            let lineStart = this.lineStarts[Math.max(0, lineNumber - 1)] || 0;
            return lineStart + Math.max(0, column - 1);
        }

        findNodeAtOffset(root, offset) {
            let best = null;

            this.nodes.forEach(node => {
                if (node.start <= offset && offset <= node.end) {
                    if (!best || (node.end - node.start) < (best.end - best.start))
                        best = node;
                }
            });

            return best || root;
        }

        currentToken() {
            return this.tokens[this.index];
        }

        advance() {
            let token = this.tokens[this.index];
            if (this.index < this.tokens.length - 1)
                this.index++;
            return token;
        }

        isEOF() {
            return this.currentToken().type == 'eof';
        }

        isKeyword(token) {
            if (!token || token.type != 'keyword')
                return false;

            for (let idx = 1; idx < arguments.length; idx++) {
                if (token.normalized == normalizeWord(arguments[idx]))
                    return true;
            }

            return false;
        }

    }

const queryModel = {

        parse(text) {
            let start = nowMs();
            let parser = new QueryParser(text);
            let document = parser.parse();

            if (document && document.performance)
                document.performance.totalMs = nowMs() - start;

            return document;
        }

    };

export default queryModel;
