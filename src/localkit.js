(function() {
  // imports
  var Q = require('q'),
    path = require('path'),
    fs = require('fs'),
    http = require('http'),
    dgram = require('dgram'),
    os = require('os'),
    crypto = require('crypto'),
    util = require('util'),
    events = require('events'),
    nconf = require('nconf');

  // local imports
  var ProjectEvents = require(path.join(__dirname, 'localkit', 'projectEvents')),
    Monaca = require(path.join(__dirname, 'monaca')),
    FileWatcher = require(path.join(__dirname, 'localkit', 'fileWatcher')),
    LocalAuth = require(path.join(__dirname, 'localkit', 'localAuth')),
    Api = require(path.join(__dirname, 'localkit', 'api')),
    broadcastAddresses = require(path.join(__dirname, 'localkit', 'broadcastAddresses')),
    inspector = require(path.join(__dirname, 'inspector'));

  // config
  var config = nconf.env()
    .file(path.join(__dirname, 'config.json'))
    .get('localkit');

  var PAIRING_KEYS_FILE = path.join(
    process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'],
    '.cordova', 'monaca_pairing_keys.json'
  );

  /**
   * @class Localkit
   * @description
   *   Create localkit object.
   * @param {object} monaca - Monaca object.
   * @param {boolean} [verbose] - Will output log messages if true.
   * @example
   *   var monaca = new Monaca(),
   *     localkit = new Localkit(monaca);
   */
  var Localkit = function(monaca, verbose) {
    if (!monaca || !(monaca instanceof Monaca)) {
      throw new Error('Must initialize with a Monaca object.');
    }

    /**
     * @description
     *   Monaca object.
     * @name Localkit#monaca
     * @type object
     */
    Object.defineProperty(this, 'monaca', {
      value: monaca,
      writable: false
    });

    this.projects = [];

    Object.defineProperty(this.projects, "hasOwnProperty", {
      enumerable: false,
      value: function(id) {
        for(var p in this.projects) {
          if ( this.projects[p][id] ) {
            return true;
          }
        }
        return false;
      }.bind(this)
    });

    Object.defineProperty(this.projects, "getProjectById", {
      enumerable: false,
      value: function(id) {
        for(var p in this.projects) {
          if ( this.projects[p][id] ) {
            return this.projects[p][id];
          }
        }
        return null;
      }.bind(this)
    });

    Object.defineProperty(this.projects, "getAllProjectIds", {
      enumerable: false,
      value: function() {
        var keys = [];
          for(var p in this.projects) {
            for (var k in this.projects[p]) {
              keys.push(k);
            }
          }
          return keys;
      }.bind(this)
    });

    Object.defineProperty(this.projects, "deleteProjectById", {
      enumerable: false,
      value: function(id) {
        for(var p in this.projects) {
          if ( this.projects[p][id] ) {
            return this.projects.splice(this.projects.indexOf(this.projects[p]),1);
          }
        }
        return null;
      }.bind(this)
    });

    this._isWatching = false;

    /**
     * @description
     *   Dictionary that translate debugger client IDs to pairing keys to keep track
     *   of debuggers paired with the localkit.
     * @name Localkit#pairingKeys
     * @type object
     */
    this.pairingKeys = {};

    if (fs.existsSync(PAIRING_KEYS_FILE)) {
      var jsonfile = fs.readFileSync(PAIRING_KEYS_FILE);
      this.pairingKeys = JSON.parse(jsonfile);
    }

    /**
     * @description
     *   <code>true</code> if beacon transmitter is running.
     * @name Localkit#beaconTransmitterRunning
     * @type boolean
     */
    this.beaconTransmitterRunning = false;

    /**
     * @description
     *   <code>true</code> if HTTP server is running.
     * @name Localkit#httpServerRunning
     * @type boolean
     */
    this.httpServerRunning = false;

    this.httpServerPort = null;
    this.httpServerIpaddr = null;

    /**
     * @description
     *   Toggle verbosity.
     * @name Localkit#verbose
     * @type boolean
     */
    this.verbose = !!verbose;

    this.localAuth = new LocalAuth(this);
    this.api = new Api(this);
  };

  util.inherits(Localkit, events.EventEmitter);

  Localkit.prototype._getServerInfo = function() {
    var loginBody = this.monaca.loginBody;

    return {
      type: config.type,
      port: this.server.address().port,
      os: os.platform(),
      name: loginBody.serverName,
      serverId: loginBody.clientId,
      userHash: crypto.createHash('sha1').update(loginBody.userId).digest('hex'),
      version: config.version
    };
  };

  Localkit.prototype._sendBeacon = function() {
    var port;

    try {
      port = this.server.address().port;
    }
    catch (e) {
      console.error('Unable to get current port. Please start HTTP server before beacon transmitter.');
      this.stopBeaconTransmitter();
    }

    var message = new Buffer(JSON.stringify(this._getServerInfo())),
      addresses = broadcastAddresses();

    var sendBroadcast = function(address) {
      var client = dgram.createSocket('udp4');
      client.on('listening', function() {
        try {
          client.setBroadcast(true);
          client.send(
            message,
            0,
            message.length,
            config.beacon_send_port,
            address,
            function(error, bytes) {
              if (error) {
                console.warn(error);
              }
              client.close();
            }
          );
        }
        catch (e) {
          console.warn(e);
        }
      });

      client.bind();
    };

    for (var i = 0; i < addresses.length; i++) {
      sendBroadcast(addresses[i]);
    }
  };

   /**
   * @method
   * @memberof Localkit
   * @description
   *   Request a pairing key from the Monaca Cloud. Used when pairing with
   *   debugger.
   * @param {string} requestToken - Request token received from debugger.
   * @param {string} clientIdHash - SHA256 hash of debugger client id.
   * @return {Promise}
   */
  Localkit.prototype.requestPairingKey = function(requestToken, clientIdHash) {
    var deferred = Q.defer();

    this.monaca._get('/user/pairing/requestKey', {
      requestToken: requestToken,
      companionClientIdHash: clientIdHash
    }).then(
      function(data) {
        deferred.resolve(JSON.parse(data.body).result.pairingKey);
      },
      function(error) {
        deferred.reject(error);
      }
    );

    return deferred.promise;
  };

  Localkit.prototype._getLocalIp = function() {
    var ifaces = os.networkInterfaces(),
      ifnames = Object.keys(ifaces);

    for (var i = 0; i < ifnames.length; i++) {
      var addresses = ifaces[ifnames[i]];

      for (var j = 0; j < addresses.length; j++) {
        var address = addresses[j];

        if (address && address.family === 'IPv4' && !address.internal) {
          return address.address;
        }
      }
    }

    return '0.0.0.0';
  };

  /**
   * @method
   * @memberof Localkit
   * @description
   *   <p>Returns HTTP Server information</p>
   * @return {Promise} - Resolves to <code>{ ipaddr: IP_ADDRESS, port: PORT, status: TRUE if running }</code>.
   */
  Localkit.prototype.getHttpServerInfo = function() {
    var deferred = Q.defer();

    var result = {
      ipaddr: this.httpServerIpaddr,
      port: this.httpServerPort,
      status: this.httpServerRunning
    }
    deferred.resolve(result);

    return deferred.promise;
  }

  /**
   * @method
   * @memberof Localkit
   * @description
   *   <p>Start HTTP Server. The HTTP server exposes an API that the debugger
   *   uses to communicate with the localkit.</p>
   *
   *   <p>Valid API calls are:</p>
   *
   *   <ul>
   *       <li><code>/api/pairing/request</code> - Used by the debugger to pair with the localkit.</li>
   *       <li><code>/api/projects</code> - Returns a list of available projects.</li>
   *       <li><code>/api/project/:project_id/tree</code> - Returns a list of files in a project.</li>
   *       <li><code>/api/project/:project_id/tree</code> - Used to read the contents of a file.</li>
   *   </ul>
   *
   *   <p>All APIs except the pairing API encrypt the HTTP body using RC4.</p>
   *
   *   <p>There is also an endpoint on <code>/events</code> that uses Server Sent Events (SSE)
   *   to send information about file system changes that the debugger listens to.</p>
   *
   * @param {object} [params] - Options
   * @param {number} [params.httpPort] - Port to listen on. Defaults to 8080.
   * @return {Promise} - Resolves to <code>{ address: IP_ADDRESS, port: PORT }</code>.
   * @example
   *   localkit.startHttpServer().then(
   *     function(server) {
   *       // HTTP server started.
   *       console.log('Server started at: ' + server.address + ':' + server.port);
   *     },
   *     function(error) {
   *       // Failed starting HTTP server.
   *     }
   *   );
   */
  Localkit.prototype.startHttpServer = function(params) {
    var deferred = Q.defer();

    params = params || {};

    if (!this.server) {
      this.server = http.createServer(this.api.requestHandler.bind(this.api));
      this.serverClients = [];
    }

    this.server.on('connection', function(client) {
      this.serverClients.push(client);

      this.emit('clientConnected', client);

      client.on('end', function() {
        this.serverClients.splice(this.serverClients.indexOf(client));
      }.bind(this));
    }.bind(this));

    this.server.on('error', function(error) {
      deferred.reject(error);
    });

    var port = params.httpPort || config.http_server_port;

    this.server.listen(port, function(error) {

      if (error) {
        deferred.reject(error);
      }
      else {
        this.projectEvents = new ProjectEvents(this);
        this.httpServerRunning = true;
        this.httpServerPort = port;
        this.httpServerIpaddr = this._getLocalIp();

        deferred.resolve({
          address: this._getLocalIp(),
          port: port
        });
      }
    }.bind(this));

    return deferred.promise;
  };

  /**
   * @method
   * @memberof Localkit
   * @description
   *   Stop HTTP Server.
   * @return {Promise}
   */
  Localkit.prototype.stopHttpServer = function() {
    var deferred = Q.defer();

    if (this.serverClients && this.serverClients.length) {
      this.serverClients.forEach(function(client) {
        try {
          client.destroy();
        }
        catch (e) {}
      });
    }

    this.server.close(function(error) {
      if (error) {
        deferred.reject(error);
      }
      else {
        this.httpServerRunning = false;
        this.httpServerPort = null;
        this.httpServerIpaddr = null;
        deferred.resolve();
      }
    }.bind(this));

    return deferred.promise;
  };

  /**
   * @method
   * @memberof Localkit
   * @description
   *   <p>Start beacon transmitter. The beacon transmitter will periodically broadcast
   *   a JSON object using UDP. The object contains information about how to connect
   *   to the HTTP API as well as what Monaca user is using the Localkit. The debugger
   *   will connect if the logged in user matches.</p>
   *
   *   <p>The beacon transmitter should be started after the HTTP has been started.</p>
   * @return {Promise}
   */
  Localkit.prototype.startBeaconTransmitter = function() {
    var deferred = Q.defer();

    if (!this.monaca._loggedIn) {
      deferred.reject(new Error('Must be logged in to use this method.'));
    }
    else {
      this._interval = setInterval(this._sendBeacon.bind(this), config.beacon_send_interval);
      this.beaconTransmitterRunning = true;
      deferred.resolve();
    }

    return deferred.promise;
  };

  /**
   * @method
   * @memberof Localkit
   * @description
   *   Stop beacon transmitter.
   * @return {Promise}
   */
  Localkit.prototype.stopBeaconTransmitter = function() {
    var deferred = Q.defer();

    if (this._interval) {
      clearInterval(this._interval);
      this._interval = undefined;
      this.beaconTransmitterRunning = false;
    }

    deferred.resolve();
    return deferred.promise;
  };

  Localkit.prototype.liveReload = function (projectId, projectPath, changeType, filePath) {
    this.projectEvents.sendFileEvent(projectId, changeType, filePath);
    this.emit('live-reload', {
      projectId: projectId,
      changeType: changeType,
      filePath: filePath,
      projectPath: projectPath
    });
  };

  /**
   * @method
   * @memberof Localkit
   * @description
   *  Add a project.
   * @param {String} projectPath - Path to project directory.
   * @param {Object} options Project parameters
   * @param {String} options.name Project name. This name will override the name in config.xml
   * @return {Promise}
   */
  Localkit.prototype.addProject = function(projectPath, options) {
    var deferred = Q.defer(),
      options = options || {};

    this.monaca.getLocalProjectId(projectPath).then(
      function(projectId) {
        if (!fs.existsSync(path.join(projectPath, 'www'))) {
          deferred.reject(projectPath + ' does not have a "www" directory.');
        }
        else if (this.projects.hasOwnProperty(projectId)) {
          // Project already added, don't do anything.
          deferred.resolve(projectId);
        }
        else {

          var fileWatcher = new FileWatcher();

          try {
            fileWatcher.onchange(function(changeType, filePath) {
              this.liveReload(projectId, projectPath, changeType, filePath);
              // this.projectEvents.sendFileEvent(projectId, changeType, filePath);
              // this.emit('live-reload', {
              //   projectId: projectId,
              //   changeType: changeType,
              //   filePath: filePath,
              //   projectPath: projectPath
              // });
            }.bind(this));

            if (this.isWatching()) {
              fileWatcher.run(path.join(projectPath, 'www'));
            }
          }
          catch (e) {
            deferred.reject(e);
            return deferred.promise;
          }
          var obj = {};
          obj[projectId] = {
            fileWatcher: fileWatcher,
            path: projectPath,
            name: options.name
          }
          this.projects.unshift(obj);

          deferred.resolve(projectId);
        }
      }.bind(this),
      function(error) {
        deferred.reject(error);
      }
    );

    return deferred.promise;
  };

  /**
   * @method
   * @memberof Localkit
   * @description
   *  Remove a project.
   * @param {String} projectPath - Path to project directory.
   * @return {Promise}
   */
  Localkit.prototype.removeProject = function(projectPath) {
    var deferred = Q.defer();

    this.monaca.getLocalProjectId(projectPath).then(
      function(projectId) {
        if (this.projects.hasOwnProperty(projectId)) {
          var project = this.projects.getProjectById(projectId);

          try {
            project.fileWatcher.stop();
          }
          catch (e) {
            deferred.reject(e);
            return deferred.promise;
          }

          project.fileWatcher = project.path = null;
          delete this.projects.deleteProjectById(projectId);
          deferred.resolve(projectId);
        }
        else {
          deferred.reject(new Error('No such project.'));
        }
      }.bind(this),
      function(error) {
        deferred.reject(error);
      }
    );

    return deferred.promise;
  };

  /**
   * @method
   * @memberof Localkit
   * @description
   *   Start file watcher for all projects where it's not currently running.
   * @return {Promise}
   */
  Localkit.prototype.startWatch = function() {
    var deferred = Q.defer(),
      paths = [];
    var projectIds = this.projects.getAllProjectIds()
      .filter(function(projectId) {
        return !this.projects.getProjectById(projectId).fileWatcher.isRunning();
      }.bind(this));

    for (var i = 0, l = projectIds.length; i < l; i ++) {
      var project = this.projects.getProjectById(projectIds[i]);

      try {
        var watchDir = path.join(project.path, 'www');

        project.fileWatcher.run(watchDir);
        paths.push(watchDir);
      }
      catch (e) {
        console.log('Unable to start file watcher: ' + e);
      }
    }

    deferred.resolve(paths);
    this._isWatching = false;

    return deferred.promise;
  };

  /**
   * @memberof Localkit
   * @description
   *   Start watching for a specific project.
   * @param {String} projectDir
   * @return {Promise}
   */
  Localkit.prototype.startWatchProject = function(projectDir) {
    var deferred = Q.defer();

    var projectId = this.projects.getAllProjectIds()
      .filter(function(projectId) {
        return this.projects.getProjectById(projectId).path === projectDir;
      }.bind(this))[0];

    this.liveReload(projectId, projectDir, "resync", null);

    if (!projectId) {
      return Q.reject(new Error('No such project.'));
    }
    else {
      var project = this.projects.getProjectById(projectId),
        watchDir = path.join(project.path, 'www');

      if (!project.fileWatcher.isRunning()) {
        try {
          project.fileWatcher.run(watchDir);
        }
        catch (e) {
          return Q.reject(e);
        }
      }
      return Q.resolve(watchDir);
    }
  };

  /**
   * @method
   * @memberof Localkit
   * @description
   *   Stop file watcher for all projects where it's currently running.
   * @return {Promise}
   *   The promise resolves to a list of directories.
   */
  Localkit.prototype.stopWatch = function() {
    var promises = this.projects.getAllProjectIds()
      .filter(function(projectId) {
        return this.projects.getProjectById(projectId).fileWatcher.isRunning();
      }.bind(this))

      .map(function(projectId) {
        var deferred = Q.defer(),
          project = this.projects.getProjectById(projectId);

        try {
          project.fileWatcher.stop();
          deferred.resolve(project.path);
        }
        catch (e) {
          deferred.reject(e);
        }

        return deferred.promise;
      }.bind(this));

    var deferred = Q.defer();

    Q.all(promises).then(
      function(projectPaths) {
        this._isWatching = false;
        deferred.resolve(projectPaths);
      }.bind(this),
      function(error) {
        deferred.reject(error);
      }
    );

    return deferred.promise;
  };

  /**
   * @memberof Localkit
   * @description
   *   Stop watching for a specific project.
   * @param {String} projectDir
   * @return {Promise}
   */
  Localkit.prototype.stopWatchProject = function(projectDir) {
    var deferred = Q.defer();

    var projectId = this.projects.getAllProjectIds()
      .filter(function(projectId) {
        return this.projects.getProjectById(projectId).path === projectDir;
      }.bind(this))[0];

    if (!projectId) {
      return Q.reject(new Error('No such project.'));
    }
    else {
      var project = this.projects.getProjectById(projectId),
        watchDir = path.join(project.path, 'www');

      if (project.fileWatcher.isRunning()) {
        try {
          project.fileWatcher.stop();
        }
        catch (e) {
          return Q.reject(e);
        }
      }
      return Q.resolve(watchDir);
    }
  };

  /**
   * @memberof Localkit
   * @description
   *   Check if project is being watched.
   * @param {String} projectDir
   * @return {Promise}
   */
  Localkit.prototype.isWatchingProject = function(projectDir) {
    var deferred = Q.defer();

    var projectId = this.projects.getAllProjectIds()
      .filter(function(projectId) {
        return this.projects.getProjectById(projectId).path === projectDir;
      }.bind(this))[0];

    if (!projectId) {
      return Q.reject(new Error('No such project.'));
    }
    else {
      var project = this.projects.getProjectById(projectId);

      if (project.fileWatcher.isRunning()) {
        return Q.resolve(true);
      }
      else {
        return Q.resolve(false);
      }
    }
  };

  /**
   * @method
   * @memberof Localkit
   * @description
   *   Send a start project event to the debugger.
   * @param {String} projectPath
   * @param {Object} [options]
   * @param {String} [options.clientId]
   * @return {Promise}
   */
  Localkit.prototype.startProject = function(projectPath, options) {
    var deferred = Q.defer();

    options = options || {};

    this.monaca.getLocalProjectId(projectPath).then(
      function(projectId) {
        if (!this.projects.hasOwnProperty(projectId)) {
          deferred.reject(new Error('No project with id: ' + projectId));
        }
        else {
          try {
            this.projectEvents.sendStartEvent(projectId, options.clientId);
            deferred.resolve(projectId);
          }
          catch (error) {
            deferred.reject(error);
          }
        }
      }.bind(this),
      function(error) {
        deferred.reject(error);
      }
    );

    return deferred.promise;
  };

  /**
   * @method
   * @memberof Localkit
   * @description
   *   Returns <code>true</code> if all projects have live reload enabled.
   * @return {Boolean}
   */
  Localkit.prototype.isWatching = function() {
    return this._isWatching;
  };

  /**
   * @method
   * @memberof Localkit
   * @description
   *   Add a list of projects and remove projects not in the list.
   * @param {Array} pathList - List of project directories.
   * @param {Array} optionsList - List of options objects.
   * @return {Promise}
   */
  Localkit.prototype.setProjects = function(pathList, optionsList) {
    var deferred = Q.defer(),
      optionsList = optionsList || {};

    var getProjects = function() {
      var promises = [];

      for (var i = pathList.length - 1; i >= 0; i--) {
        (function(i) {
          var projectPath = pathList[i],
            options = optionsList[i],
            deferred = Q.defer();

          this.monaca.getLocalProjectId(projectPath).then(
            function(projectId) {
              deferred.resolve({
                path: projectPath,
                projectId: projectId,
                options: options
              });
            },
            function(error) {
              deferred.reject(error);
            }
          );

          promises.push(deferred.promise);
         }.bind(this))(i);
      }

      return Q.all(promises);
    }.bind(this);

    getProjects().then(
      function(projects) {

        var promises = [];

        for (var i = 0, l = projects.length; i < l; i ++) {
          var project = projects[i];
          if (!this.projects.getProjectById(project.projectId)) {
            promises.push(this.addProject(project.path, project.options));
          }
        }
        var ids = this.projects.getAllProjectIds();
        for (var projectId in ids) {
          if (this.projects.hasOwnProperty(ids[projectId])) {
            var projectPath = this.projects.getProjectById(ids[projectId]).path;

            if (pathList.indexOf(projectPath) < 0) {
              promises.push(this.removeProject(projectPath));
            }
          }
        }

        Q.all(promises).then(
          function(projectPaths) {
            deferred.resolve(projectPaths);
          }.bind(this),
          function(error) {
            deferred.reject(error);
          }
        );
      }.bind(this),
      function(error) {
        deferred.reject(error);
      }
    );

    return deferred.promise;
  };

  /**
   * @method
   * @memberof Localkit
   * @description
   *   Fetch list of projects.
   * @return {Promise}
   */
  Localkit.prototype.getProjects = function() {
    var promises = [];
    var ids = this.projects.getAllProjectIds();
    for (var id in ids) {
      var currentId = ids[id];
      (function(id) {
        if (this.projects.hasOwnProperty(id)) {
          var deferred = Q.defer(),
            _project = this.projects.getProjectById(id);
          this.monaca.getProjectInfo(_project.path)
            .then(
              function(project) {

                var project_path = _project.path;
                if (project_path == '.') {
                   project_path = process.cwd();
                }

                project.name = _project.name || project.name;
                project.frameworkVersion = "";
                project.cordovaVersion = "";

                delete require.cache[path.join( project_path, '.monaca', 'project_info.json')];
                try {
                  project.frameworkVersion = require(path.join( project_path, '.monaca', 'project_info.json'))["framework_version"];
                  project.cordovaVersion = require(path.join( project_path, '.monaca', 'project_info.json'))["cordova_version"];
                } catch (e) {
                  console.error(e.message);
                }

                deferred.resolve(project);
              },
              function(error) {
                deferred.reject(error);
              }
            );

          promises.push(deferred.promise);
        }
      }.bind(this))(currentId);
    }

    return Q.all(promises);
  };

  /**
   * @method
   * @memberof Localkit
   * @description
   *   Get file tree for a Monaca project.
   * @param {string} projectId - Project ID.
   * @return {Promise}
   */
  Localkit.prototype.getProjectFiles = function(projectId) {
    var deferred = Q.defer();

    if (this.projects.hasOwnProperty(projectId)) {
      this.monaca.getLocalProjectFiles(this.projects.getProjectById(projectId).path, {
        filter : function(fn) {
          var key = path.join('/', fn);
          key = key.split(path.sep).join('/');

          // Exclude hidden files and folders.
          if (key.indexOf('/.') >= 0) {
            return false;
          }

          // Only include files in /www folder.
          return /^\/(www\/|[^/]*$)/.test(key);
          }
        }).then(
        function(files) {
          var tmp = {};

          var filenames = Object.keys(files);
          for (var i = 0, l = filenames.length; i < l; i ++) {
            var filename = filenames[i];

            if (files.hasOwnProperty(filename)) {
              tmp[filename] = files[filename];
            }
          }

          deferred.resolve(tmp);
        },
        function(error) {
          deferred.reject(error);
        }
      );
    }
    else {
      deferred.reject(new Error('No project with id: ' + projectId));
    }

    return deferred.promise;
  };

  /**
   * @method
   * @memberof Localkit
   * @description
   *   Fetches content of a project file.
   * @param {string} projectId - Project ID.
   * @param {string} filePath - Path to file (in project)
   * @return {Promise}
   */
  Localkit.prototype.readProjectFile = function(projectId, filePath) {
    var deferred = Q.defer();

    if (!this.projects.hasOwnProperty(projectId)) {
      deferred.reject(new Error('No project width id: ' + projectId));
    }
    else {
      var projectPath = this.projects.getProjectById(projectId).path,
        origFilePath = filePath;

      if (filePath.charAt(0) === '/') {
        filePath = filePath.substr(1);
      }

      filePath = path.join(projectPath, filePath);

      // Defence against path traversal attacks.
      var absoluteFilePath = path.resolve(filePath),
        absoluteProjectPath = path.resolve(projectPath);

      if (absoluteFilePath.indexOf(absoluteProjectPath) !== 0) {
        deferred.reject(new Error('File is outside of project path.'));
      }
      else {
        fs.exists(filePath, function(exists) {
          if (!exists) {
            deferred.reject(origFilePath + ' doesn\'t exist.');
          }
          else {
            if (fs.lstatSync(filePath).isDirectory()) {
              deferred.reject(filePath + ' is a directory');
            }
            else {
              fs.readFile(filePath, function(error, data) {
                if (error) {
                  deferred.reject(error);
                }
                else {
                  deferred.resolve(data);
                }
              });
            }
          }
        });
      }
    }

    return deferred.promise;
  };

  /**
   * @method
   * @memberof Localkit
   * @description
   *   Remove pairing information.
   * @return {Promise}
   */
  Localkit.prototype.clearPairing = function() {
    var deferred = Q.defer();

    this.pairingKeys = {};
    fs.writeFile(PAIRING_KEYS_FILE, JSON.stringify(this.pairingKeys), function(error) {
      if (error) {
        deferred.reject(error);
      }
      else {
        deferred.resolve();
      }
    });

    return deferred.promise;
  };

  /**
   * @method
   * @memberof Localkit
   * @description
   *   Get a list of currently connected clients.
   * @return {Promise}
   */
  Localkit.prototype.getClientList = function() {
    var deferred = Q.defer();
    deferred.resolve(this.projectEvents.connectedClients);
    return deferred.promise;
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Init inspector functionality
   * @param {Object} options - Parameter object
   * @param {String} options.adbPath - Path to adb [optional]
   * @param {String} options.proxyPath - Path to iOS WebKit Proxy [optional]
   */
  Localkit.prototype.initInspector = function(config) {
    inspector.initialize(config);
    inspector.startProxy();
  }

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Start inspector
   * @param {Object} options - Parameter object
   * @param {String} options.type - Device type, should be "ios" or "android".
   * @param {String} options.pageUrl - URL of the page to inspect.
   * @param {String} options.projectId - ID of the project to inspect.
   */
  Localkit.prototype.startInspector = function(options) {
    return inspector.launch(options)
      .catch(
        function(error) {
          this.emit('inspectorError', error);
          return Q.reject(error);
        }.bind(this)
      );
  };

  /**
   * @method
   * @memberof Localkit
   * @description
   *   Generate a One-Time Password.
   * @param {number} ttl Number of milliseconds the password should be valid.
   * @return {Promise} - Resolves to <code>{ url: Debugger URL, password: OTP, created: Created At, expires: Will Expire At }</code>.
   */
  Localkit.prototype.generateOneTimePassword = function(ttl) {
    var deferred = Q.defer();

    this.localAuth.generateOneTimePassword(ttl).then(function(password) {
      this.getHttpServerInfo().then(function(serverInfo) {
        password['url'] = [
          'monaca-debugger://localkit-auth?LocalkitId=',
          encodeURIComponent(this.monaca.loginBody.clientId),
          '&authSecret=',
          password.data.toString('hex'),
          '&ipaddr=',
          serverInfo.ipaddr,
          '&port=',
          serverInfo.port
        ].join("");
        deferred.resolve(password);
      }.bind(this), function(error) {
        deferred.reject(error);
      });
    }.bind(this), function(error) {
      deferred.reject(error);
    })

    return deferred.promise;
  };

  /**
   * @method
   * @memberof Localkit
   * @description
   *   Validate a SHA-1 hash of a One-Time Password.
   * @param {string} passwordHash
   * @return Promise
   */
  Localkit.prototype.validateOneTimePassword = function(passwordHash) {
    return this.localAuth.validateOneTimePassword(passwordHash);
  };

  /**
   * @method
   * @memberof Localkit
   * @description
   *   Generate local pairing key
   * @return Promise
   */
  Localkit.prototype.generateLocalPairingKey = function() {
    return this.localAuth.generateLocalPairingKey();
  };

  module.exports = Localkit;
})();
