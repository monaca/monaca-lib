(function() {
  'use strict';

  // imports
  var path = require('path'),
  rimraf = require('rimraf');

  var common = require(path.join(__dirname, 'common')),
    monaca = common.monaca;

  describe('Create App', function() {
    it('should not create app if any/all arguments are not supplied', function(done) {
      var resolve = false,
        reject = false;

      monaca.createApp({}).then(
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

    it('should create app if all 3 arguments are supplied', function(done) {
      var resolve = false,
        reject = false,
        appName = 'newApp';
      var projectPath = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'] + path.sep + appName;
      monaca.createApp({
        template : {
          name: 'Onsen Tab Bar',
          path: null
        }, 
        appname : appName, 
        workingDir : projectPath }).then(
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
          rimraf.sync(projectPath);
          done();
        }
      );
    }, 20000);

  });

})();
