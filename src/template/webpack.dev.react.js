try {
  var webpack = require('{{USER_CORDOVA}}/node_modules/webpack');
  var HtmlWebpackPlugin = require('{{USER_CORDOVA}}/node_modules/html-webpack-plugin');
  var ExtractTextPlugin = require('{{USER_CORDOVA}}/node_modules/extract-text-webpack-plugin');
} catch (e) {
  throw 'Missing Webpack Build Dependencies.';
}

module.exports = {
  devtool: 'eval-source-map',
  debug: true,

  entry: [
    'react-hot-loader/patch',
    'webpack-dev-server/client?http://0.0.0.0:8000/',
    'webpack/hot/only-dev-server',
    './src/main.js'
  ],

  output: {
    path: '{{PROJECT_DIR}}/www',
    filename: 'dist.js'
  },

  resolve: {
    root: [
      '{{PROJECT_DIR}}/src',
      '{{PROJECT_DIR}}/node_modules'
    ],

    extensions: ['', '.js', '.jsx', '.json', '.css', '.html', '.styl'],

    alias: {
      webpack: '{{USER_CORDOVA}}/node_modules/webpack',
      react: '{{PROJECT_DIR}}/node_modules/react',
      'react-hot-loader': '{{USER_CORDOVA}}/node_modules/react-hot-loader',
      'react-hot-loader/patch': '{{USER_CORDOVA}}/node_modules/react-hot-loader/patch',
      'webpack-dev-server/client': '{{USER_CORDOVA}}/node_modules/webpack-dev-server/client'
    }
  },

  module: {
    loaders: [{
      test: /\.(js|jsx)$/,
      loader: 'babel',
      exclude: /(react-onsenui|onsenui.js|bower_components|www|platforms|\.monaca)/,

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
      exclude: '{{PROJECT_DIR}}/src',
      loader: ExtractTextPlugin.extract('style', 'css?sourceMap')
    }, {
      test: /\.css$/,
      include: '{{PROJECT_DIR}}/src',
      loader: 'raw'
    }]
  },

  plugins: [
    new webpack.HotModuleReplacementPlugin(),
    new ExtractTextPlugin('[name].css'),
    new HtmlWebpackPlugin({
      template: 'src/public/index.html',
      chunksSortMode: 'dependency'
    })
  ],

  resolveLoader: {
    root: '{{USER_CORDOVA}}/node_modules'
  },

  devServer: {
    contentBase: './src/public',
    colors: true,
    inline: true,
    port: 8000,
    stats: 'minimal',
    hot: false // live reload will not trigger for index.html if hot is enabled.
  }
};