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
    root: [
      '{{PROJECT_DIR}}/src',
      '{{PROJECT_DIR}}/node_modules'
    ],
    extensions: ['', '.ts', '.js', '.json', '.css', '.html', '.styl']
  },

  module: {
    loaders: [{
      test: /\.ts$/,
      loader: 'ts',

      query: {
        presets: [
          '{{USER_CORDOVA}}/node_modules/babel-preset-es2015',
          '{{USER_CORDOVA}}/node_modules/babel-preset-stage-2'
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
      loaders: ['style-loader', 'css-loader', 'stylus-loader'],
    }, {
      test: /\.css$/,
      exclude: '{{PROJECT_DIR}}/src/app',
      loader: ExtractTextPlugin.extract('style', 'css?sourceMap')
    }, {
      test: /\.css$/,
      include: '{{PROJECT_DIR}}/src/app',
      loader: 'raw'
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
    stats: 'minimal'
  }
};