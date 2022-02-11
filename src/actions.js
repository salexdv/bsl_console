const monaco = require('monaco-editor/esm/vs/editor/editor.api');

window.getSortedBookmarks = function () {

    return new Map([...editor.bookmarks.entries()].sort((a, b) => a[0] - b[0]));

}

window.updateBookmarks = function (line) {

    if (line != undefined) {

        let bookmark = window.editor.bookmarks.get(line);

        if (bookmark) {
            window.editor.bookmarks.delete(line);
        }
        else {
            let color = '#7e96a8';
            bookmark = {
                range: new monaco.Range(line, 1, line),
                options: {
                    isWholeLine: true,
                    linesDecorationsClassName: 'bookmark',
                    overviewRuler: {
                        color: color,
                        darkColor: color,
                        position: 1
                    }
                }
            };
            window.editor.bookmarks.set(line, bookmark);
        }

    }

    window.editor.updateDecorations([]);        

}

function goToCurrentBookmark(sorted_bookmarks) {

    let idx = 0;
    let count = window.getLineCount();

    sorted_bookmarks.forEach(function (value, key) {
        if (idx == window.currentBookmark && key <= count) {
            window.editor.revealLineInCenter(key);
            window.editor.setPosition(new monaco.Position(key, 1));
        }
        idx++;
    });

}

window.goNextBookmark = function () {

    let sorted_bookmarks = window.getSortedBookmarks();

    if (sorted_bookmarks.size - 1 <= window.currentBookmark)
        window.currentBookmark = -1;

    window.currentBookmark++;
    goToCurrentBookmark(sorted_bookmarks);

}

window.goPreviousBookmark = function () {

    let sorted_bookmarks = window.getSortedBookmarks();

    window.currentBookmark--;

    if (window.currentBookmark < 0)
        window.currentBookmark = sorted_bookmarks.size - 1;

    goToCurrentBookmark(sorted_bookmarks);

}

let getActions = function(version1C) {

    let actions = {};

    if (!window.editor.disableContextCommands) {

        let overrideCopyPaste = true;

        const verArray = version1C.split('.');

        if (3 < verArray.length) {
            overrideCopyPaste = !((8 <= parseInt(verArray[0])) && (3 <= parseInt(verArray[1])) && (18 <= parseInt(verArray[2])));
        }

        overrideCopyPaste = false;

        if (overrideCopyPaste) {
            actions.copy_bsl = {
                label: 'Копировать',
                key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_C,
                cmd: monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_C),
                order: 1.1,
                callback: function (ed) {
                    window.selectionText = window.editor.getModel().getValueInRange(window.editor.getSelection());
                    return null;
                }
            };
            actions.paste_bsl = {
                label: 'Вставить',
                key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_V,
                cmd: monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_V),
                order: 1.2,
                callback: function (ed) {
                    window.setText(window.selectionText, null, false);
                    return null;
                }
            };
        }

        if (!window.isDCSMode() && !window.editor.disableContextQueryConstructor) {
            
            actions.query_bsl = {
                label: 'Конструктор запроса...',
                key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_D,
                cmd: monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_D),
                order: 1.3,
                callback: function (ed) {
                    let query_text = window.isQueryMode() ? window.getText() : window.getQuery();
                    window.sendEvent('EVENT_QUERY_CONSTRUCT', query_text);
                    return null;
                }
            };

        }

        actions.comment_bsl = {
            label: 'Добавить комментарий',
            key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.NUMPAD_DIVIDE,
            cmd: monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.NUMPAD_DIVIDE),
            order: 1.5,
            callback: function (ed) {
                window.addComment();
                return null;
            }
        };

        actions.uncomment_bsl = {
            label: 'Удалить комментарий',
            key: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.NUMPAD_DIVIDE,
            cmd: monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.NUMPAD_DIVIDE),
            order: 1.6,
            callback: function (ed) {
                window.removeComment();
                return null;
            }
        };

        if (window.getCurrentLanguageId() == 'bsl') {

            actions.formatstr_bsl = {
                label: 'Конструктор форматной строки...',
                key: null,
                cmd: null,
                order: 1.4,
                callback: function (ed) {
                    window.sendEvent('EVENT_FORMAT_CONSTRUCT', window.getFormatString());
                    return null;
                }
            };

            actions.format_bsl = {
                label: 'Форматировать',
                key: monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.KEY_F,
                cmd: monaco.KeyMod.chord(monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.KEY_F),
                order: 1.7,
                callback: function (ed) {
                    window.editor.trigger('', 'editor.action.formatDocument');
                    return null;
                }
            };

            actions.wordwrap_bsl = {
                label: 'Добавить перенос строки',
                order: 1.8,
                callback: function (ed) {
                    window.addWordWrap();
                    return null;
                }
            };

            actions.unwordwrap_bsl = {
                label: 'Удалить перенос строки',
                order: 1.8,
                callback: function (ed) {
                    window.removeWordWrap();
                    return null;
                }
            };

        }

        if (!window.isDCSMode()) {

            actions.add_bookmark_bsl = {
                label: 'Установить/удалить закладку',
                key: monaco.KeyMod.Alt | monaco.KeyCode.F2,
                cmd: monaco.KeyMod.chord(monaco.KeyMod.Alt | monaco.KeyCode.F2),
                order: 1.9,
                callback: function (ed) {
                    let line = window.getCurrentLine();
                    window.updateBookmarks(line);
                    return null;
                }
            };

            actions.next_bookmark_bsl = {
                label: 'Следующая закладка',
                key: monaco.KeyCode.F2,
                cmd: monaco.KeyMod.chord(monaco.KeyCode.F2),
                order: 2.0,
                callback: function (ed) {
                    window.goNextBookmark();
                    return null;
                }
            };

        }

    }
    
    return actions;

}

