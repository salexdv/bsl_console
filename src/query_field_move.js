import queryModel from './query_model';

const BOUNDARIES = new Set([
    'into', 'поместить', 'from', 'из', 'where', 'где', 'group', 'сгруппировать',
    'having', 'имеющие', 'for', 'для', 'index', 'индексировать', 'order', 'упорядочить',
    'union', 'объединить', 'totals', 'итоги', 'autoorder', 'автоупорядочивание'
]);
const MODIFIERS = new Set(['distinct', 'различные', 'allowed', 'разрешенные']);
// Часть операторов существующий токенизатор относит к идентификаторам.
const WORD_OPERATORS = new Set([
    'in', 'в', 'hierarchy', 'иерархии', 'is', 'есть', 'like', 'подобно',
    'between', 'между', 'escape', 'спецсимвол', 'refs', 'ссылка'
]);

function word(token, english, russian) {
    return token && token.type == 'keyword' &&
        (token.normalized == english || token.normalized == russian);
}

function lineStart(text, offset) {
    return text.lastIndexOf('\n', offset - 1) + 1;
}

// Здесь проверяется надёжность границ, а не весь синтаксис языка запросов.
function completeExpression(tokens) {
    if (!tokens.length)
        return false;
    let cases = 0;
    let depth = 0;
    let alias = -1;
    for (let index = 0; index < tokens.length; index++) {
        const token = tokens[index];
        if (token.value == '(') depth++;
        if (token.value == ')') depth--;
        if (depth < 0) return false;
        if (word(token, 'case', 'выбор')) cases++;
        if (word(token, 'end', 'конец')) cases--;
        if (cases < 0) return false;
        if (!depth && !cases && word(token, 'as', 'как')) {
            if (alias != -1) return false;
            alias = index;
        }
        if (token.type == 'string' && !/^("(?:[^"]|"")*"|'(?:[^']|'')*')$/.test(token.value))
            return false;
        const previous = tokens[index - 1];
        // Два операнда подряд обычно означают пропущенную запятую.
        if (previous && !WORD_OPERATORS.has(token.normalized) && !WORD_OPERATORS.has(previous.normalized) &&
            /^(identifier|number|string|parameter)$/.test(token.type) &&
            (/^(identifier|number|string|parameter)$/.test(previous.type) || previous.value == ')'))
            return false;
    }
    if (depth || cases)
        return false;
    if (alias != -1)
        return alias > 0 && alias == tokens.length - 2 && tokens[alias + 1].type == 'identifier' &&
            completeExpression(tokens.slice(0, alias));
    const last = tokens[tokens.length - 1];
    const wildcard = last.value == '*' && (tokens.length == 1 || tokens[tokens.length - 2].value == '.');
    if (last.type == 'symbol' && last.value != ')' && !wildcard ||
        tokens.length > 1 && tokens[tokens.length - 2].value != '.' && WORD_OPERATORS.has(last.normalized))
        return false;
    return !/^(as|как|when|когда|then|тогда|else|иначе|and|и|or|или|not|не)$/.test(last.normalized || '');
}

function findLists(text, tokens) {
    const lists = [];
    tokens.forEach((select, index) => {
        if (!word(select, 'select', 'выбрать') || tokens[index - 1] && tokens[index - 1].value == '.')
            return;
        let cursor = index + 1;
        let start = select.end;
        let valid = true;
        while (tokens[cursor] && (MODIFIERS.has(tokens[cursor].normalized) || word(tokens[cursor], 'top', 'первые'))) {
            const modifier = tokens[cursor++];
            start = modifier.end;
            if (word(modifier, 'top', 'первые')) {
                if (tokens[cursor].type != 'number') {
                    valid = false;
                    break;
                }
                start = tokens[cursor++].end;
            }
        }
        const fields = [];
        let fieldTokens = [];
        let depth = 0;
        let cases = 0;
        for (; cursor < tokens.length; cursor++) {
            const token = tokens[cursor];
            const boundary = !depth && !cases && (token.value == ')' || token.value == ';' ||
                token.type == 'eof' || token.type == 'keyword' && tokens[cursor - 1].value != '.' &&
                (BOUNDARIES.has(token.normalized) || word(token, 'select', 'выбрать')));
            if (boundary) {
                if (fieldTokens.length)
                    fields.push({ tokens: fieldTokens, comma: null });
                let end = token.start;
                const boundaryLine = lineStart(text, end);
                if (/^[\t ]*$/.test(text.slice(boundaryLine, end)))
                    end = Math.max(start, boundaryLine);
                lists.push({ start: start, end: end, atEOF: token.type == 'eof', fields: fields, valid: valid && !depth && !cases });
                break;
            }
            if (!depth && !cases && token.value == ',') {
                if (!fieldTokens.length) valid = false;
                fields.push({ tokens: fieldTokens, comma: token });
                fieldTokens = [];
                continue;
            }
            fieldTokens.push(token);
            if (token.value == '(') depth++;
            if (token.value == ')') depth--;
            if (word(token, 'case', 'выбор')) cases++;
            if (word(token, 'end', 'конец')) cases--;
            if (token.type == 'eof') {
                lists.push({ start: start, end: text.length, atEOF: true, fields: [], valid: false });
                break;
            }
        }
    });
    return lists;
}

