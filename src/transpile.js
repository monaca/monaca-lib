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

compiler.plugin("compile", function(params) {
  process.send( { monacaTranspileLifecycle: true, action: 'start-compile' } ); // start compile
});

compiler.plugin("after-emit", function(compilation, cb) {
  process.send( { monacaTranspileLifecycle: true, action: 'end-compile' } );  // finish compile
  cb();
});

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
    process.exit(+(err || stats.hasErrors()));
  });
}
