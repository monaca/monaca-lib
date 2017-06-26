/* eslint-env node, mocha */
var fs = require('fs'),
  path = require('path'),
  Q = require('q'),
  semver = require('semver');

var projectInfo = require(path.join(__dirname, 'monaca', 'projectInfo'));
var localPackageJSON = require(path.join(__dirname,'monaca', 'localPackageJSON'));

var getProjectInfoProperty = function(projectDir, property) {
  return projectInfo.get(projectDir, property);
};

var setProjectInfoProperty = function(projectDir, property, value) {
  return projectInfo.set(projectDir, property, value);
};

var getLocalPackageJSONProperty = function(projectDir, property) {
  return localPackageJSON.get(projectDir, property);
};

var setLocalPackageJSONProperty = function(projectDir, property, value) {
  return localPackageJSON.set(projectDir, property, value);
};

var USER_CORDOVA = path.join(
  process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'],
  '.cordova'
);

var NPM_PACKAGE_FILE = path.join(USER_CORDOVA, 'package.json');

/**
 * @method
 * @class getMonacaPackageJSON
 * @description
 * Get monaca-lib package.json
 * @return {Promise}
 */
var getMonacaPackageJSON = function() {
  try {
    var monacaPackageJSONPath = path.resolve(path.join(__dirname, '..', 'package.json')),
      monacaPackageJSONFile = require(monacaPackageJSONPath);
    return Q.resolve(monacaPackageJSONFile);
  } catch (error) {
    return Q.reject(error);
  }
};

/**
 * @method
 * @class getMonacaPackageJSON
 * @description
 * Get monaca-lib package.json
 * @return {Promise}
 */
var getDependencyBackupConfig = function(projectDir) {
  try {
    var dependencyBackupPath = path.resolve(path.join(projectDir, '.monaca', 'backup', 'backup.json')),
      dependencyBackupFile = require(dependencyBackupPath);
    return Q.resolve(dependencyBackupFile);
  } catch (error) {
    return Q.reject(error);
  }
};

/**
 * @method
 * @class getGlobalDependencies
 * @description
 * Get object with list of global dependencies for specific template
 * @param {String} Project Directory
 * @return {Promise}
 */
var getGlobalDependencies = function(projectDir) {

  return Q.all([
    projectDir,
    Q.all([
      getProjectInfoProperty(projectDir, 'build.transpile.webpack-version'),
      getProjectInfoProperty(projectDir, 'template-type'),
      getTemplateVersionSpecificKey(projectDir)
    ])
    .then(parseWebpackVersion.bind(this))
    .then(matchDependencyObjects.bind(this))
    .then(mergeObjectsArray.bind(this))
  ]);
};

/**
 * @method
 * @class backupGlobalConfiguration
 * @description
 * copy webpack config and list of global dependencies with template version into .monaca/backup
 * @param {String} Project Directory
 * @param {Object} globalDependencies
 */
var backupGlobalConfiguration = function(projectDir, globalDependencies) {

  var backupPath = path.join(projectDir, '.monaca', 'backup');
  if (!fs.existsSync(backupPath)) {
    fs.mkdirSync(backupPath);
  }
  return Q.all([
    getWebpackConfig(projectDir).then(
      function(config) {
        var deferred = Q.defer();
        var webpackFile = path.join(backupPath, 'webpack.config.js');

        fs.writeFile(webpackFile, config, function(error) {
          if (error) {
            deferred.reject(error);
          } else {
            deferred.resolve();
          }
        }
        );
        return deferred.promise;
      }),
    getLocalPackageJSONProperty(projectDir, 'version').then(
      function(version) {
        var deferred = Q.defer();
        var backupFile = path.join(backupPath, 'backup.json');
        var backupObject = {
          'version': version,
          'dependencies': globalDependencies
        };
        fs.writeFile(backupFile, JSON.stringify(backupObject, null, 2), function(error) {
          if (error) {
            deferred.reject(error);
          } else {
            deferred.resolve();
          }
        });
        return deferred.promise;
      })
  ]);
};

/**
 * @method
 * @class getTemplateVersionSpecificKeys
 * @description
 * Get dependency key specific for particular release of template
 * @param {String} Project Directory
 * @return {Promise}
 */
var getTemplateVersionSpecificKey = function(projectDir) {
  try {
    return getLocalPackageJSONProperty(projectDir, 'version').then(
      function(v) {
        if(semver.lt(v, '2.2.7')) {
          return Q.resolve('precss');
        } else {
          return Q.resolve('cssnext');
        }
      }.bind(this));
  } catch (error) {
    return Q.reject(error);
  }
};

