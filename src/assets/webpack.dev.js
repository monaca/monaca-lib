try {
  var webpack = require('{{USER_CORDOVA}}/node_modules/webpack');
} catch( e ) {
  throw 'Missing Webpack';
}

module.exports = {
  context: '{{PROJECT_DIR}}',
  entry: [
    'webpack-dev-server/client?http://0.0.0.0:8000/',
    './src/main.js'
  ],
  output: {
    path: '{{PROJECT_DIR}}',
    filename: 'www/dist.js'
  },
  module: {
    loaders: [{
      test: {{EXTENSION}},
      exclude: {{EXCLUDE}},
      loader: '{{LOADER}}',
      query: {
        presets: {{PRESETS}}
      }
    }]
  },
  
  devServer: {
    colors: true,
    inline: false,
    port: 8000
  },

  resolveLoader: {
    root: '{{USER_CORDOVA}}/node_modules'
  },
  resolve: {{RESOLVE}},
  plugins: [
    new webpack.HotModuleReplacementPlugin()
  ]
};