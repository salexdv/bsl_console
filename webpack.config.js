// ── Сборка спайка Monaco 0.55.1 под «Поле HTML документа» 1С (webpack 5) ──────────
// Рецепт перенесён из Pr-Mex/VAEditor (BSD-3-Clause, (c) 2020 Pautov Leonid) — единственный
// проверенный в бою Monaco 0.55.1 в поле 1С (Win/Linux/mac, платформа 8.3.14+). Отличия от
// VAEditor: наш код — JS+babel (не TS+ts-loader); ES-floor строже (es-check es2015, не es2019).
//
// Три слоя совместимости со старым WebKit: транспиляция (esbuild es2015 на monaco + babel на
// нашем коде) + рантайм-полифилы (src/polyfills.js) + строковые патчи monaco (replace-strings
// с assertApplied). Детали — specs/monaco-0.55/analysis.md §2.

const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const replaceStrings = require('./tools/loaders/replaceStrings'); // counts + assertApplied

module.exports = (env, argv) => {
  const isProd = argv.mode === 'production';
  // Тест-сборка (--env test): mocha-страницы test/test_query для headless-гейта Этапа 3c.
  // Каждый тест-entry = [editor.js (window.init + провайдеры), сами кейсы]; mocha/chai — из
  // node_modules скрипт-тегами в шаблоне (НЕ бандлятся — избегаем mocha-в-бандлере). Обычная
  // сборка — только console.
  const isTest = !!(env && env.test);

  return {
    context: path.resolve(__dirname, 'src'),
    entry: isTest ? {
      test: ['./editor', './test'],
      test_query: ['./editor', './test_query']
    } : {
      // Реальный редактор bsl_console (Этап 3+). Обёрнут теми же слоями совместимости, что и
      // смоук-каркас: polyfills → monaco-environment → product-service → expose-monaco.
      // boot.js остаётся в дереве как ручной смоук-энтрипоинт Этапов 1-2, но в entry не входит.
      console: './editor'
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      globalObject: 'self', // иначе monaco зовёт window в worker-контексте
      clean: true
    },
    resolve: {
      extensions: ['.js', '.json', '.css'],
      alias: {
        // 0.55: package "exports" мапит require→min/vs/editor/editor.main.js (AMD, webpack
        // не парсит) и import→esm. Алиасим bare-импорт на УЗКУЮ ESM-точку edcore.main: ядро
        // редактора + ВСЕ editor-контрибы (suggest/find/folding/hover/parameterHints/format/…),
        // но БЕЗ ~80 basic-languages и без языковых сервисов css/html/json/typescript — мы
        // регистрируем bsl/bsl_query/dcs_query сами. Экономит несколько МБ (один ts-сервис —
        // ~3-4 МБ) и время старта в поле 1С. `$` — точное совпадение, deep-import не задет.
        'monaco-editor$': path.resolve(__dirname, 'node_modules/monaco-editor/esm/vs/editor/edcore.main.js')
      }
    },
    resolveLoader: {
      alias: {
        'blob-url-loader': require.resolve('./tools/loaders/blobUrl'),
        'compile-loader': require.resolve('./tools/loaders/compile'),
        'monaco-nls': require.resolve('./tools/loaders/monacoNls'),
        'replace-strings': require.resolve('./tools/loaders/replaceStrings')
      }
    },
    devtool: isProd ? false : 'inline-source-map',
    module: {
      // Воркеры — только через наши лоадеры (blobUrl+compile), не через нативный
      // webpack5-парсинг new Worker(new URL(...)).
      parser: { javascript: { worker: false } },
      rules: [
        {
          // Патчи monaco + транспиляция в es2015. Порядок use — справа налево:
          // replace-strings (на сыром коде, до сворачивания констант и срезки комментов)
          // → esbuild (финальная транспиляция ?./class fields/static blocks).
          test: /node_modules[\\/]monaco-editor[\\/]esm[\\/].+\.js$/,
          use: [
            {
              loader: 'esbuild-loader',
              options: { target: 'es2015' }
            },
            {
              loader: 'replace-strings',
              options: {
                replacements: [
                  // (1) suggestController: Ctrl+I у inline-suggest снимаем (secondary-массив → null).
                  //     0.52.2: Windows-ветки suggestController.js (×3, стр.665/829/849); mac-ветки НЕ
                  //     трогаем (в 1С/Windows mac-набор не активируется). Литерал совпадает и в 0.52.2,
                  //     и в 0.55 (VAEditor PR #185).
                  { search: 'secondary: [2048 /* KeyMod.CtrlCmd */ | 39 /* KeyCode.KeyI */],', replace: 'secondary: null,' },
                  // (2) RegExp-флаг 'd' (hasIndices, Safari 15) → «Invalid flags» в WebKit 1С. В 0.52.2
                  //     findSectionHeaders.js — top-level `new RegExp('\\bMARK:\\s*(.*)$', 'd')` бросает
                  //     ПРИ ЗАГРУЗКЕ модуля → мёртв весь бандл. Срезаем флаг. Глобальную обёртку RegExp
                  //     не делаем — ломает именованные группы (?<name>) в 1С.
                  //     (0.55-паттерны — new RegExp(inputRegex,'d') и lookbehind (?<=['"\s]) color-computer —
                  //     в 0.52.2 отсутствуют; те патчи и rAF→setTimeout-митигация убраны при переезде
                  //     0.55→0.52.2, т.к. пустой рендер 0.55 был 0.53+ регрессией, см. VAEditor PR #185.)
                  { search: "(.*)$', 'd'", replace: "(.*)$', ''" },
                  // (3) extractKeyCode (keyboardEvent.js): WebKit поля 1С на macOS (WebView
                  //     605.1.15 без токена Safari) заполняет charCode уже на KEYDOWN (стрелки —
                  //     Apple PUA 63232-63235, BS=8, Enter=13, буквы — код символа раскладки).
                  //     Ветка `if (e.charCode)` задумана под keypress, но срабатывает и на такой
                  //     keydown: String.fromCharCode(PUA/контрол-чар) не находится в таблице имён
                  //     → KeyCode.Unknown → keybinding-слой МОЛЧА игнорирует все клавиши-команды
                  //     (стрелки/BS/Del/Enter/навигация suggest/хоткеи кириллической раскладки);
                  //     живым остаётся только input-путь textarea (печать). Ограничиваем ветку
                  //     настоящими keypress. Полевой лог-доказательство: kbdiag 2026-07-16 на
                  //     0.55-ветке, `MONACO kc=0(Unknown) | raw kc=38 cc=63232` на каждой стрелке;
                  //     код extractKeyCode идентичен в 0.52.2 и 0.55.1.
                  { search: 'if (e.charCode) {', replace: "if (e.charCode && e.type === 'keypress') {" }
                ]
              }
            }
          ]
        },
        {
          // Наш код — babel @babel/preset-env (browserslist из package.json → safari>=11).
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              cacheDirectory: true,
              presets: ['@babel/preset-env']
            }
          }
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader', 'postcss-loader']
        },
        {
          // Шрифты (codicon.ttf), svg-иконки monaco и PNG-иконки дерева переменных
          // (require.context('./tree/icons') в editor.js, resolveTreeIcon) — инлайн data:
          // (ноль внешних файлов; важно для single-file и предупреждения безопасности поля 1С).
          test: /\.(svg|ttf|png|gif)$/,
          type: 'asset/inline'
        }
      ]
    },
    plugins: [
      // Валим сборку, если строковый патч monaco не наложился (дрейф версии monaco).
      {
        apply(compiler) {
          compiler.hooks.afterEmit.tapAsync('AssertMonacoPatches', (compilation, cb) => {
            try { replaceStrings.assertApplied(); cb(); } catch (e) { cb(e); }
          });
        }
      },
      // Один main-чанк console.js в проде (folдим возможные monaco dynamic-import async-чанки;
      // нужно для es-check dist/*.js и последующей single-file-упаковки). Воркер — blob (не чанк).
      (isProd && !isTest) ? new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }) : false,
      // Тест-сборка: две mocha-страницы (BSL и запросы), каждая инжектит свой чанк.
      isTest ? new HtmlWebpackPlugin({ inject: 'body', chunks: ['test'], template: './test.html', filename: 'test.html', cache: false }) : false,
      isTest ? new HtmlWebpackPlugin({ inject: 'body', chunks: ['test_query'], template: './test_query.html', filename: 'test_query.html', cache: false }) : false,
      isTest ? false : new HtmlWebpackPlugin({
        inject: 'body',
        chunks: ['console'],
        template: './index.html',
        filename: 'index.html',
        cache: false
      })
    ].filter(Boolean),
    optimization: {
      minimize: isProd,
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            // Старый WebKit 1С не понимает ES2020: иначе terser генерит `a ?? b` из
            // `null==a?b:a` и раскавычивает не-ASCII ключи (`℘:"wp"`). ecma 2015 +
            // закавыченные ASCII-ключи = вывод как в webpack 4.
            ecma: 2015,
            format: { quote_keys: true, ascii_only: true }
          }
        })
      ],
      splitChunks: false
    },
    devServer: {
      port: 9000,
      open: true,
      hot: false
    }
  };
};
