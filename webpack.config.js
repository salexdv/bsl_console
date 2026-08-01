const HtmlWebpackPlugin = require('html-webpack-plugin');
const HtmlInlineScriptPlugin = require('html-inline-script-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const { EsbuildPlugin } = require('esbuild-loader');
const webpack = require('webpack');
const path = require('path');

const monacoNls = require.resolve('monaco-editor-nls');

module.exports = (env = {}, args = {}) => {
  const single = Boolean(env.single || env === 'single');
  const pack = Boolean(env.pack);
  const production = args.mode === 'production';

  const rules = [
    args.customOptions && {
      test: /src[\\/]editor\.js$/,
      loader: 'string-replace-loader',
      options: {
        search: 'customOptions: true',
        replace: args.customOptions + ', customOptions: true'
      }
    },
    {
      test: /node_modules[\\/]monaco-editor[\\/].+actions\.js$/,
      loader: 'string-replace-loader',
      options: {
        search: '(this._menuItems.get(id) || []).slice(0);',
        replace: '(this._menuItems.get(id) || []).slice(0);result=result.filter(function(item){return isIMenuItem(item)&&item.command.id.indexOf("_bsl")>=0;});'
      }
    },
    {
      test: /node_modules[\\/]monaco-editor[\\/].+standaloneEnums\.js$/,
      loader: 'string-replace-loader',
      options: {
        search: '108] = "NUMPAD_DIVIDE"',
        replace: '108] = "/"'
      }
    },
    {
      test: /node_modules[\\/]monaco-editor[\\/].+parameterHintsWidget\.js$/,
      loader: 'string-replace-loader',
      options: {
        multiple: [
          {
            search: 'var $ = dom.$;',
            replace: "import { escapeRegExpCharacters } from '../../../base/common/strings.js'; var $ = dom.$;"
          },
          {
            search: /var idx = signature\.label\.[\s\S.]*];/im,
            replace: 'if (!param.label.length) { return [0, 0]; } else { var regex = new RegExp("(\\\\p{L}\\\\p{N}_]|^)${escapeRegExpCharacters(param.label)}(?=\\\\p{L}\\\\p{N}_]|$)", "g"); regex.test(signature.label); var idx = regex.lastIndex - param.label.length; return idx >= 0 ? [idx, regex.lastIndex] : [0, 0]; }'
          }
        ]
      }
    },
    {
      test: /node_modules[\\/]monaco-editor[\\/].+parameterHints\.js$/,
      loader: 'string-replace-loader',
      options: {
        multiple: [
          {
            search: '[512 /* Alt */ | 16 /* UpArrow */',
            replace: '[2048 /* CtrlCmd */ | 16 /* UpArrow */'
          },
          {
            search: '[512 /* Alt */ | 18 /* DownArrow */',
            replace: '[2048 /* CtrlCmd */ | 18 /* DownArrow */'
          }
        ]
      }
    },
    {
      test: /node_modules[\\/]monaco-editor-nls[\\/].+\.js$/,
      loader: 'string-replace-loader',
      options: {
        multiple: [
          {
            search: 'let CURRENT_LOCALE_DATA = null;',
            replace: 'var CURRENT_LOCALE_DATA = null;'
          }
        ]
      }
    },
    {
      test: /node_modules[\\/]monaco-editor[\\/]esm[\\/].+\.js$/,
      loader: 'string-replace-loader',
      options: {
        multiple: [
          {
            search: 'let __insane_func;',
            replace: 'var __insane_func;'
          },
          {
            search: '0x2192',
            replace: '0xBB'
          }
        ]
      }
    },
    {
      test: /node_modules[\\/]monaco-editor[\\/]esm[\\/].+\.js$/,
      enforce: 'pre',
      loader: path.resolve(__dirname, 'tools/loaders/monacoNls.js')
    },
    {
      test: /\.ttf$/i,
      type: 'asset/inline'
    },
    {
      test: /\.js$/,
      exclude: /node_modules/,
      loader: 'esbuild-loader',
      options: {
        target: 'es2015',
        charset: 'utf8'
      }
    },
    {
      test: /\.(png|jpg|gif|svg)$/i,
      type: 'asset',
      parser: {
        dataUrlCondition: {
          maxSize: single ? 10 * 1024 * 1024 : 8192
        }
      },
      generator: {
        filename: '[name][ext]'
      }
    },
    {
      test: /\.css$/i,
      use: [
        'style-loader',
        'css-loader',
        'postcss-loader'
      ]
    }
  ].filter(Boolean);

  return {
    context: path.resolve(__dirname, 'src'),
    target: ['web', 'es2015'],
    entry: Object.assign(
      {
        console: './editor'
      },
      production
        ? {}
        : {
            test: './test_bootstrap',
            test_query: './test_query_bootstrap',
            test_query_model: './test_query_model'
          }
    ),
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      assetModuleFilename: '[name][ext]',
      clean: true
    },
    devtool: production ? false : 'inline-source-map',
    module: {
      // Mocha поставляет готовый browser UMD bundle. Его динамический require
      // используется только для подключаемых reporter-ов и не должен анализироваться Webpack.
      noParse: /node_modules[\\/]mocha[\\/]mocha\.js$/,
      rules
    },
    optimization: {
      minimize: production,
      minimizer: [
        new EsbuildPlugin({
          target: 'es2015',
          charset: 'utf8',
          legalComments: 'none'
        })
      ],
      splitChunks: single
        ? false
        : {
            chunks: 'all'
          }
    },
    plugins: [
      new webpack.NormalModuleReplacementPlugin(
        /[\\/](vscode-)?nls\.js$/,
        resource => {
          resource.request = monacoNls;
          resource.resource = monacoNls;
        }
      ),
      single
        ? false
        : new CopyWebpackPlugin({
            patterns: [
              { from: './tree/icons', to: 'tree/icons' }
            ]
          }),
      production || single
        ? new webpack.optimize.LimitChunkCountPlugin({
            maxChunks: single ? 1 : 10
          })
        : false,
      new HtmlWebpackPlugin({
        inject: 'body',
        chunks: ['console'],
        template: './index.html',
        filename: 'index.html',
        cache: false
      }),
      production && !pack
        ? new HtmlInlineScriptPlugin({
            scriptMatchPattern: [/console\.js$/]
          })
        : false,
      production
        ? false
        : new HtmlWebpackPlugin({
            inject: 'body',
            chunks: ['console', 'test'],
            template: './test.html',
            filename: 'test',
            cache: false
          }),
      production
        ? false
        : new HtmlWebpackPlugin({
            inject: 'body',
            chunks: ['console', 'test_query'],
            template: './test_query.html',
            filename: 'test_query',
            cache: false
          }),
      production
        ? false
        : new HtmlWebpackPlugin({
            inject: 'body',
            chunks: ['console', 'test_query_model'],
            template: './test_query_model.html',
            filename: 'test_query_model',
            cache: false
          })
    ].filter(Boolean),
    devServer: {
      port: 9001,
      open: true
    }
  };
};
