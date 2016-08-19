console.log(process.argv);

var rl;

var webpackConfigFile = process.argv[2];
var watch = process.argv[3] === '--watch';

var webpack = require(require('path').join(process.env.USER_CORDOVA, 'node_modules', 'webpack'));
var webpackConfig = require(webpackConfigFile);

var compiler = webpack(webpackConfig);
var watchInstance;

var outputStyle = {
  chunks: false,
  chunksModules: false,
  reasons: false,
  modules: false,
  children: false,
  warnings: false,
  hash: false,
  colors: true
};

if (watch) {
  watchInstance = compiler.watch({}, function(err, stats) {
    process.stdout.write(stats.toString(outputStyle));
  });
} else {
  compiler.run(function(err, stats) {
    process.stdout.write(stats.toString(outputStyle));
    // if (process.platform === 'win32' && rl) {
    //   rl.close();
    // }
  });
}

// if (process.platform === 'win32') {
//   rl = require('readline').createInterface({
//     input: process.stdin,
//     output: process.stdout
//   });

//   rl.on('SIGINT', function() {
//     // process.stdout.write('\nStopping http server...\n');
//     rl.close();
//     process.stderr.write('\nCanceled by the user.\n');
//     // if (watchInstance) {
//     //   watchInstance.close();
//     // }
//     //process.stderr.write('SIGINT\n');
//     process.exit(1); // TODO: NICE MESSAGES
//     //require('child_process').exec('taskkill /pid ' + process.pid + ' /T /F');
//   });
// }
