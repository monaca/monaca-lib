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
  throw new Error('Missing Webpack Build Dependencies: ' + e);
}

module.exports = {

  resolve: {
    modules: [
      "node_modules",
      path.join(projectDirectory, 'src'),
      path.join(projectDirectory, 'node_modules'),
      path.resolve(cordovaNodeModules)
    ],
    extensions: ['.js', '.vue', '.json', '.css', '.html'],
    alias: {
      vue:'vue/dist/vue.esm.js'
    }
  },

  module: {
    rules: [
      {
        test: /\.js$/,
        loader: 'babel-loader',
        exclude: /node_modules/,
        options: {
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
          ]
        }
      }, {
        test: /\.vue$/,
        loader: 'vue-loader',
        options: {
          loaders: {
            js:{
              loader: "babel-loader",
              options: {
                presets: [
                  [
                    require.resolve(path.join(cordovaNodeModules, 'babel-preset-env')),
                    {
                      "targets": {
                        "browsers": ["last 2 versions", "safari >= 7"]
                      }
                    }
                  ]
                ]
              }
            }
          }
        }
      }, {
        test: /\.(png|jpe?g|gif|svg|woff|woff2|ttf|eot|ico)$/,
        loader: 'file-loader',
        options: {
          name: '[name].[ext]?[hash]'
        }
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
      }
    ]
  },

  plugins: [
    new ExtractTextPlugin('[name].css'),
    new webpack.LoaderOptionsPlugin({
      options: {
        context: projectDirectory,
        postcss: [
          postcssImport,
          postcssUrl,
          postcssCssnext({
            browsers: ['> 1%', 'last 2 versions', 'Firefox ESR', 'Opera 12.1']
          })
        ]
      }
    }),
    new webpack.HotModuleReplacementPlugin(),
    new HtmlWebpackPlugin({
      template: 'src/index.html.ejs'
    })
  ],

  resolveLoader: {
    modules: [cordovaNodeModules]
  },

  performance: {
    hints: false 
  }
};

if (process.env.NODE_ENV === JSON.stringify('production')){

  module.exports.entry = {
    app: './src/main',
    vendor: ['vue']
  },

  module.exports.output = {
    path: path.join(projectDirectory, 'www'),
    filename: '[name].bundle.js',
    chunkFilename: '[name].chunk.js'
  },

  module.exports.devtool = "#source-map",

  module.exports.stats= {
    warnings: false,
    children: false
  },

  module.exports.plugins = (module.exports.plugins || []).concat([
    new webpack.DefinePlugin({
      'process.env': {
        'NODE_ENV': JSON.stringify('production')
      }
    }),
    new webpack.optimize.CommonsChunkPlugin({
      name: ['vendor']
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
    new webpack.optimize.UglifyJsPlugin({
      sourceMap: true,
      compress: {
        warnings: false
      }
    }),
    new CopyWebpackPlugin([{
      from: path.join(projectDirectory, 'src', 'public'),
      ignore: ['index.html.ejs']
    }]),
    new ProgressBarPlugin()
  ])
} else {
  module.exports.entry = [
    'webpack-dev-server/client?http://0.0.0.0:8000/',
    'webpack/hot/only-dev-server',
    './src/main'
  ], 

  module.exports.output = {
    path: path.join(projectDirectory, 'www'),
    filename: 'bundle.js',
    publicPath:'/'
  },

  module.exports.plugins = (module.exports.plugins || []).concat([
    new webpack.HotModuleReplacementPlugin(),
    new HtmlWebpackPlugin({
      template: 'src/index.html.ejs'
    })
  ]),

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
