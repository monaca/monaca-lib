/**
 * Used to write and read values from the
 * project_dir/.monaca/local_properties.json
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

var hasPropertyFile = function(directory) {
  var deferred = Q.defer(),
    propertyFile = path.join(directory, '.monaca', 'local_properties.json');

  fs.exists(propertyFile, function(exists) {
    if (exists) {
      deferred.resolve(propertyFile);
    }
    else {
      deferred.reject(propertyFile);
    }
  });

  return deferred.promise;
};

var createDefaultMonacaStructure = function(directory) {
  var deferred = Q.defer();

  try {
    shell.mkdir('-p', path.join(directory, '.monaca'));
    deferred.resolve();
  } catch (e) {
    deferred.reject(e);
  }

  return deferred.promise;
};

var delProperty = function(directory, property) {
  var deferred = Q.defer();

  if (property === 'project_id') {
    var propertyFile = path.join(directory, '.monaca', 'local_properties.json');

     fs.unlink(propertyFile, function(err) {
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
      hasPropertyFile(projectDir).then(
        function(propertyFile) {
          fs.readFile(propertyFile, function(error, data) {
            if (error) {
              deferred.reject(error);
            }
            else {
              try {
                var properties = JSON.parse(data.toString());
                deferred.resolve(properties[key]);
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
      hasPropertyFile(projectDir).then(
        function(propertyFile) {
          fs.readFile(propertyFile, function(error, data) {
            try {
              var obj = JSON.parse(data.toString());

              obj[key] = value;

              fs.writeFile(propertyFile, JSON.stringify(obj), function(error) {
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
        function(propertyFile) {
          var obj = {};
          obj[key] = value;

          fs.writeFile(propertyFile, JSON.stringify(obj), function(error) {
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
