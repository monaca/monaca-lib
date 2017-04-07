try {
  var path = require('path');
  var os = require('os');
  var cordovaNodeModules = path.join(os.homedir(), '.cordova', 'node_modules');

  var webpack = require(path.join(cordovaNodeModules, 'webpack'));
  var HtmlWebpackPlugin = require(path.join(cordovaNodeModules, 'html-webpack-plugin'));
  var ExtractTextPlugin = require(path.join(cordovaNodeModules, 'extract-text-webpack-plugin'));
  var ProgressBarPlugin = require(path.join(cordovaNodeModules, 'progress-bar-webpack-plugin'));

  var postcssCssnext = require(path.join(cordovaNodeModules, 'postcss-cssnext'));
  var postcssUrl = require(path.join(cordovaNodeModules, 'postcss-url'));
  var postcssImport = require(path.join(cordovaNodeModules, 'postcss-smart-import'));
 
} catch (e) {
  throw new Error('Missing Webpack Build Dependencies.');
}

module.exports = {

  entry: [
    //'webpack/hot/only-dev-server',
    './src/main'
  ],

  output: {
    path: path.join(__dirname, 'www'),
    filename: 'bundle.js',
    publicPath:'/'
  },

  resolve: {
    modules: [
      path.join(__dirname, 'src'),
      path.join(__dirname, 'node_modules'),
      path.resolve(cordovaNodeModules)
    ],

    extensions: ['.js', '.jsx', '.json', '.css', '.html'],

    unsafeCache: true
  },

  module: {
    rules: [{
      test: /\.(js|jsx)$/,
      loader: 'babel-loader',
      include: path.join(__dirname, 'src'),

      options: {
        presets: [
          path.join(cordovaNodeModules, 'babel-preset-es2015'),
          path.join(cordovaNodeModules, 'babel-preset-stage-2'),
          path.join(cordovaNodeModules, 'babel-preset-react')
        ],

        cacheDirectory: true,

        plugins: [
          path.join(cordovaNodeModules, 'react-hot-loader', 'babel')
        ]
      }
    }, {
      test: /\.html$/,
      loader: 'html-loader'
    }, {
      test: /\.(png|jpe?g|gif|svg|woff|woff2|ttf|eot|ico)$/,
      loader: 'file-loader?name=assets/[name].[hash].[ext]'
    }, {
        test: /\.css$/,
        include: [/\/onsen-css-components.css$/, path.join(__dirname, 'src')],
        loader: ExtractTextPlugin.extract({
          fallback: 'style-loader',
          use: [
            {
              loader: 'css-loader',
              options: { importLoaders: 1 }
            }, {
              loader: 'postcss-loader'
              //options: {
                //plugins: () => [
                  //postcssImport,
                  //postcssUrl,
                  //postcssCssnext({
                    //browsers: ['> 1%', 'last 2 versions', 'Firefox ESR', 'Opera 12.1']
                  //})
                //]
              //} 
            }
          ]
        })
      }, {
        test: /\.css$/,
        exclude: [/\/onsen-css-components.css$/, path.join(__dirname, 'src')],
        loader: ExtractTextPlugin.extract({
          fallback: 'style-loader',
          use: 'css-loader?sourceMap',
          publicPath: "/"
        })
      }
]
  },


  plugins: [
    new webpack.HotModuleReplacementPlugin(),
    new ExtractTextPlugin('[name].css'),
    new HtmlWebpackPlugin({
      template: 'src/public/index.html.ejs',
      chunksSortMode: 'dependency'
    }),
    new ProgressBarPlugin(),
    new webpack.LoaderOptionsPlugin({
        options: {
          context: __dirname,
          postcss: [
            postcssImport,
            postcssUrl,
            postcssCssnext
          ]
        }
      })
  ],

  devServer: {
    historyApiFallback: true,
    noInfo: true,
    inline: true,
    port: 8080
  },
  resolveLoader: {
    modules: [cordovaNodeModules]
  },
  performance: {
    hints: false
  },
  devtool: '#eval-source-map',
  devServer: {
    historyApiFallback: true,
    noInfo: true
  }

  //devServer: {
    //contentBase: './src/public',
    //colors: true,
    //inline: false,
    //historyApiFallback: true,
    //host: '0.0.0.0',
    //stats: 'minimal',
    //hot: true
  //}
};
