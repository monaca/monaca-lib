(function() {
  'use strict';

  var path = require('path'),
    os = require('os'),
    bin = require('nw').findpath(),
    spawn = require('child_process').spawn,
    request = require('request'),
    portfinder = require('portfinder'),
    adb = require('adbkit'),
    client = adb.createClient(),
    Q = require('q'),
    http = require('http'),
    Padlock = require('padlock').Padlock;

  if (!global.webkitProxyLock) {
    global.webkitProxyLock = new Padlock();
  }

  portfinder.basePort = 21538;

  var nwBin = require('nw').findpath(),
    app = path.join(__dirname, 'inspector-app');

  var getPort = function() {
    var deferred = Q.defer();

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
      var nw = spawn(nwBin, [app, webSocketUrl]);
      deferred.resolve();
    }
    catch (err) {
      deferred.reject(err);
    }

    return deferred.promise;
  };

  var startProxy = function() {
    var binaries = [];

    if (os.platform() === 'darwin') {
      binaries = [
        path.join(__dirname, '..', 'bin', 'ios-webkit-debug-proxy', 'darwin', 'ios_webkit_debug_proxy'),
        'ios_webkit_debug_proxy'
      ];
    }
    else if (os.platform() === 'linux') {
      binaries = [
        'ios_webkit_debug_proxy'
      ];
    }
    else if (os.platform() === 'windows') {
      binaries = [
        path.join(__dirname, '..', 'bin', 'ios-webkit-debug-proxy', 'windows', 'ios-webkit-debug-proxy.exe')
      ];
    }
    else {
      binaries = [
        'ios_webkit_debug_proxy'
      ];
    }

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
        }, 100);
      }
      catch (e) {
        deferred.reject(e);
      }

      return deferred.promise;
    };

    var runNext = function(port) {
      var binary = binaries.shift();

      if (!binary) {
        return Q.reject('Unable to start webkit proxy. Maybe it is not installed.');
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
          return runNext(port);
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

      getPort()
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
        if (retries < 20) {
          setTimeout(function() {
            deferred.resolve(searchDeviceForUrl(infoUrl, options, retries + 1));
          }, 500);
        }
        else {
          deferred.reject('Page not found.');
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
          deferred.reject('Didn\'t find page.');
        }
      }
    });

    return deferred.promise;
  };

  var findWebSocketUrl = function(listUrl, options) {
    var deferred = Q.defer();

    request({
      url: listUrl,
      json: true
    }, function(error, response, body) {
      if (error) {
        return deferred.reject(error);
      }
      else if (response.statusCode !== 200) {
        return deferred.reject(response.statusMessage);
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
          return findWebSocketUrl(listUrl, options);
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
    return getPort()
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

    var proc = spawn('adb', ['forward', '--remove-all']);

    proc.on('exit', function(code, signal) {
      if (code === 0) {
        deferred.resolve();
      }
      else {
        deferred.reject('Unable to stop port forwarding.');
      }
    });

    proc.on('error', function() {
      deferred.reject('Unable to start adb. Please install it.');
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
        return Q.reject(options.type ? 'No such device: ' + options.type : 'You must supply a device type.');
    }
  };

  module.exports = {
    launch: launch,
    startProxy: startProxy
  };
})();
