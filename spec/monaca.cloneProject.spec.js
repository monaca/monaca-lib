(function() {
  'use strict';

  var path = require('path'),
    fs = require('fs'),
    common = require(path.join(__dirname, 'common')),
    monaca = common.monaca,
    projectId = null;

  describe('Test setup', function() {
    it('should login and find project id', function(done) {
      monaca.login(common.username, common.password).then(
        function() {
          monaca.getProjects().then(
            function(projects) {
              projectId = projects[0].projectId;
              done();
            }
          );
        }
      );
    }, 20000);
  });

  describe('cloneProject', function() {
    beforeEach(function() {
      this.destDir = path.join(common.tmpDir, common.randomString());
    });

    it('should not clone a project that doesn\'t exist', function(done) {
      var resolve = false,
        reject = false;

      monaca.cloneProject('someid', this.destDir).then(
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

    it('should clone if the project exists', function(done) {
      var resolve = false,
        reject = false;

      monaca.cloneProject(projectId, this.destDir).then(
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
    }, 40000);
  });
})();
