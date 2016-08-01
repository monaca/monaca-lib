try {
  var path = require('path');
  var os = require('os');
  var cordovaNodeModules = path.join(os.homedir(), '.cordova', 'node_modules');

  var webpack = require(path.join(cordovaNodeModules, 'webpack'));
  var HtmlWebpackPlugin = require(path.join(cordovaNodeModules, 'html-webpack-plugin'));
  var ExtractTextPlugin = require(path.join(cordovaNodeModules, 'extract-text-webpack-plugin'));
  var CopyWebpackPlugin = require(path.join(cordovaNodeModules, 'copy-webpack-plugin'));
  var ProgressBarPlugin = require(path.join(cordovaNodeModules, 'progress-bar-webpack-plugin'));

  var autoprefixer = require(path.join(cordovaNodeModules, 'autoprefixer'));
  var precss = require(path.join(cordovaNodeModules, 'precss'));

} catch (e) {
  throw new Error('Missing Webpack Build Dependencies. ');
}

var useCache = !!process.env.WP_CACHE;

module.exports = {
  context: __dirname,
  cache: useCache,
  stats: {
    warnings: false,
    children: false
  },

  entry: {
    app: './src/main',
    vendor: ['react', 'react-dom', 'onsenui', 'react-onsenui']
  },

  output: {
    path: path.join(__dirname, 'www'),
    filename: '[name].bundle.js',
    chunkFilename: '[name].chunk.js'
  },

  resolve: {
    root: [
      path.join(__dirname, 'src'),
      path.join(__dirname, 'node_modules')
    ],

    extensions: ['', '.js', '.jsx', '.json', '.css', '.html', '.styl'],

    unsafeCache: useCache,

    alias: {
      webpack: path.join(cordovaNodeModules, 'webpack'),
      'react-hot-loader': path.join(cordovaNodeModules, 'react-hot-loader'),
      'react-hot-loader/patch': path.join(cordovaNodeModules, 'react-hot-loader', 'patch')
    }
  },

  module: {
    loaders: [{
      test: /\.(js|jsx)$/,
      loader: 'babel-loader',
      include: path.join(__dirname, 'src'),

      query: {
        presets: [
          path.join(cordovaNodeModules, 'babel-preset-es2015'),
          path.join(cordovaNodeModules, 'babel-preset-stage-2'),
          path.join(cordovaNodeModules, 'babel-preset-react')
        ],

        cacheDirectory: useCache,

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
      loader: 'style!css!postcss!stylus'
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
    new webpack.optimize.CommonsChunkPlugin({
      name: ['vendor']
    }),
    new ExtractTextPlugin('[name].css'),
    new HtmlWebpackPlugin({
      template: 'src/public/index.ejs',
      chunksSortMode: 'dependency',
      externalCSS: ['components/loader.css'],
      externalJS: ['components/loader.js'],
      minify: {
        collapseWhitespace: true,
        conservativeCollapse: true,
        removeAttributeQuotes: true,
        removeComments: true
      }
    }),
    new webpack.NoErrorsPlugin(),
    new webpack.optimize.DedupePlugin(),
    new webpack.optimize.UglifyJsPlugin(),
    new CopyWebpackPlugin([{
      from: path.join(__dirname, 'src', 'public'),
      ignore: ['index.ejs']
    }]),
    new ProgressBarPlugin()
  ],

  resolveLoader: {
    root: cordovaNodeModules
  }
};
