(function() {
  'use strict';

  var path = require('path'),
    os = require('os'),
    fs = require('fs'),
    spawn = require('child_process').spawn,
    request = require('request'),
    portfinder = require('portfinder'),
    adb = require('adbkit'),
    client = adb.createClient(),
    Q = require('q'),
    http = require('http'),
    Padlock = require('padlock').Padlock;

  // Failed starting the proxy. Probably because no iOS device is connected.
  var ERROR_START_PROXY    = 'ERROR_START_PROXY',
  // Failed to find page to inspect. Probably because the app is not running in the Debugger.
      ERROR_NO_PAGE        = 'ERROR_NO_PAGE',
  // Device is not connected by USB or USB debugging is not enabled.
      ERROR_USB_CONNECTION = 'ERROR_USB_CONNECTION',
  // Generic ADB error. Will happen when adb fails to launch or port forwarding fails.
      ERROR_ADB            = 'ERROR_ADB',
  // Will happen if a request is made to inspect a device that is not "android" or "ios".
      ERROR_NO_SUCH_DEVICE = 'ERROR_NO_SUCH_DEVICE';

  var adbProc = [];

  var config = {
    'adbPath': 'adb',
    'proxyPath': function() {
      switch (os.platform()) {
        case 'darwin':
          return path.join(__dirname, '..', 'bin', 'ios-webkit-debug-proxy', 'darwin', 'ios_webkit_debug_proxy');
        case 'win32':
          return path.join(__dirname, '..', 'bin', 'ios-webkit-debug-proxy', 'windows', 'ios-webkit-debug-proxy.exe');
        default:
          return '/usr/local/bin/ios_webkit_debug_proxy';
      }
    }(),
    'inspectorCallback': function(args) {
      console.log('Unimplemented. Called with the following args', args);
    }
  };

  if (!global.webkitProxyLock) {
    global.webkitProxyLock = new Padlock();
  }

  var getPort = function(basePort) {
    var deferred = Q.defer();

    if (basePort) {
      portfinder.basePort = basePort;
    }
    else {
      portfinder.basePort = 8002;
    }

    portfinder.getPort(function(err, port) {
      if (err) {
        deferred.reject(err);
      }
      else {
        deferred.resolve(port);
      }
    });

    return deferred.promise;
  };

  var startDevTools = function(webSocketUrl) {
    var deferred = Q.defer();

    try {
      var result = config.inspectorCallback({
        app: path.join(__dirname, 'inspector-app'),
        webSocketUrl: webSocketUrl,
        nwUrl: path.join(__dirname, 'inspector-app', 'devtools', 'front_end', 'inspector.html'),
        electronUrl: 'file://' + path.join(__dirname, 'inspector-app', 'electron.html'),
        inspectorUrl: 'devtools/front_end/inspector.html?ws=' + webSocketUrl.replace(/^ws:\/\//, ''),
        args: '?ws=' + webSocketUrl.replace(/^ws:\/\//, '')
      });

      deferred.resolve(result);
    }
    catch (err) {
      console.log('Calling inspector callback has failed. ' + err);
      deferred.reject(err);
    }

    return deferred.promise;
  };

  var startProxy = function() {
    var spawnProcess = function(binary, port) {
      var deferred = Q.defer();

      try {
        var proc = spawn(binary, ['-c', 'null:' + port + ',:' + (port + 1) + '-' + (port + 100)]);

        proc.on('error', function(error) {
          deferred.reject(error);
        });

        setTimeout(function() {
          if (proc.exitCode === null) {
            deferred.resolve(proc);
          }
          else {
            deferred.reject();
          }
        }, 400);
      }
      catch (e) {
        deferred.reject(e);
      }

      return deferred.promise;
    };

    var runNext = function(port, nbrOfTimes) {
      var binary = config.proxyPath,
        nbrOfTimes = nbrOfTimes || 0;

      if (!config.proxyPath || !fs.existsSync(config.proxyPath)) {
        return Q.reject(ERROR_START_PROXY);
      }

      return spawnProcess(binary, port).then(
        function(proc) {
          var url = 'http://localhost:' + port + '/json';

          global.iosWebkitProxyProc = proc;
          global.iosWebkitProxyUrl = url;

          proc.on('exit', function() {
            delete global.iosWebkitProxyProc;
            delete global.iosWebkitProxyUrl;
          });

          return Q.resolve(url);
        },
        function() {
          if (nbrOfTimes > 3) {
            return Q.reject(ERROR_START_PROXY);
          }

          var deferred = Q.defer();

          setTimeout(function() {
            runNext(port, nbrOfTimes + 1)
              .then(
                function(result) {
                  deferred.resolve(result);
                },
                function(error) {
                  deferred.reject(error);
                }
              );
          }, 500);

          return deferred.promise;
        }
      );
    };

    var deferred = Q.defer(),
      lock = global.webkitProxyLock;

    lock.runwithlock(function() {
      var proc = global.iosWebkitProxyProc;

      if (proc) {
        lock.release();
        return deferred.resolve(global.iosWebkitProxyUrl);
      }

      getPort(8002)
        .then(runNext)
        .then(
          function(result) {
            deferred.resolve(result);
          },
          function(error) {
            deferred.reject(error);
          }
        )
        .finally(function() {
          lock.release();
        });
    });

    return deferred.promise;
  };

  var stopProxy = function() {
    if (global.iosWebkitProxyProc) {
      try {
        global.iosWebkitProxyProc.kill();
      }
      catch (e) {
      }

      delete global.iosWebkitProxyProc;;
      delete global.iosWebkitProxyUrl;
    }

    return Q.resolve();
  };

  var firstSuccess = function(promises) {
    var deferred = Q.defer(),
      successes = [], errors = [];

    var onSuccess = function(data) {
      successes.push(data);
    };

    var onError = function(error) {
      errors.push(error);
    };

    var onComplete = function() {
      if (successes.length + errors.length === promises.length) {
        if (successes.length) {
          deferred.resolve(successes[0]);
        }
        else {
          deferred.reject(errors[0]);
        }
      }
    };

    for (var i = 0, l = promises.length; i < l; i ++) {
      promises[i]
        .then(onSuccess, onError)
        .finally(onComplete);
    }

    return deferred.promise;
  };

  var searchDeviceForUrl = function(infoUrl, options, retries) {
    var deferred = Q.defer();

    retries = retries || 0;

    request({
      url: infoUrl,
      json: true
    }, function(error, response, body) {

      if (error) {
        deferred.reject(error);
      }
      else if (response.statusCode !== 200) {
        deferred.reject(response.statusMessage);
      }
      else if (body.length === 0) {
        // Retry since sometimes it takes some time for the device to turn up in the list.
        if (retries < 10) {
          setTimeout(function() {
            deferred.resolve(searchDeviceForUrl(infoUrl, options, retries + 1));
          }, 500);
        }
        else {
          deferred.reject(ERROR_NO_PAGE);
        }
      }
      else {
        var result = body.filter(function(page) {
          var ret = true;

          if (options.pageUrl) {
            ret = ret && options.pageUrl.trim() === page.url.trim();
          }

          if (options.projectId) {
            ret = ret && page.url.indexOf('/' + options.projectId.trim() + '/') >= 0;
          }

          return ret;
        });

        if (result[0]) {
          deferred.resolve(result[0].webSocketDebuggerUrl);
        }
        else {
          deferred.reject(ERROR_NO_PAGE);
        }
      }
    });

    return deferred.promise;
  };

  var findWebSocketUrl = function(listUrl, options) {
    var deferred = Q.defer();

    request({
      url: listUrl,
      json: true,
      timeout: 1000
    }, function(error, response, body) {
      if (error || body.length === 0 || response.statusCode !== 200) {
        return deferred.reject(ERROR_USB_CONNECTION);
      }

      var promises = body.map(function(device) {
        var infoUrl = 'http://' + device.url + '/json';
        return searchDeviceForUrl(infoUrl, options);
      });

      firstSuccess(promises).then(
        function(url) {
          deferred.resolve(url);
        },
        function(error) {
          deferred.reject(error);
        }
      );
    });

    return deferred.promise;
  };

  var launchIOS = function(options) {
    return startProxy()
      .then(
        function(listUrl) {
          return findWebSocketUrl(listUrl, options)
            .catch(
              function(error) {
                return stopProxy()
                  .then(
                    function() {
                      return Q.reject(error);
                    }
                  );
              }
            );
        }
      )
      .then(startDevTools);
  };

  var findAbstractSockets = function() {
    return client.listDevices()
      .then(
        function(devices) {
          var promises = devices
            .map(
              function(device) {
                return client.shell(device.id, 'cat /proc/net/unix | grep -a remote')
                  .then(adb.util.readAll)
                  .then(
                    function(output) {
                      return [device.id, output.toString()];
                    }
                  );
              }
            );

          return Q.all(promises).then(
            function(results) {
              var sockets = {};

              for (var i = 0, l = results.length; i < l; i ++) {
                var deviceId = results[i][0],
                  output = results[i][1];

                var matches = output.match(/@[^\s]+/g) || [];

                sockets[deviceId] = matches
                  .map(function(socket) {
                    return socket.replace(/^@/, 'localabstract:');
                  });
              }
              return sockets;
            }
          );
        }
      );
  };

  var forwardAndroidDevice = function(deviceId, abstractSocket) {
    return getPort(8102)
      .then(
        function(port) {
          return client.forward(deviceId, 'tcp:' + port, abstractSocket)
            .then(
              function() {
                return 'http://localhost:' + port + '/json';
              }
            );
        }
      );
  };

  var removeForwarding = function() {
    var deferred = Q.defer();

    var proc = spawn(config.adbPath, ['forward', '--remove-all']);

    adbProc.push(proc);

    proc.on('exit', function(code, signal) {
      if (code === 0) {
        deferred.resolve();
      }
      else {
        deferred.reject(ERROR_ADB);
      }
    });

    proc.on('error', function(error) {
      deferred.reject(ERROR_ADB);
    });

    return deferred.promise;
  };

  var launchAndroid = function(options) {
    return removeForwarding()
      .then(findAbstractSockets)
      .then(
        function(abstractSockets) {
          var promises = [];

          var deviceIds = Object.keys(abstractSockets);

          if (deviceIds.length === 0) {
            return Q.reject(ERROR_USB_CONNECTION);
          }

          for (var i = 0, l = deviceIds.length; i < l; i ++) {
            var deviceId = deviceIds[i];

            if (abstractSockets.hasOwnProperty(deviceId)) {
              var sockets = abstractSockets[deviceId];

              for (var j = 0, ll = sockets.length; j < ll; j ++) {
                var abstractSocket = sockets[j];

                promises.push(forwardAndroidDevice(deviceId, abstractSocket));
              }
            }
          }

          if (promises.length === 0) {
            return Q.reject(ERROR_NO_PAGE);
          }

          return Q.all(promises);
        }
      )
      .then(
        function(urls) {

          var promises = urls
            .map(
              function(url) {

                return searchDeviceForUrl(url, options);
              }
            );

          return firstSuccess(promises);
        }
      )
      .then(startDevTools);
  };

  var launch = function(options) {
    options = options || {};

    switch (options.type) {
      case 'ios':
        return launchIOS(options);
      case 'android':
        return launchAndroid(options);
      default:
        return Q.reject(ERROR_NO_SUCH_DEVICE);
    }
  };

  var initialize = function(configOptions) {
    configOptions = configOptions || {};
    for (var i in configOptions) {
      if (config.hasOwnProperty(i)) {
        config[i] = configOptions[i];
      }
    }
  }

  var onClose = function() {
    try {
      global.iosWebkitProxyProc.kill();
    }
    catch (e) {}

    for (var i = 0, l = adbProc.length; i < l; i ++) {
      var proc = adbProc[i];

      try {
        proc.kill();
      }
      catch (e) {}
    }
  };

  process.on('exit', onClose);
  process.on('uncaughtException', onClose);
  process.on('SIGINT', onClose);
  process.on('SIGTERM', onClose);

  module.exports = {
    initialize: initialize,
    launch: launch,
    startProxy: startProxy
  };
})();
