(function() {
  'use strict';
  var path = require('path'),
    fs = require('fs'),
    shell = require('shelljs'),
    lp = require(path.join(__dirname, '..', 'src', 'monaca', 'localProperties')),
    common = require(path.join(__dirname, 'common'));

  describe('get', function() {
    it('should not work if the directory doesn\'t exist', function(done) {
      var resolve = false,
        reject = false;

      lp.get('/some/random/directory', 'key').then(
        function() {
          resolve = true;
        },
        function() {
          reject = true;
        }
      )
      .finally(
        function() {
          expect(resolve).toBe(false);
          expect(reject).toBe(true);
          done();
        }
      );
    });

    it('should not work if the directory doesn\'t contain .monaca', function(done) {
      var resolve = false,
        reject = false;

      var directory = path.join(common.tmpDir, common.randomString());

      shell.mkdir(directory);
      lp.get(directory, 'key').then(
        function() {
          resolve = true;
        },
        function() {
          reject = true;
        }
      )
      .finally(
        function() {
          expect(resolve).toBe(false);
          expect(reject).toBe(true);
          done();
        }
      );
    });

    it('should work if the directory contains .monaca', function(done) {
      var resolve = false,
        reject = false;

      var directory = path.join(common.tmpDir, common.randomString());

      shell.mkdir('-p', path.join(directory, '.monaca'));
      lp.get(directory, 'key').then(
        function() {
          resolve = true;
        },
        function() {
          reject = true;
        }
      )
      .finally(
        function() {
          expect(resolve).toBe(true);
          expect(reject).toBe(false);
          done();
        }
      );
    });

    it('should get correct value from file', function(done) {
      var  directory = path.join(common.tmpDir, common.randomString()),
        data = { key: 123 };

      shell.mkdir('-p', path.join(directory, '.monaca'));
      fs.writeFile(path.join(directory, '.monaca', 'local_properties.json'), JSON.stringify(data), function(error) {
        lp.get(directory, 'key').then(
          function(value) {
            expect(value).toBe(data.key);
            done();
          }
        );
      });
    });
  });

  describe('set', function() {
    it('should not work if the directory doesn\'t exist', function(done) {
      var resolve = false,
        reject = false;

      lp.set('/some/random/directory', 'key', 'value').then(
        function() {
          resolve = true;
        },
        function() {
          reject = true;
        }
      )
      .finally(
        function() {
          expect(resolve).toBe(false);
          expect(reject).toBe(true);
          done();
        }
      );
    });

    it('should not work if the directory doesn\'t contain .monaca', function(done) {
      var resolve = false,
        reject = false;

      var directory = path.join(common.tmpDir, common.randomString());

      shell.mkdir(directory);
      lp.set(directory, 'key', 'value').then(
        function() {
          resolve = true;
        },
        function() {
          reject = true;
        }
      )
      .finally(
        function() {
          expect(resolve).toBe(false);
          expect(reject).toBe(true);
          done();
        }
      );
    });

    it('should work if the directory does contain .monaca', function(done) {
      var resolve = false,
        reject = false;

      var directory = path.join(common.tmpDir, common.randomString());

      shell.mkdir('-p', path.join(directory, '.monaca'));
      lp.set(directory, 'key', 'value').then(
        function() {
          resolve = true;
        },
        function() {
          reject = true;
        }
      )
      .finally(
        function() {
          expect(resolve).toBe(true);
          expect(reject).toBe(false);
          done();
        }
      );
    });

    it('should write the correct value to the file', function(done) {
      var directory = path.join(common.tmpDir, common.randomString()),
        value = common.randomString();

      shell.mkdir('-p', path.join(directory, '.monaca'));
      lp.set(directory, 'key', value).then(
        function() {
          lp.get(directory, 'key').then(
            function(newValue) {
              expect(newValue).toBe(value);
              done();
            }
          );
        }
      );
    });
  });
})();
