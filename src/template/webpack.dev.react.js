try {
  var path = require('path');
  var os = require('os');
  var cordovaNodeModules = path.join(os.homedir(), '.cordova', 'node_modules');

  var webpack = require(path.join(cordovaNodeModules, 'webpack'));
  var HtmlWebpackPlugin = require(path.join(cordovaNodeModules, 'html-webpack-plugin'));
  var ExtractTextPlugin = require(path.join(cordovaNodeModules, 'extract-text-webpack-plugin'));

  var autoprefixer = require(path.join(cordovaNodeModules, 'autoprefixer'));
  var precss = require(path.join(cordovaNodeModules, 'precss'));

} catch (e) {
  throw new Error('Missing Webpack Build Dependencies.');
}

var host = process.env.WP_HOST || '127.0.0.1';
var port = +(process.env.WP_PORT) || 8000;

module.exports = {
  devtool: 'eval-source-map',
  context: __dirname,
  debug: true,
  cache: true,

  entry: [
    'react-hot-loader/patch',
    'webpack-dev-server/client?http://0.0.0.0:' + port + '/',
    'webpack/hot/only-dev-server',
    './src/main'
  ],

  output: {
    path: path.join(__dirname, 'www'),
    filename: 'bundle.js',
    publicPath: 'http://' + host + ':' + port + '/'
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
      test: /\.(png|jpe?g|gif|svg|woff|woff2|ttf|eot|ico)$/,
      loader: 'file?name=assets/[name].[hash].[ext]'
    }, {
      test: /\.styl$/,
      loader: 'style!css!postcss!stylus'
    }, {
      test: /\.css$/,
      exclude: path.join(__dirname, 'src'),
      loader: ExtractTextPlugin.extract('style', 'css?sourceMap')
    }, {
      test: /\.css$/,
      include: path.join(__dirname, 'src'),
      loader: 'raw'
    }, {
      test: /\.json$/,
      loader: 'json'
    }]
  },

  postcss: function() {
    return [precss, autoprefixer];
  },

  plugins: [
    new webpack.HotModuleReplacementPlugin(),
    new ExtractTextPlugin('[name].css'),
    new HtmlWebpackPlugin({
      template: 'src/public/index.ejs',
      chunksSortMode: 'dependency'
    })
  ],

  resolveLoader: {
    root: cordovaNodeModules
  },

  devServer: {
    contentBase: './src/public',
    colors: true,
    inline: false,
    historyApiFallback: true,
    host: '0.0.0.0',
    port: port,
    stats: 'minimal',
    hot: true
  }
};
