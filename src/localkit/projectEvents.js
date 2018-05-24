(function() {
  'use strict';

  var SSE = require('sse'),
    shell = require('shelljs'),
    path = require('path'),
    fs = require('fs'),
    crc32 = require('buffer-crc32'),
    qs = require('querystring'),
    rc4 = require(path.join(__dirname, 'rc4'));

  var ProjectEvents = function(localkit) {
    this.localkit = localkit;

    this.sse = new SSE(localkit.server, {
      path: '/events'
    });

    // Monkey patch to validate headers before starting SSE.
    var _handleRequest = this.sse.handleRequest.bind(this.sse);
    this.sse.handleRequest = function(req, res, query) {

      var clientIdHash = req.headers['x-monaca-client-id-hash'],
        pairingKey = this.localkit.pairingKeys[clientIdHash];

      if (!clientIdHash || !pairingKey || !this.localkit.api.validatePairing(req)) {
        res.writeHead(401);
        res.end(JSON.stringify({message: 'Pairing key is invalid.'}) + '\n');
      }
      else {
        _handleRequest(req, res, query);
      }
    }.bind(this);

    this.connectedClients = {};
    this._clients = [];

    this.sse.on('connection', function(client) {
      var clientIdHash = client.req.headers['x-monaca-client-id-hash'],
        pairingKey = this.localkit.pairingKeys[clientIdHash];

      var sendKeepaliveMessage = function() {
        var keepaliveMessage = JSON.stringify({
          action: 'keepalive'
        });

        client.send(rc4.encrypt(keepaliveMessage, pairingKey));
      };

      var interval = setInterval(function() {
        if (client === null) {
          clearInterval(interval);
        }
        else {
          sendKeepaliveMessage();
        }
      }, 3000);
      sendKeepaliveMessage();

      var clientObject = {
        client: client,
        pairingKey: pairingKey,
        clientId: clientIdHash
      };

      this._clients.push(clientObject);

      client.on('close', function() {
        this._clients.splice(this._clients.indexOf(clientObject), 1);
        this.localkit.emit('debuggerDisconnected', this.connectedClients[clientIdHash]);
        delete this.connectedClients[clientIdHash];
      }.bind(this));

      if (!clientIdHash || !pairingKey || !this.localkit.api.validatePairing(client.req)) {
        client.send(JSON.stringify({
          action: 'error',
          message: 'Device not paired with Localkit.'
        }));

        client.req.allowHalfOpen = false;
        return client.res.end();
      }

      else {
        var data = '';
        client.req.on('data', function(chunk) {
          data += chunk;
        });

        client.req.on('end', function() {
          var decrypted = rc4.decrypt(data, pairingKey),
            clientData = qs.parse(decrypted);

          this.connectedClients[clientIdHash] = clientData;
          this.connectedClients[clientIdHash].clientId = clientIdHash;
          this.localkit.emit('debuggerConnected', clientData);

        }.bind(this));
      }
    }.bind(this));
  };

  /**
   * Can be used to send to a specific client or, if client isn't defined,
   * it will send to all connected clients.
   */
  ProjectEvents.prototype.sendMessage = function(message, client) {
    var i, l, pairingKey, _client;

    if (client) {
      for (i = 0, l = this._clients.length; i < l; i ++) {
        _client = this._clients[i];

        if (client === _client) {
          pairingKey = client.pairingKey;
          client.client.send(rc4.encrypt(JSON.stringify(message), pairingKey));
          break;
        }
      }
    }
    else {
      // Send to all connected clients.
      for (i = 0; i < this._clients.length; i++) {
        _client = this._clients[i].client;
        pairingKey = this._clients[i].pairingKey;

        _client.send(rc4.encrypt(JSON.stringify(message), pairingKey));
      }
    }
  };

  ProjectEvents.prototype.sendStartEvent = function(projectId, clientId) {
    if (clientId) {
      var client = this._clients.filter(function(client) {
        return client.clientId === clientId;
      })[0];

      if (client) {
        this.sendMessage({
          action: 'start',
          projectId: projectId
        }, client);
      }
      else {
        throw new Error('No such client: ' + clientId);
      }
    }
    else {
      this.sendMessage({
        action: 'start',
        projectId: projectId
      });
    }
  };

  ProjectEvents.prototype.sendExitEvent = function(projectId) {
    this.sendMessage({
      action: 'exit'
    });
  };

  ProjectEvents.prototype.sendFileEvent = function(projectId, changeType, filePath) {

    if (changeType === 'resync') {
      return this.sendMessage({
        projectId: projectId,
        action: 'resync'
      });
    }

    var isDir;
    try {
      isDir = fs.lstatSync(filePath).isDirectory();
    }
    catch (error) {
      isDir = false;
    }

    var projectPath = this.localkit.projects.getProjectById(projectId).path,
      pathInProject = '/' + path.relative(projectPath, filePath).split(path.sep).join('/');

    var sendSaveEvent = function(filePath, pathInProject) {

      fs.readFile(filePath, function(error, data) {
        if (error) {
          return;
        }
        else {
          var hash = crc32(data).toString('hex');
          var base64Body = new Buffer(data).toString('base64');

          return this.sendMessage({
            projectId: projectId,
            action: 'fileSave',
            data: base64Body,
            contentHash: hash,
            path: pathInProject
          });
        }
      }.bind(this));
    }.bind(this);

    if (changeType === 'create') {
      if (isDir) {
        var files = shell.ls('-R', filePath).map(function(file) {
          return path.join(filePath, file);
        });

        files.unshift(filePath);

        for (var i = 0, l = files.length; i < l; i ++) {
          var file = files[i];

          pathInProject = '/' + path.relative(projectPath, file).split(path.sep).join('/');

          if (fs.lstatSync(file).isDirectory()) {
            return this.sendMessage({
              projectId: projectId,
              action: 'makeDir',
              path: pathInProject
            });
          } else {
            return sendSaveEvent(file, pathInProject);
          }
        }
      }
      else {
        return sendSaveEvent(filePath, pathInProject);
      }
    }
    else if (changeType === 'update') {
      return sendSaveEvent(filePath, pathInProject);
    }
    else if (changeType === 'delete') {
      return this.sendMessage({
        projectId: projectId,
        action: 'fileDelete',
        path: pathInProject
      });
    }
  };

  module.exports = ProjectEvents;
})();
