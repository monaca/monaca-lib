(function() {
  'use strict';

  var path = require('path'),
    bin = require('nw').findpath(),
    spawn = require('child_process').spawn,
    portfinder = require('portfinder'),
    adb = require('adbkit').createClient(),
    Q = require('q'),
    http = require('http');

  var nwBin = require('nw').findpath(),
    app = path.join(__dirname, 'inspector');

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

  var getWebSocketUrl = function(port, fileUrl) {
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

            if (page.url.trim() === fileUrl.trim()) {
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

  var launch = function(deviceId, socketName, fileUrl) {
    var deferred = Q.defer(),
      port;

    if (!deviceId || !socketName || !fileUrl) {
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
          return getWebSocketUrl(port, fileUrl);
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
    launch: launch
  };
})();
