try {
  var path = require('path');
  var os = require('os');
  var cordovaNodeModules = path.join(os.homedir(), '.cordova', 'node_modules');

  var webpack = require(path.join(cordovaNodeModules, 'webpack'));
  var HtmlWebpackPlugin = require(path.join(cordovaNodeModules, 'html-webpack-plugin'));
  var ExtractTextPlugin = require(path.join(cordovaNodeModules, 'extract-text-webpack-plugin'));
  var ProgressBarPlugin = require(path.join(cordovaNodeModules, 'progress-bar-webpack-plugin'));

  var cssnext = require(path.join(cordovaNodeModules, 'postcss-cssnext'));
  var postcssImport = require(path.join(cordovaNodeModules, 'postcss-import'));
  var postcssUrl = require(path.join(cordovaNodeModules, 'postcss-url'));

} catch (e) {
  throw new Error('Missing Webpack Build Dependencies.');
}

module.exports = {
  devtool: 'inline-source-map',
  context: __dirname,
  debug: true,
  cache: true,

  entry: [
    'react-hot-loader/patch',
    'webpack/hot/only-dev-server',
    './src/main'
  ],

  output: {
    path: path.join(__dirname, 'www'),
    filename: 'bundle.js',
    publicPath: '/'
  },

  resolve: {
    root: [
      path.join(__dirname, 'src'),
      path.join(__dirname, 'node_modules')
    ],

    extensions: ['', '.js', '.jsx', '.json', '.css', '.html', '.styl'],

    unsafeCache: true,

    alias: {
      webpack: path.join(cordovaNodeModules, 'webpack'),
      'react-hot-loader': path.join(cordovaNodeModules, 'react-hot-loader'),
      'react-hot-loader/patch': path.join(cordovaNodeModules, 'react-hot-loader', 'patch'),
      'webpack-dev-server/client': path.join(cordovaNodeModules, 'webpack-dev-server', 'client')
    }
  },

  module: {
    loaders: [{
      test: /\.(js|jsx)$/,
      loader: 'babel',
      include: path.join(__dirname, 'src'),

      query: {
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
      loader: 'html'
    }, {
      test: /\.(png|jpe?g|gif|svg|woff|woff2|ttf|eot|ico)(\?\S*)?$/,
      loader: 'file?name=assets/[name].[hash].[ext]'
    }, {
      test: /\.css$/,
      include: [
        path.join(__dirname, 'node_modules', 'onsenui', 'css-components-src', 'src'),
        path.join(__dirname, 'src')
      ],
      loader: ExtractTextPlugin.extract('style', 'css?importLoaders=1&-raw!postcss')
    }, {
      test: /\.css$/,
      exclude: [
        path.join(__dirname, 'node_modules', 'onsenui', 'css-components-src', 'src'),
        path.join(__dirname, 'src')
      ],
      loader: ExtractTextPlugin.extract('style', 'css?sourceMap')
    }, {
      test: /\.json$/,
      loader: 'json'
    }]
  },

  postcss: function() {
    return [
      postcssImport,
      postcssUrl,
      cssnext({
        browsers: ['> 1%', 'last 2 versions', 'Firefox ESR', 'Opera 12.1']
      })
    ]
  },

  plugins: [
    new webpack.HotModuleReplacementPlugin(),
    new ExtractTextPlugin('[name].css'),
    new HtmlWebpackPlugin({
      template: 'src/public/index.html.ejs',
      chunksSortMode: 'dependency'
    }),
    new ProgressBarPlugin()
  ],

  resolveLoader: {
    root: [
      path.join(__dirname, 'node_modules'),
      cordovaNodeModules
    ]
  },

  devServer: {
    contentBase: './src/public',
    colors: true,
    inline: true,
    historyApiFallback: true,
    host: '0.0.0.0',
    stats: 'minimal',
    hot: true
  }
};
