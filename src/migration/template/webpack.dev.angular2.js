try {
  var path = require('path');

  var webpack = require('webpack');
  var HtmlWebpackPlugin = require('html-webpack-plugin');
  var ExtractTextPlugin = require('extract-text-webpack-plugin');
  var ProgressBarPlugin = require('progress-bar-webpack-plugin');

  var cssnext = require('postcss-cssnext');
  var postcssImport = require('postcss-import');
  var postcssUrl = require('postcss-url');

} catch (e) {
  throw new Error('Missing Webpack Build Dependencies.');
}

module.exports = {
  devtool: 'inline-source-map',
  context: __dirname,
  debug: true,
  cache: true,

  entry: {
    'polyfills': './src/polyfills',
    'vendor': './src/vendor',
    'app': ['./src/main'],
    'watch': [] // the webpack-dev-server/client will be injected
  },

  output: {
    path: path.join(__dirname, 'www'),
    filename: '[name].bundle.js',
    chunkFilename: '[id].chunk.js',
    publicPath: '/'
  },

  resolve: {
    root: [
      path.join(__dirname, 'src'),
      path.join(__dirname, 'node_modules')
    ],

    extensions: ['', '.ts', '.js', '.json', '.css', '.html', '.styl'],

    unsafeCache: true,
  },

  module: {
    loaders: [{
      test: /\.ts$/,
      loader: 'ts',
      include: path.join(__dirname, 'src'),

      query: {
        presets: [
          'babel-preset-es2015',
          'babel-preset-stage-2'
        ],

        cacheDirectory: true,
      }
    }, {
      test: /\.html$/,
      loader: 'html'
    }, {
      test: /\.(png|jpe?g|gif|svg|woff|woff2|ttf|eot|ico)(\?\S*)?$/,
      loader: 'file?name=assets/[name].[hash].[ext]'
    }, {
      test: /\.css$/,
      include: [
        path.join(__dirname, 'node_modules', 'onsenui', 'css-components-src', 'src'),
        path.join(__dirname, 'src')
      ],
      loaders: ['css-to-string', ExtractTextPlugin.extract('style', 'css?importLoaders=1&-raw!postcss')]
    }, {
      test: /\.css$/,
      exclude: [
        path.join(__dirname, 'node_modules', 'onsenui', 'css-components-src', 'src'),
        path.join(__dirname, 'src')
      ],
      loader: ExtractTextPlugin.extract('style', 'css?sourceMap')
    }, {
      test: /\.json$/,
      loader: 'json'
    }],

    noParse: [/.+zone\.js\/dist\/.+/, /.+angular2\/bundles\/.+/, /angular2-polyfills\.js/]
  },

  postcss: function() {
    return [
      postcssImport,
      postcssUrl,
      cssnext({
        browsers: ['> 1%', 'last 2 versions', 'Firefox ESR', 'Opera 12.1']
      })
    ]
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
      template: 'src/public/index.html.ejs',
      chunksSortMode: 'dependency'
    }),
    new ProgressBarPlugin()
  ],

  resolveLoader: {
    root: [
      path.join(__dirname, 'node_modules')
    ]
  },

  devServer: {
    contentBase: './src/public',
    historyApiFallback: true,
    colors: true,
    inline: true,
    host: '0.0.0.0',
    stats: 'minimal'
  }
};
