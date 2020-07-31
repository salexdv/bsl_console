define(['vs/editor/editor.main'], function () {

    actions = {
        copy_bsl: {
            label: 'Копировать',
            key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_C,
            cmd: monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_C),
            order: 1.1,
            callback: function (ed) {
                selectionText = editor.getModel().getValueInRange(editor.getSelection());
                return null;
            }
        },
        paste_bsl: {
            label: 'Вставить',
            key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_V,
            cmd: monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_V),
            order: 1.2,
            callback: function (ed) {                
                setText(selectionText, null, false);
                return null;
            }
        },
        query_bsl: {
            label: 'Конструктор запроса...',
            key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_D,
            cmd: monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_D),
            order: 1.3,
            callback: function (ed) {     
                sendEvent('EVENT_QUERY_CONSTRUCT', getQuery());
                return null;
            }
        },
        formatstr_bsl: {
            label: 'Конструктор форматной строки...',
            key: null,
            cmd: null,
            order: 1.4,
            callback: function (ed) {     
                sendEvent('EVENT_FORMAT_CONSTRUCT', getFormatString());
                return null;
            }
        },
        comment_bsl: {
            label: 'Добавить комментарий',
            key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.NUMPAD_DIVIDE,
            cmd: monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.NUMPAD_DIVIDE),
            order: 1.5,
            callback: function (ed) {                
                addComment();
                return null;
            }
        },
        uncomment_bsl: {
            label: 'Удалить комментарий',
            key: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.NUMPAD_DIVIDE,
            cmd: monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.NUMPAD_DIVIDE),
            order: 1.6,
            callback: function (ed) {                
                removeComment();
                return null;
            }
        },
        saveref: {
            label: 'Сохранение ссылки, на которую указывает конкретная позиция',
            description: 'Служебное действие. Используется для подсказки любых ссылочных реквизитов через точку',
            key: 0,
            cmd: 0,
            order: 0,
            callback: function (e, obj) {                                
                if (obj && obj.hasOwnProperty('ref')) {
                    refs.set(editor.getPosition().toString(), obj);
                }
                return null;
            }
        }
    }

});