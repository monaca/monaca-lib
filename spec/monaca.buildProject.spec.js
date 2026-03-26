(function() {
  'use strict';

  // imports
  var path = require('path');

  var common = require(path.join(__dirname, 'common')),
    monaca = common.monaca;

  var projectId = null;

  describe('Build project', function() {
    beforeAll(function(done) {
      monaca.login(common.username, common.password).then(
        function() {
          return monaca.getProjects();
        }
      ).then(
        function(projects) {
          if (!projects || projects.length === 0) {
            done.fail('getProjects returned no projects');
            return;
          }
          projectId = projects[0].projectId;
          done();
        }
      ).catch(
        function(error) {
          done.fail('Test setup failed: ' + error);
        }
      );
    }, 20000);

    it('should not build if the project doesn\'t exist', function(done) {
      var resolve = false,
        reject = false;

      monaca.buildProject('incorrectid', {
        platform: 'android',
        purpose: 'debug'
      }).then(
        function() {
          resolve = true;
        },
        function() {
          reject = true;
        }
      ).finally(
        function() {
          expect(resolve).toBe(false);
          expect(reject).toBe(true);
          done();
        }
      );
    });

    it('should build for android', function(done) {
      var resolve = false,
        reject = false;

      monaca.buildProject(projectId, {
        platform: 'android',
        purpose: 'debug'
      }).then(
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
    }, 100000);

  });
})();
