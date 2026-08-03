const SEARCH_HISTORY_LIMIT = 10;
const FIND_CONTROLLER_ID = 'editor.contrib.findController';

function normalizeSearchHistory(values, limit = SEARCH_HISTORY_LIMIT) {
  if (!Array.isArray(values))
    throw new TypeError('История поиска должна быть массивом строк');

  const result = [];
  const known = new Set();

  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    if (typeof value != 'string')
      throw new TypeError('Каждый элемент истории поиска должен быть строкой');
    if (value === '' || known.has(value))
      continue;

    known.add(value);
    if (result.length < limit)
      result.push(value);
  }

  return result;
}

function addSearchHistoryValue(history, value, limit = SEARCH_HISTORY_LIMIT) {
  if (typeof value != 'string' || value === '')
    return normalizeSearchHistory(history, limit);

  return normalizeSearchHistory([value].concat(history), limit);
}

// В Monaco 0.20 у HistoryNavigator нет публичного replace(). Перезапускаем его
// собственный lifecycle, чтобы стрелки в поле поиска продолжали работать штатно.
function replaceHistoryNavigator(navigator, values) {
  if (!navigator)
    return false;

  if (typeof navigator.replace == 'function') {
    navigator.replace(values);
    return true;
  }

  if (typeof navigator._initialize == 'function' && typeof navigator._onChange == 'function') {
    navigator._initialize(values);
    navigator._onChange();
    return true;
  }

  return false;
}

function createDisposable(callback) {
  return { dispose: callback };
}

class SearchHistoryController {
  constructor(monaco) {
    this.history = [];
    this.editors = new Map();
    this.adapters = new Map();

    if (monaco && monaco.editor && typeof monaco.editor.onDidCreateEditor == 'function')
      this.editorListener = monaco.editor.onDidCreateEditor(editor => this.attachEditor(editor));
  }

  dispose() {
    if (this.editorListener)
      this.editorListener.dispose();
    Array.from(this.editors.keys()).forEach(editor => this.detachEditor(editor));
  }

  save() {
    return JSON.stringify(this.history);
  }

  restore(state) {
    try {
      if (typeof state != 'string')
        throw new TypeError('Ожидается JSON-строка с историей поиска');

      const restored = normalizeSearchHistory(JSON.parse(state));
      this.history = restored;
      this.syncMonacoHistory();
      this.renderAdapters();
      return true;
    }
    catch (error) {
      return { errorDescription: error.message };
    }
  }

  add(value) {
    const updated = addSearchHistoryValue(this.history, value);
    if (updated.length == this.history.length && updated.every((item, index) => item === this.history[index]))
      return;

    this.history = updated;
    this.syncMonacoHistory();
    this.renderAdapters();
  }

  attachEditor(editor) {
    if (!editor || this.editors.has(editor))
      return;

    const controller = this.getFindController(editor);
    if (!controller)
      return;

    const disposables = [];
    const state = typeof controller.getState == 'function' ? controller.getState() : controller._state;
    if (state && typeof state.onFindReplaceStateChange == 'function') {
      disposables.push(state.onFindReplaceStateChange(() => {
        this.ensureWidgetAdapter(editor);
        if (!state.isRevealed)
          this.closeMenus();
      }));
    }
    if (typeof editor.onDidDispose == 'function')
      disposables.push(editor.onDidDispose(() => this.detachEditor(editor)));

    this.editors.set(editor, { controller: controller, disposables: disposables });
    this.ensureWidgetAdapter(editor);
  }

  detachEditor(editor) {
    const binding = this.editors.get(editor);
    if (!binding)
      return;

    binding.disposables.forEach(disposable => disposable.dispose());
    this.editors.delete(editor);

    const adapter = Array.from(this.adapters.values()).find(item => item.editor === editor);
    if (adapter)
      this.disposeAdapter(adapter);
  }

  getFindController(editor) {
    try {
      return editor.getContribution(FIND_CONTROLLER_ID);
    }
    catch (error) {
      return null;
    }
  }

  syncMonacoHistory() {
    this.adapters.forEach(adapter => this.syncInputHistory(adapter.inputBox));
  }

  syncInputHistory(inputBox) {
    if (inputBox)
      replaceHistoryNavigator(inputBox.history, this.history.slice().reverse());
  }

  ensureWidgetAdapter(editor) {
    const binding = this.editors.get(editor);
    const widget = binding && binding.controller ? binding.controller._widget : null;
    if (!widget || this.adapters.has(widget))
      return;

    const findInput = widget._findInput;
    const inputBox = findInput && findInput.inputBox;
    const domNode = widget._domNode;
    const inputElement = inputBox && inputBox.inputElement;
    if (!findInput || !inputBox || !inputElement || !domNode)
      return;

    const document = domNode.ownerDocument;
    const actions = domNode.querySelector('.find-actions');
    if (!document || !actions)
      return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button bsl-find-history-button codicon codicon-history';
    button.title = 'История поиска';
    button.setAttribute('aria-label', 'История поиска');
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-expanded', 'false');
    actions.insertBefore(button, actions.firstChild);

    const menu = document.createElement('div');
    menu.className = 'bsl-find-history-menu';
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;
    domNode.appendChild(menu);

    const originalAddToHistory = inputBox.addToHistory;
    inputBox.addToHistory = function () {};

    const adapter = {
      editor: editor,
      widget: widget,
      findInput: findInput,
      inputBox: inputBox,
      inputElement: inputElement,
      button: button,
      menu: menu,
      originalAddToHistory: originalAddToHistory,
      disposables: []
    };

    adapter.disposables.push(this.listen(inputElement, 'blur', () => this.add(inputBox.value)));
    adapter.disposables.push(this.listen(inputElement, 'keydown', event => {
      if (event.key == 'Enter' || event.keyCode == 13)
        this.add(inputBox.value);
    }));
    adapter.disposables.push(this.listen(button, 'click', event => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleMenu(adapter);
    }));
    adapter.disposables.push(this.listen(button, 'keydown', event => this.handleButtonKeyDown(adapter, event)));
    adapter.disposables.push(this.listen(menu, 'keydown', event => this.handleMenuKeyDown(adapter, event)));
    adapter.disposables.push(this.listen(document, 'mousedown', event => {
      if (!menu.hidden && !menu.contains(event.target) && event.target !== button)
        this.closeMenu(adapter);
    }, true));

