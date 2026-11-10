// Проверки реального редактора и разрешения сочетаний клавиш Monaco.
export default function registerQueryFieldMoveTests() {
    describe('Перемещение полей запроса Alt+↑/↓', function () {
        const assert = chai.assert;
        const original = 'SELECT\n\tA,\n\tB,\n\tC\nFROM T';
        let editor;

        function pause() {
            return new Promise(resolve => setTimeout(resolve, 25));
        }

        async function key(down) {
            editor.focus();
            await pause();
            editor.getDomNode().querySelector('textarea').dispatchEvent(new KeyboardEvent('keydown', {
                key: down ? 'ArrowDown' : 'ArrowUp', code: down ? 'ArrowDown' : 'ArrowUp',
                keyCode: down ? 40 : 38, which: down ? 40 : 38,
                altKey: true, bubbles: true, cancelable: true
            }));
            await pause();
        }

        beforeEach(function () {
            window.createTab('Проверка перемещения полей', original, { language: 'bsl_query' });
            editor = window.editor;
        });

        afterEach(function () {
            window.setReadOnly(false);
            window.closeCurrentTab();
        });

        it('перехватывает клавишу и исправляет обе запятые; Undo/Redo одним шагом', async function () {
            editor.setPosition({ lineNumber: 4, column: 3 });
            await key(false);
            const expected = 'SELECT\n\tA,\n\tC,\n\tB\nFROM T';
            assert.equal(editor.getValue(), expected);
            assert.equal(editor.getPosition().lineNumber, 3);
            assert.equal(editor.getPosition().column, 3);
            editor.trigger('test', 'undo');
            assert.equal(editor.getValue(), original);
            assert.equal(editor.getPosition().lineNumber, 4);
            editor.trigger('test', 'redo');
            assert.equal(editor.getValue(), expected);
            assert.equal(editor.getPosition().lineNumber, 3);
        });

        it('блокирует выход через SELECT и FROM', async function () {
            editor.setPosition({ lineNumber: 2, column: 2 });
            await key(false);
            assert.equal(editor.getValue(), original);
            editor.setPosition({ lineNumber: 4, column: 3 });
            await key(true);
            assert.equal(editor.getValue(), original);
        });

        it('перемещает выделенный блок и сохраняет выделение', async function () {
            editor.setSelection(new monaco.Selection(3, 1, 5, 1));
            await key(false);
            assert.equal(editor.getValue(), 'SELECT\n\tB,\n\tC,\n\tA\nFROM T');
            assert.equal(editor.getModel().getValueInRange(editor.getSelection()), '\tB,\n\tC,\n');
        });

        it('перемещает блок из второй ветки объединения и отменяет обе правки за один шаг', async function () {
            const original = 'SELECT\n A,\n B,\n C\nFROM T\nUNION ALL\nSELECT\n X,\n Y,\n Z\nFROM U';
            const expected = 'SELECT\n B,\n C,\n A\nFROM T\nUNION ALL\nSELECT\n Y,\n Z,\n X\nFROM U';
            const selection = new monaco.Selection(11, 1, 9, 1);
            const moved = new monaco.Selection(10, 1, 8, 1);
            editor.setValue(original);
            editor.setSelection(selection);
            await key(false);
            assert.equal(editor.getValue(), expected);
            assert.isTrue(editor.getSelection().equalsSelection(moved));

            editor.trigger('test', 'undo');
            assert.equal(editor.getValue(), original);
            assert.isTrue(editor.getSelection().equalsSelection(selection));
            editor.trigger('test', 'redo');
            assert.equal(editor.getValue(), expected);
            assert.isTrue(editor.getSelection().equalsSelection(moved));
        });

        it('синхронно перемещает строки 69–70 и 129–130 в запросе из test_query', async function () {
            const query = window.getCode();
            const expected = query.split('\n');
            for (const lastLine of [70, 130]) {
                const [previous, first, last] = expected.slice(lastLine - 3, lastLine);
                expected.splice(lastLine - 3, 3, first, last + ',', previous.slice(0, -1));
            }

            editor.setValue(query);
            editor.setSelection(new monaco.Selection(69, 1, 71, 1));
            await key(false);
            assert.equal(editor.getValue(), expected.join('\n'));
            assert.isTrue(editor.getSelection().equalsSelection(new monaco.Selection(68, 1, 70, 1)));
        });

        it('перемещает многострочное поле целиком', async function () {
            editor.setValue('SELECT\n CASE\n WHEN A = 1 THEN 2\n END AS X,\n Y\nFROM T');
            editor.setPosition({ lineNumber: 3, column: 5 });
            await key(true);
            assert.equal(editor.getValue(), 'SELECT\n Y,\n CASE\n WHEN A = 1 THEN 2\n END AS X\nFROM T');
            assert.equal(editor.getPosition().lineNumber, 4);
        });

        it('сохраняет read-only и блокирует несколько курсоров в списке', async function () {
            editor.setSelections([new monaco.Selection(2, 2, 2, 2), new monaco.Selection(4, 2, 4, 2)]);
            await key(false);
            assert.equal(editor.getValue(), original);
            editor.setPosition({ lineNumber: 4, column: 2 });
            window.setReadOnly(true);
            await key(false);
            assert.equal(editor.getValue(), original);
        });

        it('сохраняет обычное перемещение вне полей и после смены языка', async function () {
            editor.setValue('SELECT A FROM T\nWHERE X = 1\nORDER BY A');
            editor.setPosition({ lineNumber: 3, column: 3 });
            await key(false);
            assert.equal(editor.getValue(), 'SELECT A FROM T\nORDER BY A\nWHERE X = 1');
            window.setLanguageMode('bsl');
            editor.setValue('Первая\nВторая');
            editor.setPosition({ lineNumber: 2, column: 1 });
            await key(false);
            assert.equal(editor.getValue(), 'Вторая\nПервая');
            window.setLanguageMode('dcs_query');
            editor.setValue('SELECT\n A,\n B\nFROM T');
            editor.setPosition({ lineNumber: 3, column: 2 });
            await key(false);
            assert.equal(editor.getValue(), 'SELECT\n B\n A,\nFROM T');
        });

        it('сохраняет действие после переключения вкладок', async function () {
            window.createTab('Соседняя вкладка', 'Текст');
            window.closeCurrentTab();
            assert.strictEqual(window.editor, editor);
            editor.setPosition({ lineNumber: 4, column: 2 });
            await key(false);
            assert.equal(editor.getValue(), 'SELECT\n\tA,\n\tC,\n\tB\nFROM T');
        });

        it('сохраняет disableKeyBinding/enableKeyBinding и событие 1С', async function () {
            const binding = monaco.KeyMod.Alt | monaco.KeyCode.UpArrow;
            const sendEvent = window.sendEvent;
            const events = [];
            window.sendEvent = function (name, params) {
                events.push(name);
                sendEvent(name, params);
            };
            try {
                editor.setPosition({ lineNumber: 4, column: 2 });
                window.disableKeyBinding(binding);
                await key(false);
                assert.equal(editor.getValue(), original);
                assert.include(events, 'EVENT_KEY_BINDING_' + binding);
                window.enableKeyBinding(binding);
                await key(false);
                assert.equal(editor.getValue(), 'SELECT\n\tA,\n\tC,\n\tB\nFROM T');
            }
            finally {
                window.enableKeyBinding(binding);
                window.sendEvent = sendEvent;
            }
        });
    });
}
