try {
  var path = require('path');
  var os = require('os');
  var cordovaNodeModules = path.join(os.homedir(), '.cordova', 'node_modules');

  var webpack = require(path.join(cordovaNodeModules, 'webpack'));
  var HtmlWebpackPlugin = require(path.join(cordovaNodeModules, 'html-webpack-plugin'));
  var ExtractTextPlugin = require(path.join(cordovaNodeModules, 'extract-text-webpack-plugin'));
  var CopyWebpackPlugin = require(path.join(cordovaNodeModules, 'copy-webpack-plugin'));
  var autoprefixer = require(path.join(cordovaNodeModules, 'autoprefixer'));
  var precss = require(path.join(cordovaNodeModules, 'precss'));
} catch (e) {
  throw new Error('Missing Webpack Build Dependencies.');
}

module.exports = {
  context: __dirname,

  entry: [
    './src/main'
  ],

  output: {
    path: path.join(__dirname, 'www'),
    filename: 'bundle.js'
  },

  resolve: {
    root: [
      path.join(__dirname, 'src'),
      path.join(__dirname, 'node_modules')
    ],

    extensions: ['', '.js', '.jsx', '.json', '.css', '.html', '.styl'],

    alias: {
      webpack: path.join(cordovaNodeModules, 'webpack'),
      react: path.join(__dirname, 'node_modules', 'react'),
      'react-hot-loader': path.join(cordovaNodeModules, 'react-hot-loader'),
      'react-hot-loader/patch': path.join(cordovaNodeModules, 'react-hot-loader', 'patch')
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
      loader: 'style!css!postcss!stylus',
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
    new webpack.DefinePlugin({
      'process.env': {
        'NODE_ENV': JSON.stringify('production')
      }
    }),
    new ExtractTextPlugin('[name].css'),
    new HtmlWebpackPlugin({
      template: 'src/public/index.html',
      chunksSortMode: 'dependency'
    }),
    new webpack.NoErrorsPlugin(),
    new webpack.optimize.DedupePlugin(),
    new webpack.optimize.UglifyJsPlugin(),
    new CopyWebpackPlugin([{
      from: path.join(__dirname, 'src', 'public'),
    }])
  ],

  resolveLoader: {
    root: cordovaNodeModules
  }
};