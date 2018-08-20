(function() {
  'use strict';

  var Q = require('q'),
    qlimit = require('qlimit'),
    request = require('request'),
    os = require('os'),
    path = require('path'),
    fs = require('fs-extra'),
    shell = require('shelljs'),
    crc32 = require('buffer-crc32'),
    nconf = require('nconf'),
    rimraf = require('rimraf'),
    child_process = require('child_process'),
    async = require('async'),
    extend = require('extend'),
    crypto = require('crypto'),
    xml2js = require('xml2js'),
    lockfile = require('lockfile'),
    tmp = require('tmp'),
    extract = require('extract-zip'),
    glob = require('glob'),
    EventEmitter = require('events'),
    npm;

  const { spawn } = require('child_process');
  const utils = require(path.join(__dirname, 'utils'));
  const migration = require('./migration');

  // local imports
  var localProperties = require(path.join(__dirname, 'monaca', 'localProperties'));

  var USER_CORDOVA = path.join(
      process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'],
      '.cordova'
  );

  var NPM_PACKAGE_FILE = path.join(USER_CORDOVA, 'package.json');
  var USER_DATA_FILE = path.join(USER_CORDOVA, 'monaca.json');
  var CONFIG_FILE = path.join(USER_CORDOVA, 'monaca_config.json');

  // error message
  const ERROR_DIRECTORY_PATH_MESSAGE = 'This is directory. Please provide the file path.';

  // config
  var config = nconf.env()
    .file(path.join(__dirname, 'config.json'))
    .get('monaca');

  /**
   * @class Monaca
   * @description
   *   Create Monaca API object.
   * @param {string} [apiRoot] - Root of Monaca web API. Defaults to {@link https://ide.monaca.mobi/api}.
   * @example
   *   var monaca = new Monaca();
   *
   *   monaca.login('my@email.org', 'mypassword').then(
   *     function() {
   *       // Login successful. Let's do some stuff!
   *     },
   *     function(error) {
   *       // Login failed! :(
   *     }
   *   );
   */
  var Monaca = function(apiRoot, options) {
    // Parameters are optional.
    if (typeof apiRoot === 'object') {
      options = apiRoot;
      apiRoot = undefined;
    } else {
      options = options || {};
    }

    var webApiRoot;

    if (!apiRoot) {

      try {
        if (!fs.existsSync(USER_CORDOVA)) fs.mkdirsSync(USER_CORDOVA);
        if (!fs.existsSync(CONFIG_FILE)) fs.writeFileSync(CONFIG_FILE, '{}');
      } catch (err) {
        console.log('Could not write config file ' + err);
      }

      try {
        var configContent = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        var apiEndpoint = configContent['api_endpoint'];

        if (apiEndpoint) {
          webApiRoot = 'https://' + apiEndpoint + '/en/api';
          apiRoot = 'https://ide.' + apiEndpoint + '/api';
        }
      } catch (e) {
        console.log("Cound not find/set the custom API endpoint " + e);
      }
    }

    /**
     * @description
     *   Root of Monaca IDE API.
     * @name Monaca#apiRoot
     * @type string
     * @default https://ide.monaca.mobi/api
     */
    Object.defineProperty(this, 'apiRoot', {
      value: apiRoot ? apiRoot : config.default_api_root,
      writable: true
    });

    /**
     * @description
     *   Root of Monaca web API.
     * @name Monaca#webApiRoot
     * @type string
     * @default https://monaca.mobi/en/api
     */
    Object.defineProperty(this, 'webApiRoot', {
      value: webApiRoot ? webApiRoot : config.web_api_root,
      writable: true
    });

    /**
     * @description
     *   Version of Monaca library
     * @name Monaca#version
     * @type string
     */
    Object.defineProperty(this, 'version', {
      value: require(path.join(__dirname, '..', 'package.json')).version,
      writable: false
    });

    /**
     * @description
     *   Package name.
     * @name Monaca#packageName
     * @type string
     */
    Object.defineProperty(this, 'packageName', {
      value: require(path.join(__dirname, '..', 'package.json')).name,
      writable: false
    });

    /**
     * @description
     *   Client type.
     * @name Monaca#clientType
     * @type string
     */
    Object.defineProperty(this, 'clientType', {
      value: options.clientType || 'local',
      writable: false
    });

    /**
     * @description
     *   Client version.
     * @name Monaca#clientVersion
     * @type string
     */
    Object.defineProperty(this, 'clientVersion', {
      value: options.clientVersion || '0.0.0',
      writable: false
    });

    /**
     * @description
     *   Debug.
     * @name Monaca#debug
     * @type boolean
     */
    Object.defineProperty(this, 'debug', {
      value: (options.hasOwnProperty('debug') && options.debug === true),
      writable: false
    });

    /**
     * @description
     *   userCordova.
     * @name Monaca#userCordova
     * @type string
     */
    Object.defineProperty(this, 'userCordova', {
      value: USER_CORDOVA,
      writable: false
    });

    this.tokens = {
      api: null,
      session: null
    };

    this.loginBody = null;
    this._loggedIn = false;

    if (this.debug) {
      request.debug = true;
    }

    this.projectSettings = null;

    this.emitter = new EventEmitter();
    this._monacaData = this._loadAllData();
  };

  Monaca.prototype.setAPIConfig = function(apiEndpoint) {
    var deferred = Q.defer();

    try {
      this.apiRoot = 'https://ide.' + apiEndpoint + '/api';
      this.webApiRoot = 'https://' + apiEndpoint + '/en/api';

      return this.setConfig('api_endpoint', apiEndpoint)
      .then(
        function(result) {
          deferred.resolve();
        }
      )
      .catch(
        function(e) {
          deferred.reject(e);
        }
      )
    } catch (e) {
      deferred.reject(e);
    }

    return deferred.promise;
  }

  Monaca.prototype.resetAPIConfig = function() {
    var deferred = Q.defer();

    try {
      this.apiRoot = config.default_api_root;
      this.webApiRoot = config.web_api_root;

      return this.removeConfig('api_endpoint')
      .then(
        function(result) {
          deferred.resolve();
        }
      )
      .catch(
        function(e) {
          deferred.reject(e);
        }
      )
    } catch (e) {
      deferred.reject(e);
    }

    return deferred.promise;
  }


  Monaca.prototype._generateUUIDv4 = function(a, b) {
    for (
      b = a = ''; a++ < 36; b += a * 51 & 52 ?
      (
        a ^ 15 ?
        8 ^ Math.random() *
        (a ^ 20 ? 16 : 4) :
        4
      ).toString(16) :
      '-'
    );
    return b;
  };

  Monaca.prototype.getTrackId = function() {
    if (this.getData('trackId')) {
      return Q.resolve(this.getData('trackId'));
    }
    return this.setData({
      trackId: this._generateUUIDv4()
    }).then(Q.resolve.bind(null, this.getData('trackId')));
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *  Reports any event to Monaca backend. It keeps the previous promise flow.
   * @param {object} report - Report object. Must contain 'event'.
   *  Optional values are 'arg1' and 'otherArgs'.
   * @param {any} resolvedValue - Optional. This parameter will be returned by the promise.
   * @return {Promise}
   * @example
   *   monaca.reportAnalytics({event: 'create'})
   *     .then(nextMethod)
   */
  Monaca.prototype.reportAnalytics = function(report, resolvedValue) {
    return this.getTrackId().then(
      function(trackId) {
        var form = extend({}, report, { event: 'monaca-lib-' + report.event }, {
          trackId: trackId,
          clientType: this.clientType,
          version: this.version,
          clientId: this.getData('clientId')
        });

        return this._post(this.apiRoot + '/user/track', form)
          .then(Q.resolve.bind(null, resolvedValue), Q.resolve.bind(null, resolvedValue));

      }.bind(this),
      Q.resolve.bind(null, resolvedValue)
    );
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *  Reports a fail event to Monaca backend. This must be used with a rejected promise.
   *  It keeps the rejected promise flow.
   * @param {object} report - Report object. Must contain 'event'.
   *  Optional values are 'arg1' and 'otherArgs'.
   * @param {any} resolvedValue - Optional. This parameter will be returned by the promise.
   * @return {Rejected promise}
   * @example
   *   monaca.reportFail({event: 'create'})
   *     .catch(handleErrors)
   */
  Monaca.prototype.reportFail = function(report, error) {
    report.errorDetail = error === 'object' ? error.message : error;
    return this.reportAnalytics(extend({}, report, { event: report.event + '-fail' }))
      .then(Q.reject.bind(null, error));
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *  Reports a finish event to Monaca backend. It keeps the previous promise flow.
   * @param {object} report - Report object. Must contain 'event'.
   *  Optional values are 'arg1' and 'otherArgs'.
   * @param {any} resolvedValue - Optional. This parameter will be returned by the promise.
   * @return {Promise}
   * @example
   *   monaca.reportAnalytics({event: 'create'})
   *     .then(nextMethod)
   */
  Monaca.prototype.reportFinish = function(report, resolvedValue) {
    return this.reportAnalytics(extend({}, report, { event: report.event + '-finish' }), resolvedValue);
  };

  Monaca.prototype._safeParse = function(jsonString) {
    try {
      return JSON.parse(jsonString);
    } catch(e) {
      throw new Error('Not a JSON response.');
    }
  };

  Monaca.prototype._loadAllData = function() {
    var data;
    try {
      data = require(USER_DATA_FILE);
    } catch(e) {
      if (e.code === 'MODULE_NOT_FOUND') {
        return {};
      }
      throw e;
    }
    return data;
  };

  Monaca.prototype._saveAllData = function() {
    var deferred = Q.defer(),
      jsonData;

    try {
      jsonData = JSON.stringify(this._monacaData);
    }
    catch (error) {
      return deferred.reject(error);
    }

    fs.exists(path.dirname(USER_DATA_FILE), function(exists) {
      if (!exists) {
        shell.mkdir('-p', path.dirname(USER_DATA_FILE));
      }

      fs.writeFile(USER_DATA_FILE, jsonData, function(error) {
        if (error) {
          deferred.reject(error);
        }
        else {
          deferred.resolve();
        }
      });
    });

    return deferred.promise;
  };

  Monaca.prototype.setData = function(data) {
    extend(this._monacaData, data);
    return this._saveAllData();
  };

  Monaca.prototype.getData = function(key) {
    return this._monacaData[key];
  };

  /**
   * @todo
   * @deprecated in the next major release
   */  
  Monaca.prototype._fileFilter = function(f, allowFiles, projectDir, source) {

    if ( utils.includeInExplicitFilterList(f) ) {
      return false;
    }

    if (allowFiles.length > 0) {
        var absolutePath = (os.platform() === 'win32' ? projectDir.replace(/\\/g,"/") : projectDir) + f;
        if (allowFiles.indexOf(absolutePath) < 0) { // allowFilesに含まれなければfalse
          return false;
        }
    }

    return true;

  };

  Monaca.prototype._filterFiles = function(dst, src) {
    for (var key in dst) {
      if (dst.hasOwnProperty(key)) {
        var d = dst[key];

        if (d.type == 'dir') {
          delete dst[key];
        }
        else if (dst.hasOwnProperty(key) && src.hasOwnProperty(key)) {
          var s = src[key];

          if (d.hash === s.hash) {
            delete dst[key];
          }
        }
      }
    }
  };

  /**
   * @todo
   * @deprecated in the next major release
   */
  Monaca.prototype._excludeFromCloudDelete = function(key) {
    if (/^\/.monaca|\/node_modules\/?|\/.git\/?/.test(key)) {
      return true;
    } else {
      return false;
    }
  };


  Monaca.prototype._filterMonacaIgnore = function(projectDir) {
    return this._getMonacaIgnore(projectDir)
      .split("\r\n") // Split by \r\n.
      .map(function(ele) { return ele.split("\n")}) // Split each array element from previous step by \n again.
      .reduce(function(a,b) { return a.concat(b)}) // Now concat them into one array.
      .filter(function(n) {
        return n.trim() !== "" && n.indexOf("#") !== 0;
      });
  };

  Monaca.prototype._getMonacaIgnore = function(projectDir) {
    var monacaIgnore = path.resolve(projectDir, '.monacaignore');

    if (fs.existsSync(monacaIgnore)) {
      return fs.readFileSync(monacaIgnore, 'utf8');
    } else {
      // generate .monacaignore for all frameworks
      var result = this._generateMonacaIgnore(projectDir);

      if (result instanceof Error) {
        throw result;
      } else {
        return this._getMonacaIgnore(projectDir);
      }
    }
  };

  Monaca.prototype._generateMonacaIgnore = function(projectDir) {
    let defaultConfig = '';
    let cordovaVersion = 0;

    // Get cordova version
    try {
      cordovaVersion = parseInt(this.getCordovaVersion(projectDir));
    } catch (e) {
      cordovaVersion = 0;
    }

    if (cordovaVersion > 5) {
      defaultConfig = path.resolve(__dirname, 'default-config', '.monacaignore');
    } else {
      // remove /platform from .monacaignore for lower cordovaVersion <= 5
      defaultConfig = path.resolve(__dirname, 'default-config', 'cordova5', '.monacaignore');
    }

    if (fs.existsSync(defaultConfig)) {
      console.log('Generating default .monacaignore file.');
      console.log('This file is used to filter files for download and upload operation. Please modify the content as your requirements.');
      return fs.copySync(defaultConfig, path.resolve(projectDir, '.monacaignore'));
    } else {
      return (new Error('No default .monacaignore file found.'));
    }
  };

  Monaca.prototype._filterIgnoreList = function(projectDir, framework) {
    var allFiles = [],
      ignoreList = this._filterMonacaIgnore(projectDir, framework);
    
    if (os.platform() === 'win32') {
      projectDir = projectDir.replace(/\\/g,"/");
    }

    // We have to append '/**' to get all the subdirectories recursively.
    allFiles = glob.sync(projectDir.replace(/[-[\]{}()*+?.,^$|#]/g, "\\$&") + "/**",
      {
        dot: true,
        allowWindowsEscape: true,
        ignore: ignoreList
        .map(function(rule) {
          // Since we are finding files with 'projectDir' which is an absolute path, we need to prepend '**/' for
          // ignore patterns to match actual pattern.
          return "**/" + rule;
        })
      }
    )
    return allFiles;
  };

  Monaca.prototype._createRequestClient = function(data) {
    var deferred = Q.defer(), qs = {};

    var apiToken = this.getData('x-monaca-param-api-token'),
      session = this.getData('x-monaca-param-session');

    if (apiToken) {
      qs.api_token = apiToken;
    }

    if (data) {
      extend(qs, data);
    }

    this.getConfig('http_proxy').then(
      function(httpProxy) {
        var requestClient = request.defaults({
          qs: qs,
          // rejectUnauthorized: false, // DELETE
          encoding: null,
          proxy: httpProxy,
          headers: {
            Cookie: session || null
          },
          timeout: 300 * 1000
        });
        deferred.resolve(requestClient);
      }.bind(this),
      function(error) {
        deferred.reject(error);
      }
    );

    return deferred.promise;
  };

  Monaca.prototype._request = function(method, resource, data, requestClient, isFile ) {
    method = method.toUpperCase();
    resource = resource.match(/^https?\:\/\//) ? resource : (this.apiRoot + resource);
    var deferred = Q.defer();

    var createRequestClient = function() {
      return (requestClient ? Q.resolve(requestClient) : this._createRequestClient(method === 'GET' ? data : undefined));
    }.bind(this);

    createRequestClient().then(
      function(requestClient) {
        var hashData = null;
        if (! isFile) {
          hashData = {
            method: method,
            url: resource,
            form: method === 'POST' ? data : undefined
          };
        } else {
          hashData = {
            method: method,
            url: resource,
            formData: method === 'POST' ? data : undefined
          };
        }

        requestClient(
          hashData ,
          function(error, response, body) {
            if (error) {
              deferred.reject(error.code);
            } else {
              if (response.statusCode === 200) {
                deferred.resolve({body: body, response: response});
              } else if (response.statusCode === 401 && resource.startsWith(this.apiRoot) && !this.retry) {
                  this.retry = true;
                  this.relogin().then(function() {
                    deferred.resolve(this._request(method, resource, data, null ));
                  }.bind(this), function(error) {
                    deferred.reject(new Error('Error in user authentication. Please run "monaca login" command to continue.'));
                  });
              } else if (response.statusCode === 401) {
                deferred.reject(new Error('Failed to authenticate. Please run "monaca login" command to continue.'));
              } else {
                try {
                  deferred.reject(JSON.parse(body));
                }
                catch (e) {
                  deferred.reject(response.statusCode);
                }
              }
            }
          }.bind(this)
        );
      }.bind(this),
      function(error) {
        deferred.reject(error);
      }
    )
    return deferred.promise;
  };

  Monaca.prototype._get = function(resource, data) {
    return this._request('GET', resource, data);
  };

  Monaca.prototype._post = function(resource, data) {
    return this._request('POST', resource, data);
  };

  Monaca.prototype._post_file = function(resource, data) {
    return this._request('POST', resource, data, null, true );
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *  Returns information about server availability
   * @return {Promise}
   */
  Monaca.prototype.getConnectionStatus = function() {
    var url = this.apiRoot.match(/https(.*)\//)[0] + 'server_check';

    return this._post(url, {})
    .then(
      function(res) {
        if ((/^2/).test(res.response.statusCode)) {
          return Q.resolve('available');
        } else {
          return Q.resolve('not available');
        }
      },
      function() {
        return Q.resolve('not available');
      }
    );
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *  Download project file and save to disk. Must be loggeed in to
   *  use.
   * @param {string} projectId - Monaca project id.
   * @param {string} remotePath - Source file in cloud.
   * @param {string} localPath - Local file destination.
   * @return {Promise}
   * @example
   *   monaca.downloadFile('SOME_PROJECT_ID', '/remote/file', '/local/file').then(
   *     function() {
   *       // File download successful!
   *     },
   *     function(error) {
   *       // File download failed.
   *     }
   *   );
   */
  Monaca.prototype.downloadFile = function(projectId, remotePath, localPath) {
    var deferred = Q.defer();

    this._post('/project/' + projectId + '/file/read' + remotePath, { path: remotePath }).then(
      function(data) {
        var parentDir = path.dirname(localPath);

        fs.exists(parentDir, function(exists) {
          if (!exists) {
            shell.mkdir('-p', parentDir);
          }

          fs.writeFile(localPath, data.body, function(error) {
            if (error) {
              deferred.reject(error);
            }
            else {
              deferred.resolve(localPath);
            }
          });
        });
      },
      function(error) {
        deferred.reject(error);
      }
    );

    return deferred.promise;
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Upload a file from disk to the cloud. Must be logged in to use.
   * @param {string} projectId - Monaca project ID.
   * @param {string} localPath - Local source file.
   * @param {string} remotePath - Remote file in cloud.
   * @return {Promise}
   * @example
   *   monaca.uploadFile('SOME_PROJECT_ID', '/local/file', '/remote/file').then(
   *     function() {
   *       // File upload successful!
   *     },
   *     function(error) {
   *       // File upload failed.
   *     }
   *   );
   */
  Monaca.prototype.uploadFile = function(projectId, localPath, remotePath) {
    var deferred = Q.defer();

    fs.exists(localPath, function(exists) {
      if (!exists) {
        deferred.reject(new Error('File does not exist.'));
      }
      else {
        fs.readFile(localPath, function(error, data) {
          if (error) {
            deferred.reject(error);
          }
          else {
            this._post_file('/project/' + projectId + '/file/save' + remotePath, {
              path: remotePath,
//              contentBase64: data.toString('base64')
              file: fs.createReadStream(localPath)
            }).then(
              function() {
                deferred.resolve(remotePath);
              },
              function(error) {
                deferred.reject(error);
              }
            );
          }
        }.bind(this));
      }
    }.bind(this));

    return deferred.promise;
  };

 Monaca.prototype._deleteFileFromCloud = function(projectId, remotePath) {
    var deferred = Q.defer();
    this._post('/project/' + projectId + '/file/remove', {
      paths: remotePath
    }).then(
      function() {
        deferred.resolve(remotePath);
      },
      function(error) {
        deferred.reject(error);
      }
    );
    return deferred.promise;
  };

  Monaca.prototype._login = function() {
    var deferred = Q.defer(),
      options;

    if (arguments.length === 3) {
      options = arguments[2];
    }
    else if (typeof arguments[1] === 'object') {
      options = arguments[1];
    }
    else {
      options = {};
    }

    var form = {
      language: options.language || 'en',
      clientType: options.clientType || this.clientType || 'local',
      version: options.version || this.packageName + ' ' + this.version,
      os: os.platform()
    };

    // Edition option is for Visual Studio only.
    if (options.edition) {
      form.edition = options.edition;
    }

    if (arguments.length === 1 || typeof arguments[1] === 'object') {
      form.token = arguments[0];
    }
    else {
      form.email = arguments[0];
      form.password = arguments[1];
    }
    return this._post(this.apiRoot + '/user/login', form)
      .then(
        function(data) {
          var body = this._safeParse(data.body),
            response = data.response;
          if (body.status === 'ok') {
            var headers = response.caseless.dict;
            return this.setData({
              'reloginToken': body.result.token,
              'clientId': body.result.clientId,
              'x-monaca-param-api-token': headers['x-monaca-param-api-token'],
              'x-monaca-param-session': headers['x-monaca-param-session'],
              'subscriberUrl': body.result.subscriberUrl,
            })
            .then(
              function() {
                this.tokens = {
                  api: headers['x-monaca-param-api-token'],
                  session: headers['x-monaca-param-session']
                };

                this.loginBody = body.result;
                this._loggedIn = true;

                return Q.resolve(this.loginBody);
              }.bind(this),
              Q.reject
            );
          }

          return Q.reject(body);

        }.bind(this),
        Q.reject
      );
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Prepares the current session with local data before trying any request.
   *   If local data is not found it calls relogin.
   * @param {object} [options] - Login parameters.
   * @param {string} [options.version] - App name and version to send to the Monaca API. Defaults to "monaca-lib x.y.z".
   * @param {string} [options.language] - Can be either "en" or "ja". Defaults to "en".
   * @return {Promise}
   * @example
   *   monaca.prepareSession().then(
   *     function() {
   *       // Login successful!
   *     },
   *     function(error) {
   *       // Login failed!
   *     }
   *   );
   */
  Monaca.prototype.prepareSession = function(options) {
    var apiToken = this.getData('x-monaca-param-api-token'),
      session = this.getData('x-monaca-param-session');

    if (!apiToken || !session) {
      return this.relogin(options);
    }

    this.tokens = {
      api: apiToken,
      session: session
    };
    this._loggedIn = true;

    return Q.resolve();
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Login to Monaca cloud using a saved relogin token. Use {@link Monaca#login} to
   *   login the first time.
   * @param {object} [options] - Login parameters.
   * @param {string} [options.version] - App name and version to send to the Monaca API. Defaults to "monaca-lib x.y.z".
   * @param {string} [options.language] - Can be either "en" or "ja". Defaults to "en".
   * @return {Promise}
   * @example
   *   monaca.relogin().then(
   *     function() {
   *       // Login successful!
   *     },
   *     function(error) {
   *       // Login failed!
   *     }
   *   );
   */
  Monaca.prototype.relogin = function(options) {
    options = options || {};

    var reloginToken = this.getData('reloginToken');
    if (typeof reloginToken !== 'string' || reloginToken === '') {
      return Q.reject(new Error('Not a valid relogin token.'));
    }

    return this._login(reloginToken, options);
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Sign in to Monaca cloud using email and password. Will save relogin token to disk
   *   if successful. After the relogin token has been saved, {@link Monaca#relogin} can
   *   be used to login.
   * @param {string} email - A Monaca account email.
   * @param {string} password - Password associated with the account.
   * @param {object} [options] - Additional options.
   * @param {string} [options.version] - App name and version to send to the Monaca API. Defaults to "monaca-lib x.y.z".
   * @param {string} [options.language] - Can be either "en" or "ja". Defaults to "en".
   * @return {Promise}
   * @example
   *   monaca.login('my@email.com', 'password').then(
   *     function() {
   *       // Login successful!
   *     },
   *     function(error) {
   *       // Login failed!
   *     }
   *   );
   */
  Monaca.prototype.login = function(email, password, options) {
    if (options) {
      return this._login(email, password, options);
    }
    else {
      return this._login(email, password);
    }
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Sign out from Monaca cloud. Will remove relogin token from disk and session tokens
   *   from memory.
   * @return {Promise}
   * @example
   *   monaca.login('my@email.com', 'password').then(
   *     function() {
   *       monaca.logout();
   *     }
   *   );
   */
  Monaca.prototype.logout = function() {
    return this._get(this.apiRoot + '/user/logout')
    .finally(
      function() {
        this.setData({
          'reloginToken': '',
          'clientId': '',
          'x-monaca-param-api-token': '',
          'x-monaca-param-session': '',
          'trackId': ''
        })
        .then(
          function() {
            this.tokens = {
              api: null,
              session: null
            };
            this._loggedIn = false;
          }.bind(this)
        );
      }.bind(this)
    )
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Creates a new account in Monaca cloud using email and password. Returns a token used to check.
   *   if the account has been activated.
   * @param {string} email - A Monaca account email.
   * @param {string} password - Password associated with the account.
   * @param {string} password_confirm - Password confirmation.
   * @return {Promise}
   * @example
   *   monaca.signup('my@email.com', 'password', 'password').then(
   *     function() {
   *       // Signup successful!
   *     },
   *     function(error) {
   *       // Signup failed!
   *     }
   *   );
   */
  Monaca.prototype.signup = function(email, password, passwordConfirm, options) {
    options = options || {};
    var deferred = Q.defer();

    var form = {
      language: options.language || 'en',
      clientType: options.clientType || this.clientType || 'local',
      version: options.version || this.packageName + ' ' + this.version,
      os: os.platform(),
      register: {
        email: email,
        password: password,
        password_confirm: passwordConfirm
      }
    };

    return this._post(this.webApiRoot + '/register', form)
      .then(
        function(data) {
          var body = this._safeParse(data.body);
          if (body.status === 'ok') {
            return Q.resolve(body.result.submitOK.token);
          }

          var errorMessage = body.title;
          Object.keys(body.result.formError).forEach(function(key) {
            errorMessage += '\n' + key + ': ' + body.result.formError[key];
          });

          return Q.reject(new Error(errorMessage));
        }.bind(this),
        Q.reject
      );
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Checks if the account related to the specified token is already activated.
   * @param {string} token - token related to a user account.
   * @return {Promise}
   * @example
   *   monaca.isActivatedUser('token').then(
   *     function() {
   *       // Account is activated!
   *     },
   *     function(error) {
   *       // Account is not activated yet!
   *     }
   *   );
   */
  Monaca.prototype.isActivatedUser = function(token, options) {
    options = options || {};
    var deferred = Q.defer();

    return this._post(this.webApiRoot + '/check_activate', {
      language: options.language || 'en',
      clientType: options.clientType || this.clientType || 'local',
      version: options.version || this.packageName + ' ' + this.version,
      os: os.platform(),
      param: token
    })
    .then(
      function(data) {
        var body = this._safeParse(data.body);
        if (body.status === 'ok') {
          return body.result === 1 ? Q.resolve() : Q.reject();
        }

        return Q.reject(body.title);
      }.bind(this),
      Q.reject
    );
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Checks if the project can be built.
   * @return {Promise}
   * @example
   *   monaca.checkBuildAvailability('myProjectID', 'android', 'debug').then(
   *     function() {
   *       //Build the project
   *     },
   *     function(err) {
   *       //Cannot build the project
   *     }
   *   );
   */
  Monaca.prototype.checkBuildAvailability = function(projectInfo, buildParams) {

    if (!projectInfo || !projectInfo.projectId) {
      return Q.reject(new Error("Missing project info data."));
    } else if(!buildParams || !buildParams.platform || !buildParams.purpose) {
      return Q.reject(new Error("Missing build parameters."));
    }

    var projectId = projectInfo.projectId,
      framework = projectInfo.framework ? projectInfo.framework : '',
      platform = buildParams.platform,
      buildType = buildParams.purpose;

    return this._get('/project/' + projectId + '/can_build_app')
    .then(
      function(data) {
        var body = this._safeParse(data.body);

        if (body.status === 'ok') {

          var checkError = function() {
            var platformContent = body.result[platform];

            if (!platformContent) {
              return 'Specified platform is not supported or doesn\'t exist.';
            }
            if (!platformContent.has_remaining_slot) {
              return 'Your plan does not allow further builds at the moment. Please upgrade your account to start build, or try again later.';
            }
            if (!platformContent.is_start_file_exist) {
              return 'Your project is missing the startup file (usually index.html).';
            }
            if (typeof platformContent.can_build_for[buildType] === 'undefined') {
              return platform + ' ' + buildType + ' build is not supported or doesn\'t exist.';
            }
            if (platform === 'android') {
              if (!platformContent.is_versionname_valid) {
                return 'Version name is invalid.';
              }
              if (buildType === 'release' && !platformContent.has_keysetting) {
                return 'Missing KeyStore configuration. Configure remote build by executing `monaca remote build --browser`.';
              }
            }
            if (platform === 'ios') {
              if (!platformContent.has_splash_and_icons) {
                return 'Your project is missing splash screens and/or icons. Please add the missing files from remote build settings by executing `monaca remote build --browser`.';
              }
              if (buildType === 'debug') {
                if (!platformContent.has_dev_provisioning) {
                  return 'Missing dev provisioning file. Please upload it from remote build settings by executing `monaca remote build --browser`.';
                }
                if (platformContent.dev_provisioning_error) {
                  return 'Error in dev provisioning file. Please upload again from remote build settings by executing `monaca remote build --browser`.';
                }
              } else if (buildType === 'debugger') {
                if (!platformContent.has_debug_provisioning) {
                  return 'Missing debug provisioning file. Please upload it from remote build settings by executing `monaca remote build --browser`.';
                }
                if (platformContent.debug_provisioning_error) {
                  return 'Error in debug provisioning file. Please upload again from remote build settings by executing `monaca remote build --browser`.';
                }
              } else {
                if (!platformContent['has_' + buildType + '_provisioning']) {
                  return 'Missing ' + buildType + ' provisioning file. Please upload it from remote build settings by executing `monaca remote build --browser`.';
                }
                if (platformContent[buildType + '_provisioning_error']) {
                  return 'Error in' + buildType + ' provisioning file. Please upload again from remote build settings by executing `monaca remote build --browser`.';
                }
              }
            }

            return '';
          };


          var errorMessage = checkError();

          if (!framework || framework === 'cordova') {
            if (errorMessage) {
              return Q.reject(new Error(errorMessage));
            }
          }
          return Q.resolve(body);
        } else {
          return Q.reject(new Error(body.status + " - " + body.message));
        }
      }.bind(this),
      function(err) {
        var errMessage = err.message ? err.message : '';

        if (err.code === 404) {
          return Q.reject(new Error("Error 404. Cannot reach the server, contact Monaca Support."));
        } else {
          return Q.reject(new Error("Internal server error, contact Monaca Support. " + errMessage));
        }
      }
    );
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Generate a one time token for an URL.
   * @param {string} url
   * @return {Promise}
   */
  Monaca.prototype.getSessionUrl = function(url) {
    var deferred = Q.defer();
    this._get('/user/getSessionUrl', { url: url }).then(
      function(data) {
        deferred.resolve(this._safeParse(data.body).result.url);
      }.bind(this),
      function(error) {
        deferred.reject(error);
      }
    );

    return deferred.promise;
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Downloads a file from Monaca request.
   *
   *   If the download is successful the promise will resolve with the
   *   downloaded filename.
   * @param {string} url - URL to download from
   * @param {object} data - Request parameters
   * @param {string} filename - Filename the data will be saved to. Can be a callback function.
   * @return {Promise}
   */
  Monaca.prototype.download = function(url, data, filename) {
    var deferred = Q.defer();

    this._createRequestClient(data).then(function(requestClient) {
      requestClient.get(url)
      .on('response', function(response) {

        var dest = filename;
        if (typeof filename === 'function') {
          // Callback so that the caller can decide the filename from the response
          dest = filename(response);
        }

        if (typeof dest === 'string') {
          var file = fs.createWriteStream(dest);
          response.pipe(file);
          file.on('finish', function() {
            deferred.resolve(dest);
          });
          file.on('error', function(error) {
            deferred.reject(error);
          });
        } else {
          deferred.reject(new Error('Not a valid file name.'));
        }
      })

    }.bind(this),
    function(error) {
      return deferred.reject(error);
    });
    return deferred.promise;
  }

  /**
   * @method
   * @memberof Monaca
   * @name getLatestNews
   * @description
   *   Fetches latest news and status on known issues from Monaca Cloud.
   * @param {Object} [options] Parameters
   * @param {Boolean} [options.disableStatusUpdate]
   * @return {Promise}
   */
  Monaca.prototype.getLatestNews = function(options) {
    var deferred = Q.defer();

    options = options || {};
    options.disableStatusUpdate = options.disableStatusUpdate ? 1 : 0;

    this._get('/user/info/news', options ? options : {} ).then(
      function(data) {
        deferred.resolve(this._safeParse(data.body));
      }.bind(this),
      function(error) {
        deferred.reject(error);
      }
    );
    return deferred.promise;
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Fetch a list of all available projects.
   * @return {Promise}
   * @example
   *   monaca.getProjects().then(
   *     function(projects) {
   *       console.log('You have ' + projects.length + ' projects!');
   *     },
   *     function(error) {
   *       // Unable to fetch list.
   *     }
   *   );
   */
  Monaca.prototype.getProjects = function() {
    var deferred = Q.defer();

    this._get('/user/projects').then(
      function(data) {
        deferred.resolve(this._safeParse(data.body).result.items);
      }.bind(this),
      function(error) {
        deferred.reject(error);
      }
    );

    return deferred.promise;
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Get project ID.
   * @return {Promise}
   */
  Monaca.prototype.getProjectId = function(projectDir) {
    return localProperties.get(projectDir, 'project_id');
  };

    /**
   * @method
   * @memberof Monaca
   * @description
   *   Delete project ID.
   * @return {Promise}
   */
  Monaca.prototype.deleteProjectId = function(projectDir) {
    return localProperties.del(projectDir, 'project_id');
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Get local project ID.
   * @return {Promise}
   */
  Monaca.prototype.getLocalProjectId = function(projectDir) {
    var deferred = Q.defer(),
      absolutePath = path.resolve(projectDir);

    try {
      var projectId = crypto.createHash('sha256').update(absolutePath).digest('hex');
      deferred.resolve(projectId);
    }
    catch (error) {
      deferred.reject(error);
    }

    return deferred.promise;
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Set project ID.
   * @return {Promise}
   */
  Monaca.prototype.setProjectId = function(projectDir, projectId) {
    return localProperties.set(projectDir, 'project_id', projectId);
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Fetch a list of files and directories for a project.
   *   Must be logged in to use.
   * @param {string} projectId
   * @return {Promise}
   * @example
   *   monaca.getProjectFiles('SOME_PROJECT_ID').then(
   *     function(files) {
   *       // Fetched file list!
   *     },
   *     function(error) {
   *       // Failed fetching file list!
   *     }
   *   );
   */
  Monaca.prototype.getProjectFiles = function(projectId) {
    var deferred = Q.defer();

    utils.info('Reading Remote Files...', deferred);

    this._post('/project/' + projectId + '/file/tree').then(
      function(data) {
        utils.info('Reading Remote Files [FINISHED]', deferred);
        deferred.resolve(JSON.parse(data.body).result.items);
      },
      function(error) {
        utils.info('Reading Remote Files [ERROR]', deferred);
        deferred.reject(error);
      }
    );

    return deferred.promise;
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Fetch a list of files and directories for a local project.
   * @param {string} projectDir - Path to project.
   * @param {Object} [options] Parameters like filter to filter from list of files.
   * @return {Promise}
   * @example
   *   monaca.getLocalProjectFiles = function('/some/directory').then(
   *     function(files) {
   *       // Successfully fetched file list!
   *     },
   *     function(error) {
   *       // Failed fetching file list!
   *     }
   *   );
   */
  Monaca.prototype.getLocalProjectFiles = function(projectDir, options) {
    let deferred = Q.defer();
    let qLimit = qlimit(100);
    let getFileChecksum = qLimit(function(file) {
      let deferred = Q.defer();

      fs.readFile(file, function(error, data) {
        if (error) {
          deferred.reject(error);
        }
        else {
          deferred.resolve(crc32(data).toString('hex'));
        }
      });

      return deferred.promise;
    });

    utils.info('Reading Local Files...', deferred);

    fs.exists(projectDir, function(exists) {
      if (exists) {
        let files = {},
          promises = [],
          filteredList = [];

        try {
          // create .monacaignore if there isn't
          let ignoreList = this._filterMonacaIgnore(projectDir);

          // Read all files from project directory
          filteredList = glob.sync("**/*",
            {
              cwd: path.resolve(projectDir),
              dot: true,
            }
          );

          // filter list from .monacaignore
          filteredList = utils.filter(filteredList, ignoreList);
          // user-defined filter functions
          if (options && options.filter && typeof options.filter === 'function') {
            filteredList = filteredList.filter(options.filter);
          }

        } catch(error) {
          return deferred.reject(error);
        }

        utils.info('Reading Local Files [Calculating File Checksum]');

        filteredList.forEach(function(file) {
          let obj = {},
            key = path.join('/', file);

          // Converting Windows path delimiter to slash
          key = key.split(path.sep).join('/');
          files[key] = obj;

          let absolutePath = path.join(projectDir, file);

          let fileStat = fs.lstatSync(absolutePath);
          if (fileStat.isDirectory()) {
            obj.type = 'dir';
          }
          else {
            obj.type = 'file';
            let deferred = Q.defer();
            getFileChecksum(absolutePath).then(
              function(checksum) {
                deferred.resolve([key, checksum]);
              },
              function(error) {
                // throw warning and continue with empty checksum
                console.log('[ERROR]', key, error);
                deferred.resolve([key, '']);
              }
            );

            promises.push(deferred.promise);
          }
        });

        Q.all(promises).then(
          function(results) {
            results.forEach(function(result) {
              let key = result[0],
                checksum = result[1];

              files[key].hash = checksum;
            });

            utils.info('Reading Local Files [FINISHED]', deferred);
            deferred.resolve(files);
          },
          function(error) {
            utils.info('Reading Local Files [ERROR]', deferred);
            deferred.reject(error);
          }
        );
      }
      else {
        deferred.reject(projectDir + ' does not exist');
      }
    }.bind(this));

    return deferred.promise;
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Download Monaca project and save it to disk. Must be logged in to use.
   *   Will fail if {@link destDir} already exists. The returned promise will
   *   be notified every time a file has been copied so the progress can be
   *   tracked.
   * @param {string} projectId - Monaca project ID.
   * @param {string} destDir - Destination directory.
   * @param {boolean} clone (default true). if true, set `project_id` to `.monaca/local_properties.json`
   * @return {Promise}
   * @example
   *   monaca.cloneProject(123, '/home/user/workspace/myproject').then(
   *     function(dest) {
   *       console.log('Project placed in: ' + dir);
   *     },
   *     function(error) {
   *       // Wasn't able to cloneProject project! :(
   *     },
   *     function(file) {
   *       var progress = 100 * file.index / file.total;
   *       console.log('[' + progress + '%] ' + file.path);
   *     }
   *   );
   */
  Monaca.prototype.cloneProject = function(projectId, destDir, clone = true) {
    var deferred = Q.defer();
    fs.exists(destDir, function(exists) {
      if (exists && shell.ls(destDir).length > 0) {
        deferred.reject(new Error('File or directory already exists and it contains files.'));
      }
      else {
        var success = true;

        try {
          shell.mkdir(destDir);
        }
        catch (e) {
          success = false;
          deferred.reject(e);
        }

        if (success) {
          this.getProjectFiles(projectId).then(
            function(files) {
              var index = 0,
                qLimit = qlimit(4);

              var totalLength = Object.keys(files)
              .map(
                function(key) {
                  return files[key].type === 'file' ? 1 : 0;
                }
              )
              .reduce(
                function(a, b) {
                  return a + b;
                }
              );

              var downloadFile = function(_path) {
                var d = Q.defer();
                this.downloadFile(projectId, _path, path.join(destDir, _path)).then(
                  function(dest) {
                    deferred.notify({
                      total: totalLength,
                      index: index,
                      path: dest
                    });
                    d.resolve(dest);
                  },
                  function(error) {
                    d.reject(error);
                  }
                )
                .finally(
                  function() {
                    index++;
                  }
                );
                return d.promise;
              }.bind(this);

              Q.all(Object.keys(files).map(qLimit(function(_path) {
                if (files.hasOwnProperty(_path) && files[_path].type == 'file') {
                  return downloadFile(_path);
                }
              }.bind(this)))).then(
                function() {
                  if (clone === true) {
                    return this.setProjectId(destDir, projectId);
                  } else {
                    return deferred.resolve(destDir);
                  }
                }.bind(this)
              ).then(
                function() {
                  deferred.resolve(destDir);
                },
                function(error) {
                  deferred.reject(error);
                }
              );
            }.bind(this),
            function(error) {
              deferred.reject(error);
            }
          );
        }
      }
    }.bind(this));

    return deferred.promise;
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Create a new project in the Cloud.
   *
   *   Returns a promise that resolves to the project info.
   * @param {object} options - Parameters
   * @param {string} options.name - Project name
   * @param {string} options.description - Project description
   * @param {string} options.templateId - Template ID (e.g. "rss", "minimum", etc.)
   * @param {boolean} [options.isBuildOnly] - Set to true if the project is uploaded just for building.
   * @return {Promise}
   * @example
   *   monaca.createProject({
   *     name: 'My project',
   *     description: 'An awesome app that does awesome things.',
   *     template: 'minimum'
   *   }).then(
   *     function(projectId) {
   *       // Creation successful!
   *     },
   *     function(error) {
   *       // Creation failed!
   *     }
   *   );
   */
  Monaca.prototype.createProject = function(options) {
    var deferred = Q.defer();

    options.isBuildOnly = options.isBuildOnly ? 1 : 0;

    this._post('/user/project/create', options).then(
      function(data) {
        deferred.resolve(this._safeParse(data.body).result);
      }.bind(this),
      function(error) {
        deferred.reject(error);
      }
    );

    return deferred.promise;
  };

  Monaca.prototype.getProjectInfo = function(projectDir, framework) {
    var deferred = Q.defer();

    var getDefaultProjectInfo = function(projectId) {
      return Q.resolve({
        name: 'Undefined Project Name',
        directory: projectDir,
        description: 'No description',
        projectId: projectId
      });
    };

    var getReactNativeProjectInfo = function(projectId) {
      var projectConfig = require(path.join(projectDir, 'package.json'));

      // extract the name from the project path
      var projectName = path.basename(projectDir),
        projectDescription;

      if (projectConfig && projectConfig.description) {
        projectDescription = projectConfig.description;
      }

      return Q.resolve({
        name: projectName,
        directory: projectDir,
        description: projectDescription ? projectDescription : '',
        projectId: projectId
      });
    };

    var getCordovaProjectInfo = function(projectId) {

      var getValidConfigFile = function() {
        var possibleFiles = ['config.xml', 'config.ios.xml', 'config.android.xml'];

        for (var i = 0, l = possibleFiles.length; i < l; i ++) {
          var configFile = path.join(projectDir, possibleFiles[i]);

          if (fs.existsSync(configFile)) {
            return configFile;
          }
        }

        return null;
      };

      this.getLocalProjectId(projectDir)
      .then(
        function(projectId) {
          var configFile = getValidConfigFile();
          if (configFile) {
            fs.readFile(configFile, function(error, data) {
              if (error) {
                deferred.reject(error);
              } else {
                xml2js.parseString(data, function(error, result) {
                  if (error) {
                    deferred.reject(error);
                  } else {
                    var projectConfig = {
                      name: result.widget.name[0],
                      directory: projectDir,
                      description: result.widget.description[0],
                      projectId: projectId
                    };

                    deferred.resolve(projectConfig);
                  }
                });
              }
            });
          } else {
            return getDefaultProjectInfo(projectId);
          }
        },
        function(error) {
          deferred.reject(error);
        }
      );

      return deferred.promise;
    }.bind(this);

    return this.getLocalProjectId(projectDir)
    .then(
      function(projectId) {
        if (!framework || framework === 'cordova') {
          return getCordovaProjectInfo(projectId);
        } else {
          return getReactNativeProjectInfo(projectId);
        }
      },
      function(error) {
        return Q.reject(error);
      }
    );
  };


  /**
   * @method
   * @memberof Monaca
   * @description
   *  Checks file difference between local and remote projects.
   *  Pass in the options.Type = 'downloadProject' if you want to get changes between remote and local projects (download action).
   *  If it succeeds, an object containing the modified/deleted files will be returned.
   * @param {string} projectDir - Project directory.
   * @return {Promise}
   * @example
   *   monaca.checkModifiedFiles('/my/project/').then(
   *     function(files) {
   *       // Modified/deleted files
   *     },
   *     function(error) {
   *       // Error while checking the files.
   *     }
   *   );
   */
  Monaca.prototype.checkModifiedFiles = function(projectDir, options) {
    let projectId, framework;

    if (options && options.result) {
      // return the result if it is supplied
      return Q.resolve(options.result);
    }

    return this.isMonacaProject(projectDir)
    .then(
      function(projectFramework) {
        framework = projectFramework;
        return ((options && options.skipTranspile) ? this.getProjectId(projectDir) : this.transpile(projectDir))
      }.bind(this)
    )
    .then(
      localProperties.get.bind(this, projectDir, 'project_id')
    )
    .then(
      function(value) {
        projectId = value;
        return Q.all([this.getLocalProjectFiles(projectDir), this.getProjectFiles(projectId)]);
      }.bind(this)
    )
    .then(
      function(files) {
        let localFiles, remoteFiles, actionType, temp;

        utils.info('Comparing Files...');

        let ignoreList = this._filterMonacaIgnore(projectDir);

        if (options && options.actionType === 'downloadProject') {
          localFiles = files[1]; //remote file
          remoteFiles = files[0]; //local files
          actionType = 'downloadProject';
          localFiles = utils.filterIgnoreFiles(localFiles, ignoreList, true);
        } else {
          localFiles = files[0];
          remoteFiles = files[1];
          actionType = 'uploadProject';
          remoteFiles = utils.filterIgnoreFiles(remoteFiles, ignoreList, true);
        }

        let filesToBeDeleted = {};

        // check if the files doesn't exist in cloud (for upload) or in local (for download)
        for (let f in remoteFiles) {
          if (!localFiles.hasOwnProperty(f)) {
            filesToBeDeleted[f] = remoteFiles[f];
          }
        }

        // Filter out directories and unchanged files in local (for upload) or in cloud (for download)
        this._filterFiles(localFiles, remoteFiles);

        let keys = [];

        // Modified files.
        let modifiedFiles = {};

        if (actionType === 'downloadProject') {
          modifiedFiles = {
            downloaded: localFiles, //remote file
            deleted: filesToBeDeleted
          };
        } else {
          modifiedFiles = {
            uploaded: localFiles,
            deleted: filesToBeDeleted
          };
        }

        keys = localFiles;

        let result = {
          filesToBeDeleted: filesToBeDeleted,
          modifiedFiles: modifiedFiles,
          keys: keys, //no used - will be deprecated in the next major API release
          projectId: projectId
        };

        utils.info('Comparing Files [FINISHED]');
        return Q.resolve(result);
      }.bind(this)
    )
    .catch(
      function(e) {
        return Q.reject(e);
      }
    );
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *  Uploads a Monaca project to the Cloud. Will fail if the specified
   *  directory doesn't contain a Monaca project or if the project is
   *  not associated with the logged in user.
   *
   *  Will not overwrite files if they are identical.
   *
   *  If the upload is successful the promise will resolve with the project ID.
   * @param {string} projectDir - Project directory.
   * @return {Promise}
   * @example
   *   monaca.uploadProject('/my/project/').then(
   *     function(projectId) {
   *       // Upload successful!
   *     },
   *     function(error) {
   *       // Upload failed!
   *     },
   *     function(progress) {
   *       // Track the progress
   *     }
   *   );
   */
  Monaca.prototype.uploadProject = function(projectDir, options) {
    let deferred = Q.defer();

    if (options && (options.userDefinedSelectedFileFlag === true) && (!options.userDefinedSelectedFiles || !options.userDefinedSelectedFiles.length)) {
      utils.info('You have chosen not to upload anything.', deferred);
      deferred.resolve([]);
      return deferred.promise;
    }

    this.checkModifiedFiles(projectDir, options)
    .then(
      function(result) {
        let filesToBeDeleted = result.filesToBeDeleted,
          modifiedFiles = result.modifiedFiles,
          keys = result.keys,
          projectId = result.projectId;

        if (options && !options.dryrun && options.delete && filesToBeDeleted && Object.keys(filesToBeDeleted)) {

          if (options && options.userDefinedSelectedFileFlag === true) {
            filesToBeDeleted = utils.filterObjectByKeys(filesToBeDeleted, options.userDefinedSelectedFiles);
            modifiedFiles.deleted = filesToBeDeleted;
          }

          this._deleteFileFromCloud(projectId, Object.keys(filesToBeDeleted))
          .then(
            function() {
              console.log(Object.keys(filesToBeDeleted)
                .map(function(f) {
                  return "deleted -> " + f;
                })
                .join("\n")
              );
            },
            function(err) {
              console.log("\nfile delete error ->  : " + JSON.stringify(err));
            }
          )
        }

        let uploaded = modifiedFiles.uploaded;

        if (options && options.userDefinedSelectedFileFlag === true && uploaded && Object.keys(uploaded)) {
          uploaded = utils.filterObjectByKeys(uploaded, options.userDefinedSelectedFiles);
          modifiedFiles.uploaded = uploaded;
        }

        // If dryrun option is set, just return the files to be uploaded.
        if (options && options.dryrun) {
          return deferred.resolve(modifiedFiles);
        }

        let totalLength = Object.keys(uploaded).length,
          currentIndex = 0,
          qLimit = qlimit(4);

        let uploadFile = function(key) {
          let d = Q.defer();
          let absolutePath = path.join(projectDir, key.substr(1));
          let notifyDeferred = null;

          this.uploadFile(projectId, absolutePath, key)
          .then(
            function(remotePath) {
              notifyDeferred = (options.deferred) ? options.deferred : deferred;
              notifyDeferred.notify({
                path: remotePath,
                total: totalLength,
                index: currentIndex
              });
              d.resolve();
            },
            function(error) {
              utils.info('error ' + absolutePath, deferred);
              d.reject(error);
            }
          )
          .finally(
            function() {
              currentIndex++;
            }
          );
          return d.promise;
        }.bind(this);

        Q.all(Object.keys(uploaded).map(qLimit(function(key) {
          return uploadFile(key);
        }.bind(this))))
        .then(
          function() {
            deferred.resolve(modifiedFiles);
          },
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
   * @memberof Monaca
   * @description
   *   Downloads a Monaca project from the Cloud. Will fail if the
   *   specified directory doesn't contain a Monaca project or if the
   *   project is not associated with the logged in user.
   *
   *   Will not download unchanged files.
   *
   *   If the upload is successful the promise will resolve with the
   *   project ID.
   * @param {string} projectDir - Project directory.
   * @return {Promise}
   * @example
   *   monaca.downloadProject('/my/project/').then(
   *     function(projectId) {
   *       // Download successful!
   *     },
   *     function(error) {
   *       // Download failed!
   *     },
   *     function(progress) {
   *       // Track the progress
   *     }
   *   );
   */
  Monaca.prototype.downloadProject = function(projectDir, options) {
    let deferred = Q.defer();

    if (options && (options.userDefinedSelectedFileFlag === true) && (!options.userDefinedSelectedFiles || !options.userDefinedSelectedFiles.length)) {
      util.info('You have chosen not to download anything.', deferred);
      deferred.resolve([]);
      return deferred.promise;
    }

    if (!options) options = {};
    options.skipTranspile = true;
    options.actionType = 'downloadProject';

    this.checkModifiedFiles(projectDir, options).then(
      function(result) {
        let filesToBeDeleted = result.filesToBeDeleted,
            modifiedFiles = result.modifiedFiles,
            keys = result.keys,
            projectId = result.projectId;

        if (options && !options.dryrun && options.delete && filesToBeDeleted) {

          if (options && options.userDefinedSelectedFileFlag === true) {
            filesToBeDeleted = utils.filterObjectByKeys(filesToBeDeleted, options.userDefinedSelectedFiles);
            modifiedFiles.deleted = filesToBeDeleted;
          }

          for (let f in filesToBeDeleted) {
            try {
              if (filesToBeDeleted[f].type === 'file') {
                fs.unlinkSync(path.join(projectDir, f));
                console.log("deleted file-> " + path.join(projectDir, f));
              }
              else if (filesToBeDeleted[f].type === 'dir') {
                fs.rmdirSync(path.join(projectDir, f));
                console.log("deleted folder-> " + path.join(projectDir, f));
              }
            } catch (err) {
              console.log("Error deleting " + filesToBeDeleted[f].type + ": " + f);
            }
          }
        }

        let downloaded = modifiedFiles.downloaded;

        if (options && options.userDefinedSelectedFileFlag === true) {
          downloaded = utils.filterObjectByKeys(downloaded, options.userDefinedSelectedFiles);
          modifiedFiles.downloaded = downloaded;
        }

        // Modified files.
        let download_ModifiedFiles = {
          remoteFiles: modifiedFiles.downloaded,
          deleted: filesToBeDeleted
        }

        // If dryrun option is set, just return the files to be downloaded and deleted.
        if (options && options.dryrun) {
          return deferred.resolve(download_ModifiedFiles);
        }

        let totalLength = Object.keys(modifiedFiles.downloaded).length,
          currentIndex = 0,
          qLimit = qlimit(4);

        let downloadFile = function(key) {
          let d = Q.defer();
          let absolutePath = path.join(projectDir, key.substr(1));
          let notifyDeferred = null;

          this.downloadFile(projectId, key, absolutePath).then(
            function(remotePath) {
              notifyDeferred = (options.deferred) ? options.deferred : deferred;
              notifyDeferred.notify({
                path: remotePath,
                total: totalLength,
                index: currentIndex
              });
              d.resolve();
            },
            function(error) {
              utils.info('error ' + absolutePath, deferred);
              d.reject(error);
            }
          )
          .finally(
            function() {
              currentIndex++;
            }
          );
          return d.promise;
        }.bind(this);

        Q.all(Object.keys(modifiedFiles.downloaded).map(qLimit(function(key) {
          return downloadFile(key);
        }.bind(this)))).then(
          function() {
            deferred.resolve(download_ModifiedFiles);
          },
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

  Monaca.prototype.pollBuildStatus = function(projectId, queueId) {
    var deferred = Q.defer();
    var buildRoot = '/project/' + projectId + '/build';

    var interval = setInterval(function() {
      this._post(buildRoot + '/status/' + queueId).then(
        function(data) {
          var result = this._safeParse(data.body).result;

          deferred.notify(result.description);

          if (result.finished) {
            clearInterval(interval);

            if (result.status === 'finish') {
              deferred.resolve(result.description);
            }
            else {
              this._post(buildRoot + '/result/' + queueId).then(
                function(data) {
                  deferred.reject(this._safeParse(data.body).result.error_message);
                }.bind(this),
                function(error) {
                  deferred.reject(error);
                }
              );
            }
          }
        }.bind(this),
        function(error) {
          clearInterval(interval);
          deferred.reject(error);
        }
      );
    }.bind(this), 1000);

    return deferred.promise;
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Builds a Monaca project.
   *
   *   If the build is successful the promise will resolve to
   *   an object containing information about the build.
   * @param {string} projectId - Project ID.
   * @param {object} params - Build parameters.
   * @param {string} params.platform - Target platform. Should be one of "android", "ios" or "winrt".
   * @param {string} [params.android_webview] - When building for Android the webview can be configured. Choose between "default" or "crosswalk"
   * @param {string} [params.android_arch] - Required when building for Crosswalk. Should be one of either "x86" or "arm".
   * @param {string} [params.framework_version] - Framework version. Defaults to 3.5.
   * @param {string} [params.purpose] - Type of build. Should be one of either "debug" or "release". Defaults to "debug".
   * @return {Promise}
   * @example
   *   monaca.uploadProject('/some/project').then(
   *     function(projectId) {
   *       var params = {
   *         platform: 'android',
   *         purpose: 'debug'
   *       };
   *
   *       monaca.buildProject(projectId, params).then(
   *         function(result) {
   *           // Build was successful!
   *         },
   *         function(error) {
   *           // Build failed!
   *         },
   *         function(progress) {
   *           // Track build status.
   *         }
   *       );
   *     }
   *   );
   */
  Monaca.prototype.buildProject = function(projectId, params, skipPolling) {
    var deferred = Q.defer(),
      buildRoot = '/project/' + projectId + '/build';

    params = params || {};

    if (!params.framework_version) {
      params.framework_version = '3.5';
    }

    if (!params.purpose) {
      params.purpose = 'debug';
    }

    if (!params.platform) {
      deferred.reject(new Error('Must specify build platform.'));
    }

    this._post(buildRoot, params).then(
      function(data) {
        var queueId = this._safeParse(data.body).result.queue_id;

        if(skipPolling) {
          return deferred.resolve(queueId);
        }

        this.pollBuildStatus(projectId, queueId).then(
          function() {
            this._post(buildRoot + '/result/' + queueId).then(
              function(data) {
                deferred.resolve(this._safeParse(data.body).result);
              }.bind(this),
              function(error) {
                deferred.reject(error);
              }
            );
          }.bind(this),
          function(error) {
            deferred.reject(error);
          },
          function(progress) {
            deferred.notify(progress);
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
   * @memberof Monaca
   * @description
   *   Gets a list of project templates.
   *
   *   The method will resolve to list of project templates.
   * @return {Promise}
   * @example
   *   monaca.getTemplates().then(
   *     function(templates) {
   *       //list of templates
   *     },
   *     function(err) {
   *       //error
   *     });
   */
  Monaca.prototype.getTemplates = function() {
    return this._get('/user/templates', { version: this.version })
      .then(
        function(data) {
          var body = this._safeParse(data.body);

          if (body.status === 'ok') {
            return Q.resolve(body.result);
          } else {
            return Q.reject(body.status);
          }
        }.bind(this),
        Q.reject
      );
  };

  Monaca.prototype._npmInit = function () {
    if (npm) {
      return Q.resolve(npm);
    }

    var npmModules = (this.clientType === 'cli') ? ['global-npm', 'npm'] : ['npm', 'global-npm'];

    for (var i in npmModules) {
      try {
        npm = require(npmModules[i]);
      } catch (err) {
        if (i == (npmModules.length - 1)) {
          if (err.code === 'MODULE_NOT_FOUND') {
            err.message = 'npm module not found, add it in order to be able to use this functionality.';
          } else {
            err.message = 'There is an issue with npm. Error code: ' + err.code;
          }

          return Q.reject(err);
        }
      }

      if (npm) {
        return Q.resolve(npm);
      }
    }
  }

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Runs NPM install command
   * @param {String} Directory
   * @param {String} Dependencies to install. Omit it to use the directory's package.json
   * @param {Boolean} dev Install devDependencies
   * @return {Promise}
   */
  Monaca.prototype._npmInstall = function (dir, argvs, dev = false) {
    argvs = argvs || [];

    return new Promise((resolve, reject) => {
      this._npmInit().then(function () {
        let opts = {
          'audit': false
        };
        if (dev) opts['save-dev'] = true;
        npm.load(opts, function (err) {
          if (err) {
            return reject(err);
          }

          npm.commands.install(dir, argvs, function (err, data) {
            if (err) {
              utils.info(err);
              return reject(err);
            }
            resolve(data);
          });
        });
      }, function (err) {
        console.error('[NPM ERROR]', err.message);
        process.exit(1);
      });
    });
  };

  function _jsStringEscape(string) {
    return ('' + string).replace(/["'\\\n\r\u2028\u2029]/g, function (character) {
      // Escape all characters not included in SingleStringCharacters and
      // DoubleStringCharacters on
      // http://www.ecma-international.org/ecma-262/5.1/#sec-7.8.4
      switch (character) {
        case '"':
        case "'":
        case '\\':
          return '\\' + character;
        // Four possible LineTerminator characters need to be escaped:
        case '\n':
          return '\\n';
        case '\r':
          return '\\r';
        case '\u2028':
          return '\\u2028';
        case '\u2029':
          return '\\u2029';
      }
    })
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Get Cordova version used by the project
   * @param {String} Project's Directory
   * @return {String | Exception}
   */
  Monaca.prototype.getCordovaVersion = function (projectDir) {
    let config = this.fetchProjectData(projectDir);

    if (!config) throw '\'.monaca/project_info.json\' is missing. Please execute \'monaca init\' to convert your project into a Monaca project.';
    return config['cordova_version'];
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Installs dev dependencies in a project.
   * @param {String} Project's Directory
   * @param {Boolean} isTranspile
   * @return {Promise}
   */
  Monaca.prototype.installDevDependencies = function (projectDir, isTranspile) {

    let needToInstall = (projectDir, dependency) => {
      let dep;
      try { dep = require(path.resolve(projectDir, 'node_modules', dependency, 'package.json')); }
      catch (e) { return true }
      finally { if (!dep) return true; return false; }
    };

    return new Promise((resolve, reject) => {
      let installDependencies = [], allDependencies = [];

      if (isTranspile) {
        const templateType = this.getTemplateType(projectDir);
        if(!templateType) return reject(new Error('[Dev dependencies] Failed to get the project type'));

        const dependencies = ['babel-core@6.24.0', 'babel-loader@6.2.4', 'babel-preset-es2015@6.9.0', 'babel-preset-react@6.11.1', 'babel-preset-stage-2@6.11.0', 'copy-webpack-plugin@3.0.1', 'css-loader@0.23.1', 'css-to-string-loader@0.1.0', 'extract-text-webpack-plugin@1.0.1', 'file-loader@0.9.0', 'html-loader@0.4.3', 'html-webpack-plugin@2.22.0', 'null-loader@0.1.1', 'postcss-loader@0.9.1', 'postcss-cssnext@2.9.0', 'postcss-import@9.1.0', 'postcss-url@7.0.0', 'progress-bar-webpack-plugin@1.8.0', 'raw-loader@0.5.1', 'read-cache@1.0.0', 'stylus@0.54.5', 'stylus-loader@2.1.1', 'style-loader@0.13.1', 'webpack@1.13.1', 'webpack-dev-server@1.14.1', 'write-file-webpack-plugin@4.3.2', 'script-ext-html-webpack-plugin@2.0.1'];
        const reactDependencies = ['react-hot-loader@3.0.0-beta.1'];
        const vueDependencies = ['vue-loader@11.0.0', 'vue-template-compiler@~2.5.0']
        const angualrDependencies = ['ts-loader@1.3.3', 'typescript@2.4.2']

        if (templateType === 'vue') allDependencies = allDependencies.concat(dependencies, vueDependencies);
        if (templateType === 'angular2') allDependencies = allDependencies.concat(dependencies, angualrDependencies);
        if (templateType === 'react') allDependencies = allDependencies.concat(dependencies, reactDependencies);

      } else allDependencies.push('browser-sync@2.24.5');

      // Checking installed dependencies
      allDependencies.forEach( dependency => {
        if(needToInstall(projectDir, dependency.split('@')[0])) installDependencies.push(dependency);
      })

      let cordovaVersion = this.getCordovaVersion(projectDir);
      try {
        if (!cordovaVersion || cordovaVersion <= 0) {
          cordovaVersion = this.getLatestCordovaVersion(); // install the latest cordova version if failed to retrieve cordova version information
        } else if (parseInt(cordovaVersion) <= 3) {
          cordovaVersion = 4; // install cordova@4.x for lower cordova version 1 to 3
        }
      } catch (e) {
        cordovaVersion = this.getLatestCordovaVersion(); // fallback, install the latest
      }

      if (utils.needToInstallCordova(projectDir)) installDependencies.push('cordova@' + cordovaVersion);

      if (installDependencies.length > 0) {
        utils.info('\n[Dev dependencies] Installing...\n');
        this._npmInstall(projectDir, installDependencies, true).then(
          resolve.bind(null, projectDir),
          reject.bind(null, new Error('[Dev dependencies] Failed to install dev dependencies.'))
        );
      } else resolve(projectDir);
    });

  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Get webpack config template and replace string variables with project specific values.
   * @param {String} Webpack Config Environment Type (prod|dev)
   * @param {String} Project Directory
   * @param {String} folder Folder to get the webpack files
   * @return {String}
   */
  Monaca.prototype.getWebpackConfig = function(environment, projectDir, folder) {
    try {
      var config = this.fetchProjectData(projectDir);
    } catch(error) {
      throw 'Failed to require package info.';
    }

    var framework = config['template-type'];

    var file = 'webpack.' + environment + '.' + framework +  '.js';
    var asset = path.resolve(path.join(__dirname, folder, file));

    if (!fs.existsSync(asset)) {
      throw 'Failed to locate Webpack config template for framework ' + framework;
    }

    return fs.readFileSync(asset, 'utf8');
  }


  /**
   * @method
   * @memberof Monaca
   * @description
   *   Get Cordova version used by the project
   * @param {String} Project's Directory
   * @return {String | Exception}
   */
  Monaca.prototype.getCordovaVersion = function (projectDir) {
    let config = this.fetchProjectData(projectDir);

    if (!config) throw '\'.monaca/project_info.json\' is missing.';
    return config['cordova_version'];
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Installs the template's dependencies.
   * @param {String} Project's Directory
   * @return {Promise}
   */
  Monaca.prototype.installTemplateDependencies = function(projectDir) {
    var deferred = Q.defer();

    fs.exists(path.resolve(path.join(projectDir, 'package.json')), function(exists) {
      if (exists) {
        utils.info('Installing template dependencies...\n');
        this._npmInstall(projectDir).then(
          deferred.resolve.bind(null, projectDir),
          deferred.reject.bind(null, 'Failed to install template dependencies.')
        );
      }
      else {
        deferred.resolve(projectDir);
      }
    }.bind(this));

    return deferred.promise;
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Returns a JSON Object of the project's info.
   * @param {String} Project Directory
   * @return {Object}
   */
  Monaca.prototype.fetchProjectData = function(projectDir) {
    try {
      var project_json_data = this._safeParse(fs.readFileSync(path.resolve(path.join(projectDir, '.monaca', 'project_info.json'))));
    } catch (e) {
      project_json_data = null;
    }

    return project_json_data;
  }

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Get the project's framework
   * @param {String} Project Directory
   * @return {String}
   */
  Monaca.prototype.getTemplateType = function(projectDir) {
    let config = this.fetchProjectData(projectDir);

    if (!config) return null;
    let type = config['template-type'];

    return type ? type : null;
  }

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Returns path to the webpack config file.
   * @return {String}
   */
  Monaca.prototype.getWebpackConfigFile = function(projectDir) {
    var webpackConfig = path.resolve(projectDir, 'webpack.config.js');
    if (!fs.existsSync(webpackConfig)) {
      var error = new Error();
      error.link = 'https://github.com/monaca/monaca-lib/blob/master/updateProject.md';
      error.message = '\nAppears that this project is not configured properly. This may be due to a recent update.\nPlease check this guide to update your project:\n ' + error.link + ' \n';
      error.action = 'reconfiguration';

      throw error;
    }

    return webpackConfig;
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Transpiles projects that need to be transpiled and are enabled.
   * @param {String} Project Directory
   * @param {Object} Options
   * @param {Function} cb Callback
   * @return {Promise}
   */
  Monaca.prototype.transpile = function(projectDir, options, cb) {
    options = options || {};

    return new Promise((resolve, reject) => {

      if (!this.hasTranspileScript(projectDir)) {
        return resolve(new Error('This project\'s type does not support transpiling capabilities. Please create \'monaca:transpile\' script to transpile the project in the \'package.json\' \n' ));
      } else if ((options && options.watch) && !this.hasDebugScript(projectDir)) {
        return reject(new Error('Transpile --watch option failed! Please create \'monaca:debug\' script in \'package.json\''));
      }

      /**
       * Exit Callback function
       */
      let exitCb = (err, stats) => {
        const response = {message: '\n\nTranspiling finished for ' + projectDir};

        if (cb) cb( { type: 'lifecycle', action : 'process-exit'} );
        if (err === 1) reject(new Error('Error has occured while transpiling ' + projectDir + ' with webpack. Please check the logs.'));
        this.emitter.emit('output', Object.assign({}, response, {type: 'success'}));
        if(!options.watch) resolve(response);
      }

      this.emitter.emit('output', { type: 'success', message: 'Running Transpiler...' });
      utils.info('Running Transpiler...\n');

      if (cb != null) cb( { type: 'lifecycle', action : 'start-compile' } );

      const command = options.watch ? 'monaca:debug' : 'monaca:transpile';
      let npm;

      try {
        npm = spawn('npm', ['run', command], {
          cwd: projectDir,
          stdio: this.clientType === 'cli' ? 'inherit': 'pipe',
          env: process.env
        })
      } catch (ex) {
        exitCb(1);
      }

      // Watch option: waiting for after emit message
      if (options.watch) resolve({ message: 'Watching directory "' + projectDir + '" for changes...', pid: npm.pid });

      // Emmit message to localkit
      if (this.clientType !== 'cli') {
        npm.stdout.on('data', (data) => { 
          this.emitter.emit('output', { type: 'progress', message: data.toString() }); //transpile tab
          utils.info(data.toString()); //log file
        });
        npm.stderr.on('data', (data) => { 
          this.emitter.emit('output', { type: 'progress', message: data.toString() }); 
          utils.info(data.toString());
        });
      }

      // Finish
      npm.on('exit', exitCb);
    });
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Download template from Monaca Cloud.
   * @param {String} resource Template URL
   * @param {String} destinationDir Destionation directory
   * @return {Promise}
   */
  Monaca.prototype.downloadTemplate = function(resource, destinationDir) {

    var checkDirectory = function() {
      var deferred = Q.defer();

      fs.exists(destinationDir, function(exists) {
        if (exists) {
          deferred.reject(new Error('Directory already exists'));
        }
        else {
          deferred.resolve(destinationDir);
        }
      });

      return deferred.promise;
    };

    var createTmpFile = function() {
      return Q.denodeify(tmp.file)()
        .then(
          function() {
            return arguments[0][0];
          }
        );
    };

    var saveZipFile = function(path, data) {
      return Q.denodeify(fs.writeFile)(path, data)
        .then(
          function() {
            return path;
          }
        );
    };

    var unzipFile = function(data) {
      return createTmpFile()
        .then(
          function(path) {
            return saveZipFile(path, data);
          }
        )
        .then(
          function(zipPath) {
            var deferred = Q.defer();
            var tmpDir = destinationDir + '-tmp';

            extract(zipPath, {dir: tmpDir}, function(error) {
              if (error) {
                return deferred.reject(error);
              }

              fs.readdir(tmpDir, function(error, files) {
                var retry = 0;
                var source = files.length === 1 ? path.join(tmpDir, files[0]) : tmpDir;
                var mv = function() {
                  fs.rename(source, destinationDir, function(error) {
                    // Windows fix
                    if (error && error.code === 'EPERM' && ++retry < 5) {
                      setTimeout(function () {
                        mv();
                      }, 200);
                    } else if (error) {
                      return deferred.reject(error);
                    } else {
                      fs.rmdir(tmpDir, function(error) {
                        return deferred.resolve(destinationDir);
                      });
                    }
                  });
                };

                mv();
              });

            });

            return deferred.promise;
          }
        );
    };

    var fetchFile = function() {
      utils.info('\nDownloading template...\n');

      return this._get(resource)
        .then(function(data) {
          return Q.resolve(data.body);
        });
    }.bind(this);

    return checkDirectory()
      .then(fetchFile)
      .then(unzipFile)
      .then(this.initComponents.bind(this))
      .then(this.installTemplateDependencies.bind(this));
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Set config file path.
   * @param {String} configFile
   * @return {Promise}
   */
  Monaca.prototype.setConfigFile = function(configFile) {
    var deferred = Q.defer();

    // Parent directory must exist.
    var parentDir = path.dirname(configFile);
    fs.exists(parentDir, function(exists) {
      if (exists) {
        this._configFile = configFile;
        deferred.resolve(configFile);
      }
      else {
        deferred.reject(new Error('Unable to set config file: ' + parentDir + ' does not exist.'));
      }
    }.bind(this));

    return deferred.promise;
  };

  Monaca.prototype._ensureConfigFile = function() {
    var deferred = Q.defer(),
      configFile = this._configFile || CONFIG_FILE;

    var parentDir = path.dirname(configFile);

    fs.exists(parentDir, function(exists) {
      if (!exists) {
        try {
          shell.mkdir('-p', parentDir);
        }
        catch (err) {
          return deferred.reject(err);
        }
      }

      fs.exists(configFile, function(exists) {
        if (!exists) {
          fs.writeFile(configFile, '{}', function(err) {
            if (err) {
              deferred.reject(err);
            }
            else {
              deferred.resolve(configFile);
            }
          });
        }
        else {
          deferred.resolve(configFile);
        }
      });
    });

    return deferred.promise;
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Set a config value.
   * @param {String} key
   * @param {String} value
   * @return {Promise}
   * @example
   *   monaca.setConfig('http_proxy_host', '1.2.3.4').then(
   *     function(value) {
   *       console.log('Proxy host set to ' + value);
   *     },
   *     function(error) {
   *       console.log('An error has occurred: ' + error);
   *     }
   *   );
   */
  Monaca.prototype.setConfig = function(key, value) {
    if (typeof key === 'undefined') {
      throw new Error('"key" must exist.');
    }
    else if (typeof key !== 'string') {
      throw new Error('"key" must be a string.');
    }
    else if (typeof value === 'undefined') {
      throw new Error('"value" must exist.');
    }
    else if (typeof value !== 'string' && value !== null) {
      throw new Error('"value" must be a string or null.');
    }

    var deferred = Q.defer();

    this._ensureConfigFile().then(
      function(configFile) {
        var lockFile = configFile + '.lock';

        lockfile.lock(lockFile, {wait: 10000}, function(error) {
          if (error) {
            return deferred.reject(error);
          }

          var unlock = function() {
            lockfile.unlock(lockFile, function(error) {
              if (error) {
                console.error(error);
              }
            });
          };

          fs.readFile(configFile, function(error, data) {
            if (error) {
              unlock();
              return deferred.reject(error);
            }

            try {
              var ob = JSON.parse(data);

              if (value === null) {
                value = ob[key];
                delete ob[key];
              } else {
                ob[key] = value;
              }

              fs.writeFile(configFile, JSON.stringify(ob), function(error) {
                unlock();

                if (error) {
                  deferred.reject(error);
                }
                else {
                  deferred.resolve(value);
                }
              });
            }
            catch (err) {
              unlock();
              deferred.reject(err);
            }
          });
        });
      },
      function(error) {
        deferred.reject(error);
      }
    );

    return deferred.promise;
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Remove a config value.
   * @param {String} key
   * @return {Promise}
   */
  Monaca.prototype.removeConfig = function(key) {
    return this.setConfig(key, null);
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Get a config value.
   * @param {String} key
   * @return {Promise}
   * @example
   *   monaca.getConfig('http_proxy_host').then(
   *     function(value) {
   *       console.log('Proxy host is ' + value);
   *     },
   *     function(error) {
   *       console.log('Unable to get proxy host: ' + error);
   *     }
   *   );
   */
  Monaca.prototype.getConfig = function(key) {
    if (typeof key === 'undefined') {
      throw new Error('"key" must exist.');
    }
    else if (typeof key !== 'string') {
      throw new Error('"key" must be a string.');
    }

    var deferred = Q.defer();

    this.getAllConfigs().then(
      function(settings) {
        deferred.resolve(settings[key]);
      },
      function(error) {
        deferred.reject(error);
      }
    );

    return deferred.promise;
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Get a config value synchronously
   * @param {String} key
   * @return {String} config Value of the key from config file
   * @example
   *   var proxy = monaca.getConfigSync('http_proxy');
   */
  Monaca.prototype.getConfigSync = function(key) {
    var config;
    var configFile = this._configFile || CONFIG_FILE;
    if (typeof key === 'undefined') {
      throw new Error('"key" must exist.');
    }
    else if (typeof key !== 'string') {
      throw new Error('"key" must be a string.');
    }
    try {
      if (fs.existsSync(configFile)) {
        var configJson = JSON.parse(fs.readFileSync(configFile));
        if (configJson && configJson[key]) {
          config = configJson[key];
        }
      }
    }
    catch (e){
      throw new Error(e);
    }
    return config;
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Get all config key-value pairs.
   * @return {Promise}
   * @example
   *   monaca.getAllConfigs().then(
   *     function(settings) {
   *     },
   *     function(error) {
   *       console.log('Unable to get configs: ' + error);
   *     }
   *   );
   */
  Monaca.prototype.getAllConfigs = function() {
    var deferred = Q.defer();

    this._ensureConfigFile().then(
      function(configFile) {
        fs.readFile(configFile, function(error, data) {
          if (error) {
            deferred.reject(error);
          }
          else {
            try {
              deferred.resolve(JSON.parse(data));
            }
            catch (err) {
              deferred.reject(err);
            }
          }
        });
      },
      function(error) {
        deferred.reject(error);
      }
    );

    return deferred.promise;
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Utility method to check if a folder is a Cordova project.
   * @param {String} projectDir - Project directory.
   * @return {Promise}
   */
  Monaca.prototype.isCordovaProject = function(projectDir) {
    var exists = function(dir) {
      var deferred = Q.defer();

      fs.exists(dir, function(exists) {
        if (exists) {
          deferred.resolve();
        } else {
          if (path.parse(dir).base === 'www') {
            deferred.reject(new Error("'www' directory is missing."));
          } else if (path.parse(dir).base === 'config.xml') {
            deferred.reject(new Error("'config.xml' file is missing."));
          } else {
            deferred.reject(new Error('this is not a Cordova project.'));
          }
        }
      });

      return deferred.promise;
    };

    return Q.all([
      exists(path.join(projectDir, 'www')),
      exists(path.join(projectDir, 'config.xml'))
    ]).then(
      function() {
        return Q.resolve('cordova');
      },
      function(error) {
        var docsUrl;
        if (this.clientType === 'cli') {
          docsUrl = 'https://docs.monaca.io/en/monaca_cli/manual/troubleshooting/#incomplete-files-and-folder-structure';
        } else {
          docsUrl = 'https://docs.monaca.io/' + (global.locale === 'ja' ? 'ja' : 'en') + '/monaca_localkit/manual/troubleshooting/';
        }
        return Q.reject(error + '\nPlease visit ' + docsUrl);
      }.bind(this)
    );
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Utility method to check if a folder is a React Native project.
   * @param {String} projectDir - Project directory.
   * @return {Promise}
   */
  Monaca.prototype.isReactNativeProject = function(projectDir) {
    var deferred = Q.defer();

    if (fs.existsSync(projectDir)) {
      var projectConfig;

      try {
        projectConfig = require(path.join(projectDir, 'package.json'));
      } catch (err) {
        return Q.reject(err);
      }

      if (projectConfig && projectConfig.dependencies && projectConfig.dependencies['react-native']) {
        deferred.resolve('react-native');
      } else {
        deferred.reject();
      }
    } else {
      deferred.reject(new Error('The directory does not exist.'))
    }

    return deferred.promise;
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Utility method to check if a folder is a Monaca project.
   * @param {String} projectDir - Project directory.
   * @return {Promise}
   */
  Monaca.prototype.isMonacaProject = function(projectDir) {
    return this.isReactNativeProject(projectDir)
    .then(
      function(value) {
        return Q.resolve(value);
      },
      function() {
        return this.isCordovaProject(projectDir)
          .then(values => {
            if(!!this.fetchProjectData(projectDir)) Q.resolve('monaca');
            else throw '[.monaca/project_info.json] File is missing';
          });
      }.bind(this)
    )
  };

   /**
   * @method
   * @memberof Monaca
   * @description
   *   Utility method to check if a folder structure is correct.
   * @param {String} projectDir - Project directory.
   * @param {Array} requiredItems - Items to be checked.
   * @return {Promise}
   */
  Monaca.prototype._checkProjectStructure = function(projectDir, requiredItems) {
    // Log of items that are missing.
    var missingItems = [];

    // Loop though each file and directory and check if it exists.
    requiredItems.forEach(function(item) {
      try {
        fs.statSync(path.join(projectDir, item));
      } catch (e) {
        missingItems.push(path.join(projectDir, item));
      }
    });

    // Reject if one or more are missing.
    if (missingItems.length > 0) {
      var err = new Error("This is not a valid project, missing: \n\n" + missingItems.join('\n'));
      return Q.reject(err);
    }

    // Valid Monaca Project
    return Q.resolve(true);
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Get info about current user.
   * @return {Object}
   */
  Monaca.prototype.getCurrentUser = function() {
    if (this._loggedIn) {
      return this.loginBody;
    }
  };

   /**
   * @method
   * @memberof Monaca
   * @description
   *   Get info about the latest performed remote builds.
   * @return {Promise}
   */
  Monaca.prototype.getRemoteBuildList = function(projectId) {
    return this._get(this.apiRoot + '/project/' + projectId + '/build/history', {
      count: 1,
      maxNum: 20
    })
  }

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Starts remote build process in browser
   *   Set arg.skipDownload to true if you want to skip download the changes after closing the windows.
   * @param {Object} arg - Information about project which is to be built remotely.
   * @param {Function} openRemoteBuildWindow - Specifies how browser will be opened with remote build url, returns promise.
   * @return {Promise}
   */
  Monaca.prototype.startRemoteBuild = function(arg, openRemoteBuildWindow) {
    try {
      var outerDeferred = Q.defer();
      var getProjectId = function() {
        return this.getProjectId(arg.path)
          .then(
            function(projectId) {
              if (typeof projectId === 'undefined') {
                return Q.reject();
              }
              else {
                return projectId;
              }
            }
          );
      }.bind(this)

      var createProject = function() {
        return this.createProject({
            name: arg.name,
            description: arg.description || '',
            templateId: 'minimum',
            isBuildOnly: false
          })
          .then(
            function(info) {
              return info.projectId;
            }
          );
      }.bind(this);

      var uploadFiles = function() {
        outerDeferred.notify('Uploading files to the cloud...');
        var options = null;
        if (arg.delete) {
          options = {'delete' : true};
        }
        if (arg.skipTranspile) {
          options.skipTranspile = true;
        }
        if (arg.userDefinedSelectedFileFlag === true) {
          options.userDefinedSelectedFileFlag = true;
          options.userDefinedSelectedFiles = arg.userDefinedSelectedFiles;
        }
        options.deferred = outerDeferred;
        return this.uploadProject(arg.path, options);
      }.bind(this);

      var relogin = function() {
        return this.relogin()
          .catch(
            function() {
              return Q.resolve();
            }.bind(this)
          );
      }.bind(this);

      var downloadProject = function() {
        outerDeferred.notify('Downloading changes from the cloud...');
        var options = null;
        if (arg.delete) {
          options = {'delete' : true};
        }
        options.deferred = outerDeferred;
        return this.downloadProject(arg.path, options);
      }.bind(this);

      this.isMonacaProject(arg.path)
        .catch(
          function(error) {
            if (this.clientType === 'cli') {
              var errorMsg = 'Could not perform the operation: ' + error.message + '\nPlease visit https://docs.monaca.io/en/monaca_cli/manual/troubleshooting/#incomplete-files-and-folder-structure';
            } else {
              var errorMsg = error.message + '\nPlease visit http://docs.monaca.io/'+ (global.locale === 'ja' ? 'ja' : 'en') + '/monaca_localkit/manual/troubleshooting/';
            }
            return Q.reject(new Error(errorMsg));
          }.bind(this)
        )
        .then(relogin)
        .then(
          function() {
            return getProjectId()
              .then(
                function(projectId) {
                  return projectId;
                },
                function() {
                  return createProject()
                    .then(
                      function(projectId) {
                        return this.setProjectId(arg.path, projectId)
                          .then(
                            function() {
                              return projectId;
                            }
                          );
                      }.bind(this)
                    );
                }.bind(this)
              );
          }.bind(this)
        )
        .then(
          function(projectId) {
            return uploadFiles()
              .then(
                function() {
                  return projectId;
                }
              )
              .catch(
                function() {
                  return createProject()
                    .then(
                      function(projectId) {
                        return this.setProjectId(arg.path, projectId)
                          .then(
                            function() {
                              return projectId;
                            }
                          )
                          .then(uploadFiles);
                      }.bind(this)
                    );
                }.bind(this)
              )
          }.bind(this)
        )
        .then(
          function(projectId) {
            // notify client the projectId -- the project is available at the cloud now.
            outerDeferred.notify({
              projectId: projectId
            });
            var url;
            if (arg.showSettings) {
              url = this.apiRoot.match(/https(.*)\//)[0] + '/project/' + projectId + '/build?page=settings';
            } else if (arg.showUrl) {
              url = arg.showUrl.replace('%%PROJECT_ID%%', projectId);
            } else {
              url = this.apiRoot.match(/https(.*)\//)[0] + '/project/' + projectId + '/build';
            }

            if (openRemoteBuildWindow.getLibSessionCookie && openRemoteBuildWindow.getLibSessionCookie()) {
              return url;
            } else {
              return this.getSessionUrl(url);
            }
          }.bind(this)
        )
        .then(function(url) {
          outerDeferred.notify('Waiting for the remote build window to close...');
          return openRemoteBuildWindow(url);
        })
        .then(function(){
          if (arg.skipDownload) {
            return true;
          } else {
            return downloadProject();
          }
        })
        .then(
          function() {
            outerDeferred.resolve();
          },
          function(err) {
            outerDeferred.reject(err);
          }
        )
    }
    catch (e1) {
      console.log("Error in monaca lib start remote build " + e1);
      outerDeferred.reject(e1);
    }
    return outerDeferred.promise;
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *  Gets latest version information about all Monaca platform tools from Monaca Cloud.
   * @return {Promise}
   */
  Monaca.prototype.getLatestVersionInfo = function() {
    var deferred = Q.defer();
    // Since this is a public api, directly call it without any authentication parameters in request header.
    request(this.apiRoot + '/public/versions', function (error, response, body) {
      if (!error && response.statusCode == 200) {
        deferred.resolve(JSON.parse(body));
      } else {
        deferred.reject(error);
      }
    })
    return deferred.promise;
  }

  /**
   * @method
   * @memberof Monaca
   * @description
   *  Send builds to third-party app distribution services.
   * @return {Promise}
   */
  Monaca.prototype.distribute = function(alias, service, request_parameters, build_id, projectId, ci_queue_id) {
    if(!projectId) {
      projectId = this.getProjectId();
    }

    var unknownErrorMsg = 'An unknown error has occurred while attempting to submit build distribution request. (alias: ' + alias + '; parameters: ' + JSON.stringify(request_parameters) + ')';
    var resource = '/project/' + projectId + '/distribute';

    return this._post(resource, {
      alias: alias,
      service: service,
      parameters: request_parameters,
      build_queue_id: build_id,
      ci_queue_id: ci_queue_id || null
    }).then(
      function(response) {
        var body = this._safeParse(response.body);

        if(body.status === 'error' || body.status === 'fail') {
          return Q.reject(body.message || unknownErrorMsg);
        } else {
          return Q.resolve(body);
        }
      }.bind(this),
      function() {
        return Q.reject(unknownErrorMsg);
      }
    );
  }

  /**
   * 
   * @param {*} response 
   * @param {*} customUnknownErrorMsg 
   * @param {*} deferred 
   * 
   * @returns {Promise}
   */
  Monaca.prototype._prepareResponse = function(response, customUnknownErrorMsg, deferred) {
    if(!response || !response.body) throw new Error('Invalid API Response Detected');
    
    var body = this._safeParse(response.body);
    deferred = deferred || Q;

    if(body.status === 'error' || body.status === 'fail') {
      return deferred.reject(body.message || customUnknownErrorMsg);
    } else {
      return deferred.resolve(body);
    }
  }

  /**
   * Get Project Settings
   * 
   * @param {String} project_id 
   * 
   * @returns {Promise}
   */
  Monaca.prototype.fetchProjectSettings = function(project_id) {
    if(!project_id) {
      project_id = this.getProjectId();
    }

    if(this.projectSettings) {
      return Q.resolve(this.projectSettings);
    }

    var unknownErrorMsg = 'An unknown error has occurred while attempting to fetch project settings.';
    var resource = '/project/' + project_id + '/setting/read';

    return this._post(resource, {}).then(
      (response) => { return this._prepareResponse(response, unknownErrorMsg); },
      (error) => { return Q.reject(error || unknownErrorMsg); }
    );
  }

  /* Methods for Setting Android Related Signing Materials  */

  /**
   * Fetches a collection of known KeyStore aliases.
   * 
   * @param {String} project_id
   * 
   * @return {Promise}
   */
  Monaca.prototype.fetchSigningAliasCollection = function(project_id) {
    if(!project_id) {
      project_id = this.getProjectId();
    }

    var unknownErrorMsg = 'An unknown error has occurred while attempting to fetch the collection of your KeyStore alias configurations.';

    return this.fetchProjectSettings(project_id).then(
      (body) => {
        return Q.resolve(
          body.result 
          && body.result.project 
          && body.result.project.android 
          && body.result.project.android.alias_android_list 
          ? body.result.project.android.alias_android_list.map(x => x.alias)
          : []
        );
      },
      (error) => {
        // Replace error with specific error message.
        return Q.reject(unknownErrorMsg);
      }
    );

    return this._post(resource, {}).then(
      (response) => { return this._prepareResponse(response, unknownErrorMsg); },
      (error) => { return Q.reject(error || unknownErrorMsg); }
    ).then((body) => {
      var collection = [];
    
      // Populate Collection
      (body.result || []).forEach(function(profile) {
        collection.push({
          label: profile.prov_name + '  ( ' + profile.crt.cn + ' ) ',
          crt_id: profile.crt.crt_id,
          prov_id: profile.prov_id
        });
      });

      return Q.resolve(collection);
    });
  }

  /**
   * Generate new KeyStore and alias. Exisiting KeyStore and aliases will be removed.
   * 
   * @param {String} project_id 
   * @param {String} alias_name 
   * @param {String} alias_password 
   * @param {String} keystore_password 
   * 
   * @returns {Promise}
   */
  Monaca.prototype.generateSigningKeyStore = function (project_id, alias_name, alias_password, keystore_password) {
    if(!project_id) {
      project_id = this.getProjectId();
    }

    var unknownErrorMsg = 'An unknown error has occurred while attempting to generate an Android KeyStore.';
    var resource = '/project/' + project_id + '/setting/make/keystore';

    return this._post(resource, {
      alias : alias_name,
      alias_password : alias_password,
      password : keystore_password
    }).then(
      (response) => { return this._prepareResponse(response, unknownErrorMsg); },
      (error) => { return Q.reject(error || unknownErrorMsg); }
    );
  }

  /**
   * Upload exisiting KeyStore & Alias file.
   * Exisiting KeyStore & Alias will be removed.
   * 
   * @param {String} project_id 
   * @param {String} filePath 
   * @param {String} password 
   * 
   * @returns {Promise}
   */
  Monaca.prototype.uploadSigningKeyStore = function (project_id, filePath, password) {
    if(!project_id) {
      project_id = this.getProjectId();
    }

    filePath = path.resolve(filePath);

    if(!fs.existsSync(filePath)) {
      return Q.reject('The provided KeyStore file path does not exist.');
    }

    if (utils.isDirectory(filePath)) {
      return Q.reject(ERROR_DIRECTORY_PATH_MESSAGE);
    }

    var unknownErrorMsg = 'An unknown error has occurred while attempting to upload Android KeyStore to Monaca.';
    var resource = '/project/' + project_id + '/setting/keystore/save';

    return this._post_file(resource, {
      password: password,
      isOverwrite: 'true',
      file: fs.createReadStream(filePath)
    }).then(
      (response) => { return this._prepareResponse(response, unknownErrorMsg); },
      (error) => { return Q.reject(error || unknownErrorMsg); }
    );
  }

  /**
   * Add an Android KeyStore Alias
   * 
   * @param {String} project_id 
   * @param {String} alias_name 
   * @param {String} alias_password 
   * 
   * @returns {Promise}
   */
  Monaca.prototype.addSigningAlias = function (project_id, alias_name, alias_password) {
    if(!project_id) {
      project_id = this.getProjectId();
    }

    var unknownErrorMsg = 'An unknown error has occurred while attempting to add an alias to the existing Android KeyStore.';
    var resource = '/project/' + project_id + '/setting/make/alias';

    return this._post(resource, {
      alias : alias_name,
      password : alias_password
    }).then(
      (response) => { return this._prepareResponse(response, unknownErrorMsg); },
      (error) => { return Q.reject(error || unknownErrorMsg); }
    );
  }

  /**
   * Removes Android KeyStore Aliase
   * 
   * @param {String} project_id 
   * @param {String} alias_name 
   * 
   * @returns {Promise}
   */
  Monaca.prototype.removeSigningAlias = function(project_id, alias_name) {
    var unknownErrorMsg = 'An unknown error has occurred while attempting to remove your signing KeyStore alias.';
    var resource = '/project/' + project_id + '/setting/delete/alias';

    return this._post(resource, {
      alias : alias_name
    }).then(
      (response) => { return this._prepareResponse(response, unknownErrorMsg); },
      (error) => { return Q.reject(error || unknownErrorMsg); }
    );
  }

  /**
   * Downloads Android KeyStore
   * 
   * @param {String} project_id 
   * @param {String} downloadToDir 
   * 
   * @returns {Promise}
   */
  Monaca.prototype.exportSigningKeyStore = function(project_id, downloadToDir) {
    var downloadTokenResource = '/project/' + project_id + '/export/keystore_android';
    var unknownErrorMsg = 'An unknown error has occurred while attempting to export the Android KeyStore.';
    var prepareDownloadErrorMsg = 'Failed to prepare to download the requested Android KeyStore.';
    
    if(!downloadToDir) {
      return Q.reject('Missing path to the download directory. Please provide a path to a directory to save to.');
    }
    
    return this._post(downloadTokenResource, {mode: 'start'})
      .then(
        (response) => { return this._prepareResponse(response, prepareDownloadErrorMsg); },
        (response) => { return Q.reject(response || unknownErrorMsg); }
      ).then(
        body => {
          if(body && body.result && body.result.dlToken) {
            return Q.resolve(body.result.dlToken);
          }

          return Q.reject(prepareDownloadErrorMsg);
        },

        (error) => { return Q.reject(error ||  unknownErrorMsg); }
      ).then(
        (token) => {
          var downloadResource = '/project/' + project_id + '/export/keystore_android?mode=download&dlToken=' + token;
          return this._post(downloadResource, {});
        },

        (error) => { return Q.reject(error ||  unknownErrorMsg); }
      ).then(
        (fileContent) => {
          // Resolve the download directory.
          downloadToDir = path.resolve(downloadToDir);

          // If the folder does not exist, create the folder.
          if(!fs.existsSync(downloadToDir)) {
            shell.mkdir('-p', downloadToDir);
          }

          // KeyStore file name
          var file = path.join(downloadToDir, 'android.keystore');
          var deferred = Q.defer();

          fs.writeFile(file, fileContent.body, (error) => {
            if (error) {
              return deferred.reject(error);
            }
  
            return deferred.resolve(file);
          });

          return deferred.promise;
        },

        (error) => { return Q.reject(error ||  unknownErrorMsg); }
      );
  }
  
  /* Methods for Setting iOS Related Signing Materials  */

  /**
   * Fetches a collection of Provisioning Profile and Certificate IDs.
   * 
   * @return {Promise}
   */
  Monaca.prototype.fetchSigningProvisioningProfileCollection = function() {
    var unknownErrorMsg = 'An unknown error has occurred while attempting to fetch the collection of your provisioning profile configurations.';
    var resource = '/user/ios/provlist';

    return this._post(resource, {}).then(
      (response) => { return this._prepareResponse(response, unknownErrorMsg); },
      (error) => { return Q.reject(error || unknownErrorMsg); }
    ).then((body) => {
      var collection = [];
    
      // Populate Collection
      (body.result || []).forEach(function(profile) {
        collection.push({
          label: profile.prov_name + '  ( ' + profile.crt.cn + ' ) ',
          crt_id: profile.crt.crt_id,
          prov_id: profile.prov_id
        });
      });

      return Q.resolve(collection);
    });
  }

  /* Methods for Setting iOS Related Signing Materials  */

  /**
   * Fetches a collection of Certificate IDs.
   * 
   * @return {Promise}
   */
  Monaca.prototype.fetchSigningCertificateCollection = function() {
    var unknownErrorMsg = 'An unknown error has occurred while attempting to fetch the collection of your certificate configurations.';
    var resource = '/user/ios/provlist';

    return this._post(resource, {}).then(
      (response) => { return this._prepareResponse(response, unknownErrorMsg); },
      (error) => { return Q.reject(error || unknownErrorMsg); }
    ).then((body) => {
      let collection = new Map();
      let key = '';
      let value = '';
      // Populate Collection
      (body.result || []).forEach(function(profile) {
        key = profile.crt.crt_id;
        collection.set(key, {
          label: profile.crt.cn,
          crt_id: key,
          expiration: profile.crt.expiration
        });
      });

      // convert to array
      let result = [];
      if (collection && (collection.size >= 1)) result = Array.from(collection.values());

      return Q.resolve(result);
    });
  }


  /**
   * Fetches a collection of Private Key Related Data
   * 
   * @return {Promise}
   */
  Monaca.prototype.fetchSigningPrivateKeyCollection = function() {
    var unknownErrorMsg = 'An unknown error has occurred while attempting to fetch the collection of your private keys.';
    var resource = '/user/ios/keylist';

    return this._post(resource, {}).then(
      (response) => { return this._prepareResponse(response, unknownErrorMsg); },
      (error) => { return Q.reject(error || unknownErrorMsg); }
    ).then((body) => {
      var collection = [];
    
      // Populate Collection
      (body.result || []).forEach(function(pk) {
        collection.push({
          key_id: pk.key_id,
          email: pk.email,
          hash: pk.hash,
          has_csr: pk.has_csr,
          has_certs: pk.crts.length > 0
        });
      });

      return Q.resolve(collection);
    });
  }

  /**
   * Generates a Signing Private Key Certificate Signing Request
   * 
   * @param {String} email 
   * @param {String} name 
   * @param {String} country 
   * 
   * @return {Promise}
   */
  Monaca.prototype.generateSigningPKCSR = function(email, name, country) {
    var unknownErrorMsg = 'An unknown error has occurred while attempting to generate a Private Key and CSR for iOS signing.';
    var resource = '/user/ios/makecsr';

    return this._post(resource, {
      name: name,
      email: email,
      country: country
    }).then(
      (response) => { return this._prepareResponse(response, unknownErrorMsg); },
      (error) => { return Q.reject(error || unknownErrorMsg); }
    );
  }

  /**
   * Downloads Private Key Certificate Signing Request
   * 
   * @param {String} csr_id 
   * @param {String} downloadToDir 
   * 
   * @returns {Promise}
   */
  Monaca.prototype.exportSigningPKCSR = function(csr_id, downloadToDir) {
    var unknownErrorMsg = 'An unknown error has occurred while attempting to export iOS Certificate Signing Request.';
    var resource = '/user/ios/downloadcsr?id=' + encodeURIComponent(csr_id);

    if(!downloadToDir) {
      return Q.reject('Missing path to the download directory. Please provide a path to a directory to save to.');
    }

    downloadToDir = path.resolve(downloadToDir);

    if(!fs.existsSync(downloadToDir)) {
      shell.mkdir('-p', downloadToDir);
    }

    return this._post(resource, {}).then(
      (fileContent) => {
        // Signing Request File Name
        var file = path.join(downloadToDir, 'ios.certSigningRequest');
        var deferred = Q.defer();

        fs.writeFile(file, fileContent.body, (error) => {
          if (error) {
            return deferred.reject(error);
          }

          return deferred.resolve(file);
        });

        return deferred.promise;
      },

      (error) => { return Q.reject(error && error.message || unknownErrorMsg); }
    );
  }

  /**
   * Upload iOS Signing Certificate
   * 
   * @param {String} filePath
   * 
   * @returns {Promise}
   */
  Monaca.prototype.uploadSigningCertificate = function(filePath) {
    var unknownErrorMsg = 'An unknown error has occurred while attempting to upload iOS signing certificate to Monaca.';
    var resource = '/user/ios/importcrt';

    filePath = path.resolve(filePath);

    if(!fs.existsSync(filePath)) {
      return Q.reject('The provided certificate file path does not exist.');
    }

    if (utils.isDirectory(filePath)) {
      return Q.reject(ERROR_DIRECTORY_PATH_MESSAGE);
    }

    return this._post_file(resource, {
      file: fs.createReadStream(filePath)
    }).then(
      (response) => { return this._prepareResponse(response, unknownErrorMsg); },
      (error) => { return Q.reject(error || unknownErrorMsg); }
    );
  }

  /**
   * Upload iOS Signing Provisioning Profile
   * 
   * @param {String} filePath 
   * 
   * @returns {Promise}
   */
  Monaca.prototype.uploadSigningProvisioningProfile = function(filePath) {
    var unknownErrorMsg = 'An unknown error has occurred while attempting to upload iOS provisioning profile to Monaca.';
    var resource = '/user/ios/importprov';

    filePath = path.resolve(filePath);

    if(!fs.existsSync(filePath)) {
      return Q.reject('The provided provisioning profile file path does not exist.');
    }

    if (utils.isDirectory(filePath)) {
      return Q.reject(ERROR_DIRECTORY_PATH_MESSAGE);
    }

    return this._post_file(resource, {
      file: fs.createReadStream(filePath)
    }).then(
      (response) => { return this._prepareResponse(response, unknownErrorMsg); },
      (error) => { return Q.reject(error || unknownErrorMsg); }
    );
  }

  /**
   * Upload iOS Signing p12 file
   * 
   * @param {String} filePath 
   * @param {String} password 
   * 
   * @returns {Promise}
   */
  Monaca.prototype.uploadSigningPKCS12 = function(filePath, password) {
    var unknownErrorMsg = 'An unknown error has occurred while attempting to upload iOS PKCS12 to Monaca.';
    var resource = '/user/ios/importpkcs';

    filePath = path.resolve(filePath);

    if(!fs.existsSync(filePath)) {
      return Q.reject('The provided p12 file path does not exist.');
    }

    if (utils.isDirectory(filePath)) {
      return Q.reject(ERROR_DIRECTORY_PATH_MESSAGE);
    }

    return this._post_file(resource, {
      password: password,
      file: fs.createReadStream(filePath)
    }).then(
      (response) => { return this._prepareResponse(response, unknownErrorMsg); },
      (error) => { return Q.reject(error || unknownErrorMsg); }
    );
  }

  /**
   * Remove iOS Signing Certificate
   * 
   * @param {String} id 
   * 
   * @returns {Promise}
   */
  Monaca.prototype.removeSigningCertificate = function(id) {
    var unknownErrorMsg = 'An unknown error has occurred while attempting to remove your signing certificate.';
    var resource = '/user/ios/deletecrt';

    return this._post(resource, {
      id: id
    }).then(
      (response) => { return this._prepareResponse(response, unknownErrorMsg); },
      (error) => { return Q.reject(error || unknownErrorMsg); }
    );
  }

  /**
   * Remove iOS Signing Provisioning Profile
   * 
   * @param {String} id 
   * 
   * @returns {Promise}
   */
  Monaca.prototype.removeSigningProvisioningProfile = function(id) {
    var unknownErrorMsg = 'An unknown error has occurred while attempting to remove your signing provisioning profile.';
    var resource = '/user/ios/deleteprov';

    return this._post(resource, {
      id: id
    }).then(
      (response) => { return this._prepareResponse(response, unknownErrorMsg); },
      (error) => { return Q.reject(error || unknownErrorMsg); }
    );
  }

  /**
   * Remove iOS Signing Private Key
   * 
   * @param {String} id 
   * 
   * @returns {Promise}
   */
  Monaca.prototype.removeSigningPrivateKey = function(id) {
    var unknownErrorMsg = 'An unknown error has occurred while attempting to remove your signing private key and CSR.';
    var resource = '/user/ios/deletekey';

    return this._post(resource, {
      id: id
    }).then(
      (response) => { return this._prepareResponse(response, unknownErrorMsg); },
      (error) => { return Q.reject(error || unknownErrorMsg); }
    );
  }

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Returns true if the project has the (Monaca) Transpile command defined.
   *
   * @param {String} projectDir Project directory
   * @return {Promise}
   */
  Monaca.prototype.hasTranspileScript = function (projectDir) {
    let packageJsonFile = path.join(projectDir, 'package.json');
    let packageJsonContent = utils.readJSONFile(packageJsonFile);

    return !!(packageJsonContent && packageJsonContent.scripts && packageJsonContent.scripts['monaca:transpile']);
  }

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Returns true if the project has the (Monaca) Transpile command defined.
   *
   * @param {String} projectDir Project directory
   * @return {Promise}
   */
  Monaca.prototype.hasDebugScript = function (projectDir) {
    let packageJsonFile = path.join(projectDir, 'package.json');
    let packageJsonContent = utils.readJSONFile(packageJsonFile);

    return !!(packageJsonContent && packageJsonContent.scripts && packageJsonContent.scripts['monaca:debug']);
  }

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Returns true if it is a old project (created using Monaca 2.x or lower).
   * @param {String} projectDir Project directory
   * @return {Boolean}
   */
  Monaca.prototype.isOldProject = function (projectDir) {
    let packageJsonFile = path.join(projectDir, 'package.json');
    let packageJsonContent = utils.readJSONFile(packageJsonFile);

    return (packageJsonContent && packageJsonContent.scripts) ? (!packageJsonContent.scripts['monaca:preview']) : true;
  }

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Writes new webpack configs with new dependencies to the project directory.
   * @param {String} Project Directory
   * @return {Promise}
   */
  Monaca.prototype.generateTemplateWebpackConfigs = function (projectDir) {
    const config = this.fetchProjectData(projectDir);
    const environment = ['dev', 'prod'];
    const folder = utils.MIGRATION_TEMPLATES_FOLDER;

    if (!config.build) return Promise.resolve(projectDir);

    return new Promise((resolve, reject) => {
      try {
        environment.forEach((env) => {
          let webpackConfig = 'webpack.' + env + '.new.config.js';
          let webpackFile = path.resolve(path.join(projectDir, webpackConfig));
          if (!fs.existsSync(webpackFile)) {
            let fileContent = this.getWebpackConfig(env, projectDir, folder);
            fs.writeFileSync(webpackFile, fileContent, 'utf8');
          } else {
            utils.info(`\t${webpackConfig} already exists. Skipping.\n`);
          }
        })
        resolve(projectDir);
      } catch (error) {
        reject(error);
      }
      resolve(projectDir);
    });

  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   This is the lastest Cordova Version for building
   * @return {String}
   */
  Monaca.prototype.getLatestCordovaVersion = function () {
    return utils.CORDOVA_VERSION;
  };


  /**
   * @method
   * @memberof Monaca
   * @description
   *   Function to create .monaca/project_info.json file
   *
   * @param {String} projectDir Project directory
   * @param {Boolean} isTranspile
   * @return {Promise}
   */
  Monaca.prototype.createProjectInfoFile = function (projectDir, isTranspile) {
    return migration.createProjectInfoFile(projectDir, isTranspile);
  }

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Function to create res folder with icons and splashes
   *
   * @param {String} projectDir Project directory
   * @return {Promise}
   */
  Monaca.prototype.initIconsSplashes = function (projectDir) {
    return migration.initIconsSplashes(projectDir);
  }

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Copies Monaca components folder to www.
   *
   * @param {String} projectDir Project directory
   * @return {Promise}
   */
  Monaca.prototype.initComponents = function (projectDir) {
    return migration.initComponents(projectDir);
  }

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Create default config.xml file.
   *
   * @param {String} projectDir Project directory
   * @return {Promise}
   */
  Monaca.prototype.createConfigFile = function (projectDir) {
    return migration.createConfigFile(projectDir);
  }

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Create default package.json file.
   *
   * @param {String} projectDir Project directory
   * @return {Promise}
   */
  Monaca.prototype.createPackageJsonFile = function (projectDir) {
    return migration.createPackageJsonFile(projectDir);
  }

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Upgrade old projects (Monaca CLI 2.x or lower) to Monaca CLI 3.0.0 structure
   *
   * @param {String} projectDir Project directory
   * @param {Object} options Options
   * @return {Promise}
   */
  Monaca.prototype.upgrade = function (projectDir, options) {
    return migration.upgrade(projectDir, options, this);
  }

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Allow projects created using other cli tools to use Monaca
   *
   * @param {String} projectDir Project directory
   * @param {Boolean} isTranspile
   * @param {Object} commands commands to inject into package.json
   * @return {Promise}
   */
  Monaca.prototype.init = function (projectDir, isTranspile, commands) {
    return migration.init(projectDir, isTranspile, commands, this);
  }

  module.exports = Monaca;
})();
