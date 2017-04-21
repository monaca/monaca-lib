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
 
} catch (e) {
  throw new Error('Missing Webpack Build Dependencies: ' + e);
}

module.exports = {
   entry : [
   'webpack-dev-server/client?http://0.0.0.0:8000/',
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
      "node_modules",
      path.join(__dirname, 'src'),
      path.join(__dirname, 'node_modules'),
      path.resolve(cordovaNodeModules)
    ],
    extensions: ['.js', '.vue', '.json', '.css', '.html'],
    //maybe distinguish between development and production version of vue
    alias: {
      vue:'vue/dist/vue.esm.js'
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

if (process.env.NODE_ENV === JSON.stringify('production')){
  console.log("This is production");
  module.exports.devtool = "#source-map",
  module.exports.stats= {
    warnings: false,
    children: false
  },

  module.exports.plugins = [
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
      template: 'src/public/index.html.ejs',
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
    new webpack.NoErrorsPlugin(),
    new webpack.optimize.DedupePlugin(),
    new webpack.optimize.UglifyJsPlugin(),
    new CopyWebpackPlugin([{
      from: path.join(__dirname, 'src', 'public'),
      ignore: ['index.html.ejs']
    }]),
    new ProgressBarPlugin()
  ],
  module.exports.performance = {
    hints: "error"
  }

} else {
  console.log("This is development " + process.env.NODE_ENV);
  module.exports.devtool = "#eval-source-map",

  module.exports.devServer = {
    historyApiFallback: true,
    noInfo: true,
    contentBase: './src/public',
    inline: true,
    host: '0.0.0.0',
    stats: 'minimal'
  },

  module.exports.performance = {
    hints: "warning"
  }
}
