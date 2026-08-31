import './tabs.css';

function element(tagName, className, text) {
  const node = document.createElement(tagName);
  if (className)
    node.className = className;
  if (typeof text != 'undefined')
    node.textContent = text;
  return node;
}

class EditorTabs {
  constructor(hooks) {
    this.hooks = hooks;
    this.tabs = [];
    this.active = null;
    this.mru = [];

    this.domNode = element('div', 'bsl-editor-tabs bsl-editor-tabs-hidden');
    this.domNode.setAttribute('role', 'tablist');
    this.domNode.setAttribute('aria-label', 'Вкладки редактора');
    this.listNode = element('div', 'bsl-editor-tabs-list');
    this.domNode.appendChild(this.listNode);

    const workspace = document.getElementById('editor-workspace');
    const container = document.getElementById('container');
    const anchor = workspace || container;
    if (anchor && anchor.parentNode)
      anchor.parentNode.insertBefore(this.domNode, anchor);
  }

  registerInitial(session) {
    this.tabs.push(session);
    this.createTabNode(session);
    this.active = session;
    this.touchMru(session);
    this.render();
  }

  add(session) {
    this.tabs.push(session);
    this.createTabNode(session);
    this.select(session, true);
  }

  createTabNode(session) {
    const tabNode = element('div', 'bsl-editor-tab');
    tabNode.setAttribute('role', 'tab');
    tabNode.setAttribute('tabindex', '-1');
    const titleNode = element('span', 'bsl-editor-tab-title', session.title);
    const closeNode = element('button', 'bsl-editor-tab-close', '\u00d7');
    closeNode.type = 'button';
    closeNode.title = 'Закрыть вкладку';
    closeNode.setAttribute('aria-label', 'Закрыть вкладку ' + session.title);
    tabNode.title = session.title;
    tabNode.appendChild(titleNode);
    tabNode.appendChild(closeNode);
    tabNode.addEventListener('click', () => this.select(session, true));
    closeNode.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.requestClose(session);
    });
    session.tabNode = tabNode;
    session.titleNode = titleNode;
    session.closeNode = closeNode;
    this.listNode.appendChild(tabNode);
  }

  select(session, emitEvent) {
    if (!session || this.tabs.indexOf(session) < 0)
      return;

    if (this.active === session) {
      this.touchMru(session);
      return;
    }

    const previous = this.active;
    if (this.hooks.onActivate)
      this.hooks.onActivate(session, previous);
    this.active = session;
    this.touchMru(session);
    this.render();
    if (session.tabNode && session.tabNode.scrollIntoView)
      session.tabNode.scrollIntoView();
    if (emitEvent)
      this.emitChanged();
  }

  touchMru(session) {
    const index = this.mru.indexOf(session);
    if (index >= 0)
      this.mru.splice(index, 1);
    this.mru.push(session);
  }

  requestClose(session) {
    if (!session || this.tabs.indexOf(session) < 0)
      return;
    if (this.hooks.shouldConfirmClose && this.hooks.shouldConfirmClose()) {
      this.hooks.confirmClose(session.title, () => this.close(session));
      return;
    }
    this.close(session);
  }

  closeCurrent() {
    this.requestClose(this.active);
  }

  close(session) {
    const closingIndex = this.tabs.indexOf(session);
    if (closingIndex < 0)
      return;

    if (this.tabs.length == 1) {
      if (this.hooks.onResetLast)
        this.hooks.onResetLast(session);
      this.setTitle(session, 'Основная');
      this.active = session;
      this.mru = [session];
      this.render();
      this.emitChanged();
      return;
    }

    const wasActive = session === this.active;
    const previousActiveIndex = this.tabs.indexOf(this.active);
    if (this.hooks.onDispose)
      this.hooks.onDispose(session, wasActive);

    this.tabs.splice(closingIndex, 1);
    const mruIndex = this.mru.indexOf(session);
    if (mruIndex >= 0)
      this.mru.splice(mruIndex, 1);
    if (session.tabNode)
      session.tabNode.remove();

    if (wasActive) {
      this.active = null;
      const next = this.mru.length ? this.mru[this.mru.length - 1] : this.tabs[0];
      this.select(next, false);
      this.emitChanged();
    }
    else {
      this.render();
      const currentIndex = this.tabs.indexOf(this.active);
      if (currentIndex != previousActiveIndex)
        this.emitChanged();
    }
  }

  setTitle(session, title) {
    session.title = title;
    if (session.titleNode)
      session.titleNode.textContent = title;
    if (session.tabNode)
      session.tabNode.title = title;
    if (session.closeNode) {
      session.closeNode.title = 'Закрыть вкладку';
      session.closeNode.setAttribute('aria-label', 'Закрыть вкладку ' + title);
    }
  }

  replaceCurrentEditor(editor) {
    if (this.active)
      this.active.editor = editor;
  }

  emitChanged() {
    const current = this.getCurrent();
    if (!current || !this.hooks.onChanged)
      return;

    this.hooks.onChanged(current);
  }

  getCurrent() {
    if (!this.active)
      return null;

    return {
      title: this.active.title,
      index: this.tabs.indexOf(this.active)
    };
  }

  setTheme(theme) {
    this.domNode.classList.toggle('dark', String(theme || '').indexOf('dark') >= 0);
  }

  render() {
    this.domNode.classList.toggle('bsl-editor-tabs-hidden', this.tabs.length <= 1);
    this.tabs.forEach((session) => {
      const selected = session === this.active;
      session.tabNode.classList.toggle('active', selected);
      session.tabNode.setAttribute('aria-selected', selected ? 'true' : 'false');
      session.tabNode.setAttribute('tabindex', selected ? '0' : '-1');
    });
  }

  getSessions() {
    return this.tabs.slice();
  }
}

export default EditorTabs;
