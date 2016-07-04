try {
  var webpack = require('{{USER_CORDOVA}}/node_modules/webpack');
  var HtmlWebpackPlugin = require('{{USER_CORDOVA}}/node_modules/html-webpack-plugin');
  var ExtractTextPlugin = require('{{USER_CORDOVA}}/node_modules/extract-text-webpack-plugin');
  var CopyWebpackPlugin = require('{{USER_CORDOVA}}/node_modules/copy-webpack-plugin');
} catch (e) {
  throw 'Missing Dependencies.';
}

module.exports = {
  entry: {
    'polyfills': './src/polyfills.ts',
    'vendor': './src/vendor.ts',
    'app': './src/main.ts'
  },

  output: {
    path: '{{PROJECT_DIR}}/www',
    filename: '[name].js',
    chunkFilename: '[id].chunk.js'
  },

  resolve: {
    root: '{{PROJECT_DIR}}/src/public',
    extensions: ['', '.ts', '.js', '.json', '.css', '.html']
  },

  module: {
    loaders: [{
      test: /\.ts$/,
      loader: 'ts',
      exclude: /(node_modules|bower_components|platforms|www|\.monaca)/,
      query: {
        presets: [
          '{{USER_CORDOVA}}/node_modules/babel-preset-es2015',
          '{{USER_CORDOVA}}/node_modules/babel-preset-stage-2'
        ]
      }
    }, {
      test: /\.ts$/,
      loader: 'angular2-template',
      exclude: /(node_modules|bower_components|platforms|www|\.monaca)/
    }, {
      test: /\.html$/,
      loader: 'html'
    }, {
      test: /\.(png|jpe?g|gif|svg|woff|woff2|ttf|eot|ico)$/,
      loader: 'null'
    }, {
      test: /\.css$/,
      exclude: '{{PROJECT_DIR}}/src/app',
      loader: 'null'
    }],

    noParse: [/.+zone\.js\/dist\/.+/, /.+angular2\/bundles\/.+/, /angular2-polyfills\.js/]
  },

  ts: {
    compilerOptions: {
      sourceMap: false,
      sourceRoot: './src',
      inlineSourceMap: true
    }
  },

  plugins: [
    new ExtractTextPlugin('[name].css'),
    new webpack.optimize.CommonsChunkPlugin({
      name: ['app', 'vendor', 'polyfills']
    }),
    new HtmlWebpackPlugin({
      template: 'src/public/index.html',
      chunksSortMode: 'dependency'
    }),
    new webpack.NoErrorsPlugin(),
    new webpack.optimize.DedupePlugin(),
    new webpack.optimize.UglifyJsPlugin(),
    new CopyWebpackPlugin([{
      from: '{{PROJECT_DIR}}/src/public',
    }])
  ],

  resolveLoader: {
    root: '{{USER_CORDOVA}}/node_modules'
  }
};