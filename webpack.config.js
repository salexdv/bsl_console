const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const RemovePlugin = require('remove-files-webpack-plugin');
const webpack = require('webpack');
const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const nls = require.resolve('./src/nls.ru');

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
          test: /node_modules[\\/]monaco-editor[\\/].+parameterHints\.js$/,
          loader: 'string-replace-loader',
          options: {
            multiple: [{
              search: '[512 /* KeyMod.Alt */ | 16 /* KeyCode.UpArrow */',
              replace: '[2048 /* KeyMod.CtrlCmd */ | 16 /* KeyCode.UpArrow */'
            },
            {
              search: '[512 /* KeyMod.Alt */ | 18 /* KeyCode.DownArrow */',
              replace: '[2048 /* KeyMod.CtrlCmd */ | 18 /* KeyCode.DownArrow */'
            }]

          }
        },
        {
          test: /\.js$/,
          exclude: /node_modules\/(?!monaco-editor)/,
          use: {
            loader: 'babel-loader',
            options: {
              cacheDirectory: true,
              presets: ["@babel/preset-env"]
            }
          }
        },
        {
          test: /\.(png|jpg|gif|svg)$/i,
          type: 'asset/resource'
        },
        {
          test: /\.css$/,
          use: [
            'style-loader',
            'css-loader',
            'postcss-loader'
          ]
        },
        {
          test: /\.wasm$/,
          type: "asset/inline",
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
      env.lang == 'ru' ? new webpack.NormalModuleReplacementPlugin(/\/(vscode-)?nls\.js$/, function (resource) {
        resource.request = nls
        resource.resource = nls
      }) : false,
      args.mode == 'development' ? new CopyWebpackPlugin({
        patterns: [
          { from: path.join(__dirname, 'node_modules/mocha/mocha.js'), to: 'mocha.js' },
          { from: path.join(__dirname, 'node_modules/mocha/mocha.css'), to: 'mocha.css' },
          { from: path.join(__dirname, 'node_modules/chai/chai.js'), to: 'chai.js' },
        ]
      }) : false,
      new MonacoWebpackPlugin({
        languages: ['xml'],
      }),
      new CopyWebpackPlugin({
        patterns: [
          { from: './tree/icons', to: 'tree/icons' }
        ]
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