function prepareFields(text, list) {
    let lower = list.start;
    list.fields.forEach(field => {
        if (!completeExpression(field.tokens)) {
            list.valid = false;
            return;
        }
        const first = field.tokens[0];
        const last = field.tokens[field.tokens.length - 1];
        if (field.comma && !/^\s*$/.test(text.slice(last.end, field.comma.start)))
            list.valid = false;
        field.expressionStart = first.start;
        field.expressionEnd = last.end;
        // Концевой комментарий принадлежит выражению даже после разделителя.
        const after = field.comma ? field.comma.end : last.end;
        const tail = /^[\t ]*\/\/[^\r\n]*/.exec(text.slice(after, list.end));
        field.end = tail ? after + tail[0].length : last.end;
        const firstLine = lineStart(text, first.start);
        field.start = firstLine >= lower && /^[\t ]*$/.test(text.slice(firstLine, first.start)) ? firstLine : first.start;
        const gap = text.slice(lower, field.start);
        const comments = /(^|\n)[\t ]*\/\/[^\r\n]*/g;
        let comment = comments.exec(gap);
        // Комментарий на строке SELECT относится к заголовку, а не к первому полю.
        if (comment && !comment[1] && !/^[\t ]*$/.test(text.slice(lineStart(text, lower), lower)))
            comment = comments.exec(gap);
        if (comment)
            field.start = lower + comment.index + comment[1].length;
        field.head = text.slice(field.start, last.end);
        field.tail = tail ? text.slice(after, field.end) : '';
        field.beforeComma = field.comma ? text.slice(last.end, field.comma.start) : '';
        // Запятая может находиться на отдельной строке; перенос сохраняется в промежутке.
        field.separatorEnd = Math.max(field.end, field.comma ? field.comma.end : field.end);
        lower = field.separatorEnd;
    });
}

function intersects(selection, list) {
    const start = Math.min(selection.anchor, selection.active);
    const end = Math.max(selection.anchor, selection.active);
    return start == end ? list.start <= start && (start < list.end || list.atEOF && start == list.end) :
        start < list.end && list.start < end;
}

