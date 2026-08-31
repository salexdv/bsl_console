function registerTabsBrowserTests() {
  describe('Вкладки редактора', function () {
    const assert = chai.assert;

    function tabNodes() {
      return Array.prototype.slice.call(document.querySelectorAll('.bsl-editor-tab'));
    }

    function clickTab(index) {
      tabNodes()[index].click();
    }

    function closeButton(index) {
      return tabNodes()[index].querySelector('.bsl-editor-tab-close');
    }

    function lastTabEvent() {
      for (let index = window.events_queue.length - 1; index >= 0; index--) {
        if (window.events_queue[index].event == 'EVENT_TAB_CHANGED')
          return window.events_queue[index];
      }
      return null;
    }

    beforeEach(function () {
      window.setOption('confirmTabClose', false);
      window.events_queue.length = 0;
    });

    after(function () {
      window.setOption('confirmTabClose', false);
      while (tabNodes().length > 1)
        closeButton(tabNodes().length - 1).click();
      window.closeCurrentTab();
      window.events_queue.length = 0;
    });

    it('скрывает панель для исходной единственной вкладки', function () {
      assert.equal(tabNodes().length, 1);
      assert.isTrue(document.querySelector('.bsl-editor-tabs').classList.contains('bsl-editor-tabs-hidden'));
      assert.equal(tabNodes()[0].querySelector('.bsl-editor-tab-title').textContent, 'Основная');
      assert.deepEqual(window.getCurrentTab(), { title: 'Основная', index: 0 });
    });

    it('создаёт независимую текущую вкладку и отправляет событие с нулевым индексом', function () {
      window.updateText('Текст основной вкладки');
      const initialEditor = window.editor;
      window.events_queue.length = 0;

      window.createTab('Запрос', 'ВЫБРАТЬ 1', { language: 'bsl_query', readOnly: true });

      assert.equal(tabNodes().length, 2);
      assert.isFalse(document.querySelector('.bsl-editor-tabs').classList.contains('bsl-editor-tabs-hidden'));
      assert.equal(window.getText(), 'ВЫБРАТЬ 1');
      assert.equal(window.getCurrentLanguageId(), 'bsl_query');
      assert.isTrue(window.getReadOnly());
      assert.deepEqual(lastTabEvent(), {
        event: 'EVENT_TAB_CHANGED',
        params: { title: 'Запрос', index: 1 }
      });
      assert.deepEqual(window.getCurrentTab(), lastTabEvent().params);
      assert.equal(window.events_queue.filter(function (item) {
        return item.event == 'EVENT_CONTENT_CHANGED';
      }).length, 0);

      clickTab(0);
      assert.strictEqual(window.editor, initialEditor);
      assert.deepEqual(window.getCurrentTab(), { title: 'Основная', index: 0 });
      assert.equal(window.getText(), 'Текст основной вкладки');
      assert.equal(window.getCurrentLanguageId(), 'bsl');
      assert.isFalse(window.getReadOnly());
    });

    it('допускает одинаковые и безопасно отображает произвольные названия', function () {
      window.createTab('Одинаковая', 'Первый');
      window.createTab('Одинаковая', 'Второй');
      window.createTab('<img src=x onerror=alert(1)>', 'Третий');

      assert.equal(tabNodes().length, 5);
      assert.equal(document.querySelectorAll('.bsl-editor-tabs img').length, 0);
      assert.equal(tabNodes()[4].querySelector('.bsl-editor-tab-title').textContent, '<img src=x onerror=alert(1)>');
      assert.equal(window.getText(), 'Третий');
    });

    it('сохраняет курсор, undo и compare независимо по вкладкам', function () {
      clickTab(0);
      window.updateText('Альфа');
      window.editor.setPosition({ lineNumber: 1, column: 3 });
      window.setText('Бета');
      const firstEditor = window.editor;

      window.createTab('Сравнение', 'Изменённый');
      const secondCodeEditor = window.editor;
      window.compare('Эталон');
      const secondDiffEditor = window.editor;
      assert.isOk(secondDiffEditor.navi);

      clickTab(0);
      assert.strictEqual(window.editor, firstEditor);
      assert.equal(window.editor.getPosition().column, 7);
      window.editor.trigger('', 'undo');
      assert.equal(window.getText(), 'Альфа');

      clickTab(tabNodes().length - 1);
      assert.strictEqual(window.editor, secondDiffEditor);
      assert.notStrictEqual(window.editor, secondCodeEditor);
      assert.isOk(window.editor.navi);
      window.compare();
      assert.equal(window.getText(), 'Изменённый');
    });

    it('применяет общие визуальные настройки ко всем вкладкам', function () {
      window.setFontSize(17);
      const activeEditor = window.editor;
      clickTab(0);
      assert.equal(window.editor.getRawOptions().fontSize, 17);
      clickTab(tabNodes().length - 1);
      assert.equal(activeEditor.getRawOptions().fontSize, 17);
      window.setFontSize(14);
    });

    it('закрывает фоновую вкладку и сообщает об изменении индекса текущей', function () {
      const currentTitle = tabNodes()[tabNodes().length - 1].querySelector('.bsl-editor-tab-title').textContent;
      window.events_queue.length = 0;
      closeButton(0).click();
      const event = lastTabEvent();
      assert.equal(event.params.title, currentTitle);
      assert.equal(event.params.index, tabNodes().length - 1);
      assert.deepEqual(window.getCurrentTab(), event.params);
    });

    it('после закрытия активной выбирает последнюю ранее активную', function () {
      clickTab(0);
      const expectedTitle = tabNodes()[0].querySelector('.bsl-editor-tab-title').textContent;
      clickTab(tabNodes().length - 1);
      window.closeCurrentTab();
      assert.equal(document.querySelector('.bsl-editor-tab.active .bsl-editor-tab-title').textContent, expectedTitle);
      assert.equal(lastTabEvent().params.title, expectedTitle);
    });

    it('подтверждает закрытие для API и выполняет выбранное действие', function () {
      window.createTab('С подтверждением', 'Текст');
      window.setOption('confirmTabClose', true);
      const count = tabNodes().length;

      window.closeCurrentTab();
      assert.equal(tabNodes().length, count);
      assert.include(document.querySelector('.tingle-modal-box__content').textContent, 'С подтверждением');
      document.querySelector('.tingle-modal--visible .tingle-btn--danger').click();
      assert.equal(tabNodes().length, count);

      window.closeCurrentTab();
      document.querySelector('.tingle-modal--visible .tingle-btn--primary').click();
      assert.equal(tabNodes().length, count - 1);
      window.setOption('confirmTabClose', false);
    });

    it('освобождает модели и сбрасывает последнюю вкладку в Основную', function () {
      while (tabNodes().length > 1)
        closeButton(tabNodes().length - 1).click();
      const modelsBeforeReset = monaco.editor.getModels().length;

      window.closeCurrentTab();

      assert.equal(tabNodes().length, 1);
      assert.equal(tabNodes()[0].querySelector('.bsl-editor-tab-title').textContent, 'Основная');
      assert.isTrue(document.querySelector('.bsl-editor-tabs').classList.contains('bsl-editor-tabs-hidden'));
      assert.equal(window.getText(), '');
      assert.equal(window.getCurrentLanguageId(), 'bsl');
      assert.isFalse(window.getReadOnly());
      assert.deepEqual(window.getCurrentTab(), { title: 'Основная', index: 0 });
      assert.equal(monaco.editor.getModels().length, modelsBeforeReset);
    });
  });
}

export default registerTabsBrowserTests;
