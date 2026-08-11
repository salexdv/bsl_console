function decodePart(value) {
  try { return decodeURIComponent(value); }
  catch (ignore) { return null; }
}

function splitReference(value) {
  let path = value;
  let anchor = '';
  const hash = path.indexOf('#');
  if (0 <= hash) {
    anchor = path.slice(hash + 1);
    path = path.slice(0, hash);
  }
  const query = path.indexOf('?');
  if (0 <= query)
    path = path.slice(0, query);
  path = decodePart(path);
  anchor = decodePart(anchor);
  if (path === null || anchor === null)
    return null;
  return { path: path, anchor: anchor };
}

function normalizeInternalPath(path, basePath) {
  path = String(path || '').replace(/\\/g, '/');
  basePath = String(basePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (/[\u0000-\u001f\u007f]/.test(path) || /^\/\//.test(path))
    return null;
  const absolute = path.charAt(0) == '/';
  const parts = absolute ? [] : basePath.split('/').slice(0, -1).filter(function (part) { return part; });
  const source = path.replace(/^\/+/, '').split('/');
  for (let i = 0; i < source.length; i++) {
    const part = source[i];
    if (!part || part == '.') continue;
    if (part == '..') {
      if (!parts.length) return null;
      parts.pop();
    }
    else {
      parts.push(part);
    }
  }
  return parts.join('/');
}

function resolveHelpLink(href, current) {
  const value = String(href || '').trim();
  if (!value || /^[\/\\]{2}/.test(value))
    return null;
  if (/^https?:\/\//i.test(value))
    return { type: 'external', href: value };

  const v8 = /^v8help:\/\/(SyntaxHelperContext|SyntaxHelperLanguage)\/(.*)$/i.exec(value);
  if (v8) {
    const reference = splitReference(v8[2]);
    if (!reference) return null;
    const path = normalizeInternalPath(reference.path, '');
    if (!path) return null;
    return {
      type: 'internal',
      kind: v8[1].toLowerCase() == 'syntaxhelpercontext' ? 'context' : 'language',
      path: path,
      anchor: reference.anchor
    };
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || !current || !current.kind || !current.path)
    return null;
  const reference = splitReference(value);
  if (!reference) return null;
  const path = reference.path
    ? normalizeInternalPath(reference.path, current.path)
    : normalizeInternalPath(current.path, '');
  if (!path) return null;
  return { type: 'internal', kind: current.kind, path: path, anchor: reference.anchor };
}

export { normalizeInternalPath, resolveHelpLink };
