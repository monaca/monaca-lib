try {
  var webpack = require('{{USER_CORDOVA}}/node_modules/webpack');
  var ExtractTextPlugin = require('{{USER_CORDOVA}}/node_modules/extract-text-webpack-plugin');
  var CopyWebpackPlugin = require('{{USER_CORDOVA}}/node_modules/copy-webpack-plugin');
} catch (e) {
  throw 'Missing Webpack Build Dependencies.';
}

module.exports = {
  entry: [
    './src/main.js'
  ],

  output: {
    path: '{{PROJECT_DIR}}/www',
    filename: 'dist.js'
  },

  module: {
    loaders: [{
      test: /\.(js)$/,
      exclude: /(node_modules|bower_components|www|platforms|\.monaca)/,
      loader: 'babel-loader',
      query: {
        presets: [
          '{{USER_CORDOVA}}/node_modules/babel-preset-es2015',
          '{{USER_CORDOVA}}/node_modules/babel-preset-stage-2',
          '{{USER_CORDOVA}}/node_modules/babel-preset-react'
        ],
        plugins: ['{{USER_CORDOVA}}/node_modules/react-hot-loader/babel']
      }
    }, {
      test: /\.html$/,
      loader: 'html'
    }, {
      test: /\.(png|jpe?g|gif|svg|woff|woff2|ttf|eot|ico)$/,
      loader: 'file?name=assets/[name].[hash].[ext]'
    }, {
      test: /\.styl$/,
      loaders: ['style-loader', 'css-loader', 'stylus-loader'], 
    }, {
      test: /\.css$/,
      exclude: '{{PROJECT_DIR}}',
      loader: ExtractTextPlugin.extract('style', 'css?sourceMap')
    }, {
      test: /\.css$/,
      include: '{{PROJECT_DIR}}',
      loader: 'raw'
    }]
  },

  resolveLoader: {
    root: '{{USER_CORDOVA}}/node_modules'
  },

  resolve: {},

  plugins: [
    new ExtractTextPlugin('[name].css'),
    new webpack.NoErrorsPlugin(),
    new webpack.optimize.DedupePlugin(),
    new webpack.optimize.UglifyJsPlugin(),
    new CopyWebpackPlugin([{
      from: '{{PROJECT_DIR}}/src/public',
    }])
  ],
};