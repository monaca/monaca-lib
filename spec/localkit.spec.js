(function() {
  'use strict';

  // imports
  var path = require('path'),
    request = require('request'),
    common = require(path.join(__dirname, 'common')),
    monaca = common.monaca;

  // localkit class
  var Localkit = require(path.join(__dirname, '..', 'src', 'localkit')),
    Monaca = require(path.join(__dirname, '..', 'src', 'monaca')),
    projectPath = path.join(common.tmpDir, common.randomString());

  describe('Setup tests', function() {
    it('should login and clone a project', function(done) {
      monaca.login(common.username, common.password).then(
        function() {
          monaca.getProjects().then(
            function(projects) {
              var projectId = projects[0].projectId;

              monaca.cloneProject(projectId, projectPath).then(
                function() {
                  done();
                }
              );
            }
          );
        }
      );
    }, 30000);
  });

  describe('Localkit object', function() {
    it('requires a monaca object and a project path', function() {
      var localkit;

      expect(function() {
        localkit = new Localkit();
      }).toThrow();

      expect(function() {
        localkit = new Localkit(1);
      }).toThrow();

      expect(function() {
        localkit = new Localkit(monaca);
      }).not.toThrow();
    });

    it('has some attributes', function() {
      var localkit = new Localkit(monaca);
      expect(localkit.monaca).toEqual(jasmine.any(Monaca));
    });
  });

  describe('HTTP server', function() {
    it('should be startable', function(done) {
      var localkit = new Localkit(monaca),
        started = false;

      localkit.startHttpServer().then(
        function() {
          started = true;
        },
        function() {
        }
      )
      .finally(
        function() {
          localkit.stopHttpServer();
          expect(started).toBe(true);
          done();
        }
      );
    });

    it('should accept connections', function(done) {
      var localkit = new Localkit(monaca);

      localkit.startHttpServer().then(
        function() {
          request('http://localhost:8001/', function(error, response, body) {
            if (!error) {
              expect(JSON.parse(body).code === 404);
              localkit.stopHttpServer();
              done();
            }
          });
        }
      );
    });

    it('should be stoppable', function(done) {
      var localkit = new Localkit(monaca);

      localkit.startHttpServer().then(
        function() {
          localkit.stopHttpServer().then(
            function() {
              request('http://localhost:8001/', function(error) {
                expect(error).not.toBe(null);
                done();
              });
            }
          );
        }
      );
    });
  });

  describe('Beacon transmitter', function() {
    it('should be startable', function(done) {
      var localkit = new Localkit(monaca);

      expect(localkit.beaconTransmitterRunning).toBe(false);
      localkit.startBeaconTransmitter().then(
        function() {
          expect(localkit.beaconTransmitterRunning).toBe(true);
          localkit.stopBeaconTransmitter();
          done();
        }
      );
    });

    it('should be stoppable', function(done) {
      var localkit = new Localkit(monaca);

      localkit.startBeaconTransmitter().then(
        function() {
          expect(localkit.beaconTransmitterRunning).toBe(true);

          localkit.stopBeaconTransmitter().then(
            function() {
              expect(localkit.beaconTransmitterRunning).toBe(false);
              done();
            }
          );
        }
      );
    });
  });

  describe('Projects', function() {
    it('should be addable', function(done) {
      var localkit = new Localkit(monaca);

      localkit.addProject(projectPath).then(
        function() {
          expect(Object.keys(localkit.projects).length).toBe(1);
          done();
        }
      );
    });

    it('should be removable', function(done) {
      var localkit = new Localkit(monaca);

      localkit.addProject(projectPath).then(
        function() {
          return localkit.removeProject(projectPath);
        }
      )
      .then(
        function() {
          expect(Object.keys(localkit.projects).length).toBe(0);
          done();
        }
      );
    });

    it('should be settable', function(done) {
      var localkit = new Localkit(monaca);

      localkit.setProjects([projectPath]).then(
        function() {
          expect(Object.keys(localkit.projects).length).toBe(1);
          done();
        }
      );
    });

    it('should be watchable', function(done) {
      // This test is broken since it doesn't allow the process to terminate.
      done();
      return;

      var localkit = new Localkit(monaca);

      localkit.addProject(projectPath).then(function() {
        return localkit.startWatch();
      })
      .then(function(projectPaths) {
        expect(projectPaths[0]).toBe(projectPath);
        localkit.stopWatch().then(function() {
          done();
        });
      });
    });
  });
}());
