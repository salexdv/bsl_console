import { resolveHelpLink } from './links';
import { findNavigationPath } from './navigation';

const HELP_SECTION_TITLES = {
  'Использование:': true,
  'Синтаксис:': true,
  'Параметры:': true,
  'Свойства:': true,
  'Методы:': true,
  'Конструкторы:': true,
  'Описание:': true,
  'Доступность:': true,
  'Пример:': true,
  'Возвращаемое значение:': true,
  'Использование в версии:': true
};

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function createVirtualList(container, onOpen) {
  const rowHeight = 30;
  const spacer = element('div', 'bsl-help-list-spacer');
  container.appendChild(spacer);
  let items = [];
  function render() {
    const first = Math.max(0, Math.floor(container.scrollTop / rowHeight) - 5);
    const count = Math.ceil((container.clientHeight || 300) / rowHeight) + 10;
    const last = Math.min(items.length, first + count);
    spacer.textContent = '';
    spacer.style.height = (items.length * rowHeight) + 'px';
    for (let i = first; i < last; i++) {
      const item = items[i];
      const title = item.title || item.path;
      const row = element('button', 'bsl-help-list-row');
      row.type = 'button';
      row.style.top = (i * rowHeight) + 'px';
      row.appendChild(element('span', 'bsl-help-list-title', title));
      if (item.context)
        row.appendChild(element('span', 'bsl-help-list-context', ' (' + item.context + ')'));
      row.title = item.context ? title + ' (' + item.context + ')' : title;
      row.addEventListener('click', function () { onOpen(item); });
      spacer.appendChild(row);
    }
  }
  container.addEventListener('scroll', render);
  return {
    setItems: function (value) { items = value || []; container.scrollTop = 0; render(); },
    render: render
  };
}

function compactStyle(value) {
  const parts = String(value || '').split(';');
  const kept = [];
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index].trim();
    if (!part) continue;
    const colon = part.indexOf(':');
    const name = (colon >= 0 ? part.slice(0, colon) : part).trim().toLowerCase();
    if (name == 'margin' || name == 'padding'
      || name == 'margin-top' || name == 'margin-bottom'
      || name == 'padding-top' || name == 'padding-bottom'
      || name == 'margin-block' || name == 'margin-block-start' || name == 'margin-block-end'
      || name == 'padding-block' || name == 'padding-block-start' || name == 'padding-block-end')
      continue;
    kept.push(part);
  }
  return kept.join('; ');
}

