define(['vs/editor/editor.main'], function () {

    getActions = function(version1C) {

        let actions = {};
        let overrideCopyPaste = true;

        const verArray = version1C.split('.');

        if (3 < verArray.length) {
            overrideCopyPaste = !((8 <= parseInt(verArray[0])) && (3 <= parseInt(verArray[1])) && (18 <= parseInt(verArray[2])));
        }

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

        actions.query_bsl = {
            label: 'Конструктор запроса...',
            key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_D,
            cmd: monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_D),
            order: 1.3,
            callback: function (ed) {     
                sendEvent('EVENT_QUERY_CONSTRUCT', getQuery());
                return null;
            }
        };        
        
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
                if (obj && obj.hasOwnProperty('data')) {
                    let position = editor.getPosition();
                    let lineContextData = contextData.get(position.lineNumber);
                    if (!lineContextData) {
                        contextData.set(position.lineNumber, new Map());
                    }
                    lineContextData = contextData.get(position.lineNumber);
                    lineContextData.set(obj.name, obj.data);
                }
                return null;
            }
        }
    }

});