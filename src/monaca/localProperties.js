/**
 * Used to write and read values from the 
 * project_dir/.monaca/local_properties.json
 * file.
 */

var fs = require('fs'),
  path = require('path'),
  Q = require('q');

var hasMonacaDir = function(directory) {
  var deferred = Q.defer();

  fs.exists(path.join(directory, '.monaca'), function(exists) {
    if (exists) {
      deferred.resolve();
    }
    else {
      deferred.reject();
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
    function() {
      deferred.reject(new Error('.monaca directory missing. This is not a Monaca project.'));
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
    function() {
      deferred.reject(new Error('.monaca directory missing. This is not a Monaca project.'));
    }
  );

  return deferred.promise;
};

module.exports = {
  get: getProperty,
  set: setProperty
};
