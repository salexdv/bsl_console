import { normalizePath } from './hbk-reader';

const GROUP_TITLES = {
  properties: 'Свойства',
  methods: 'Методы',
  ctors: 'Конструкторы',
  events: 'События',
  fields: 'Поля',
  params: 'Параметры',
  formparams: 'Параметры формы'
};

function groupFromPath(path) {
  const parts = normalizePath(path).split('/');
  for (let i = parts.length - 1; i >= 0; i--) {
    const key = parts[i].toLowerCase();
    if (GROUP_TITLES[key]) return key;
  }
  return '';
}

function inferGroupTitle(node) {
  if (!node || node.title || !node.children || !node.children.length) return '';
  const groups = {};
  node.children.forEach(function (child) {
    if (!child.path) return;
    const group = groupFromPath(child.path);
    if (group) groups[group] = true;
  });
  const keys = Object.keys(groups);
  return keys.length == 1 ? GROUP_TITLES[keys[0]] : '';
}

function compactContext(ancestors, node) {
  let groupAt = -1;
  for (let i = ancestors.length - 1; i >= 0; i--) {
    if (ancestors[i].systemGroup) { groupAt = i; break; }
  }
  let owner = '';
  const ownerStart = groupAt >= 0 ? groupAt - 1 : ancestors.length - 1;
  for (let i = ownerStart; i >= 0; i--) {
    if (ancestors[i].title && !ancestors[i].systemGroup) {
      owner = ancestors[i].title;
      break;
    }
  }
  const parts = [];
  if (owner) parts.push(owner);
  if (groupAt >= 0) parts.push(ancestors[groupAt].title);
  if (node.title) parts.push(node.title);
  return parts.join('/');
}

function decorateContextNavigation(nodes, pages, packageKind) {
  const kind = packageKind || 'context';
  function visit(node, ancestors) {
    node.path = normalizePath(node.path);
    node.tocId = node.tocId || node.id;
    const inferred = inferGroupTitle(node);
    if (inferred) {
      node.title = inferred;
      node.systemGroup = true;
    }
    if (node.path) {
      const page = pages[kind + ':' + node.path];
      if (page) {
        node.pageId = page.id;
        node.id = page.id;
        node.title = node.tocTitle
          || (page.titleResolved ? page.title : '')
          || node.tocAlias || node.title || page.title;
        page.title = node.title || page.title;
        page.alias = node.alias || '';
        page.context = compactContext(ancestors, node);
        node.context = page.context;
      }
    }
    const next = ancestors.concat([node]);
    (node.children || []).forEach(function (child) { visit(child, next); });
  }
  (nodes || []).forEach(function (node) { visit(node, []); });
  return nodes;
}

function findNavigationNode(nodes, tocId) {
  const list = nodes || [];
  for (let index = 0; index < list.length; index++) {
    const node = list[index];
    if (node.tocId == tocId || node.id == tocId)
      return node;
    const nested = findNavigationNode(node.children, tocId);
    if (nested) return nested;
  }
  return null;
}

function findPath(nodes, predicate, ancestors) {
  const list = nodes || [];
  const path = ancestors || [];
  for (let index = 0; index < list.length; index++) {
    const node = list[index];
    path.push(node);
    if (predicate(node)) return path.slice();
    const nested = findPath(node.children, predicate, path);
    if (nested) return nested;
    path.pop();
  }
  return null;
}

/** Возвращает путь от корня оглавления к статье: сначала по page id, затем по kind + path. */
function findNavigationPath(nodes, item) {
  if (!item || !item.kind) return null;
  if (item.id) {
    const byId = findPath(nodes, function (node) {
      return node.kind == item.kind && (node.id == item.id || node.pageId == item.id);
    });
    if (byId) return byId;
  }
  const path = normalizePath(item.path);
  if (!path) return null;
  return findPath(nodes, function (node) {
    return node.kind == item.kind && normalizePath(node.path) == path;
  });
}

function resolvePage(pages, kind, path, id) {
  if (!pages) return null;
  if (id && pages[id]) return pages[id];
  return pages[kind + ':' + normalizePath(path)] || null;
}

export {
  GROUP_TITLES, inferGroupTitle, compactContext, decorateContextNavigation,
  findNavigationNode, findNavigationPath, resolvePage
};
