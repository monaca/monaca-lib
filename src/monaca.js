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

  // local imports
  var localProperties = require(path.join(__dirname, 'monaca', 'localProperties'));

  var USER_CORDOVA = path.join(
      process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'],
      '.cordova'
  );

  var NPM_PACKAGE_FILE = path.join(USER_CORDOVA, 'package.json');
  var USER_DATA_FILE = path.join(USER_CORDOVA, 'monaca.json');
  var CONFIG_FILE = path.join(USER_CORDOVA, 'monaca_config.json');

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

    /**
     * @description
     *   Root of Monaca IDE API.
     * @name Monaca#apiRoot
     * @type string
     * @default https://ide.monaca.mobi/api
     */
    Object.defineProperty(this, 'apiRoot', {
      value: apiRoot ? apiRoot : config.default_api_root,
      writable: false
    });

    /**
     * @description
     *   Root of Monaca web API.
     * @name Monaca#webApiRoot
     * @type string
     * @default https://monaca.mobi/en/api
     */
    Object.defineProperty(this, 'webApiRoot', {
      value: apiRoot ? apiRoot : config.web_api_root,
      writable: false
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

    this.tokens = {
      api: null,
      session: null
    };

    this.loginBody = null;
    this._loggedIn = false;

    if (this.debug) {
      request.debug = true;
    }

    this.emitter = new EventEmitter();
    this._monacaData = this._loadAllData();
  };


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

  //Used to filter the uploaded/downloaded files/dirs based on patterns
  Monaca.prototype._fileFilter = function(f, allowFiles, projectDir, source) {
    // Upload/download .monaca/project_info.json
    if (f.indexOf('/.monaca/project_info.json') == 0) {
      return true;
    }

    if (f.indexOf('/.monaca/android/AndroidManifest.xml') == 0) {
        return true;
     }

    if (f.indexOf('/.monaca/ios/MonacaApp-Info.plist') == 0) {
        return true;
    }

    // Exclude other hidden files and folders from being uploaded.
    if (f.indexOf('/.') >= 0 && source === "uploadProject") {
      return false;
    }

    // Allow all config files in root directory.
    if (/^\/(.*config\..*|.*.json)$/.test(f)) {
      return true;
    }

    // Platform specific files.
    if (f.indexOf('/platforms/ios/MonacaApp-Info.plist') >= 0) {
      return true;
    }
    if (/^\/platforms\/ios\/MonacaApp\/Resources\/icons\/icon[\.a-z0-9@x-]*\.png$/.test(f)) {
      return true;
    }
    if (/^\/platforms\/ios\/MonacaApp\/Resources\/splash\/Default[a-zA-Z0-9@\-\.~]+\.png$/.test(f)) {
      return true;
    }
    if (f.indexOf('/platforms/android/AndroidManifest.xml') >= 0) {
      return true;
    }
    if (/^\/platforms\/android\/res\/drawable\-[a-z]+\/(icon|screen[\.9]*)\.png$/.test(f)) {
      return true;
    }
    if (/^\/platforms\/android\/res\/drawable.+\/screen.+.png$/.test(f)) {
      return true;
    }
    if (/^\/platforms\/(chrome|winrt)\/[^\/]+$/.test(f)) {
      return true;
    }

    if (allowFiles.length > 0) {
      // Only include files in /www, /merges and /plugins folders.
      if (/^\/(?!www\/|www$|merges\/|merges$|plugins\/|plugins$|src\/|src$|typings\/|typings$|res\/|res$).*/.test(f)) {
        return false;
      } else {
        // Check if file is present in one of the /www, /merges and /plugins folders and also in list of allowed files.
        if (allowFiles.indexOf((os.platform() === 'win32' ? projectDir.replace(/\\/g,"/") : projectDir) + f) >= 0) {
          return true;
        } else {
          return false;
        }
      }
    } else {
      // Only include files in /www, /merges and /plugins folders.
      return !/^\/(www\/|merges\/|plugins\/|src\/|typings\/|res\/|[^/]*$)/.test(f);
    }
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

  Monaca.prototype._filterIgnoreList = function(projectDir) {
    var ignoreList = [], allFiles=[];
    if (fs.existsSync(path.join(projectDir, ".monacaignore"))) {
      ignoreList = fs.readFileSync(path.join(projectDir, ".monacaignore"), {
          "encoding": "utf8"
        })
        .split("\r\n") // Split by \r\n.
        .map(function(ele) { return ele.split("\n")}) // Split each array element from previous step by \n again.
        .reduce(function(a,b) { return a.concat(b)}) // Now concat them into one array.
        .filter(function(n) {
          return n.trim() !== "" && n.indexOf("#") !== 0;
        });
    }

    if (os.platform() === 'win32') {
      projectDir = projectDir.replace(/\\/g,"/");
    }

    // We have to append '/**' to get all the subdirectories recursively.
    allFiles = glob.sync(projectDir + "/**",
      {
        dot: true,
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

    if (this.tokens && this.tokens.api) {
      qs.api_token = this.tokens.api;
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
            Cookie: this.tokens.session
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

    this._post('/project/' + projectId + '/file/read', { path: remotePath }).then(
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
            this._post_file('/project/' + projectId + '/file/save', {
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
      clientType: options.clientType || 'local',
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
              'x-monaca-param-session': headers['x-monaca-param-session']
            })
            .then(
              function() {
                this.tokens = {
                  api: headers['x-monaca-param-api-token'],
                  session: headers['x-monaca-param-session']
                };

                this.loginBody = body.result;
                this._loggedIn = true;

                return Q.resolve();
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
   *   monaca.relogin().then(
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
    var deferred = Q.defer();

    this.setData({
      'reloginToken': '',
      'clientId': '',
      'x-monaca-param-api-token': '',
      'x-monaca-param-session': '',
      'trackId': ''
    })
    .then(
      function() {
        delete this.tokens;
        this._loggedIn = false;

        deferred.resolve();
      }.bind(this),
      deferred.reject
    );

    return deferred.promise;
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
      clientType: options.clientType || 'local',
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
      clientType: options.clientType || 'local',
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
  Monaca.prototype.checkBuildAvailability = function(projectId, platform, buildType) {

    if (!projectId || !platform || !buildType) {
      return Q.reject(new Error("Missing parameters."));
    }

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
                return 'Missing KeyStore configuration. Configure remote build and try again.';
              }
            }
            if (platform === 'ios') {
              if (!platformContent.has_splash_and_icons) {
                return 'Your project is missing splash screens and/or icons. Please open remote build settings to configure.';
              }
              if (buildType === 'debug') {
                if (!platformContent.has_dev_provisioning) {
                  return 'Missing dev provisioning file. Please upload it from remote build settings.';
                }
                if (platformContent.dev_provisioning_error) {
                  return 'Error in dev provisioning file. Please upload again from remote build settings.';
                }
              }
              if (buildType === 'debugger') {
                if (!platformContent.has_debug_provisioning) {
                  return 'Missing debug provisioning file. Please upload it from remote build settings.';
                }
                if (platformContent.debug_provisioning_error) {
                  return 'Error in debug provisioning file. Please upload again from remote build settings.';
                }
              }
              if (!platformContent['has_' + buildType + '_provisioning']) {
                return 'Missing ' + buildType + ' provisioning file. Please upload it from remote build settings.';
              }
              if (platformContent[buildType + '_provisioning_error']) {
                return 'Error in' + buildType + ' provisioning file. Please upload again from remote build settings.';
              }
            }

            return '';
          };

          var errorMessage = checkError();
          if (errorMessage) {
            return Q.reject(new Error(errorMessage));
          } else {
            return Q.resolve(body);
          }
        } else {
          return Q.reject(new Error(body.status + " - " + body.message));
        }
      }.bind(this),
      function(err) {
        if (err.code === 404) {
          return Q.reject(new Error("Cannot reach the server, contact Monaca Support. Error code: " + err.code));
        } else {
          return Q.reject(new Error("Internal server error, contact Monaca Support. Error code: " + err.code));
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
    shell.mkdir('-p', path.join(projectDir, '.monaca'));
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

    this._post('/project/' + projectId + '/file/tree').then(
      function(data) {
        deferred.resolve(JSON.parse(data.body).result.items);
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
    var deferred = Q.defer();

    var qLimit = qlimit(100);
    var getFileChecksum = qLimit(function(file) {
      var deferred = Q.defer();

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

    fs.exists(projectDir, function(exists) {
      if (exists) {
        var files = {},
          promises = [];

        var list = shell.ls('-RA', projectDir).filter(function(name) {
          return name.indexOf('node_modules') !== 0;
        });

        var filteredList = list;
        if (options && options.filter && typeof options.filter === 'function') {
          filteredList = list.filter(options.filter);
        }
        filteredList.forEach(function(file) {
          var obj = {},
            key = path.join('/', file);

          // Converting Windows path delimiter to slash
          key = key.split(path.sep).join('/');
          files[key] = obj;

          var absolutePath = path.join(projectDir, file);

          if (fs.lstatSync(absolutePath).isDirectory()) {
            obj.type = 'dir';
          }
          else {
            obj.type = 'file';

            var deferred = Q.defer();

            getFileChecksum(absolutePath).then(
              function(checksum) {
                deferred.resolve([key, checksum]);
              },
              function(error) {
                deferred.reject(error);
              }
            );

            promises.push(deferred.promise);
          }
        });

        Q.all(promises).then(
          function(results) {
            results.forEach(function(result) {
              var key = result[0],
                checksum = result[1];

              files[key].hash = checksum;
            });

            // Remove local properties file.
            delete files['/.monaca/local_properties.json'];

            deferred.resolve(files);
          },
          function(error) {
            deferred.reject(error);
          }
        );
      }
      else {
        deferred.reject(projectDir + ' does not exist');
      }
    });

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
  Monaca.prototype.cloneProject = function(projectId, destDir) {
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

  Monaca.prototype.getProjectInfo = function(projectPath) {
    var deferred = Q.defer();

    var guessConfigFile = function(projectPath) {
      var possibleFiles = ['config.xml', 'config.ios.xml', 'config.android.xml'];

      for (var i = 0, l = possibleFiles.length; i < l; i ++) {
        var configFile = path.join(projectPath, possibleFiles[i]);

        if (fs.existsSync(configFile)) {
          return configFile;
        }
      }

      return null;
    };

    this.getLocalProjectId(projectPath).then(
      function(projectId) {
        var configFile = guessConfigFile(projectPath);
        if (configFile) {
          fs.readFile(configFile, function(error, data) {
            if (error) {
              deferred.reject(error);
            } else {
              xml2js.parseString(data, function(error, result) {
                if (error) {
                  deferred.reject(error);
                } else {
                  var project = {
                    name: result.widget.name[0],
                    directory: projectPath,
                    description: result.widget.description[0],
                    projectId: projectId
                  };

                  deferred.resolve(project);
                }
              });
            }
          });
        }
        else {
          deferred.resolve({
            name: 'Undefined Project Name',
            directory: projectPath,
            description: 'No description',
            projectId: projectId
          });
        }
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
    var deferred = Q.defer();

    this.transpile(projectDir).then(
      localProperties.get.bind(this, projectDir, 'project_id'),
      function(error) {
        deferred.reject(error);
      }
    ).then(
      function(projectId) {
        Q.all([this.getLocalProjectFiles(projectDir), this.getProjectFiles(projectId)]).then(
          function(files) {
            var localFiles = files[0],
              remoteFiles = files[1];

            // Fetch list of files after ignoring files/directories in .monacaignore file.
            var allowFiles = this._filterIgnoreList(projectDir);

            var filesToBeDeleted = {};

            for (var f in remoteFiles) {
              // If file on Monaca Cloud doesn't exist locally then it should be deleted from Cloud.
              if (!localFiles.hasOwnProperty(f)) {
                filesToBeDeleted[f] = remoteFiles[f];
              }
            }
            if (options && !options.dryrun && options.delete) {
              this._deleteFileFromCloud(projectId, Object.keys(filesToBeDeleted)).then(
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

            // Filter out directories and unchanged files.
            this._filterFiles(localFiles, remoteFiles);

            var keys = [];

            // Checks if the file/dir are included in a directory that can be uploaded.
            for (var file in localFiles) {
              if (this._fileFilter(file, allowFiles, projectDir, "uploadProject")) {
                keys.push(file);
              }
            }

            // Modified files.
            var modifiedFiles = {
              uploaded: {},
              deleted: filesToBeDeleted
            };

            for (var i in keys) {
              if (localFiles[keys[i]]) {
                modifiedFiles.uploaded[keys[i]] = localFiles[keys[i]];
              }
            }

            // If dryrun option is set, just return the files to be uploaded.
            if (options && options.dryrun) {
              return deferred.resolve(modifiedFiles);
            }

            var totalLength = keys.length,
              currentIndex = 0,
              qLimit = qlimit(4);

            var uploadFile = function(key) {
              var d = Q.defer();
              var absolutePath = path.join(projectDir, key.substr(1));

              this.uploadFile(projectId, absolutePath, key).then(
                function(remotePath) {
                  deferred.notify({
                    path: remotePath,
                    total: totalLength,
                    index: currentIndex
                  });
                  d.resolve();
                },
                function(error) {
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

            Q.all(keys.map(qLimit(function(key) {
              if (localFiles.hasOwnProperty(key)) {
                return uploadFile(key);
              }
            }.bind(this)))).then(
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
      }.bind(this)
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
    var deferred = Q.defer();
    localProperties.get(projectDir, 'project_id').then(
      function(projectId) {
        Q.all([this.getLocalProjectFiles(projectDir), this.getProjectFiles(projectId)]).then(
          function(files) {
            var localFiles = files[0],
              remoteFiles = files[1];

            var filesToBeDeleted = {};

            // Fetch list of files after ignoring files/directories in .monacaignore file.
            var allowFiles = this._filterIgnoreList(projectDir);
            var tempArr = [];

            // Checks if the file/dir are included in a directory that can be downloaded.
            for (var file in localFiles){
              if (this._fileFilter(file, allowFiles, projectDir, "downloadProject")) {
                tempArr.push(file);
              }
            }

            // Needed to delete first the leafs of the dir tree
            tempArr.sort();
            tempArr.reverse();

            for (var i = 0; i < tempArr.length; i++) {
              var f = tempArr[i];
              // If the file is not present on Monaca cloud but is present locally and it is not listed under .monacaignore, then it must be deleted.
              if (!remoteFiles.hasOwnProperty(f)) {
                filesToBeDeleted[f] = localFiles[f];
                if (options && !options.dryrun && options.delete) {
                  try {
                    if (localFiles[f].type === 'file') {
                      fs.unlinkSync(path.join(projectDir, f));
                      console.log("deleted file-> " + path.join(projectDir, f));
                    }
                    else if (localFiles[f].type === 'dir') {
                      fs.rmdirSync(path.join(projectDir, f));
                      console.log("deleted folder-> " + path.join(projectDir, f));
                    }
                  } catch (err) {
                    console.log("Error deleting " + localFiles[f].type + ": " + f);
                  }
                }
              }
            }

            // Filter out directories and unchanged files.
            this._filterFiles(remoteFiles, localFiles);



            var filterFiles = function() {
              if (allowFiles.length > 0) {
                for (var file in remoteFiles) {
                  if (allowFiles.indexOf((os.platform() === 'win32' ? projectDir.replace(/\\/g,"/") : projectDir) + file) >= 0) {
                    // Allow this file since it exists in the allowed list of files.
                  } else {
                    // Check if this file already exists locally.
                    // If yes then don't donwload it. If no, then download it.
                    if (fs.existsSync(path.join(projectDir,file))) {
                      delete remoteFiles[file];
                    }
                  }
                }
              }
            }

            // Filter files to be downloaded according to .monacaignore file.
            filterFiles();

            // Modified files.
            var modifiedFiles = {
              remoteFiles: remoteFiles,
              deleted: filesToBeDeleted
            }

            // If dryrun option is set, just return the files to be downloaded and deleted.
            if (options && options.dryrun) {
              return deferred.resolve(modifiedFiles);
            }

            var totalLength = Object.keys(remoteFiles).length,
              currentIndex = 0,
              qLimit = qlimit(4);

            var downloadFile = function(key) {
              var d = Q.defer();
              var absolutePath = path.join(projectDir, key.substr(1));

              this.downloadFile(projectId, key, absolutePath).then(
                function(remotePath) {
                  deferred.notify({
                    path: remotePath,
                    total: totalLength,
                    index: currentIndex
                  });
                  d.resolve();
                },
                function(error) {
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

            Q.all(Object.keys(remoteFiles).map(qLimit(function(key) {
              if (remoteFiles.hasOwnProperty(key)) {
                return downloadFile(key);
              }
            }.bind(this)))).then(
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
  Monaca.prototype.buildProject = function(projectId, params) {
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

    var pollBuild = function(queueId) {
      var deferred = Q.defer();

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
    }.bind(this);

    this._post(buildRoot, params).then(
      function(data) {
        var queueId = this._safeParse(data.body).result.queue_id;

        pollBuild(queueId).then(
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

  Monaca.prototype._npmInit = function() {
    if (npm) {
      return Q.resolve(npm);
    }

    var npmModules = ['npm', 'global-npm'];

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
   * @return {Promise}
   */
  Monaca.prototype._npmInstall = function(dir, argvs) {
    argvs = argvs || [];
    var deferred = Q.defer();

    this._npmInit().then(function() {
      npm.load({}, function (err) {
        if (err) {
          return deferred.reject(err);
        }

        npm.commands.install(dir, argvs, function(err, data) {
          if (err) {
            return deferred.reject(err);
          }

          deferred.resolve(data);
        });
      });
    }, function(err) {
      console.error(err.message);
      process.exit(1);
    });

    return deferred.promise;
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
   *   Installs build dependencies.
   * @param {String} Project's Directory
   * @return {Promise}
   */
  Monaca.prototype.installBuildDependencies = function(projectDir) {
    var config = this.fetchProjectData(projectDir);

    if(!config.build) {
      return Q.resolve(projectDir);
    }

    var deferred = Q.defer();
    var packageJsonFile = path.resolve(path.join(__dirname, '..', 'package.json'));
    var dependencies = require(packageJsonFile).additionalDependencies;
    var installDependencies = [];

    if(!fs.existsSync(USER_CORDOVA)) {
      fs.mkdirSync(USER_CORDOVA);
    }
    if(!fs.existsSync(NPM_PACKAGE_FILE)) {
      fs.writeFileSync(NPM_PACKAGE_FILE, '{}');
    }
    var nodeModules = path.join(USER_CORDOVA, 'node_modules');
    if(!fs.existsSync(nodeModules)) {
      fs.mkdirSync(nodeModules);
    }

    Object.keys(dependencies).forEach(function(key) {
      var dep;
      try {
        dep = require(path.join(USER_CORDOVA, 'node_modules', key, 'package.json'));
      } catch (e) {
      } finally {
        if (!dep || dep.version !== dependencies[key]) {
          installDependencies.push(key + '@' + dependencies[key]);
          var depPath = path.join(nodeModules, key)
          if(!fs.existsSync(depPath)) {
            fs.mkdirSync(depPath);
          }
        }
      }
    });

    if(installDependencies.length > 0) {
      process.stdout.write('\n\nInstalling build dependencies...\n');
      this._npmInstall(USER_CORDOVA, installDependencies).then(
        deferred.resolve.bind(null, projectDir),
        deferred.reject.bind(null, new Error('Failed to install build dependencies.'))
      );
    } else {
      deferred.resolve(projectDir);
    }

    return deferred.promise;
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Get webpack config template and replace string variables with project specific values.
   * @param {String} Webpack Config Environment Type (prod|dev)
   * @param {String} Project Directory
   * @return {String}
   */
  Monaca.prototype.getWebpackConfig = function(environment, projectDir) {
    try {
      var config = this.fetchProjectData(projectDir);
    } catch(error) {
      throw 'Failed to require package info.';
    }

    var framework = config['template-type'];
    var file = 'webpack.' + environment + '.' + framework +  '.js';
    var asset = path.resolve(path.join(__dirname, 'template', file));

    if(!fs.existsSync(asset)) {
      throw 'Failed to locate Webpack config template for framework ' + framework;
    }

    return fs.readFileSync(asset, 'utf8');
  }

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Writes webpack configs to the project directory.
   * @param {String} Project Directory
   * @return {Promise}
   */
  Monaca.prototype.generateBuildConfigs = function(projectDir) {
    var config = this.fetchProjectData(projectDir);

    if(!config.build) {
      return Q.resolve(projectDir);
    }

    var deferred = Q.defer();

    try {
      var webpackDevFile = path.resolve(path.join(projectDir, 'webpack.dev.config.js'));
      if(!fs.existsSync(webpackDevFile)) {
        var fileContent = this.getWebpackConfig('dev', projectDir);
        fs.writeFileSync(webpackDevFile, fileContent, 'utf8');
      } else {
        process.stdout.write('webpack.dev.config.js already exists. Skipping.\n');
      }

      var webpackProdFile = path.resolve(path.join(projectDir, 'webpack.prod.config.js'));
      if(!fs.existsSync(path.resolve(path.join(projectDir, 'webpack.prod.config.js')))) {
        var fileContent = this.getWebpackConfig('prod', projectDir);
        fs.writeFileSync(webpackProdFile, fileContent, 'utf8');
      } else {
        process.stdout.write('webpack.prod.config.js already exists. Skipping.\n');
      }

      deferred.resolve(projectDir);
    } catch (error) {
      deferred.reject(error);
    }

    return Q.resolve(projectDir);
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Copies Monaca components folder to www.
   * @param {String} Project Directory
   * @return {Promise}
   */
  Monaca.prototype.initComponents = function(projectDir) {
    var deferred = Q.defer();
    var componentsPath = path.join(projectDir, 'www', 'components');
    fs.exists(componentsPath, function(exists) {
      if (exists) {
        process.stdout.write('www/components already exists. Skipping.\n');
        return deferred.resolve(projectDir);
      } else {
        fs.copy(path.resolve(__dirname, 'template', 'components'), componentsPath, function(error) {
          return error ? deferred.reject(error) : deferred.resolve(projectDir);
        });
      }
    });

    return deferred.promise;
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
        process.stdout.write('Installing template dependencies...\n');
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
   *   Returns true if the type of project supports transpile.
   * @param {String} Project Directory
   * @return {Boolean}
   */
  Monaca.prototype.isTranspilable = function(projectDir) {
    var config = this.fetchProjectData(projectDir);

    if(!config) {
      return false;
    }

    var type = config['template-type'];
    return type && ( type === 'react' || type === 'angular2' );
  }

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Returns true if user has enabled the project transpile feature.
   * @param {String} Project Directory
   * @return {Boolean}
   */
  Monaca.prototype.isTranspileEnabled = function(projectDir) {
    var config = this.fetchProjectData(projectDir);
    return config.build && config.build.transpile && config.build.transpile.enabled;
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Returns path to the user's global webpack binary.
   * @return {String}
   */
  Monaca.prototype.getWebpackBinPath = function() {
    return path.resolve(path.join(USER_CORDOVA, 'node_modules', '.bin', (process.platform === 'win32' ? 'webpack.cmd' : 'webpack')));
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Returns path to the user's global webpack-de-server binary.
   * @return {String}
   */
  Monaca.prototype.getWebpackDevServerBinPath = function() {
    return path.resolve(path.join(USER_CORDOVA, 'node_modules', '.bin', 'webpack-dev-server'));
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Returns path to the webpack config file.
   * @return {String}
   */
  Monaca.prototype.getWebpackConfigFile = function(projectDir, environment) {
    var webpackConfig = path.resolve(projectDir, 'webpack.' + environment + '.config.js');
    if(!fs.existsSync(webpackConfig)) {
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
   * @return {Promise}
   */
  Monaca.prototype.transpile = function(projectDir, options) {
    options = options || {};

    if (!this.isTranspilable(projectDir)) {
      return Q.resolve({
        message: 'This project\'s type does not support transpiling capabilities.\n'
      });
    }

    if (!this.isTranspileEnabled(projectDir)) {
      return Q.resolve({
        message: 'The transpiling feature for this project is currently disabled.\n'
      });
    }

    try {
      var webpackConfigFile = this.getWebpackConfigFile(projectDir, 'prod');
    } catch(error) {
      return Q.reject(error);
    }

    var deferred = Q.defer();
    this.emitter.emit('output', {
      type: 'success',
      message: 'Running Transpiler...'
    });
    process.stdout.write('Running Transpiler...\n');

    var parameters = [webpackConfigFile];
    if (options.watch) {
      parameters.push('--watch')
    }

    var webpackProcess = child_process.fork(path.join(__dirname, 'transpile.js'), parameters, {
      env: extend({}, process.env, {
        USER_CORDOVA: USER_CORDOVA,
        NODE_ENV: JSON.stringify('production'),
        WP_CACHE: options.cache || ''
      })
    });

    webpackProcess.on('message', function(data) {
      if(this.clientType === 'cli') {
        process.stdout.write(data + '\n');
      } else {
        this.emitter.emit('output', {
          type: 'progress',
          message: data
        });
      }
    }.bind(this));

    webpackProcess.on('exit', function(code) {
      if(code === 1) {
        var error = new Error('Error has occured while transpiling ' + projectDir + ' with webpack. Please check the logs.');
        deferred.reject(error);
      } else {
        deferred.resolve({
          message: '\n\nTranspiling finished for ' + projectDir
        });
      }
    });

    if (options.watch) {
      deferred.resolve({
        message: 'Watching directory "' + projectDir + '" for changes...',
        pid: webpackProcess.pid
      });
    }

    return deferred.promise;
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
      process.stdout.write('\nDownloading template...\n');

      return this._get(resource)
        .then(function(data) {
          return Q.resolve(data.body);
        });
    }.bind(this);

    return checkDirectory()
      .then(fetchFile)
      .then(unzipFile)
      .then(this.initComponents.bind(this))
      .then(this.generateBuildConfigs.bind(this))
      .then(this.installTemplateDependencies.bind(this))
      .then(this.installBuildDependencies.bind(this));
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
        }
        else {
          deferred.reject();
        }
      });

      return deferred.promise;
    }

    return Q.all([
      exists(path.join(projectDir, 'www')),
      exists(path.join(projectDir, 'config.xml'))
    ]).then(
      function() {
        return projectDir + ' is a Cordova project.';
      },
      function() {
        return Q.reject(projectDir + ' is not a Cordova project.');
      }
    );
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
    var exists = function(dir) {
      var deferred = Q.defer();

      fs.exists(dir, function(exists) {
        if (exists) {
          deferred.resolve();
        }
        else {
          deferred.reject();
        }
      });

      return deferred.promise;
    }

    var hasConfigFile = function() {
      var configFiles = ['config.xml', 'config.ios.xml', 'config.android.xml'];

      var promises = configFiles
        .map(
          function(fileName) {
            return exists(path.join(projectDir, fileName));
          }
        );

      var next = function() {
        var promise = promises.shift();

        if (!promise) {
          return Q.reject(new Error('Config file is missing.'));
        }

        return promise.then(
          function() {
            return projectDir;
          },
          function() {
            return next();
          }
        );
      };

      return next();
    };

    return exists(path.join(projectDir, 'www')).then(
      function() {
        return hasConfigFile();
      },
      function() {
        return Q.reject(new Error('"www" directory is missing.'));
      }
    );
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
   *   Starts remote build process in browser
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
            isBuildOnly: true
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
        return this.downloadProject(arg.path, options);
      }.bind(this);

      this.isMonacaProject(arg.path)
        .catch(
          function() {
            return Q.reject(new Error('Could not build since project is not a Monaca project or does not exist on disk.'));
          }
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
            if (arg.showSettings) {
              return this.getSessionUrl('https://ide.monaca.mobi/project/' + projectId + '/build?page=settings');
            }
            else if (arg.showUrl) {
              return this.getSessionUrl(arg.showUrl.replace('%%PROJECT_ID%%', projectId));
            }
            else {
              return this.getSessionUrl('https://ide.monaca.mobi/project/' + projectId + '/build');
            }
          }.bind(this)
        )
        .then(function(url) {
          outerDeferred.notify('Waiting for the remote build window to close...');
          return openRemoteBuildWindow(url);
        })
        .then(downloadProject)
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


  module.exports = Monaca;
})();
