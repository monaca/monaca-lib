(function() {
  'use strict';

  // imports
  var path = require('path'),
    fs = require('fs'),
    shell = require('shelljs');

  var common = require(path.join(__dirname, 'common')),
    monaca = common.monaca;

  var destDir = path.join(common.tmpDir, common.randomString()),
    projectId = null;

  describe('Setup test', function() {
    it('should login and clone a project', function(done) {
      monaca.login(common.username, common.password).then(
        function() {
          monaca.getProjects().then(
            function(projects) {
              projectId = projects[0].projectId;

              monaca.cloneProject(projectId, destDir).then(
                function() {
                  done();
                }
              );
            }
          );
        }
      );
    }, 40000);
  });

  describe('Download project', function() {
    it('should not work if the directory doesn\'t exist', function(done) {
      var resolve = false,
        reject = false;

      monaca.downloadProject('/some/directory').then(
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

    it('should not work if directory is not a Monaca project', function(done) {
      var resolve = false,
        reject = false;

      var directory = path.join(common.tmpDir, common.randomString());

      shell.mkdir(directory);

      monaca.downloadProject(directory).then(
        function() {
          resolve = true;
        },
        function() {
          reject = true;
        }
      ).finally(function() {
        expect(resolve).toBe(false);
        expect(reject).toBe(true);
        done();
      });
    });
    
    it('should work if directory is a Monaca project', function(done) {
      var resolve = false,
        reject = false;

      monaca.downloadProject(destDir).then(
        function() {
          resolve = true;
        },
        function() {
          reject = true;
        }
      ).finally(
        function() {
          expect(resolve).toBe(true);
          expect(reject).toBe(false);
          done();
        }
      );
    });

    it('should not download any files if no changes were made', function(done) {
      var resolve = false,
        reject = false,
        n = 0;

      monaca.downloadProject(destDir).then(
        function() {
          resolve = true;
        },
        function() {
          reject = true;
        },
        function() {
          n++;
        }
      ).finally(
        function() {
          expect(resolve).toBe(true);
          expect(reject).toBe(false);
          expect(n).toBe(0);
          done();
        }
      );
    });

    it('should download files that are changed', function(done) {
      var resolve = false,
        reject = false,
        n = 0;

      var fn = path.join(common.tmpDir, common.randomString());

      fs.writeFileSync(fn, common.randomString());

      monaca.uploadFile(projectId, fn, path.join('/www', 'index.html')).then(function() {
        monaca.downloadProject(destDir).then(
          function() {
            resolve = true;
          },
          function(error) {
            reject = true;
          },
          function() {
            n++;
          }
        ).finally(
          function() {
            expect(resolve).toBe(true);
            expect(reject).toBe(false);
            expect(n).toBe(1);
            done();
          }
        );
      });
    });
  });
})();
