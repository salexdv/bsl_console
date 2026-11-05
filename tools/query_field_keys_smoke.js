const assert = require('assert');

// Доверенные браузерные события: проверка маршрута от клавиатуры до действий Monaco.
module.exports = async function queryFieldKeysSmoke(page) {
    const original = 'SELECT\n A,\n B\nFROM T';
    const swapped = 'SELECT\n B,\n A\nFROM T';
    await page.evaluate(text => {
        window.createTab('Alt+стрелки: клавиатура', text, { language: 'bsl_query' });
        window.editor.setPosition({ lineNumber: 3, column: 3 });
        window.editor.focus();
    }, original);
    async function alt(key) {
        await page.keyboard.down('Alt');
        try { await page.keyboard.press(key); }
        finally { await page.keyboard.up('Alt'); }
    }
    try {
        await alt('ArrowDown');
        assert.equal(await page.evaluate(() => window.editor.getValue()), original, 'Выход за FROM');
        await alt('ArrowUp');
        assert.equal(await page.evaluate(() => window.editor.getValue()), swapped, 'Одно нажатие — одна перестановка');
        await page.evaluate(() => window.editor.trigger('test', 'undo'));
        assert.equal(await page.evaluate(() => window.editor.getValue()), original, 'Один шаг Undo');
        await page.evaluate(() => window.editor.trigger('test', 'redo'));
        assert.equal(await page.evaluate(() => window.editor.getValue()), swapped, 'Один шаг Redo');
        await alt('ArrowUp');
        assert.equal(await page.evaluate(() => window.editor.getValue()), swapped, 'Выход за SELECT');
        await alt('ArrowDown');
        assert.equal(await page.evaluate(() => window.editor.getValue()), original, 'Обратная перестановка');
        await page.evaluate(() => window.setReadOnly(true));
        await alt('ArrowUp');
        assert.equal(await page.evaluate(() => window.editor.getValue()), original, 'Read-only');
    }
    finally {
        await page.evaluate(() => {
            window.setReadOnly(false);
            window.closeCurrentTab();
        });
    }
};
