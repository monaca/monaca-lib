(function() {
  'use strict';

  // imports
  var qs = require('querystring'),
    path = require('path'),
    fs = require('fs'),
    rc4 = require(path.join(__dirname, 'rc4')),
    inspector = require(path.join(__dirname, '..', 'inspector'));

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
      '/api/debugger/inspect': this.inspectApi.bind(this)
    };
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

    var remotePairingKey;
    try {
      remotePairingKey = rc4.decrypt(request.headers['x-monaca-client-credential'], pairingKey);
    }
    catch (error) {
      remotePairingKey = null;
    }

    if (remotePairingKey === pairingKey) {
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

      if (body.length > 1e6) {
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
      deviceId = data.deviceId,
      abstractSocketAddress = data.abstractSocketAddress,
      fileUrl = data.fileUrl;

    if (!deviceId || !abstractSocketAddress || !fileUrl) {
      return this.sendJsonResponse(response, 400, 'Parameters missing.', undefined, true, pairingKey);
    }

    inspector.launch(deviceId, abstractSocketAddress, fileUrl).then(
      function() {
        return this.sendJsonResponse(response, 200, 'Inspection started.', undefined, true, pairingKey);
      }.bind(this),
      function(error) {
        return this.sendJsonResponse(response, 500, 'Unable to start inspector.', undefined, true, pairingKey);
      }.bind(this)
    );
  }

  module.exports = Api;
})();
