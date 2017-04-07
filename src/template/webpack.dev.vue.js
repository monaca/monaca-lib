try {
  var path = require('path');
  var os = require('os');
  var cordovaNodeModules = path.join(os.homedir(), '.cordova', 'node_modules');

  var webpack = require(path.join(cordovaNodeModules, 'webpack'));
  var HtmlWebpackPlugin = require(path.join(cordovaNodeModules, 'html-webpack-plugin'));
  var ExtractTextPlugin = require(path.join(cordovaNodeModules, 'extract-text-webpack-plugin'));
  var ProgressBarPlugin = require(path.join(cordovaNodeModules, 'progress-bar-webpack-plugin'));

  var postcssCssnext = require(path.join(cordovaNodeModules, 'postcss-cssnext'));
  var postcssUrl = require(path.join(cordovaNodeModules, 'postcss-url'));
  var postcssImport = require(path.join(cordovaNodeModules, 'postcss-smart-import'));
 
} catch (e) {
  throw new Error('Missing Webpack Build Dependencies.');
}

module.exports = {

  entry: [
    'webpack/hot/only-dev-server',
    './src/main'
  ],

  output: {
    path: path.join(__dirname, 'www'),
    filename: 'bundle.js',
    publicPath:'/'
  },

  resolve: {
    modules: [
      path.join(__dirname, 'src'),
      path.join(__dirname, 'node_modules'),
      path.resolve(cordovaNodeModules)
    ],
    extensions: ['.js', '.vue', '.json', '.css', '.html'],

    alias: {
      vue:'vue/dist/vue.esm.js',
      'setimmediate':'/Users/adam/.cordova/node_modules/webpack/node_modules/node-libs-browser/node_modules/timers-browserify/node_modules/setimmediate/setImmediate'
    }
  },

  module: {
    rules: [
      {
        test: /\.vue$/,
        loader: 'vue-loader',
        options: {
          loaders: {
          }
          // other vue-loader options go here
        }
      }, {
        test: /\.js$/,
        loader: 'babel-loader',
        exclude: /node_modules/
      }, {
        test: /\.(png|jpe?g|gif|svg|woff|woff2|ttf|eot|ico)$/,
        loader: 'file-loader',
        options: {
          name: '[name].[ext]?[hash]'
        }
      }, {
        test: /\.css$/,
        include: [/\/onsen-css-components.css$/, path.join(__dirname, 'src')],
        loader: ExtractTextPlugin.extract({
          fallback: 'style-loader',
          use: [
            {
              loader: 'css-loader',
              options: { importLoaders: 1 }
            }, {
              loader: 'postcss-loader'
              //options: {
                //plugins: () => [
                  //postcssImport,
                  //postcssUrl,
                  //postcssCssnext({
                    //browsers: ['> 1%', 'last 2 versions', 'Firefox ESR', 'Opera 12.1']
                  //})
                //]
              //} 
            }
          ]
        })
      }, {
        test: /\.css$/,
        exclude: [/\/onsen-css-components.css$/, path.join(__dirname, 'src')],
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
    new HtmlWebpackPlugin({
      template: 'src/public/index.html.ejs'
    }),
    new webpack.LoaderOptionsPlugin({
        options: {
          context: __dirname,
          postcss: [
            postcssImport,
            postcssUrl,
            postcssCssnext
          ]
        }
      }),
    new webpack.HotModuleReplacementPlugin()
  ],
  devServer: {
    historyApiFallback: true,
    noInfo: true,
    inline: true,
    port: 8080
  },
  resolveLoader: {
    modules: [cordovaNodeModules]
  },
  performance: {
    hints: false
  },
  devtool: '#eval-source-map',
  devServer: {
    historyApiFallback: true,
    noInfo: true
  }
};

if (process.env.NODE_ENV === 'production') {
  module.exports.devtool = '#source-map';
  // http://vue-loader.vuejs.org/en/workflow/production.html
  module.exports.plugins = (module.exports.plugins || []).concat([
    new webpack.DefinePlugin({
      'process.env': {
        NODE_ENV: '"production"'
      }
    }),
    new webpack.optimize.UglifyJsPlugin({
      sourceMap: true,
      compress: {
        warnings: false
      }
    }),
    new webpack.LoaderOptionsPlugin({
      minimize: true
    })
  ]);
}
