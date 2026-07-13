// Inline-замена string-replace-loader. Патчит исходники monaco под совместимость
// с рантаймом старого WebKit «Поля HTML документа» 1С (правила — в webpack.config.js).
//
// Self-check: monaco дрейфует между релизами. Если search-паттерн исчез,
// split/join тихо ничего не делает → патч НЕ накладывается, а ломается только в
// реальной 1С (браузерный/CI-прогон зелёный, баг невидим). Копим число замен по
// каждому паттерну за всю сборку; assertApplied() (зовётся плагином на afterEmit)
// валит сборку, если какой-то паттерн ни разу не совпал.
//
// Механика перенесена из Pr-Mex/VAEditor (BSD-3-Clause, (c) 2020 Pautov Leonid),
// tools/loaders/replaceStrings.js — проверенный в поле 1С рецепт Monaco 0.55.1.

const counts = Object.create(null); // search -> суммарно замен за сборку

module.exports = function (source) {
  const { replacements } = this.getOptions() || {};
  if (!replacements) return source;
  let out = source;
  for (const { search, replace } of replacements) {
    const parts = out.split(search);
    if (!(search in counts)) counts[search] = 0;
    counts[search] += parts.length - 1;
    out = parts.join(replace);
  }
  return out;
};

module.exports.counts = counts;

// Бросает, если какой-либо паттерн за сборку не совпал ни разу (дрейф monaco).
module.exports.assertApplied = function () {
  const missing = Object.keys(counts).filter(function (s) { return counts[s] === 0; });
  if (missing.length) {
    throw new Error(
      'replace-strings: обязательные патчи monaco НЕ наложены (дрейф версии monaco?):\n' +
      missing.map(function (s) { return '  • ' + s; }).join('\n') +
      '\nБез них бандл ломается в WebKit 1С. Обновите паттерны под текущую версию monaco.'
    );
  }
};
