// Тултипы параметров запроса (&Параметр) поверх механизма инлей-хинтов (specs/query-params-tooltips).
// В отличие от setInlayHints позиции не передаются: контроллер сам ищет вхождения параметров в тексте
// модели и пересчитывает набор при каждом изменении текста. Отрисовка делегируется в inlayHintsController
// редактора — набор хинтов общий (см. specs/inlay-hints). Опциональное поле tooltip (markdown-строка)
// становится всплывающей подсказкой хинта при наведении (без нативного окна «Выполнить команду»).

// Символы имени параметра запроса после первого знака (первый — буква или подчёркивание).
const QUERY_PARAM_NAME_TRAILING = 'A-Za-zА-ЯЁа-яё0-9_';

// Экранирует строку для вставки в regex-источник.
function escapeRegExp(text) {

  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

}

// Разбирает вход setQueryParamsTooltips (JSON-строка или массив) и нормализует элементы.
// Дубликаты имён параметров: побеждает последний элемент. Возвращает { params } либо { error } —
// без выбросов.
function parseQueryParams(value) {

  try {

    let parsed = typeof value == 'string' ? JSON.parse(value) : value;

    if (!Array.isArray(parsed))
      return { error: 'Ожидается массив описаний параметров' };

    let byName = new Map();

    for (let i = 0; i < parsed.length; i++) {

      let item = parsed[i];

      if (!item || typeof item != 'object')
        continue;

      let param = item.param == null ? '' : String(item.param);
      let label = item.label == null ? '' : String(item.label);

      if (!param.length || !label.length)
        continue;

      // Произвольное значение для события клика; отсутствующий или null — тултип не кликабельный.
      let tooltipValue = item.value === undefined || item.value === null
        ? undefined
        : item.value;

      // Markdown-строка всплывающей подсказки при наведении (InlayHint.tooltip Monaco);
      // отсутствующая или null — подсказки нет.
      let tooltip = item.tooltip === undefined || item.tooltip === null
        ? undefined
        : String(item.tooltip);

      byName.set(param, {
        param: param,
        label: label,
        value: tooltipValue,
        tooltip: tooltip
      });

    }

    return { params: Array.from(byName.values()) };

  }
  catch (e) {
    return { error: e.message };
  }

}

// Строит regex-источник для поиска всех вхождений заданных имён параметров.
// Граница имени обязательна: &Парам не должен совпадать внутри &Параметр.
// Имя параметра — в первой группе захвата (используется при поиске с captureMatches).
function buildParamsPattern(params) {

  let names = params
    .map(function (item) { return escapeRegExp(item.param); })
    .sort(function (a, b) { return b.length - a.length; })
    .join('|');

  return '&(' + names + ')(?![' + QUERY_PARAM_NAME_TRAILING + '])';

}

export function createQueryParamsTooltipsController(codeEditor) {

  let currentParams = [];

  // Пересчитывает вхождения параметров и заменяет набор инлей-хинтов.
  function refresh() {

    if (!currentParams.length)
      return true;

    if (!codeEditor.inlayHintsController)
      return false;

    let model = codeEditor.getModel();
    if (!model)
      return false;

    let hints = [];
    let byName = new Map();

    currentParams.forEach(function (item) {
      byName.set(item.param, item);
    });

    let matches = model.findMatches(buildParamsPattern(currentParams), false, true, false, null, true);

    for (let i = 0; i < matches.length; i++) {

      let item = byName.get(matches[i].matches[1]);

      if (!item)
        continue;

      // Колонка хинта — сразу после вхождения: endColumn вхождения "&Имя" — колонка последнего
      // символа + 1, семантика afterContentClassName согласована с setInlayHints
      // («для конца строки — длина строки + 1»).
      hints.push({
        line: matches[i].range.startLineNumber,
        column: matches[i].range.endColumn,
        text: item.label,
        id: item.param,
        event_params: item.value,
        tooltip: item.tooltip
      });

    }

    // Флаг queryParams: хинты набора рендерятся без штатной command-ссылки (нативный hover
    // «Выполнить команду» выключен), с markdown-tooltip и pointer-курсором — см. inlay_hints.js.
    return codeEditor.inlayHintsController.setHints(hints, { queryParams: true });

  }

  // Забывает набор параметров, не трогая отрисованные хинты (рендер уже заменён/очищен снаружи).
  function forget() {
    currentParams = [];
  }

  // Забывает набор и, если он был задан, убирает отрисованные инлей-хинты.
  function clear() {

    if (!currentParams.length)
      return false;

    forget();

    if (codeEditor.inlayHintsController)
      codeEditor.inlayHintsController.clear();

    return true;

  }

  return {
    setParams: function (value) {

      let parsed = parseQueryParams(value);

      if (parsed.error)
        return { errorDescription: parsed.error };

      currentParams = parsed.params;

      if (!currentParams.length) {
        if (codeEditor.inlayHintsController)
          codeEditor.inlayHintsController.clear();
        return true;
      }

      return refresh() === true ? true : { errorDescription: 'Не удалось отрисовать тултипы параметров' };

    },
    refresh: refresh,
    forget: forget,
    clear: clear,
    getState: function () {
      return {
        paramsCount: currentParams.length
      };
    }
  };

}

export { parseQueryParams, buildParamsPattern };