    this.adapters.set(widget, adapter);
    this.syncInputHistory(inputBox);
    this.renderAdapter(adapter);
  }

  listen(target, eventName, callback, capture = false) {
    target.addEventListener(eventName, callback, capture);
    return createDisposable(() => target.removeEventListener(eventName, callback, capture));
  }

  renderAdapters() {
    this.adapters.forEach(adapter => this.renderAdapter(adapter));
  }

  renderAdapter(adapter) {
    const document = adapter.menu.ownerDocument;
    while (adapter.menu.firstChild)
      adapter.menu.removeChild(adapter.menu.firstChild);

    this.history.forEach((value, index) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'bsl-find-history-item';
      item.setAttribute('role', 'option');
      item.setAttribute('data-history-index', index.toString());
      item.title = value;
      item.textContent = value.replace(/\r?\n/g, ' ↵ ');
      item.addEventListener('click', event => {
        event.preventDefault();
        this.selectValue(adapter, value);
      });
      adapter.menu.appendChild(item);
    });

    const empty = this.history.length == 0;
    adapter.button.disabled = empty;
    adapter.button.classList.toggle('disabled', empty);
    if (empty)
      this.closeMenu(adapter);
  }

  toggleMenu(adapter) {
    if (this.history.length == 0)
      return;
    if (!adapter.menu.hidden) {
      this.closeMenu(adapter);
      return;
    }

    this.closeMenus();
    adapter.menu.hidden = false;
    adapter.widget._domNode.classList.add('bsl-find-history-open');
    adapter.button.setAttribute('aria-expanded', 'true');
  }

  closeMenus() {
    this.adapters.forEach(adapter => this.closeMenu(adapter));
  }

  closeMenu(adapter) {
    adapter.menu.hidden = true;
    adapter.widget._domNode.classList.remove('bsl-find-history-open');
    adapter.button.setAttribute('aria-expanded', 'false');
  }

  selectValue(adapter, value) {
    adapter.findInput.setValue(value);
    this.closeMenu(adapter);
    adapter.widget.focusFindInput();
  }

  handleButtonKeyDown(adapter, event) {
    if (event.key != 'ArrowDown' && event.keyCode != 40
      && event.key != 'ArrowUp' && event.keyCode != 38
      && event.key != 'Escape' && event.keyCode != 27)
      return;

    event.preventDefault();
    if (event.key == 'Escape' || event.keyCode == 27) {
      this.closeMenu(adapter);
      return;
    }

    if (adapter.menu.hidden)
      this.toggleMenu(adapter);

    const items = Array.from(adapter.menu.querySelectorAll('.bsl-find-history-item'));
    if (!items.length)
      return;

    const openLast = event.key == 'ArrowUp' || event.keyCode == 38;
    items[openLast ? items.length - 1 : 0].focus();
  }

  handleMenuKeyDown(adapter, event) {
    const items = Array.from(adapter.menu.querySelectorAll('.bsl-find-history-item'));
    if (!items.length)
      return;

    const currentIndex = Math.max(0, items.indexOf(adapter.menu.ownerDocument.activeElement));
    if (event.key == 'ArrowDown' || event.keyCode == 40) {
      event.preventDefault();
      items[(currentIndex + 1) % items.length].focus();
    }
    else if (event.key == 'ArrowUp' || event.keyCode == 38) {
      event.preventDefault();
      items[(currentIndex + items.length - 1) % items.length].focus();
    }
    else if (event.key == 'Enter' || event.keyCode == 13) {
      event.preventDefault();
      items[currentIndex].click();
    }
    else if (event.key == 'Escape' || event.keyCode == 27) {
      event.preventDefault();
      this.closeMenu(adapter);
      adapter.widget.focusFindInput();
    }
  }

  disposeAdapter(adapter) {
    adapter.disposables.forEach(disposable => disposable.dispose());
    adapter.inputBox.addToHistory = adapter.originalAddToHistory;
    if (adapter.button.parentNode)
      adapter.button.parentNode.removeChild(adapter.button);
    if (adapter.menu.parentNode)
      adapter.menu.parentNode.removeChild(adapter.menu);
    this.adapters.delete(adapter.widget);
  }
}

export {
  SEARCH_HISTORY_LIMIT,
  normalizeSearchHistory,
  addSearchHistoryValue,
  replaceHistoryNavigator,
  SearchHistoryController
};
export default SearchHistoryController;
