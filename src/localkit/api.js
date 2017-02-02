(function() {
  'use strict';

  // imports
  var qs = require('querystring'),
    path = require('path'),
    fs = require('fs'),
    crypto = require('crypto'),
    Q = require('q'),
    rc4 = require(path.join(__dirname, 'rc4'));

  var PAIRING_KEYS_FILE = path.join(
    process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'],
    '.cordova', 'monaca_pairing_keys.json'
  );

  var Api = function(localkit) {
    this.localkit = localkit;
    this.monaca = localkit.monaca;

    this.routes = {
      '/api/pairing/request': this.pairingApi.bind(this),
      '/api/projects': this.projectsApi.bind(this),
      '/api/project/:project_id/file/tree': this.fileTreeApi.bind(this),
      '/api/project/:project_id/file/read': this.fileReadApi.bind(this),
      '/api/project/:project_id/started': this.noop.bind(this),
      '/api/project/:project_id/stopped': this.noop.bind(this),
      '/api/debugger/inspect': this.inspectApi.bind(this),
      '/api/local/auth': this.localAuthApi.bind(this)
    };
  };

  Api.prototype.noop = function(request, response) {
    response.end(JSON.stringify({
      status: 'ok',
      code: 200
    }));
  };

  Api.prototype.sendJsonResponse = function(response, code, message, result, encrypt, pairingKey) {
    response.writeHead(code, {
      'Content-Type': 'application/json'
    });

    var data = {
      status: code.toString()[0] === '2' ? 'ok' : 'fail',
      code: code,
      message: message
    };

    if (result) {
      data.result = result;
    }

    var msg = JSON.stringify(data);

    if (this.monaca.debug) {
      console.debug("Local Response: " + msg);
    }

    this.localkit.emit('httpResponse', {
      // Warning: One more httpResponse emit below
      response: response,
      code: code,
      message: message
    });

    if (encrypt) {
      response.end(rc4.encrypt(msg, pairingKey));
    }
    else {
      response.end(msg);
    }
  };

  Api.prototype.matchRoutes = function(url, route) {
    var urlParts = url.split('?')[0].split('/'),
      routeParts = route.split('/');

    if (urlParts.length !== routeParts.length) {
      return null;
    }

    var data = {};

    for (var i = 0, l = urlParts.length; i < l; i ++) {
      var urlPart = urlParts[i],
        routePart = routeParts[i];

      if (routePart.charAt(0) === ':') {
        data[routePart.substr(1)] = urlPart;
      }
      else {
        if (routePart !== urlPart) {
          return null;
        }
      }
    }

    return data;
  };

  Api.prototype.getPairingKey = function(request) {
    var clientId = request.headers['x-monaca-client-id-hash'];

    return this.localkit.pairingKeys[clientId];
  };

  Api.prototype.requestHandler = function(request, response) {
    if (this.monaca.debug) {
      console.debug("Local Request to: " + request.url);
    }

    var keys = Object.keys(this.routes);

    for (var i = 0, l = keys.length; i < l; i ++) {
      var data = this.matchRoutes(request.url, keys[i]);

      if (data) {
        return this.routes[keys[i]](request, response, data);
      }
    }

    this.sendJsonResponse(response, 404, 'No such route.');
  };

  Api.prototype.pairingApi = function(request, response) {
    var data = qs.parse((request.url + '?').split('?')[1]),
      requestToken = data.requestToken,
      clientIdHash = data.clientIdHash;

    if (!requestToken || !clientIdHash) {
      if (this.localkit.verbose) {
        console.log('Invalid pairing paramters.');
      }
      return this.sendJsonResponse(400, 'Must specify request token and client id hash.');
    }
    else {
      this.localkit.requestPairingKey(requestToken, clientIdHash).then(
        function(pairingKey) {
          if (this.localkit.verbose) {
            console.log('Paired with debugger!');
          }
          this.localkit.pairingKeys[clientIdHash] = pairingKey;

          fs.writeFile(PAIRING_KEYS_FILE, JSON.stringify(this.localkit.pairingKeys),  function(error) {
            if (error) {
              return this.sendJsonResponse(response, 500, 'Unable to save pairing key.');
            }

            return this.sendJsonResponse(response, 200, 'Received pairing key.', this.localkit._getServerInfo());
          }.bind(this));
        }.bind(this),
        function(error) {
          if (this.localkit.verbose) {
            console.log('Failed pairing with debugger.');
          }
          return this.sendJsonResponse(response, 400, error);
        }.bind(this)
      );
    }
  };

  Api.prototype.validatePairing = function(request) {
    var pairingKey = this.getPairingKey(request);

    if (!pairingKey) {
      if (this.localkit.verbose) {
        console.log('No pairing key associated with this device.');
      }
      return false;
    }

    var expectedClientCredential;
    try {
      expectedClientCredential = rc4.encrypt(pairingKey.toString("hex"), new Buffer(pairingKey.toString("hex"), "utf8"));
    } catch (error) {
      expectedClientCredential = null;
    }

    if (expectedClientCredential === request.headers['x-monaca-client-credential']) {
      return true;
    }

    if (this.localkit.verbose) {
      console.log('Invalid pairing key.');
    }

    return false;
  };

  Api.prototype.projectsApi = function(request, response) {
    if (!this.validatePairing(request)) {
      this.sendJsonResponse(response, 401, 'Not paired with debugger.');
      return;
    }

    var pairingKey = this.getPairingKey(request);

    if (this.localkit.verbose) {
      console.log('Debugger requested project list.');
    }

    this.localkit.getProjects().then(
      function(projects) {
        this.sendJsonResponse(response, 200, 'Project list', projects, true, pairingKey);
      }.bind(this),
      function(error) {
        this.sendJsonResponse(response, 400, 'Unable to get project list.', undefined, true, pairingKey);
      }.bind(this)
    );
  };

  Api.prototype.fileTreeApi = function(request, response, data) {
    if (!this.validatePairing(request)) {
      this.sendJsonResponse(response, 401, 'Not paired with debugger.');
      return;
    }

    var pairingKey = this.getPairingKey(request);

    var projectId = data.project_id;

    if (this.localkit.verbose) {
      console.log('Debugger requested file tree.');
    }

    this.localkit.getProjectFiles(projectId).then(
      function(files) {
        this.sendJsonResponse(response, 200, 'File list', {items: files}, true, pairingKey);
      }.bind(this),
      function(error) {
        this.sendJsonResponse(response, 400, 'Unable to get project files.', undefined, true, pairingKey);
      }.bind(this)
    );

  };

  Api.prototype.fileReadApi = function(request, response, data) {
    if (!this.validatePairing(request)) {
      this.sendJsonResponse(response, 401, 'Not paired with debugger.');
      return;
    }

    var pairingKey = this.getPairingKey(request);

    var projectId = data.project_id,
      body = '';

    request.on('data', function (data) {
      body += data;

      if (body.length > 1e8) {
        request.connection.destroy();
      }
    });

    request.on('end', function () {
      try {
        var data = JSON.parse(rc4.decrypt(body, pairingKey));

        if (this.localkit.verbose) {
          console.log('Debugger requested file: ' + data.path);
        }

        this.localkit.readProjectFile(projectId, data.path).then(
          function(buf) {
            response.writeHead(200, {
              'Content-Type': 'application/octet-stream'
            });
            response.end(rc4.encrypt(buf, pairingKey));

            this.localkit.emit('httpResponse', {
              response: response,
              code: '200',
              message: 'File read ' + data.path
            });

          }.bind(this),
          function(error) {
            this.sendJsonResponse(response, 500, 'Unable to read file.', undefined, true, pairingKey);
          }.bind(this)
        );
      }
      catch (error) {
        this.sendJsonResponse(response, 400, 'Unable to parse data', undefined, true, pairingKey);
      }
    }.bind(this));
  };

  Api.prototype.inspectApi = function(request, response) {
    if (!this.validatePairing(request)) {
      this.sendJsonResponse(response, 401, 'Not paired with debugger.');
      return;
    }

    var data = qs.parse((request.url + '?').split('?')[1]),
      pairingKey = this.getPairingKey(request),
      fileUrl = data.fileUrl;

    if (!fileUrl) {
      return this.sendJsonResponse(response, 400, 'Parameters missing.', undefined, true, pairingKey);
    }

    var platform = data['abstractSocketAddress'] ? 'android' : 'ios';

    this.localkit.startInspector({
      type: platform,
      pageUrl: fileUrl
    }).then(
      function() {
        return this.sendJsonResponse(response, 200, 'Inspection started.', undefined, true, pairingKey);
      }.bind(this),
      function(error) {
        return this.sendJsonResponse(response, 500, 'Unable to start inspector: ' + error, undefined, true, pairingKey);
      }.bind(this)
    );
  }

  Api.prototype.localAuthApi = function(request, response) {
    var passwordHash = request.headers['x-otp-hash'] || '';

    var get = function(request) {
      var body = '',
        deferred = Q.defer();

      request.on('data', function(data) {
        body += data;

        if (body.length > 1e8) {
          request.connection.destroy();
          deferred.reject({code: 500, message: ' too large.'});
        }
      });

      request.on('end', function() {
        deferred.resolve(body);
      });

      return deferred.promise;
    };

    var decrypt = function(body, otp) {
      try {
        return Q.resolve(rc4.decrypt(body, otp));
      }
      catch (e) {
        return Q.reject({code: 400, message: 'Unable to decrypt body.'});
      }
    };

    var parse = function(body) {
      try {
        return Q.resolve(qs.parse(body));
      }
      catch (e) {
        return Q.reject({code: 400, message: 'Unable to parse body.'});
      }
    };

    var validate = function(data) {
      if (!data.clientId) {
        return Q.reject({code: 400, message: '"clientId" parameter missing.'});
      }
      else {
        return Q.resolve(data);
      }
    };

    var pairing = function(data) {
      return this.localkit.generateLocalPairingKey()
        .then(
          function(pairingKey) {
            var shasum = crypto.createHash('sha256');
            shasum.update(data.clientId);
            var clientIdHash = shasum.digest('hex');

            this.localkit.pairingKeys[clientIdHash] = pairingKey;

            var writeFile = Q.denodeify(fs.writeFile);

            return writeFile(PAIRING_KEYS_FILE, JSON.stringify(this.localkit.pairingKeys))
              .then(
                function() {
                  // Pairing completed.
                  return Q.resolve({data: data, pairingKey: pairingKey});
                },
                function(error) {
                  return Q.reject({code: 500, message: 'Unable to save pairing keys.'});
                }
              );
          }.bind(this),
          function() {
            return Q.reject({code: 500, message: 'Unable to generate pairing key.'});
          }
        );
    }.bind(this);

    this.localkit.validateOneTimePassword(passwordHash)
      .then(
        function(password) {
          var otp = password.data;

          get(request)
            .then(
              function(body) {
                return decrypt(body, otp);
              }
            )
            .then(parse)
            .then(validate)
            .then(pairing)
            .then(
              function(param) {
                var data = param.data,
                  pairingKey = param.pairingKey;

                var serverInfo = this.localkit._getServerInfo(),
                  userInfo = this.monaca.getCurrentUser();

                var ip = request.connection.localAddress.replace(/^:.*:/, '');;

                var data = {
                  type: serverInfo.type,
                  port: serverInfo.port,
                  os: serverInfo.os,
                  serverName: serverInfo.name,
                  serverId: serverInfo.serverId,
                  userHash: serverInfo.userHash,
                  version: serverInfo.version,
                  userId: userInfo.userId,
                  username: userInfo.username,
                  email: userInfo.email,
                  pairingKey: pairingKey.toString('hex')
                };

                this.sendJsonResponse(response, 200, 'Pairing successful.', data, true, otp);
              }.bind(this),
              function(error) {
                this.sendJsonResponse(response, error.code, error.message);
              }.bind(this)
            );
        }.bind(this),
        function(error) {
          return this.sendJsonResponse(response, 401, 'Failed to process the request. The one-time password might have expired.');
        }.bind(this)
      )
  };

  module.exports = Api;
})();
