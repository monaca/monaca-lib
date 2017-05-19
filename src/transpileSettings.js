var fs = require('fs'),
  path = require('path'),
  shell = require('shelljs'),
  Q = require('q'),
  semver = require('semver');

  var projectInfo = require(path.join(__dirname, 'monaca', 'projectInfo'));
  var localPackageJSON = require(path.join(__dirname, 'localPackageJSON'));

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

  /**
   * @method
   * @class getMonacaPackageJSON
   * @description
   * Get monaca-lib package.json
   * @return {Promise}
   */
  var getMonacaPackageJSON = function() {
    var deferred = Q.defer();
    try {
      var monacaJsonFile = path.resolve(path.join(__dirname, '..', 'package.json')),
        monacaDependencies = require(monacaJsonFile);
      deferred.resolve(monacaDependencies);
      return deferred.promise;
    } catch (error) {
      deferred.reject(error);
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
        getProjectInfoProperty(projectDir, "build.transpile.webpack_version"),
        getProjectInfoProperty(projectDir, "template-type"),
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
      getWebpackConfig(projectDir)
      .then(function (config) {
        var webpackFile = path.join(backupPath, 'webpack.config.js');
        fs.writeFile(webpackFile, JSON.stringify(config), function(error) {
          if (error) {
            return Q.reject(error);
          }
          else {
            return Q.resolve();
          }
        }
        );
      }),
      getLocalPackageJSONProperty(projectDir, 'version')
      .then(function (version) {
        var backupFile = path.join(backupPath, 'backup.json');
        var backupObject = {'version': version, 'dependencies': globalDependencies};
        fs.writeFile(backupFile, JSON.stringify(backupObject), function(error) {
          if (error) {
            return Q.reject(error);
          }
          else {
            return Q.resolve();
          }
        });
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
   return getLocalPackageJSONProperty(projectDir, 'version')
    .then(function(v) {
      if(semver.lt(v, '2.2.7')) {
        return Q('precss');
      } else {
        return Q('cssnext');
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

    return getProjectInfoProperty(projectDir, "template-type")
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

          return deferred.promise;
        } catch (error) {
          deferred.reject(error);
        }
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

    return getMonacaPackageJSON().then(function(objectJSON) {
      try {
        for(var i in dependencyKeys) {
          var regex = new RegExp(dependencyKeys[i], "i");
          for(var key in objectJSON) {
            if(regex.test(key)) {
              dependencyObjects.push(objectJSON[key]);
            }
          }
        }

        if(dependencyKeys.length === dependencyObjects.length) {
          return Q(dependencyObjects);
        } else {
          return Q.reject(new Error('Wrong configuration in .monaca/project_info.json'));
        }
      } catch (error) {
        Q.reject(error);
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

      Object.keys(objectJSON).sort().forEach(function(key) {
        sortedObject[key] = objectJSON[key];
      });
      console.log(sortedObject);
      return Q(sortedObject);
    } catch (error) {
      Q.reject(error);
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
    var deferred = Q.defer();
    try {
      dependencyKeys[0] = "webpack" + dependencyKeys[0];
      deferred.resolve(dependencyKeys);
      return deferred.promise;
    } catch (error) {
      deferred.reject(error);
    }
  };

module.exports = {
  getGlobalDependencies: getGlobalDependencies,
  backupGlobalConfiguration: backupGlobalConfiguration
};
