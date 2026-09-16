// Тултипы параметров запроса (&Параметр) поверх механизма инлей-хинтов (specs/query-params-tooltips).
// В отличие от setInlayHints позиции не передаются: контроллер сам ищет вхождения параметров в тексте
// модели и пересчитывает набор при каждом изменении текста. Отрисовка делегируется в inlayHintsController
// редактора — набор хинтов общий (см. specs/inlay-hints). Опциональное поле tooltip (markdown-строка)
// становится всплывающей подсказкой хинта при наведении (штатный hover-виджет Monaco, см. inlay_hints.js).

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

      // Markdown-строка всплывающей подсказки при наведении (hover-провайдер inlay_hints.js);
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

// Markdown-подсказка при наведении на хинт из набора тултипов параметров запроса
// (specs/query-params-tooltips). На Monaco 0.20 нет InlayHint.tooltip (injected text
// появился позже), поэтому подсказку показывает штатный hover-виджет Monaco через
// hover-провайдера: markdown рендерит штатный рендерер с sanitize:true, command:-ссылки
// без isTrusted заблокированы, http/https — кликабельны (markdownRenderer.js).
//
// Позиция мыши над ::after-псевдоэлементом хинта разрешается Monaco в якорь хинта
// (mouseTarget.js: caretRangeFromPoint приходит в граничную колонку пустого span
// декорации), а нативный hover запускается на CONTENT_TEXT (hover.js) — провайдер
// и получает запрос с позицией якоря или якоря-1 (у хинта в середине строки виджет
// запрашивает на range.startColumn, см. provideQueryParamsHover). Гейты против ложных
// срабатываний: мышь сейчас над этим хинтом (DOM-детект в handleMouseMove — позиция
// соседнего символа тоже равна якорю) и строка/колонка запроса соседствуют с якорем.
//
// Monaco здесь намеренно берётся глобальным (window.monaco), а не через require('./monaco'):
// модуль попадает в граф entry test_query через bsl_language, и статический require Monaco
// породил бы второй экземпляр Monaco в отдельном webpack-рантайме entry — см. комментарий
// в bsl_language.js и specs/query-params-tooltips/plan.md.
let hoveredHint = null;
let hoveredModel = null;

// Запоминает хинт под мышью (только с tooltip — прочие подсказки не показывают),
// null — сброс (уход мыши, смена/очистка набора). Вызывается контроллером инлей-хинтов
// из inlay_hints.js (handleMouseMove/handleMouseLeave/setHints/clear/dispose).
export function setHoveredHint(hint, model) {

  if (hint && hint.tooltip !== undefined) {
    hoveredHint = hint;
    hoveredModel = model;
  }
  else {
    hoveredHint = null;
    hoveredModel = null;
  }

}

export function provideQueryParamsHover(model, position) {

  if (!hoveredHint || model !== hoveredModel)
    return null;

  if (position.lineNumber != hoveredHint.line)
    return null;

  // Позиция запроса — якорь хинта или колонка слева от него. У хинта в конце строки
  // Monaco запрашивает hover коллапсированным диапазоном ровно на якоре, а у хинта
  // в середине строки ::after-чип визуально занимает место между якорем и предыдущей
  // колонкой, hit-test брекетует якорь соседними колонками (mouseTarget.js) и hover-
  // виджет запрашивает провайдеров на range.startColumn = якорь - 1 (modesContentHover.js).
  // Ложные срабатывания отсекает DOM-гейт: провайдер активен, только пока мышь над
  // самим хинтом (hoveredHint, см. handleMouseMove).
  if (position.column != hoveredHint.column && position.column != hoveredHint.column - 1)
    return null;

  return {
    range: new monaco.Range(hoveredHint.line, hoveredHint.column, hoveredHint.line, hoveredHint.column),
    contents: [{ value: hoveredHint.tooltip }]
  };

}

let hoverProviderRegistered = false;

// Для hover-провайдеров языка запроса (bsl_language.js): возвращает markdown-подсказку
// тултипа параметра, если мышь сейчас над его хинтом и позиция — якорь хинта. Провайдеры
// языка по этому же условию подавляют штатный hover слова — иначе слово параметра
// (совпавшее со ссылкой в SELECT, см. getQueryModelSelectItemByWord) добавляет вторую
// строку в hover-виджет рядом с markdown-подсказкой.
export function queryParamsTooltipHover(model, position) {
  return provideQueryParamsHover(model, position);
}

// Регистрируется один раз лениво — при первом наборе тултипов параметров запроса
// (по образцу ensureClickCommand в реализации 0.55). Редакторов-вкладок много,
// провайдер один; гейт по модели/позиции отсекает чужие редакторы.
export function ensureQueryParamsHoverProvider() {

  if (hoverProviderRegistered)
    return;

  hoverProviderRegistered = true;

  const provider = { provideHover: provideQueryParamsHover };

  monaco.languages.registerHoverProvider('bsl_query', provider);
  monaco.languages.registerHoverProvider('dcs_query', provider);

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

    // Флаг queryParams: у хинтов набора включается markdown-tooltip при наведении
    // и pointer-events у хинтов с tooltip — см. inlay_hints.js.
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
