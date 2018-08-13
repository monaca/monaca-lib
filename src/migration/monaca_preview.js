/*
* Collaborator: yong@asial.co.jp
*/
const open = require('open');
const port = process.env.PORT ? process.env.PORT : 8080;

let hookStdout = function() {
  var originalWrite = process.stdout.write

  process.stdout.write = function(string) {
    originalWrite.apply(process.stdout, arguments)
    if (/bundle is now VALID|webpack: Compiled successfully/.test(string)) {
      process.stdout.write('Opening browser...');
      process.stdout.write = originalWrite;
      process.stdout.write('\n');
      open('http://127.0.0.1:' + port + '/webpack-dev-server/');
    }
  };
};

try {
  // Webpack Dev Server
  let webpack = require('webpack');
  let webpackConfig = require('./webpack.dev.new.config.js');
  
  if (webpackConfig.devServer.inline) {
    let packUrl = "http://localhost:" + port + "/";

    if (process.env.MONACA_TERMINAL) {
      packUrl = "https://0.0.0.0:" + port  +  "/";
      webpackConfig.devServer.disableHostCheck = true;
    }

    if (webpackConfig.entry.watch && webpackConfig.entry.watch instanceof Array) {
      webpackConfig.entry.watch.unshift("webpack-dev-server/client?" + packUrl);
    } else if (webpackConfig.entry.app && webpackConfig.entry.app instanceof Array) {
      webpackConfig.entry.app.unshift("webpack-dev-server/client?" + packUrl);
    } else if (webpackConfig.entry && webpackConfig.entry instanceof Array) {
      webpackConfig.entry.unshift("webpack-dev-server/client?" + packUrl);
    }

  }

  let WebpackDevServer = require('webpack-dev-server');
  let server = new WebpackDevServer(webpack(webpackConfig), webpackConfig.devServer);

  server.listen(port, '0.0.0.0', hookStdout);

} catch (e) {
  console.log('webpack error', e);
}