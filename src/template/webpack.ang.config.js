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
  throw new Error('Missing Webpack Build Dependencies :' + e);
}

module.exports = {


  resolve: {
    modules: [
      "node_modules",
      path.join(__dirname, 'src'),
      path.join(__dirname, 'node_modules'),
      path.resolve(cordovaNodeModules)
    ],

    extensions: ['.js', '.jsx', '.json', '.css', '.html'],

    //check which should be for production
    unsafeCache: true
  },

  module: {
    rules: [{
      test: /\.(js|jsx)$/,
      loader: 'babel-loader',
      include: path.join(__dirname, 'src'),

      options: {
        presets: [
          path.join(cordovaNodeModules, 'babel-preset-es2015'),
          path.join(cordovaNodeModules, 'babel-preset-stage-2'),
          path.join(cordovaNodeModules, 'babel-preset-react')
        ],

        cacheDirectory: true,

        plugins: [
          path.join(cordovaNodeModules, 'react-hot-loader', 'babel')
        ]
      }
    }, {
      test: /\.html$/,
      loader: 'html-loader'
    }, {
      test: /\.(png|jpe?g|gif|svg|woff|woff2|ttf|eot|ico)$/,
      loader: 'file-loader?name=assets/[name].[hash].[ext]'
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
    new webpack.HotModuleReplacementPlugin(),
    new ExtractTextPlugin('[name].css'),
    new HtmlWebpackPlugin({
      template: 'src/public/index.html.ejs',
      chunksSortMode: 'dependency'
    }),
    new ProgressBarPlugin(),
    new webpack.LoaderOptionsPlugin({
        options: {
          context: __dirname,
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
};

if (process.env.NODE_ENV === JSON.stringify('production')) {

  module.exports.devtool = "#source-map",

  module.exports.stats= {
    warnings: false,
    children: false
  },

  module.exports.entry = {
    app: './src/main',
    vendor: ['react', 'react-dom', 'onsenui', 'react-onsenui']
  },

  module.exports.output = {
    path: path.join(__dirname, 'www'),
    filename: '[name].bundle.js',
    chunkFilename: '[name].chunk.js'
  },

  module.exports.plugins = [
    new webpack.DefinePlugin({
      'process.env': {
        'NODE_ENV': JSON.stringify('production')
      }
    }),
    new ExtractTextPlugin('[name].css'),
    new webpack.optimize.CommonsChunkPlugin({
      name: ['vendor']
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
    hints: "warning"
  }
} else {

  module.exports.devtool = "#eval-source-map",

  module.exports.entry = [
    'react-hot-loader/patch',
    'webpack-dev-server/client?http://0.0.0.0:8000/',
    'webpack/hot/only-dev-server',
    './src/main'
  ],

  module.exports.output = {
    path: path.join(__dirname, 'www'),
    filename: 'bundle.js'
  },

  module.exports.devServer  = {
    hot: true,
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
