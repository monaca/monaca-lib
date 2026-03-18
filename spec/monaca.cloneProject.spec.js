(function() {
  'use strict';

  var path = require('path'),
    fs = require('fs'),
    common = require(path.join(__dirname, 'common')),
    monaca = common.monaca,
    projectId = null,
    setupFailed = false;

  describe('Test setup', function() {
    it('should login and find project id', function(done) {
      monaca.login(common.username, common.password).then(
        function() {
          return monaca.getProjects();
        }
      ).then(
        function(projects) {
          if (!projects || projects.length === 0) {
            setupFailed = true;
            done.fail('getProjects returned no projects');
            return;
          }
          projectId = projects[0].projectId;
          done();
        }
      ).catch(
        function(error) {
          setupFailed = true;
          done.fail('Test setup failed: ' + error);
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
      if (setupFailed || !projectId) {
        pending('Skipped: Test setup failed or timed out (projectId not available)');
        return;
      }

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

  describe('cloneProject when setup fails', function() {
    beforeEach(function() {
      this.destDir = path.join(common.tmpDir, common.randomString());
    });

    it('should fail gracefully when projectId is not available', function(done) {
      if (!setupFailed && projectId) {
        pending('Skipped: Test setup succeeded, this test is for failure scenarios only');
        return;
      }

      var reject = false;

      monaca.cloneProject(null, this.destDir).then(
        function() {
          done.fail('cloneProject should not resolve with null projectId');
        },
        function() {
          reject = true;
        }
      )
      .finally(
        function() {
          expect(reject).toBe(true);
          done();
        }
      );
    });
  });
})();
