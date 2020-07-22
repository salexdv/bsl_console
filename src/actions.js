define(['vs/editor/editor.main'], function () {

    actions = {
        copy_bsl: {
            label: 'Копировать',
            key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_C,
            cmd: monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_C),            
            callback: function (ed) {
                selectionText = editor.getModel().getValueInRange(editor.getSelection());
                return null;
            }
        },
        paste_bsl: {
            label: 'Вставить',
            key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_V,
            cmd: monaco.KeyMod.chord(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_V),                        
            callback: function (ed) {                
                setText(selectionText, null);                
                return null;
            }
        }
    }

});