/**
 * @method
 * @class getWebpackConfig
 * @description
 *   Get webpack configuration that match framework used in template
 * @param {String} Project Directory
 * @return {Promise}
 */
var getWebpackConfig = function(projectDir) {
  return getProjectInfoProperty(projectDir, 'template-type')
  .then(function(framework) {
    var deferred = Q.defer();
    try {
      var file = 'webpack.' + framework + '.config.js';
      var asset = path.resolve(path.join(__dirname, '..', 'src', 'template', file));

      if (!fs.existsSync(asset)) {
        deferred.reject(new Error('Failed to locate Webpack config template for framework ' + framework));
      } else {
        deferred.resolve(fs.readFileSync(asset, 'utf8'));
      }
    } catch (error) {
      deferred.reject(error);
    }
    return deferred.promise;
  });
};

/**
 * @method
 * @class matchDependencyObjects
 * @description
 * returns array of dependency objects that matched specific dependencyKeys
 * @param {String} dependencyKeys
 * @return {Promise}
 */
var matchDependencyObjects = function(dependencyKeys) {
  var dependencyObjects = [];

  dependencyKeys.push('additionalDependencies');

  return getMonacaPackageJSON()
  .then(function(objectJSON) {
    try {
      for (var i in dependencyKeys) {
        var regex = new RegExp(dependencyKeys[i], 'i');
        for (var key in objectJSON) {
          if(regex.test(key)) {
            dependencyObjects.push(objectJSON[key]);
          }
        }
      }

      if(dependencyKeys.length === dependencyObjects.length) {
        return Q.resolve(dependencyObjects);
      } else {
        return Q.reject(new Error('Wrong configuration in .monaca/project_info.json'));
      }
    } catch (error) {
      return Q.reject(error);
    }
  });
};


/**
 * @method
 * @class mergeObjectsArray
 * @description
 * merge array of objects into one
 * @param {String} objArray
 * @return {Promise}
 */
var mergeObjectsArray = function(objArray) {
  var mergeFunction = function(obj, dep){
    return Object.assign(obj, dep);
  };

  var sortedObject = {};
  try {
    var objectJSON = objArray.reduce(mergeFunction);

    Object.keys(objectJSON).sort()
    .forEach(
      function(key) {
        sortedObject[key] = objectJSON[key];
      }
    );
    return Q.resolve(sortedObject);
  } catch (error) {
    return Q.reject(error);
  }
};

/**
 * @method
 * @class parseWebpackVersion
 * @description
 * parse webpack version in dependency keys array
 * @param {String []} dependencyKeys
 * @return {Promise}
 */
var parseWebpackVersion = function(dependencyKeys) {
  try {
    dependencyKeys[0] = 'webpack' + dependencyKeys[0];

    return Q.resolve(dependencyKeys);
  } catch (error) {
    return Q.reject(error);
  }
};

/**
 * @method
 * @memberof Monaca
 * @description
 *   Installs the template's dependencies.
 * @param {String} Project's Directory
 * @return {Promise}
 */
var installTemplateDependencies = function(projectDir) {
  var deferred = Q.defer();
  fs.exists(path.resolve(path.join(projectDir, 'package.json')), function(exists) {
    if (exists) {
      process.stdout.write('Installing template dependencies...\n');
      this._npmInstall(projectDir).then(
        deferred.resolve.bind(null, projectDir),
        deferred.reject.bind(null, 'Failed to install template dependencies.')
      );
    } else {
      deferred.resolve(projectDir);
    }
  }.bind(this));

  return deferred.promise;
};

/**
 * @method
 * @memberof Monaca
 * @description
 *   Installs global dependencies.
 * @param {String} Project's Directory
 * @return {Promise}
 */
var installGlobalDependencies = function(projectDir, dependencies) {

  var deferred = Q.defer();
  var installDependencies = [];

  if (!fs.existsSync(USER_CORDOVA)) {
    fs.mkdirSync(USER_CORDOVA);
  }
  if (!fs.existsSync(NPM_PACKAGE_FILE)) {
    fs.writeFileSync(NPM_PACKAGE_FILE, '{}');
  }
  var nodeModules = path.join(USER_CORDOVA, 'node_modules');
  if (!fs.existsSync(nodeModules)) {
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
        if (!fs.existsSync(depPath)) {
          fs.mkdirSync(depPath);
        }
      }
    }
  });

  if (installDependencies.length > 0) {
    process.stdout.write('\n\nInstalling build dependencies...\n');
    this._npmInstall(USER_CORDOVA, installDependencies).then(
      deferred.resolve.bind(null, dependencies),
      deferred.reject.bind(null, new Error('Failed to install build dependencies.'))
    );
  } else {
    deferred.resolve(dependencies);
  }

  return Q.all([projectDir, deferred.promise]);
};


