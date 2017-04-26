try {
  var path = require('path');
  var os = require('os');
  var cordovaNodeModules = path.join(os.homedir(), '.cordova', 'node_modules');

  var webpack = require(path.join(cordovaNodeModules, 'webpack'));
  var HtmlWebpackPlugin = require(path.join(cordovaNodeModules, 'html-webpack-plugin'));
  var ExtractTextPlugin = require(path.join(cordovaNodeModules, 'extract-text-webpack-plugin'));
  var CopyWebpackPlugin = require(path.join(cordovaNodeModules, 'copy-webpack-plugin'));
  var ProgressBarPlugin = require(path.join(cordovaNodeModules, 'progress-bar-webpack-plugin'));

  var postcssCssnext = require(path.join(cordovaNodeModules, 'postcss-cssnext'));
  var postcssUrl = require(path.join(cordovaNodeModules, 'postcss-url'));
  var postcssImport = require(path.join(cordovaNodeModules, 'postcss-smart-import'));
  var projectDirectory = process.cwd();
} catch (e) {
  throw new Error('Missing Webpack Build Dependencies.' + e);
}

module.exports = {
  entry: {
    'polyfills': './src/polyfills',
    'vendor': './src/vendor',
    'app': './src/main'
  },

  output: {
    path: path.join(projectDirectory, 'www'),
    filename: '[name].js',
    chunkFilename: '[id].chunk.js'
  },

  resolve: {
    modules: [
      "node_modules",
      path.join(projectDirectory, 'src'),
      path.join(projectDirectory, 'node_modules'),
      path.resolve(cordovaNodeModules)
    ],
    extensions: ['.ts', '.js', '.json', '.css', '.html']
  },

  module: {
    loaders: [{
      test: /\.ts$/,
      loader: 'ts-loader',
      include: path.join(projectDirectory, 'src'),

      options: {
        compilerOptions: {
          sourceMap: false,
          sourceRoot: './src',
          inlineSourceMap: true
        },
        presets: [
          require.resolve(path.join(cordovaNodeModules, 'babel-preset-stage-3')),
          [
            require.resolve(path.join(cordovaNodeModules, 'babel-preset-env')),
            {
              "targets": {
                "browsers": ["last 2 versions", "safari >= 7"]
              }
            }
          ]
        ],
        cacheDirectory: true
      }
    }, {
      test: /\.html$/,
      loader: 'html-loader'
    }, {
      test: /\.(png|jpe?g|gif|svg|woff|woff2|ttf|eot|ico)$/,
      loader: 'file-loader?name=assets/[name].[hash].[ext]'
    },  {
      test: /\.css$/,
      include: [/\/onsen-css-components.css$/, path.join(projectDirectory, 'src')],
      loader: "css-to-string-loader"
    }, {
      test: /\.css$/,
      include: [/\/onsen-css-components.css$/, path.join(projectDirectory, 'src')],
      loader: ExtractTextPlugin.extract({
        fallback: 'style-loader',
        use: [
          {
            loader: 'css-loader',
            options: { importLoaders: 1 }
          }, {
            loader: 'postcss-loader'
          }
        ]
      })
    }, {
      test: /\.css$/,
      exclude: [/\/onsen-css-components.css$/, path.join(projectDirectory, 'src')],
      loader: ExtractTextPlugin.extract({
        fallback: 'style-loader',
        use: 'css-loader?sourceMap',
        publicPath: "/"
      })
    }],

    noParse: [/.+zone\.js\/dist\/.+/, /.+angular2\/bundles\/.+/, /angular2-polyfills\.js/]
  },

  plugins: [
    new webpack.ContextReplacementPlugin(
      /angular(\\|\/)core(\\|\/)(esm(\\|\/)src|src)(\\|\/)linker/,
      projectDirectory
    ),
    new ExtractTextPlugin('[name].css'),
    new webpack.optimize.CommonsChunkPlugin({
      name: ['app', 'vendor', 'polyfills']
    }),
    new HtmlWebpackPlugin({
      template: 'src/index.html.ejs',
      chunksSortMode: 'dependency'
    }),
    new ProgressBarPlugin(),
    new webpack.LoaderOptionsPlugin({
      options: {
        context: projectDirectory,
        postcss: [
          postcssImport,
          postcssUrl,
          postcssCssnext
        ]
      }
    })
  ],

  resolveLoader: {
    modules: [cordovaNodeModules]
  },
  performance: {
    hints: false 
  }
};

if (process.env.NODE_ENV === JSON.stringify('production')) {

  module.exports.devtool = "#source-map",

  module.exports.stats = {
    warnings: false,
    children: false
  },

  module.exports.plugins = (module.exports.plugins || []).concat([
    new webpack.DefinePlugin({
      'process.env': {
        'NODE_ENV': JSON.stringify('production')
      }
    }),
    new ExtractTextPlugin('[name].css'),
    new webpack.optimize.CommonsChunkPlugin({
      name: ['app', 'vendor', 'polyfills']
    }),
    new HtmlWebpackPlugin({
      template: 'src/index.html.ejs',
      chunksSortMode: 'dependency',
      externalCSS: ['components/loader.css'],
      externalJS: ['components/loader.js'],
      minify: {
        caseSensitive: true,
        collapseWhitespace: true,
        conservativeCollapse: true,
        removeAttributeQuotes: false,
        removeComments: true
      }
    }),
    new webpack.NoEmitOnErrorsPlugin(),
    new webpack.optimize.UglifyJsPlugin(),
    new ProgressBarPlugin()
  ])
} else {
  module.exports.devtool = "#eval-source-map",

  module.exports.devServer = {
    historyApiFallback: true,
    noInfo: true,
    contentBase: './src/public',
    inline: true,
    host: '0.0.0.0',
    stats: 'minimal'
  }
}
