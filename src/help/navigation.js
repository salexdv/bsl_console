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

function decorateContextNavigation(nodes, pages) {
  function visit(node, ancestors) {
    node.path = normalizePath(node.path);
    node.tocId = node.tocId || node.id;
    const inferred = inferGroupTitle(node);
    if (inferred) {
      node.title = inferred;
      node.systemGroup = true;
    }
    if (node.path) {
      const page = pages['context:' + node.path];
      if (page) {
        node.pageId = page.id;
        node.id = page.id;
        node.title = node.title || page.title;
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

function resolvePage(pages, kind, path, id) {
  if (!pages) return null;
  if (id && pages[id]) return pages[id];
  return pages[kind + ':' + normalizePath(path)] || null;
}

export { GROUP_TITLES, inferGroupTitle, compactContext, decorateContextNavigation, resolvePage };
