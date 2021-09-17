define(['vs/editor/editor.main'], function () {

    getSortedBookmarks = function () {

        return new Map([...editor.bookmarks.entries()].sort((a, b) => a[0] - b[0]));

    }

    updateBookmarks = function (line) {

        if (line != undefined) {

            let bookmark = editor.bookmarks.get(line);

            if (bookmark) {
                editor.bookmarks.delete(line);
            }
            else {
                bookmark = { range: new monaco.Range(line, 1, line), options: { isWholeLine: true, linesDecorationsClassName: 'bookmark' } };
                editor.bookmarks.set(line, bookmark);
            }

        }

        editor.updateDecorations([]);        

    }

    function goToCurrentBookmark(sorted_bookmarks) {

        let idx = 0;
        let count = getLineCount();

        sorted_bookmarks.forEach(function (value, key) {
            if (idx == currentBookmark && key <= count) {
                editor.revealLineInCenter(key);
                editor.setPosition(new monaco.Position(key, 1));
            }
            idx++;
        });

    }

    goNextBookmark = function () {

        let sorted_bookmarks = getSortedBookmarks();

        if (sorted_bookmarks.size - 1 <= currentBookmark)
            currentBookmark = -1;

        currentBookmark++;
        goToCurrentBookmark(sorted_bookmarks);

    }

    goPreviousBookmark = function () {

        let sorted_bookmarks = getSortedBookmarks();

        currentBookmark--;

        if (currentBookmark < 0)
            currentBookmark = sorted_bookmarks.size - 1;

        goToCurrentBookmark(sorted_bookmarks);

    }

    getActions = function(version1C) {

        let actions = {};

        if (!editor.disableContextCommands) {

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
                        selectionText = editor.getModel().getValueInRange(editor.getSelection());
                        return null;
                    }
                };
                actions.paste_bsl = {
                    label: 'Вставить',
                    key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_V,
                    cmd: monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_V),
                    order: 1.2,
                    callback: function (ed) {
                        setText(selectionText, null, false);
                        return null;
                    }
                };
            }

            if (!DCSMode && !editor.disableContextQueryConstructor) {

                actions.query_bsl = {
                    label: 'Конструктор запроса...',
                    key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_D,
                    cmd: monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_D),
                    order: 1.3,
                    callback: function (ed) {
                        sendEvent('EVENT_QUERY_CONSTRUCT', queryMode ? getText() : getQuery());
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
                    addComment();
                    return null;
                }
            };

            actions.uncomment_bsl = {
                label: 'Удалить комментарий',
                key: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.NUMPAD_DIVIDE,
                cmd: monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.NUMPAD_DIVIDE),
                order: 1.6,
                callback: function (ed) {
                    removeComment();
                    return null;
                }
            };

            if (!queryMode && !DCSMode) {

                actions.formatstr_bsl = {
                    label: 'Конструктор форматной строки...',
                    key: null,
                    cmd: null,
                    order: 1.4,
                    callback: function (ed) {
                        sendEvent('EVENT_FORMAT_CONSTRUCT', getFormatString());
                        return null;
                    }
                };

                actions.format_bsl = {
                    label: 'Форматировать',
                    key: monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.KEY_F,
                    cmd: monaco.KeyMod.chord(monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.KEY_F),
                    order: 1.7,
                    callback: function (ed) {
                        editor.trigger('', 'editor.action.formatDocument');
                        return null;
                    }
                };

                actions.wordwrap_bsl = {
                    label: 'Добавить перенос строки',
                    order: 1.8,
                    callback: function (ed) {
                        addWordWrap();
                        return null;
                    }
                };

                actions.unwordwrap_bsl = {
                    label: 'Удалить перенос строки',
                    order: 1.8,
                    callback: function (ed) {
                        removeWordWrap();
                        return null;
                    }
                };

            }

            if (!DCSMode) {

                actions.add_bookmark_bsl = {
                    label: 'Установить/удалить закладку',
                    key: monaco.KeyMod.Alt | monaco.KeyCode.F2,
                    cmd: monaco.KeyMod.chord(monaco.KeyMod.Alt | monaco.KeyCode.F2),
                    order: 1.9,
                    callback: function (ed) {
                        let line = getCurrentLine();
                        updateBookmarks(line);
                        return null;
                    }
                };

                actions.next_bookmark_bsl = {
                    label: 'Следующая закладка',
                    key: monaco.KeyCode.F2,
                    cmd: monaco.KeyMod.chord(monaco.KeyCode.F2),
                    order: 2.0,
                    callback: function (ed) {
                        goNextBookmark();
                        return null;
                    }
                };

            }

        }
        
        return actions;

    }

    permanentActions = {
        saveref: {
            label: 'Сохранение ссылки, на которую указывает конкретная позиция',
            description: 'Служебное действие. Используется для подсказки любых ссылочных реквизитов через точку',
            key: 0,
            cmd: 0,
            order: 0,
            callback: function (e, obj) {                                
                if (obj) {
                    if (obj.hasOwnProperty('data')) {
                        let position = editor.getPosition();
                        let lineContextData = contextData.get(position.lineNumber);
                        if (!lineContextData) {
                            contextData.set(position.lineNumber, new Map());
                        }
                        lineContextData = contextData.get(position.lineNumber);
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
                    requestMetadata(obj.metadata);
                }
                return null;
            }
        },
        delLine: {
            label: 'Удалить текущую строку',
            key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_L,
            cmd: monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_L),
            order: 0,
            callback: function (ed) {
                editor.trigger('', 'editor.action.deleteLines', {})
                return null;
            }
        },
        jumpToBracketOpen: {
            label: 'Перейти к скобке',
            key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.US_OPEN_SQUARE_BRACKET,
            cmd: monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.US_OPEN_SQUARE_BRACKET),
            order: 0,
            callback: function (ed) {
                jumpToBracket();
                return null;
            }
        },
        jumpToBracketClose: {
            label: 'Перейти к скобке',
            key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.US_CLOSE_SQUARE_BRACKET,
            cmd: monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.US_CLOSE_SQUARE_BRACKET),
            order: 0,
            callback: function (ed) {
                jumpToBracket();
                return null;
            }
        },
        selectToBracket: {
            label: 'Выделить скобки и текст между ними',
            key: monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KEY_B,
            cmd: monaco.KeyMod.chord(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KEY_B),
            order: 0,
            callback: function (ed) {
                selectToBracket();
                return null;
            }
        }
    }

});