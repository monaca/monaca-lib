
/**
 * Used to write and read values from the
 * project_dir/.monaca/project_info.json
 * file.
 */

var fs = require('fs'),
  path = require('path'),
  shell = require('shelljs'),
  Q = require('q');

var hasMonacaDir = function(directory) {
  var deferred = Q.defer();

  fs.exists(path.join(directory, '.monaca'), function(exists) {
    if (exists) {
      deferred.resolve();
    }
    else {
      createDefaultMonacaStructure(directory)
      .then(function() {
        deferred.resolve();
      }, function(e) {
        deferred.reject(e);
      })
    }
  });

  return deferred.promise;
};

var hasLocalPackageJSONFile = function(directory) {
  var deferred = Q.defer(),
    settingsFile = path.join(directory, 'package.json');

  fs.exists(settingsFile, function(exists) {
    if (exists) {
      deferred.resolve(settingsFile);
    }
    else {
      deferred.reject(settingsFile);
    }
  });

  return deferred.promise;
};

var delProperty = function(directory, property) {
  var deferred = Q.defer();

  if (property === 'project_id') {
    var settingsFile = path.join(directory, '.monaca', 'project_info.json');

     fs.unlink(settingsFile, function(err) {
        if (err) {
          deferred.reject(new Error("Could not delete the property: " + err));
        } else {
          deferred.resolve();
        }
      });
  } else {
    deferred.reject(new Error("The required property cannot be deleted because it does not exist."));
  }

  return deferred.promise;
};


var getProperty = function(projectDir, key) {
  var deferred = Q.defer();

  hasMonacaDir(projectDir).then(
    function() {
      hasLocalPackageJSONFile(projectDir).then(
        function(settingsFile) {
          fs.readFile(settingsFile, function(error, data) {
            if (error) {
              deferred.reject(error);
            }
            else {
              try {
                var settings = JSON.parse(data.toString());
                deferred.resolve(settings[key]);
              }
              catch (e) {
                deferred.reject(e);
              }
            }
          });
        },
        function() {
          deferred.resolve();
        }
      );
    },
    function(e) {
      deferred.reject(e);
    }
  );

  return deferred.promise;
};

var setProperty = function(projectDir, key, value) {
  var deferred = Q.defer();
  hasMonacaDir(projectDir).then(
    function() {
      hasLocalPackageJSONFile(projectDir).then(
        function(settingsFile) {
          fs.readFile(settingsFile, function(error, data) {
            try {
              var obj = JSON.parse(data.toString());

              obj[key] = value;

              fs.writeFile(settingsFile, JSON.stringify(obj), function(error) {
                if (error) {
                  deferred.reject(error);
                }
                else {
                  deferred.resolve();
                }
              });
            }
            catch (e) {
              deferred.reject(e);
            }
          });
        },
        function(settingsFile) {
          var obj = {};
          obj[key] = value;

          fs.writeFile(settingsFile, JSON.stringify(obj), function(error) {
            if (error) {
              deferred.reject(error);
            }
            else {
              deferred.resolve();
            }
          });
        }
      );
    },
    function(e) {
      deferred.reject(e);
    }
  );

  return deferred.promise;
};

module.exports = {
  get: getProperty,
  set: setProperty,
  del: delProperty
};