/**
 * @method
 * @memberof Monaca
 * @description
 *   Installs build dependencies.
 * @param {String} Project's Directory
 * @return {Promise}
 */
var ejectConfiguration = function(projectDir) {
  var mergeIntoPackage = function(globalDependencies, localDependencies) {
    mergeObjectsArray([globalDependencies, localDependencies])
    .then(
      function(dependencies) {
        return setLocalPackageJSONProperty(projectDir, 'dependencies', dependencies);
      }
    );
  };

  var webpack1Eject = function(localDependencies) {
    return getGlobalDependencies(projectDir)
    .spread(
      function(projectDir, globalDependencies) {
        return  mergeIntoPackage(globalDependencies, localDependencies);
      }
    );
  };

  var webpack2Eject = function(localDependencies) {
    return copyWebpackBackup(projectDir)
    .then(
      function() {
        return getDependencyBackupConfig(projectDir)
        .then(
          function(backupConfig) {
            return mergeIntoPackage(backupConfig.dependencies, localDependencies);
          }
        );
      }
    );
  };

  return getLocalPackageJSONProperty(projectDir, 'dependencies')
  .then(
    function(localDependencies) {
      getProjectInfoProperty(projectDir, 'build.transpile.webpack-version')
      .then(
        function(webpackVersion) {
          if(webpackVersion >= 2) {
            webpack2Eject(localDependencies);
          } else {
            webpack1Eject(localDependencies);
          }
        }
      );
    }
  );
};
/**
 * @method
 * @memberof Monaca
 * @description
 *   Installs build dependencies.
 * @param {String} Project's Directory
 * @return {Promise}
 */
var eject = function(projectDir) {
  var deferred = Q.defer();
  try {

    return getProjectInfoProperty(projectDir, 'build.transpile.ejected')
    .then(function(ejected) {
      if(!ejected) {
        ejectConfiguration(projectDir);
      } else {
        return Q.reject(new Error('Project is already ejected'));
      }
    })
    .then(this.installTemplateDependencies.bind(this))
    .then(setProjectInfoProperty(projectDir, 'build.transpile.ejected', true));
  } catch (error) {
    deferred.reject(error);
  }
  return deferred.promise;
};

/**
 * @method
 * @class copyWebpackBackup
 * @description
 *   Get webpack configuration that match framework used in template
 * @param {String} Project Directory
 * @return {Promise}
 */
var copyWebpackBackup = function(projectDir) {
  var getWebpackBackup = function(projectDir) {
    var deferred = Q.defer();
    try {
      var file = 'webpack.config.js';
      var asset = path.resolve(path.join(projectDir, '.monaca', 'backup', file));

      if (!fs.existsSync(asset)) {
        deferred.reject(new Error('Failed to locate Webpack backup config for template'));
      } else {
        deferred.resolve(fs.readFileSync(asset, 'utf8'));
      }

    } catch (error) {
      deferred.reject(error);
    }
    return deferred.promise;
  };

  return getWebpackBackup(projectDir)
  .then(function(config) {
    var deferred = Q.defer();
    var webpackFile = path.join(projectDir, 'webpack.config.js');
    if (fs.existsSync(webpackFile)) {
      //TODO think if I should skip this step
      deferred.reject(new Error('Webpack configuration already exists. Please remove it in order to do eject'));
    } else {
      fs.writeFile(webpackFile, config, function(error) {
        if (error) {
          deferred.reject(error);
        } else {
          deferred.resolve();
        }
      });
    }

    return deferred.promise;
  });
};

module.exports = {
  getGlobalDependencies: getGlobalDependencies,
  getProjectInfoProperty: getProjectInfoProperty,
  setProjectInfoProperty: setProjectInfoProperty,
  getLocalPackageJSONProperty: getLocalPackageJSONProperty,
  setLocalPackageJSONProperty: setLocalPackageJSONProperty,
  installGlobalDependencies: installGlobalDependencies,
  installTemplateDependencies: installTemplateDependencies,
  backupGlobalConfiguration: backupGlobalConfiguration,
  eject: eject
};