let permanentActions = {
    saveref: {
        label: 'Сохранение ссылки, на которую указывает конкретная позиция',
        description: 'Служебное действие. Используется для подсказки любых ссылочных реквизитов через точку',
        key: 0,
        cmd: 0,
        order: 0,
        callback: function (e, obj) {                                
            if (obj) {
                if (obj.hasOwnProperty('data')) {
                    let position = window.editor.getPosition();
                    let lineContextData = window.contextData.get(position.lineNumber);
                    if (!lineContextData) {
                        window.contextData.set(position.lineNumber, new Map());
                    }
                    lineContextData = window.contextData.get(position.lineNumber);
                    lineContextData.set(obj.name.toLowerCase(), obj.data);
                }
                if (obj.hasOwnProperty('post_action') && obj.post_action)
                    editor.trigger('saveref', obj.post_action, {});
            }
            return null;
        }
    },
    requestMetadata: {
        label: 'Запрос динамического обновления метаданных',
        description: 'Служебное действие. Используется для запроса метаданных справочника/документа и т.п. при выборе его из списка подсказок',
        key: 0,
        cmd: 0,
        order: 0,
        callback: function (e, obj) {                                
            if (obj && obj.hasOwnProperty('metadata')) {
                window.requestMetadata(obj.metadata);
            }
            return null;
        }
    },
    jumpToBracketOpen: {
        label: 'Перейти к скобке',
        key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.US_OPEN_SQUARE_BRACKET,
        cmd: monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.US_OPEN_SQUARE_BRACKET),
        order: 0,
        callback: function (ed) {
            window.jumpToBracket();
            return null;
        }
    },
    jumpToBracketClose: {
        label: 'Перейти к скобке',
        key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.US_CLOSE_SQUARE_BRACKET,
        cmd: monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.US_CLOSE_SQUARE_BRACKET),
        order: 0,
        callback: function (ed) {
            window.jumpToBracket();
            return null;
        }
    }
}

export { getActions, permanentActions };