function sanitizeArticle(rawHtml, onInternal, onExternal, currentArticle) {
  const parsed = new DOMParser().parseFromString(rawHtml || '', 'text/html');
  const forbidden = 'script,style,iframe,object,embed,form,input,button,textarea,select,option,link,meta,base,applet,frame,frameset';
  Array.prototype.slice.call(parsed.querySelectorAll(forbidden)).forEach(function (node) { node.remove(); });
  Array.prototype.slice.call(parsed.querySelectorAll('*')).forEach(function (node) {
    Array.prototype.slice.call(node.attributes || []).forEach(function (attribute) {
      const name = attribute.name.toLowerCase();
      if (name.indexOf('on') == 0 || name == 'srcdoc'
        || (name == 'style' && /(?:url\s*\(|expression\s*\()/i.test(attribute.value)))
        node.removeAttribute(attribute.name);
      else if (name == 'style')
        attribute.value = compactStyle(attribute.value);
    });
  });
  Array.prototype.slice.call(parsed.querySelectorAll('[src]')).forEach(function (node) { node.removeAttribute('src'); });
  Array.prototype.slice.call(parsed.querySelectorAll('[xlink\\:href],[action],[formaction],[poster],[background]')).forEach(function (node) {
    node.removeAttribute('xlink:href'); node.removeAttribute('action'); node.removeAttribute('formaction');
    node.removeAttribute('poster'); node.removeAttribute('background');
  });
  Array.prototype.slice.call(parsed.querySelectorAll('[href]')).forEach(function (node) {
    if (node.tagName.toLowerCase() != 'a') node.removeAttribute('href');
  });
  Array.prototype.slice.call(parsed.querySelectorAll('a[href]')).forEach(function (link) {
    const href = (link.getAttribute('href') || '').trim();
    const target = resolveHelpLink(href, currentArticle);
    if (target && target.type == 'internal') {
      link.setAttribute('href', '#');
      link.addEventListener('click', function (event) {
        event.preventDefault();
        onInternal({ kind: target.kind, path: target.path, anchor: target.anchor });
      });
    }
    else if (target && target.type == 'external') {
      link.setAttribute('href', target.href);
      link.removeAttribute('target');
      link.removeAttribute('rel');
      link.addEventListener('click', function (event) {
        event.preventDefault();
        onExternal({ label: link.innerText || link.textContent || '', href: target.href });
      });
    }
    else {
      link.removeAttribute('href');
    }
  });
  Array.prototype.slice.call(parsed.body.querySelectorAll('*')).forEach(function (node) {
    const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
    if (HELP_SECTION_TITLES[text]) node.classList.add('bsl-help-section-title');
  });
  return parsed.body;
}

function highlight(root, terms) {
  if (!terms || !terms.length) return;
  const normalizedTerms = terms.map(function (term) { return term.replace(/ё/g, 'е'); });
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
  const nodes = [];
  let current;
  while ((current = walker.nextNode())) nodes.push(current);
  nodes.forEach(function (node) {
    const value = node.nodeValue;
    const normalized = value.toLocaleLowerCase().replace(/ё/g, 'е');
    const ranges = [];
    normalizedTerms.forEach(function (term) {
      let start = 0;
      while (term && (start = normalized.indexOf(term, start)) >= 0) {
        ranges.push([start, start + term.length]); start += term.length;
      }
    });
    if (!ranges.length) return;
    ranges.sort(function (a, b) { return a[0] - b[0]; });
    const fragment = document.createDocumentFragment();
    let offset = 0;
    ranges.forEach(function (range) {
      if (range[0] < offset) return;
      fragment.appendChild(document.createTextNode(value.slice(offset, range[0])));
      const mark = element('mark', '', value.slice(range[0], range[1]));
      fragment.appendChild(mark); offset = range[1];
    });
    fragment.appendChild(document.createTextNode(value.slice(offset)));
    node.parentNode.replaceChild(fragment, node);
  });
}

function createHelpUi(service, editorProvider, onExternalLink) {
  const overlay = element('section', 'bsl-help-overlay');
  overlay.setAttribute('aria-label', 'Справка 1С');
  overlay.setAttribute('aria-hidden', 'true');
  const toolbar = element('header', 'bsl-help-toolbar');
  const back = element('button', 'bsl-help-icon', '←'); back.title = 'Назад';
  const forward = element('button', 'bsl-help-icon', '→'); forward.title = 'Вперёд';
  const locate = element('button', 'bsl-help-icon bsl-help-locate');
  locate.type = 'button';
  locate.title = 'Найти текущий элемент в дереве';
  locate.setAttribute('aria-label', locate.title);
  locate.appendChild(element('span', 'codicon codicon-list-tree'));
  const caption = element('div', 'bsl-help-caption', 'Справка 1С');
  const close = element('button', 'bsl-help-close', '×'); close.title = 'Закрыть';
  toolbar.appendChild(back); toolbar.appendChild(forward); toolbar.appendChild(locate);
  toolbar.appendChild(caption); toolbar.appendChild(close);
  const body = element('div', 'bsl-help-body');
  const message = element('div', 'bsl-help-message');
  const navigation = element('aside', 'bsl-help-navigation');
  const tabs = element('div', 'bsl-help-tabs');
  const tabNames = [{ id: 'contents', title: 'Содержание' }, { id: 'index', title: 'Индекс' }, { id: 'search', title: 'Поиск' }];
  const panels = {};
  const tabButtons = {};
  tabNames.forEach(function (tab) {
    const button = element('button', 'bsl-help-tab', tab.title); button.type = 'button';
    button.dataset.tab = tab.id; tabs.appendChild(button); tabButtons[tab.id] = button;
    const panel = element('div', 'bsl-help-panel'); panel.dataset.tab = tab.id; navigation.appendChild(panel); panels[tab.id] = panel;
  });
  navigation.insertBefore(tabs, navigation.firstChild);
  const contents = element('div', 'bsl-help-tree'); panels.contents.appendChild(contents);
  const indexInput = element('input', 'bsl-help-input'); indexInput.placeholder = 'Имя или слова пути';
  const indexMeta = element('div', 'bsl-help-meta');
  const indexListNode = element('div', 'bsl-help-list');
  panels.index.appendChild(indexInput); panels.index.appendChild(indexMeta); panels.index.appendChild(indexListNode);
  const searchInput = element('input', 'bsl-help-input'); searchInput.placeholder = 'Все слова';
  const searchMeta = element('div', 'bsl-help-meta');
  const searchListNode = element('div', 'bsl-help-list');
  panels.search.appendChild(searchInput); panels.search.appendChild(searchMeta); panels.search.appendChild(searchListNode);
  const separator = element('div', 'bsl-help-separator');
  const article = element('main', 'bsl-help-article');
  const status = element('div', 'bsl-help-status', 'Справка не загружена');
  const articleContent = element('div', 'bsl-help-article-content');
  article.appendChild(status); article.appendChild(articleContent);
  body.appendChild(navigation); body.appendChild(separator); body.appendChild(article);
  overlay.appendChild(toolbar); overlay.appendChild(message); overlay.appendChild(body);
  const workspace = document.getElementById('editor-workspace');
  const dockSeparator = element('div', 'bsl-help-dock-separator');
  if (workspace) {
    workspace.appendChild(dockSeparator);
    workspace.appendChild(overlay);
  }
  else {
    overlay.classList.add('standalone');
    document.body.appendChild(overlay);
  }

  let activeTab = 'contents';
  let selected = null;
  let activeTerms = [];
  let history = [];
  let historyAt = -1;
  let previousFocus = null;
  let previousEditor = null;
  let searchTimer = null;
  let indexRenderHandle = null;
  let indexRenderAnimationFrame = false;
  let dockWidth = null;
  let navigationHeight = null;
  const expandedNodes = {};
  const initialState = service.getState();
  let renderedScope = initialState.scope;
  let renderedPackages = '';
  let viewSequence = 0;
  let articleSequence = 0;
  let locateSequence = 0;
  let locating = false;
  let treeRows = {};

  function packageSignature(value) {
    const packages = value.packages || {};
    return (value.kinds || []).map(function (kind) {
      const pack = packages[kind];
      return kind + ':' + (pack ? String(pack.generation) + ':' + String(pack.provisional) : '');
    }).join('|');
  }

  function currentEditor() {
    return editorProvider();
  }

  function layoutEditor() {
    const editor = currentEditor();
    function layout() {
      if (!editor) return;
      if (editor.layout) editor.layout();
      if (editor.navi) {
        if (editor.getOriginalEditor) editor.getOriginalEditor().layout();
        if (editor.getModifiedEditor) editor.getModifiedEditor().layout();
      }
    }
    layout();
    if (typeof requestAnimationFrame == 'function') requestAnimationFrame(layout);
  }

  function clampDockWidth(width) {
    const available = workspace ? workspace.clientWidth : window.innerWidth;
    return Math.max(340, Math.min(Math.max(340, available - 300), width));
  }

  function applyDockWidth(width) {
    if (!workspace) return;
    dockWidth = clampDockWidth(width);
    overlay.style.width = dockWidth + 'px';
  }

  function clampNavigationHeight(height) {
    const available = body.clientHeight || 500;
    return Math.max(150, Math.min(Math.max(150, available - 180), height));
  }

  function applyNavigationHeight(height) {
    navigationHeight = clampNavigationHeight(height);
    navigation.style.height = navigationHeight + 'px';
  }

  function setTab(name) {
    activeTab = name;
    Object.keys(panels).forEach(function (id) {
      panels[id].classList.toggle('active', id == name);
      tabButtons[id].classList.toggle('active', id == name);
    });
    if (name == 'index') indexInput.focus();
    if (name == 'search') searchInput.focus();
  }

  function selectedPath() {
    return selected ? findNavigationPath(service.getNavigation(), selected) : null;
  }

  function updateToolbarButtons() {
    back.disabled = historyAt <= 0;
    forward.disabled = historyAt < 0 || historyAt >= history.length - 1;
    locate.disabled = locating || !selectedPath();
  }

  function updateTreeSelection() {
    Object.keys(treeRows).forEach(function (key) {
      treeRows[key].classList.remove('current');
      treeRows[key].removeAttribute('aria-current');
    });
    const path = selectedPath();
    if (!path || !path.length) return;
    const current = path[path.length - 1];
    const title = treeRows[current.tocId || current.id];
    if (!title) return;
    title.classList.add('current');
    title.setAttribute('aria-current', 'true');
  }

  function renderStatus(value) {
    message.classList.toggle('visible', value.status != 'ready');
    if (value.status == 'loading') message.textContent = 'Загрузка справки…';
    else if (value.status == 'error') message.textContent = value.lastError || 'Ошибка загрузки справки';
    else if (value.status == 'empty') message.textContent = 'Справка не загружена';
    else message.textContent = '';
    if (!selected && value.status == 'ready') {
      status.textContent = 'Выберите статью';
      status.classList.add('visible');
    }
  }

  function renderState(value) {
    if (value.scope != renderedScope) {
      renderedScope = value.scope;
      resetScope();
    }
    renderStatus(value);
    const signature = packageSignature(value);
    if (signature == renderedPackages)
      return;
    renderedPackages = signature;
    renderTree();
    renderIndex();
    updateToolbarButtons();
  }

  function treeNode(node) {
    const row = element('div', 'bsl-help-tree-node');
    const line = element('div', 'bsl-help-tree-line');
    const toggle = element('button', 'bsl-help-tree-toggle', node.children && node.children.length ? '▸' : '');
    const title = element('button', 'bsl-help-tree-title', node.title || node.path || 'Без названия');
    line.appendChild(toggle); line.appendChild(title); row.appendChild(line);
    let children = null;
    let opening = false;
    const nodeKey = node.tocId || node.id;
    treeRows[nodeKey] = title;
    function appendChildren() {
      if (children) return;
      children = element('div', 'bsl-help-tree-children');
      node.children.forEach(function (child) { children.appendChild(treeNode(child)); });
      row.appendChild(children);
    }
    function setOpened(opened) {
      appendChildren();
      children.classList.toggle('open', opened);
      toggle.textContent = opened ? '▾' : '▸';
      if (opened) expandedNodes[nodeKey] = true;
      else delete expandedNodes[nodeKey];
    }
    toggle.addEventListener('click', function () {
      if (!node.children || !node.children.length) return;
      if (children) {
        setOpened(!children.classList.contains('open'));
        return;
      }
      if (node.childrenHydrated) {
        setOpened(true);
        return;
      }
      if (opening) return;
      opening = true;
      toggle.textContent = '…';
      service.hydrate(node).then(function (hydrated) {
        node.children = hydrated;
        node.childrenHydrated = true;
        opening = false;
        setOpened(true);
      }).catch(function () {
        opening = false;
        toggle.textContent = '▸';
      });
    });
    title.addEventListener('click', function () {
      if (node.path) openArticle(node, [], true);
      else toggle.click();
    });
    if (expandedNodes[nodeKey] && node.childrenHydrated)
      setOpened(true);
    return row;
  }

  function renderTree() {
    const scrollTop = contents.scrollTop;
    contents.textContent = '';
    treeRows = {};
    service.getNavigation().forEach(function (node) { contents.appendChild(treeNode(node)); });
    contents.scrollTop = scrollTop;
    updateTreeSelection();
  }

  const indexList = createVirtualList(indexListNode, function (item) { openArticle(item, [], true); });
  const searchList = createVirtualList(searchListNode, function (item) { openArticle(item, activeTerms, true); });

  function resetScope() {
    viewSequence++;
    articleSequence++;
    locateSequence++;
    locating = false;
    clearTimeout(searchTimer);
    searchTimer = null;
    cancelIndexRender();
    selected = null;
    activeTerms = [];
    history = [];
    historyAt = -1;
    Object.keys(expandedNodes).forEach(function (key) { delete expandedNodes[key]; });
    indexInput.value = '';
    searchInput.value = '';
    indexMeta.textContent = 'Найдено: 0';
    searchMeta.textContent = 'Найдено: 0';
    indexList.setItems([]);
    searchList.setItems([]);
    articleContent.textContent = '';
    status.textContent = 'Выберите статью';
    status.classList.remove('error');
    updateToolbarButtons();
  }

  function renderIndex() {
    const result = service.prefix(indexInput.value);
    indexMeta.textContent = 'Найдено: ' + result.total;
    indexList.setItems(result.items);
    return result;
  }

  function cancelIndexRender() {
    if (indexRenderHandle === null) return;
    if (indexRenderAnimationFrame && typeof cancelAnimationFrame == 'function')
      cancelAnimationFrame(indexRenderHandle);
    else
      clearTimeout(indexRenderHandle);
    indexRenderHandle = null;
  }

  function scheduleIndexRender() {
    if (indexRenderHandle !== null) return;
    indexRenderAnimationFrame = typeof requestAnimationFrame == 'function';
    const callback = function () {
      indexRenderHandle = null;
      renderIndex();
    };
    indexRenderHandle = indexRenderAnimationFrame ? requestAnimationFrame(callback) : setTimeout(callback, 0);
  }

  function openArticle(item, terms, addHistory) {
    if (!item || !item.kind || !item.path) return Promise.resolve();
    if (!service.isKindActive(item.kind)) return Promise.resolve();
    const requestView = viewSequence;
    status.textContent = 'Загрузка статьи…';
    status.classList.remove('error');
    status.classList.add('visible');
    return service.article(item, terms).then(function (result) {
      if (requestView != viewSequence) return;
      selected = { id: result.id, kind: result.kind, path: result.path, title: result.title, anchor: item.anchor || '' };
      articleSequence++;
      locateSequence++;
      locating = false;
      activeTerms = terms || [];
      if (addHistory) {
        history = history.slice(0, historyAt + 1);
        history.push({ item: selected, terms: activeTerms });
        historyAt = history.length - 1;
      }
      articleContent.textContent = '';
      const safe = sanitizeArticle(result.html, function (target) {
        if (service.isKindActive(target.kind)) openArticle(target, [], true);
      }, onExternalLink, selected);
      while (safe.firstChild) articleContent.appendChild(safe.firstChild);
      status.classList.remove('visible', 'error');
      highlight(articleContent, activeTerms);
      article.scrollTop = 0;
      if (selected.anchor) {
        const targets = articleContent.querySelectorAll('[id],[name]');
        let anchorTarget = null;
        for (let i = 0; i < targets.length; i++) {
          if (targets[i].id == selected.anchor || targets[i].getAttribute('name') == selected.anchor) {
            anchorTarget = targets[i]; break;
          }
        }
        if (anchorTarget) {
          let top = anchorTarget.offsetTop;
          let parent = anchorTarget.offsetParent;
          while (parent && parent != article) {
            top += parent.offsetTop;
            parent = parent.offsetParent;
          }
          article.scrollTop = Math.max(0, top - 8);
        }
      }
      updateTreeSelection();
      updateToolbarButtons();
    }).catch(function (error) {
      if (requestView != viewSequence) return;
      status.textContent = 'Ошибка открытия: ' + (error.message || String(error));
      status.classList.add('visible', 'error');
    });
  }

  function sameArticle(item) {
    return selected && item && selected.id == item.id && selected.kind == item.kind && selected.path == item.path;
  }

  function scrollTreeTitleIntoView(title) {
    const viewport = contents.getBoundingClientRect();
    const row = title.getBoundingClientRect();
    if (row.top < viewport.top)
      contents.scrollTop -= viewport.top - row.top;
    else if (row.bottom > viewport.bottom)
      contents.scrollTop += row.bottom - viewport.bottom;
  }

  function locateSelected() {
    const requested = selected && { id: selected.id, kind: selected.kind, path: selected.path };
    const requestView = viewSequence;
    const requestArticle = articleSequence;
    if (!requested || !selectedPath()) {
      updateToolbarButtons();
      return Promise.resolve();
    }
    const requestLocate = ++locateSequence;
    locating = true;
    updateToolbarButtons();
    setTab('contents');

    function isCurrent() {
      return requestLocate == locateSequence && requestView == viewSequence
        && requestArticle == articleSequence && sameArticle(requested);
    }

    function hydratePath() {
      if (!isCurrent()) return Promise.resolve(null);
      const path = findNavigationPath(service.getNavigation(), requested);
      if (!path) return Promise.resolve(null);
      for (let index = 0; index + 1 < path.length; index++) {
        const node = path[index];
        if (node.children && node.children.length && !node.childrenHydrated)
          return service.hydrate(node).then(hydratePath);
      }
      return Promise.resolve(path);
    }

    return hydratePath().then(function (path) {
      if (!isCurrent() || !path) return;
      for (let index = 0; index + 1 < path.length; index++)
        expandedNodes[path[index].tocId || path[index].id] = true;
      renderTree();
      const current = path[path.length - 1];
      const title = treeRows[current.tocId || current.id];
      if (!title) return;
      title.focus();
      scrollTreeTitleIntoView(title);
    }).catch(function () {
      // Ошибка ленивой гидратации не должна менять статью или историю.
    }).then(function () {
      if (requestLocate != locateSequence) return;
      locating = false;
      updateToolbarButtons();
    });
  }

  function show(preferredEditor) {
    previousFocus = document.activeElement;
    const editor = currentEditor();
    previousEditor = preferredEditor || editor;
    if (!preferredEditor && editor && editor.navi) {
      if (editor.getModifiedEditor().hasTextFocus()) previousEditor = editor.getModifiedEditor();
      else if (editor.getOriginalEditor().hasTextFocus()) previousEditor = editor.getOriginalEditor();
    }
    if (workspace) {
      dockSeparator.classList.add('visible');
      overlay.classList.add('visible');
      applyDockWidth(dockWidth === null ? workspace.clientWidth * .3 : dockWidth);
    }
    overlay.classList.add('visible'); overlay.setAttribute('aria-hidden', 'false');
    renderStatus(service.getState()); setTab(activeTab);
    if (navigationHeight === null) applyNavigationHeight(body.clientHeight * .45);
    else applyNavigationHeight(navigationHeight);
    close.focus();
    layoutEditor();
  }

  function showIndex(query, preferredEditor) {
    cancelIndexRender();
    indexInput.value = query;
    activeTab = 'index';
    show(preferredEditor);
    const result = renderIndex();
    if (result.items.length)
      return openArticle(result.items[0], [], true);
    return Promise.resolve();
  }

  function hide() {
    if (!overlay.classList.contains('visible')) return;
    overlay.classList.remove('visible'); overlay.setAttribute('aria-hidden', 'true');
    dockSeparator.classList.remove('visible');
    layoutEditor();
    const editor = currentEditor();
    if (previousEditor && previousEditor.focus) previousEditor.focus();
    else if (previousFocus && previousFocus.focus) previousFocus.focus();
    else if (editor && editor.focus) editor.focus();
  }

  tabNames.forEach(function (tab) { tabButtons[tab.id].addEventListener('click', function () { setTab(tab.id); }); });
  close.addEventListener('click', hide);
  overlay.addEventListener('keydown', function (event) { if (event.key == 'Escape' || event.keyCode == 27) { event.preventDefault(); hide(); } });
  indexInput.addEventListener('input', scheduleIndexRender);
  searchInput.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      const requestView = viewSequence;
      if (service.getState().indexing)
        searchMeta.textContent = 'Индексируется…';
      service.search(searchInput.value).then(function (result) {
        if (requestView != viewSequence) return;
        activeTerms = result.terms;
        searchMeta.textContent = 'Найдено: ' + result.total + (result.total > result.items.length ? ', показано: ' + result.items.length : '');
        searchList.setItems(result.items);
      }).catch(function (error) {
        if (requestView == viewSequence) searchMeta.textContent = error.message || String(error);
      });
    }, 150);
  });
  back.addEventListener('click', function () { if (0 < historyAt) { historyAt--; const h = history[historyAt]; openArticle(h.item, h.terms, false); updateToolbarButtons(); } });
  forward.addEventListener('click', function () { if (historyAt + 1 < history.length) { historyAt++; const h = history[historyAt]; openArticle(h.item, h.terms, false); updateToolbarButtons(); } });
  locate.addEventListener('click', locateSelected);

  let dragging = '';
  separator.addEventListener('mousedown', function (event) { dragging = 'navigation'; event.preventDefault(); });
  dockSeparator.addEventListener('mousedown', function (event) { dragging = 'dock'; event.preventDefault(); });
  document.addEventListener('mousemove', function (event) {
    if (!dragging) return;
    if (dragging == 'navigation') {
      const rect = body.getBoundingClientRect();
      applyNavigationHeight(event.clientY - rect.top);
    }
    else if (workspace) {
      const rect = workspace.getBoundingClientRect();
      applyDockWidth(rect.right - event.clientX);
      layoutEditor();
    }
  });
  document.addEventListener('mouseup', function () { dragging = ''; });
  window.addEventListener('resize', function () {
    if (!overlay.classList.contains('visible')) return;
    if (dockWidth !== null) applyDockWidth(dockWidth);
    if (navigationHeight !== null) applyNavigationHeight(navigationHeight);
    layoutEditor();
  });
  service.subscribe(renderState);
  setTab(activeTab); updateToolbarButtons();

  return {
    show: show,
    showIndex: showIndex,
    hide: hide,
    setTheme: function (theme) {
      const dark = /dark|vs-dark/i.test(theme || '');
      overlay.classList.toggle('dark', dark);
      dockSeparator.classList.toggle('dark', dark);
    },
    isVisible: function () { return overlay.classList.contains('visible'); },
    openArticle: openArticle
  };
}

export { createHelpUi, sanitizeArticle };
