try {
  var path = require('path');
  var os = require('os');
  var cordovaNodeModules = path.join(os.homedir(), '.cordova', 'node_modules');

  var webpack = require(path.join(cordovaNodeModules, 'webpack'));
  var HtmlWebpackPlugin = require(path.join(cordovaNodeModules, 'html-webpack-plugin'));
  var ExtractTextPlugin = require(path.join(cordovaNodeModules, 'extract-text-webpack-plugin'));
  var autoprefixer = require(path.join(cordovaNodeModules, 'autoprefixer'));
  var precss = require(path.join(cordovaNodeModules, 'precss'));
} catch (e) {
  throw new Error('Missing Webpack Build Dependencies.');
}

var port = +(process.env.WP_PORT) || 8000;

module.exports = {
  devtool: 'eval-source-map',
  context: __dirname,
  debug: true,

  entry: {
    'polyfills': './src/polyfills.ts',
    'vendor': './src/vendor.ts',
    'app': './src/main.ts'
  },

  output: {
    path: path.join(__dirname, 'www'),
    filename: '[name].js',
    chunkFilename: '[id].chunk.js'
  },

  resolve: {
    root: [
      path.join(__dirname, 'src'),
      path.join(__dirname, 'node_modules')
    ],

    extensions: ['', '.ts', '.js', '.json', '.css', '.html', '.styl']
  },

  module: {
    loaders: [{
      test: /\.ts$/,
      loader: 'ts',

      query: {
        presets: [
          path.join(cordovaNodeModules, 'babel-preset-es2015'),
          path.join(cordovaNodeModules, 'babel-preset-stage-2')
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
      loader: 'style!css!postcss!stylus',
    }, {
      test: /\.css$/,
      exclude: path.join(__dirname, 'src', 'app'),
      loader: ExtractTextPlugin.extract('style', 'css?sourceMap')
    }, {
      test: /\.css$/,
      include: path.join(__dirname, 'src', 'app'),
      loader: 'raw'
    }, {
      test: /\.json$/,
      loader: 'json'
    }],

    noParse: [/.+zone\.js\/dist\/.+/, /.+angular2\/bundles\/.+/, /angular2-polyfills\.js/]
  },

  postcss: function() {
    return [precss, autoprefixer];
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
    root: cordovaNodeModules
  },

  devServer: {
    contentBase: './src/public',
    colors: true,
    inline: true,
    port: port,
    host: '0.0.0.0',
    stats: 'minimal'
  }
};