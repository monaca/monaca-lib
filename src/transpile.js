var webpackConfigFile = process.argv[2];
var watch = process.argv[3] === '--watch';

var webpack = require(require('path').join(process.env.USER_CORDOVA, 'node_modules', 'webpack'));
var webpackConfig = require(webpackConfigFile);

var outputStyle = {
  chunks: false,
  children: false,
  warnings: false,
  version: false,
  hash: false,
  colors: true
};

var compiler = webpack(webpackConfig);

if (watch) {
  compiler.watch({
    poll: false,
    aggregateTimeout: 300
  }, function(err, stats) {
    process.send(stats.toString(outputStyle));
  });
} else {
  compiler.run(function(err, stats) {
    process.send(stats.toString(outputStyle));
  });
}