/** Рассчитывает одну замену и новые смещения выделения по текущему тексту. */
export function calculateFieldMove(text, selections, direction) {
    const lists = findLists(text, queryModel.tokenize(text).tokens);
    const touched = lists.filter(list => selections.some(selection => intersects(selection, list)));
    if (!touched.length)
        return { status: 'fallback' };
    if (selections.length != 1)
        return { status: 'blocked' };
    const selection = selections[0];
    const start = Math.min(selection.anchor, selection.active);
    let end = Math.max(selection.anchor, selection.active);
    // Выделенная строка с концом в колонке 1 не захватывает следующее поле.
    if (start < end && text[end - 1] == '\n')
        end--;
    if (start < end && text[end] == '\n' && text[end - 1] == '\r')
        end--;
    const list = touched.sort((left, right) => left.end - left.start - (right.end - right.start))[0];
    prepareFields(text, list);
    if (!list.valid || !list.fields.length || start < list.start || end > list.end)
        return { status: 'blocked' };
    const fields = list.fields;
    function fieldAt(offset) {
        for (let index = 0; index < fields.length; index++) {
            if (offset <= fields[index].end || offset < fields[index].separatorEnd ||
                offset == fields[index].separatorEnd && (!fields[index + 1] || offset < fields[index + 1].start))
                return index;
        }
        return fields.length - 1;
    }
    const first = fieldAt(start);
    const last = fieldAt(start == end ? end : Math.max(start, end - 1));
    if (direction < 0 && first == 0 || direction > 0 && last == fields.length - 1)
        return { status: 'blocked' };
    const order = fields.map((field, index) => index);
    if (direction < 0) {
        const neighbour = order.splice(first - 1, 1)[0];
        order.splice(last, 0, neighbour);
    }
    else {
        const neighbour = order.splice(last + 1, 1)[0];
        order.splice(first, 0, neighbour);
    }
    const replacementStart = fields[0].start;
    const replacementEnd = fields[fields.length - 1].separatorEnd;
    let replacement = '';
    const newStarts = [];
    const eol = text.indexOf('\r\n') == -1 ? '\n' : '\r\n';
    order.forEach((source, destination) => {
        const field = fields[source];
        newStarts[source] = replacementStart + replacement.length;
        replacement += field.head + (destination < fields.length - 1 ? ',' : '') + field.tail;
        const gap = fields[destination].beforeComma + (destination < fields.length - 1 ?
            text.slice(fields[destination].separatorEnd, fields[destination + 1].start) : '');
        // Перенесённый // не должен закомментировать следующее поле или секцию.
        const following = gap + (destination < fields.length - 1 ? '' : text.slice(replacementEnd));
        if (field.tail && (destination < fields.length - 1 ? !/[\r\n]/.test(gap) : /^[\t ]*[^\s]/.test(following)))
            replacement += eol;
        replacement += gap;
    });
    function movedOffset(offset, index) {
        const field = fields[index];
        // Позиции на разделителе/комментарии учитывают добавленную или убранную запятую.
        let relative = Math.max(0, Math.min(offset - field.start, field.head.length));
        if (offset > field.expressionEnd) {
            const destination = order.indexOf(index);
            const tailOffset = Math.max(0, offset - (field.comma ? field.comma.end : field.expressionEnd));
            relative = field.head.length + (destination < fields.length - 1 ? 1 : 0) + Math.min(field.tail.length, tailOffset);
        }
        return newStarts[index] + relative;
    }
    let newStart = movedOffset(start, first);
    let newEnd = movedOffset(end, last);
    // Для выделения целых строк сохраняем конец в начале следующей строки.
    if (start != Math.max(selection.anchor, selection.active) && text[Math.max(selection.anchor, selection.active) - 1] == '\n') {
        const resultText = text.slice(0, replacementStart) + replacement + text.slice(replacementEnd);
        const newline = resultText.indexOf('\n', newEnd);
        if (newline != -1) newEnd = newline + 1;
    }
    if (selection.anchor == selection.active)
        newEnd = newStart;
    return {
        status: 'edit', start: replacementStart, end: replacementEnd, text: replacement,
        anchor: selection.anchor <= selection.active ? newStart : newEnd,
        active: selection.anchor <= selection.active ? newEnd : newStart
    };
}

export function registerQueryFieldMove(editor, monaco) {
    function runMove(direction) {
        const model = editor.getModel();
        if (!model || editor.getOption(monaco.editor.EditorOption.readOnly))
            return;
        let move = { status: 'fallback' };
        if (model.getLanguageIdentifier().language == 'bsl_query') {
            const selections = editor.getSelections().map(selection => ({
                anchor: model.getOffsetAt({ lineNumber: selection.selectionStartLineNumber, column: selection.selectionStartColumn }),
                active: model.getOffsetAt(selection.getPosition())
            }));
            move = calculateFieldMove(model.getValue(), selections, direction);
        }
        if (move.status == 'fallback') {
            return editor.getAction(direction < 0 ? 'editor.action.moveLinesUpAction' : 'editor.action.moveLinesDownAction').run();
        }
        if (move.status != 'edit') return;
        const start = model.getPositionAt(move.start);
        const end = model.getPositionAt(move.end);
        editor.pushUndoStop();
        editor.executeEdits('bsl.moveQueryField', [{
            range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
            text: move.text
        }], () => {
            const anchor = model.getPositionAt(move.anchor);
            const active = model.getPositionAt(move.active);
            return [new monaco.Selection(anchor.lineNumber, anchor.column, active.lineNumber, active.column)];
        });
        editor.pushUndoStop();
        editor.revealPositionInCenterIfOutsideViewport(editor.getPosition());
    }
    // У вкладок общий container: глобальный сервис Monaco ставит на него по слушателю
    // на редактор. Обрабатываем клавишу на самом редакторе до всплытия к container,
    // иначе одно нажатие может выполнить команду несколько раз.
    // Подписка принадлежит emitter редактора и удаляется при его dispose.
    editor.onKeyDown(event => {
        if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
            event.keyCode != monaco.KeyCode.UpArrow && event.keyCode != monaco.KeyCode.DownArrow)
            return;
        // disableKeyBinding должен по-прежнему передавать нажатие команде моста 1С.
        const disabled = editor['kbinding_' + (monaco.KeyMod.Alt | event.keyCode)];
        if (disabled && disabled.get())
            return;
        event.preventDefault();
        event.stopPropagation();
        runMove(event.keyCode == monaco.KeyCode.UpArrow ? -1 : 1);
    });
}
