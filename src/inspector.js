(function() {
  'use strict';

  var path = require('path'),
    bin = require('nw').findpath(),
    spawn = require('child_process').spawn,
    request = require('request'),
    portfinder = require('portfinder'),
    adb = require('adbkit').createClient(),
    Q = require('q'),
    http = require('http');

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

  var getWebSocketUrl = function(port, pageUrl) {
    var deferred = Q.defer();

    http.get('http://localhost:' + port + '/json', function(res) {
      var data = '';

      res.on('data', function(chunk) {
        data += chunk;
      });

      res.on('end', function() {
        try {
          var pages = JSON.parse(data);

          for (var i = 0; i < pages.length; i++) {
            var page = pages[i];

            if (page.url.trim() === pageUrl.trim()) {
              return deferred.resolve(page.webSocketDebuggerUrl);
            }
          }

          deferred.reject('No debugger found.');
        }
        catch (err) {
          deferred.reject(err);
        }
      });
    })
    .on('error', function(err) {
      deferred.reject(err);
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

  var startProxy = function(port) {
    var deferred = Q.defer();

    try {
      var proc = spawn('ios_webkit_debug_proxy', ['-c', 'null:' + port + ',:' + (port + 1) + '-' + (port + 100)]);
      deferred.resolve('http://localhost:' + port + '/json');
    }
    catch (error) {
      deferred.reject(error);
    }

    return deferred.promise;
  };

  var firstSuccess = function(promises) {
    var deferred = Q.defer(),
      success = [], failure = [];

    for (var i = 0, l = promises.length; i < l; i ++) {
      var promise = promises[i];

      promise.then(
        function(data) {
          success.push(data);
        },
        function(error) {
          failure.push(error);
        }
      ).finally(
        function() {
          if (success.length + failure.length === promises.length) {
            if (success.length) {
              deferred.resolve(success[0]);
            }
            else {
              deferred.reject(failure[0]);
            }
          }
        }
      );
    }

    return deferred.promise;
  };

  var searchDeviceForUrl = function(infoUrl, pageUrl, retries) {
    var deferred = Q.defer(),
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
        // Retry
        if (retries < 20) {
          setTimeout(function() {
            deferred.resolve(searchDeviceForUrl(infoUrl, pageUrl, retries + 1));
          }, 50);
        }
        else {
          deferred.reject('Page not found.');
        }
      }
      else {
        var result = body.filter(function(page) {
          return page.url === pageUrl;
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

  var findWebSocketUrl = function(listUrl, pageUrl) {
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

      body.push({});
      body[1].url = 'localhost:123';

      var promises = body.map(function(device) {
        var infoUrl = 'http://' + device.url + '/json';
        return searchDeviceForUrl(infoUrl, pageUrl);
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
    return getPort()
      .then(startProxy)
      .then(
        function(listUrl) {
          return findWebSocketUrl(listUrl, options.pageUrl);
        }
      )
      .then(startDevTools)
      .then(
        function(bla) {
          console.log('sucess', bla);
        },
        function(bla) {
          console.log('error', bla);
        }
      );
  };

  var launch2 = function(options) {
    options = options || {};

    switch (options.type) {
      case 'ios':
        return launchIOS(options);
        break;
      case 'android':
        return launchAndroid(options);
        break;
      default:
        return Q.reject(options.type ? 'No such device: ' + options.type : 'You must supply a device type.');
    }
  };

  var launch = function(deviceId, socketName, pageUrl) {
    var deferred = Q.defer(),
      port;

    if (!deviceId || !socketName || !pageUrl) {
      deferred.reject('Parameters missing.');
    }
    else {
      getPort()
      .catch(
        function() {
          return 9222;
        }
      )
      .then(
        function(_port) {
          port = _port;
          return adb.forward(deviceId, 'tcp:' + port, 'localabstract:' + socketName);
        }
      )
      .then(
        function() {
          return getWebSocketUrl(port, pageUrl);
        },
        function(err) {
          deferred.reject(err);
        }
      )
      .then(
        function(webSocketUrl) {
          return startDevTools(webSocketUrl);
        },
        function(err) {
          deferred.reject(err);
        }
      ).then(
        function() {
          deferred.resolve();
        },
        function(err) {
          deferred.reject(err);
        }
      );
    }

    return deferred.promise;
  };

  module.exports = {
    launch: launch,
    launch2: launch2
  };
})();
