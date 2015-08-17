(function() {
  'use strict';

  var Q = require('q'),
    qlimit = require('qlimit'),
    request = require('request'),
    os = require('os'),
    path = require('path'),
    fs = require('fs'),
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
    Decompress = require('decompress'),
    zip = require('decompress-unzip');

  // local imports
  var localProperties = require(path.join(__dirname, 'monaca', 'localProperties'));

  var USER_DATA_FILE = path.join(
    process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'],
    '.cordova', 'monaca.json'
  );

  var CONFIG_FILE = path.join(
    process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'],
    '.cordova', 'monaca_config.json'
  );

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
    /**
     * @description
     *   Root of Monaca web API.
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
     *   Package name.
     * @name Monaca#packageName
     * @type string
     */
    Object.defineProperty(this, 'debug', {
      value: (options && options.hasOwnProperty("debug") && options.debug === true),
      writable: false
    });

    this._loggedIn = false;
    
    if (this.debug) {
      request.debug = true;
    }
  };

  Monaca.prototype._loadAllData = function() {
    var deferred = Q.defer();

    fs.exists(USER_DATA_FILE, function(exists) {
      if (exists) {
        fs.readFile(USER_DATA_FILE, function(error, data) {
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
      }
      else {
        deferred.resolve({});
      }
    });

    return deferred.promise;
  };

  Monaca.prototype._saveAllData = function(data) {
    var deferred = Q.defer(),
      jsonData;

    try {
      jsonData = JSON.stringify(data);
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

  Monaca.prototype.setData = function(key, value) {
    var deferred = Q.defer();

    this._loadAllData().then(
      function(data) {
        data[key] = value;

        this._saveAllData(data).then(
          function() {
            deferred.resolve(value);
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

  Monaca.prototype.getData = function(key) {
    var deferred = Q.defer();

    this._loadAllData().then(
      function(data) {
        deferred.resolve(data[key]);
      },
      function(error) {
        deferred.reject(error);
      }
    );

    return deferred.promise;
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

  Monaca.prototype._createRequestClient = function(data) {
    var deferred = Q.defer(),
      qs = {
        api_token: this.tokens.api
      };

    if (data) {
      extend(qs, data);
    }

    if (!this._loggedIn) {
      deferred.reject('Must be logged in to use this method.');
    }
    else {
      this.getConfig('http_proxy').then(
        function(httpProxy) {
          var requestClient = request.defaults({
            qs: qs,
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
      )
    }

    return deferred.promise;
  }

  Monaca.prototype._get = function(resource, data) {
    var deferred = Q.defer();

    this._createRequestClient(data).then(
      function(requestClient) {
        if (resource.charAt(0) !== '/') {
          resource = '/' + resource;
        }
        requestClient.get(this.apiRoot + resource,
          function(error, response, body) {
            if (error) {
              deferred.reject(error.code);
            } else {
              if (response.statusCode === 200) {
                deferred.resolve(body);
              } else {
                try {
                  deferred.reject(JSON.parse(body));
                }
                catch (e) {
                  deferred.reject(response.statusCode);
                }
              }
            }
          }
        )
      }.bind(this),
      function(error) {
        deferred.reject(error);
      }
    )
    return deferred.promise;
  };

  Monaca.prototype._post = function(resource, data) {
    var deferred = Q.defer();

    this._createRequestClient().then(
      function(requestClient) {
        if (resource.charAt(0) !== '/') {
          resource = '/' + resource;
        }
        requestClient.post({
          url: this.apiRoot + resource,
          form: data
        }, function(error, response, body) {
          if (error) {
            deferred.reject(error.code);
          } else {
            if (response.statusCode === 200 || response.statusCode === 201) {
              deferred.resolve(body);
            } else {
              try {
                deferred.reject(JSON.parse(body));
              }
              catch (e) {
                deferred.reject('Error code: ' + response.statusCode);
              }
            }
          }
        });
      }.bind(this)
    );

    return deferred.promise;
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

          fs.writeFile(localPath, data, function(error) {
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
        deferred.reject('File does not exist.');
      }
      else {
        fs.readFile(localPath, function(error, data) {
          if (error) {
            deferred.reject(error);
          }
          else {
            this._post('/project/' + projectId + '/file/save', {
              path: remotePath,
              contentBase64: data.toString('base64')
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
      clientType: 'local',
      version: options.version || this.packageName + ' ' + this.version,
      os: os.platform()
    };

    if (arguments.length === 1 || typeof arguments[1] === 'object') {
      form.token = arguments[0];
    }
    else {
      form.email = arguments[0];
      form.password = arguments[1];
    }

    Q.all([this.getData('clientId'), this.getConfig('http_proxy')]).then(
      function(data) {
        var clientId = data[0],
          httpProxy = data[1];

        if (clientId) {
          form.clientId = clientId;
        }
        request.post({
          url: this.apiRoot + '/user/login',
          proxy: httpProxy,
          form: form
        },
        function(error, response, body) {
          try {
            var _body = JSON.parse(body || '{}');
          } catch (e) {
            deferred.reject("Not a JSON response");
          }
          if (error) {
            deferred.reject(error.code);
          }
          else {
            if (response.statusCode == 200) {
              var d = Q.defer();

              this.setData('reloginToken', _body.result.token).then(
                function() {
                  this.setData('clientId', _body.result.clientId).then(
                    function() {
                      d.resolve();
                    },
                    function(error) {
                      d.reject(error);
                    }
                  );
                }.bind(this),
                function(error) {
                  d.reject(error);
                }
              );

              d.promise.then(
                function() {
                  var headers = response.caseless.dict;

                  this.tokens = {
                    api: headers['x-monaca-param-api-token'],
                    session: headers['x-monaca-param-session']
                  };

                  this.loginBody = _body.result;

                  this._loggedIn = true;
                  deferred.resolve();
                }.bind(this),
                function(error) {
                  deferred.reject(error);
                }
              );
            }
            else {
              deferred.reject(_body);
            }
          }
        }.bind(this));
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
    var deferred = Q.defer();

    options = options || {};

    this.getData('reloginToken').then(
      function(reloginToken) {
        if (typeof(reloginToken) !== 'string' || reloginToken === '') {
          return deferred.reject("Not a valid relogin token.");
        }

        this._login(reloginToken, options).then(
          function() {
            deferred.resolve();
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

    this.setData('reloginToken', '').then(
      function() {
        delete this.tokens;
        this._loggedIn = false;
        deferred.resolve();
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
   *   Generate a one time token for an URL.
   * @param {string} url
   * @return {Promise}
   */
  Monaca.prototype.getSessionUrl = function(url) {
    var deferred = Q.defer();

    this._get('/user/getSessionUrl', { url: url }).then(
      function(response) {
        deferred.resolve(JSON.parse(response).result.url);
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
            deferred.resolve(filename);
          });
          file.on('error', function(error) {
            deferred.reject(error);
          });
        } else {
          deferred.reject("Not a valid file name");
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
      function(response) {
        deferred.resolve(JSON.parse(response));
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
      function(response) {
        deferred.resolve(JSON.parse(response).result.items);
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
      function(response) {
        deferred.resolve(JSON.parse(response).result.items);
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
  Monaca.prototype.getLocalProjectFiles = function(projectDir) {
    var deferred = Q.defer();

    var getFileChecksum = function(file) {
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
    };

    fs.exists(projectDir, function(exists) {
      if (exists) {
        var files = {},
          promises = [];

        var list = shell.ls('-RA', projectDir).filter(function(name) {
          return name.indexOf('node_modules') !== 0;
        });

        list.forEach(function(file) {
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
        deferred.reject('File or directory already exists and it contains files.');
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
      function(response) {
        var data;

        try {
          data = JSON.parse(response).result;
        }
        catch (error) {
          return deferred.reject(error);
        }

        deferred.resolve(data);
      },
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
  Monaca.prototype.uploadProject = function(projectDir) {
    var deferred = Q.defer();

    localProperties.get(projectDir, 'project_id').then(
      function(projectId) {
        Q.all([this.getLocalProjectFiles(projectDir), this.getProjectFiles(projectId)]).then(
          function(files) {
            var localFiles = files[0],
              remoteFiles = files[1];

            // Filter out directories and unchanged files.
            this._filterFiles(localFiles, remoteFiles);

            var fileFilter = function(fn) {
              // Exclude hidden files and folders.
              if (fn.indexOf('/.') >= 0) {
                return false;
              }

              // Platform specific files
            	if (fn.indexOf('/platforms/ios/MonacaApp-Info.plist') >= 0) {
            		return true;
            	}
            	if (/^\/platforms\/ios\/MonacaApp\/Resources\/icons\/icon[\.a-z0-9@x-]*\.png$/.test(fn)) {
            		return true;
            	}
            	if (/^\/platforms\/ios\/MonacaApp\/Resources\/splash\/Default[a-zA-Z0-9@\-\.~]+\.png$/.test(fn)) {
            		return true;
            	}
            	if (fn.indexOf('/platforms/android/AndroidManifest.xml') >= 0) {
            		return true;
            	}
            	if (/^\/platforms\/android\/res\/drawable\-[a-z]+\/(icon|screen[\.9]*)\.png$/.test(fn)) {
            		return true;
            	}
            	if (/^\/platforms\/android\/res\/drawable.+\/screen.+.png$/.test(fn)) {
            		return true;
            	}
            	if (/^\/platforms\/(chrome|winrt)\/[^\/]+$/.test(fn)) {
            		return true;
            	}
            	
            	// Only include files in /www, /merges and /plugins folders.
            	return /^\/(www\/|merges\/|plugins\/|[^/]*$)/.test(fn);
            };

            var keys = Object.keys(localFiles).filter(fileFilter);

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
                deferred.resolve(projectId);
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
  Monaca.prototype.downloadProject = function(projectDir) {
    var deferred = Q.defer();

    localProperties.get(projectDir, 'project_id').then(
      function(projectId) {
        Q.all([this.getLocalProjectFiles(projectDir), this.getProjectFiles(projectId)]).then(
          function(files) {
            var localFiles = files[0],
              remoteFiles = files[1];

            // Filter out directories and unchanged files.
            this._filterFiles(remoteFiles, localFiles);

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
                deferred.resolve(projectId);
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
      deferred.reject('Must specify build platform.');
    }

    var pollBuild = function(queueId) {
      var deferred = Q.defer(),
        counter = 0;

      var interval = setInterval(function() {
        if (counter++ == 80) {
          clearInterval(interval);
          deferred.reject('Build timed out');
        }

        this._post(buildRoot + '/status/' + queueId).then(
          function(response) {
            var result = JSON.parse(response).result;

            deferred.notify(result.description);

            if (result.finished) {
              clearInterval(interval);

              if (result.status === 'finish') {
                deferred.resolve(result.description);
              }
              else {
                this._post(buildRoot + '/result/' + queueId).then(
                  function(response) {
                    deferred.reject(JSON.parse(response).result.error_message);
                  },
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
      function(response) {
        var queueId = JSON.parse(response).result.queue_id;

        pollBuild(queueId).then(
          function() {
            this._post(buildRoot + '/result/' + queueId).then(
              function(response) {
                deferred.resolve(JSON.parse(response).result);
              },
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
    return this._get('/user/project/templates')
      .then(
        function(response) {
          var data;

          try {
            data = JSON.parse(response);
          }
          catch (e) {
            return Q.reject(e);
          }

          if (data.status === 'ok') {
            return data.result.items;
          }
          else {
            return Q.reject(data.status);
          }
        }
      );
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Download template from Monaca Cloud.
   * @param {String} templateId Template ID
   * @param {String} destinationDir Destionation directory
   * @return {Promise}
   */
  Monaca.prototype.downloadTemplate = function(templateId, destinationDir) {
    var checkDirectory = function() {
      var deferred = Q.defer();

      fs.exists(destinationDir, function(exists) {
        if (exists) {
          deferred.reject('Directory already exists');
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
          function(path) {
            var deferred = Q.defer();

            var decompress = new Decompress()
              .src(path)
              .dest(destinationDir)
              .use(zip({strip: 0}));

            decompress.run(function(err) {
              if (err) {
                deferred.reject(err);
              }
              else {
                deferred.resolve(destinationDir);
              }
            });

            return deferred.promise;
          }
        );
    }

    var fetchFile = function() {
      return this._get('/user/project/downloadTemplate', {templateId: templateId});
    }.bind(this);

    return checkDirectory()
      .then(fetchFile)
      .then(unzipFile);
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Create project from template.
   * @param {String} templateId Template ID
   * @param {String} destinationDir Destionation directory
   * @return {Promise}
   */
  Monaca.prototype.createFromTemplate = function(templateId, destinationDir) {
    return this.downloadTemplate(templateId, destinationDir);
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
        deferred.reject('Unable to set config file: ' + parentDir + ' does not exist.');
      }
    }.bind(this));

    return deferred.promise;
  };

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Get current config file.
   * @return {Promise}
   */
  Monaca.prototype.getConfigFile = function() {
    var deferred = Q.defer();

    deferred.resolve(this._configFile || CONFIG_FILE);

    return deferred.promise;
  };

  Monaca.prototype._ensureConfigFile = function() {
    var deferred = Q.defer();

    // Ensure that config file exists.
    this.getConfigFile().then(
      function(configFile) {
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
      },
      function() {
      }
    );

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
    else if (typeof value !== 'string') {
      throw new Error('"value" must be a string.');
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
              ob[key] = value;

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
    if (typeof key === 'undefined') {
      throw new Error('"key" must exist.');
    }
    else if (typeof key !== 'string') {
      throw new Error('"key" must be a string.');
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
              var ob = JSON.parse(data),
                value = ob[key];

              delete ob[key];

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
          return Q.reject('Config file is missing.');
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
        return Q.reject('"www" directory is missing.');
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
        return this.uploadProject(arg.path);
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
        return this.downloadProject(arg.path);
      }.bind(this);
      
      this.isMonacaProject(arg.path)
        .catch(
          function() {          
            return Q.reject('Could not build since project is not a Monaca project or does not exist on disk.');
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
          function() {
            return uploadFiles()
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
  
  module.exports = Monaca;
})();
