module.exports = {
  context: '{{PROJECT_DIR}}',
  entry: [
    './src/main.js'
  ],
  output: {
    path: '{{PROJECT_DIR}}',
    filename: 'www/dist.js'
  },
  module: {
    loaders: [{
      test: /\.js$/,
      exclude: /(node_modules|bower_components|platforms|www|\.monaca)/,
      loader: 'babel-loader',
      query: {
        presets: [
          '{{USER_CORDOVA}}/node_modules/babel-preset-es2015',
          '{{USER_CORDOVA}}/node_modules/babel-preset-stage-2',
          '{{USER_CORDOVA}}/node_modules/babel-preset-react'
        ]
      }
    }]
  },
  resolveLoader: {
    root: '{{USER_CORDOVA}}/node_modules'
  },
  resolve: {}
};