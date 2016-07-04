try {
  var webpack = require('{{USER_CORDOVA}}/node_modules/webpack');
} catch (e) {
  throw 'Missing Webpack Build Dependencies.';
}

module.exports = {
  devtool: 'eval',
  context: '{{PROJECT_DIR}}/www',
  entry: [
    'react-hot-loader/patch',
    'webpack-dev-server/client?http://0.0.0.0:8000/',
    'webpack/hot/only-dev-server',
    '../src/main.js'

  ],
  watch: true,
  output: {
    path: '{{PROJECT_DIR}}',
    filename: 'www/dist.js'
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
      test: /\.(html|css|png|jpg)$/,
      exclude: /(node_modules|bower_components|platforms|\.monaca)/,
      loader: 'file-loader'
    }]
  },

  devServer: {
    colors: true,
    inline: true,
    port: 8000,
    hot: true
  },

  resolveLoader: {
    root: '{{USER_CORDOVA}}/node_modules'
  },

  resolve: {
    alias: {
      webpack: '{{USER_CORDOVA}}/node_modules/webpack',
      react: '{{PROJECT_DIR}}/node_modules/react',
      'react-hot-loader': '{{USER_CORDOVA}}/node_modules/react-hot-loader',
      'react-hot-loader/patch': '{{USER_CORDOVA}}/node_modules/react-hot-loader/patch',
      'webpack-dev-server/client': '{{USER_CORDOVA}}/node_modules/webpack-dev-server/client'
    }
  },
  plugins: [
    new webpack.HotModuleReplacementPlugin()
  ]
};