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
      test: {{EXTENSION}},
      exclude: {{EXCLUDE}},
      loader: '{{LOADER}}',
      query: {
        presets: {{PRESETS}}
      }
    }]
  },
  resolveLoader: {
    root: '{{USER_CORDOVA}}/node_modules'
  },
  resolve: {{RESOLVE}}
};