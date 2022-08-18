const MonacoWebpackPlugin = require('monaco-editor-esm-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const ScriptExtHtmlWebpackPlugin = require('script-ext-html-webpack-plugin');
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const RemovePlugin = require('remove-files-webpack-plugin');
const webpack = require('webpack');
const path = require('path');

module.exports = (env, args) => {

  return {
    context: path.resolve(__dirname, 'src'),
    entry: Object.assign(
      {
        console: './editor'
      },
      args.mode == 'development' ?
      {
        test: './test',
        test_query: './test_query'
      }
      : {}
    ),
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js'
    },
    resolveLoader: {
      alias: {
        'blob-url-loader': require.resolve('./tools/loaders/blobUrl'),
        'compile-loader': require.resolve('./tools/loaders/compile'),
      }
    },
    devtool: args.mode == 'development' ? "inline-source-map" : false,
    module: {
      rules: [
        args.customOptions ?
          {
            test: /src[\\/]editor\.js$/,
            loader: 'string-replace-loader',
            options: {
              search: 'customOptions: true',
              replace: args.customOptions + ', customOptions: true'
            }
          } : {},
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
            multiple: [{
              search: 'var $ = dom.$;',
              replace: "import { escapeRegExpCharacters } from '../../../base/common/strings.js'; var $ = dom.$;"
            },
            {
              search: /var idx = signature\.label\.[\s\S.]*];/im,
              replace: 'if (!param.label.length) { return [0, 0]; } else { var regex = new RegExp("(\\\\W|^)${escapeRegExpCharacters(param.label)}(?=\\\\W|$)", "g"); regex.test(signature.label); var idx = regex.lastIndex - param.label.length; return idx >= 0 ? [idx, regex.lastIndex] : [0, 0]; }'
            }]

          }
        },
        {
          test: /node_modules[\\/]monaco-editor[\\/].+parameterHints\.js$/,
          loader: 'string-replace-loader',
          options: {
            multiple: [{
              search: '[512 /* Alt */ | 16 /* UpArrow */',
              replace: '[2048 /* CtrlCmd */ | 16 /* UpArrow */'
            },
            {
              search: '[512 /* Alt */ | 18 /* DownArrow */',
              replace: '[2048 /* CtrlCmd */ | 18 /* DownArrow */'
            }]

          }
        },
        {
          test: /node_modules[\\/]monaco-editor-nls[\\/].+\.js$/,
          loader: 'string-replace-loader',
          options: {
            multiple: [{
              search: 'let CURRENT_LOCALE_DATA = null;',
              replace: 'var CURRENT_LOCALE_DATA = null;'
            }]
          }
        },
        {
          test: /node_modules[\\/]monaco-editor[\\/]esm[\\/].+\.js$/,
          loader: 'string-replace-loader',
          options: {
            multiple: [{
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
          test: /\.ttf$/,
          use: 'base64-inline-loader?limit=1000&name=[name].[ext]'
        },
        {
          test: /\.js/,
          enforce: 'pre',
          include: /node_modules[\\\/]monaco-editor[\\\/]esm/,
          use: MonacoWebpackPlugin.loader
        },
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              cacheDirectory: true,
              presets: ['@babel/env']
            }
          }
        },
        {
          test: /\.(png|jpg|gif)$/i,
          use: [
            {
              loader: 'url-loader',
              options: {
                limit: 8192,
              },
            },
          ],
        },
        {
          test: /\.css$/,
          use: [
            'style-loader',
            'css-loader',
            'postcss-loader'
          ]
        },
      ]
    },
    optimization: {
      minimize: args.mode === 'production',
      splitChunks: {
        chunks: 'all'
      }
    },
    plugins: [
      new MonacoWebpackPlugin({
        languages: ['xml'],
      }),
      args.mode == 'production' ? new webpack.optimize.LimitChunkCountPlugin({
        maxChunks: 10
      }) : false,
      new CleanWebpackPlugin(),
      new HtmlWebpackPlugin({
        inject: 'body',
        chunks: ['console'],
        template: './index.html',
        filename: 'index.html',
        cache: false
      }),
      args.mode == 'production' ? new ScriptExtHtmlWebpackPlugin({
        inline: ['console.js']
      }) : false,
      args.mode == 'development' ? new HtmlWebpackPlugin({
        inject: 'body',
        chunks: ['console', 'test'],
        template: './test.html',
        filename: 'test',
        cache: false
      }) : false,
      args.mode == 'development' ? new HtmlWebpackPlugin({
        inject: 'body',
        chunks: ['console', 'test_query'],
        template: './test_query.html',
        filename: 'test_query',
        cache: false
      }) : false,
      args.mode == 'production' ? new RemovePlugin({
        after: {
          include: [
            './dist/test.js',
            './dist/test_query.js',
            './dist/editor.worker.js'
          ]
        }
      }) : false
    ].filter(Boolean),
    devServer: {
      port: 9000,
      open: true
    }
  }
};