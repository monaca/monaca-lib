(function() {
  'use strict';

  var path = require('path'),
    fs = require('fs'),
    common = require(path.join(__dirname, 'common'));

  var monaca = common.monaca;

  describe('login', function() {
    it('should fail with incorrect credentials', function(done) {
      var resolve = false,
        reject = false;

      monaca.login('some@email.com', 'wrongpass').then(
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

    it('should succeed with correct credentials', function(done) {
      var resolve = false,
        reject = false;

      monaca.login(common.username, common.password).then(
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
  });

  describe('logout', function() {
    it('should remove relogin token and in-memory tokens', function(done) {
      monaca.login(common.username, common.password).then(
        function() {
          monaca.getData('reloginToken').then(
            function(token) {
              expect(token.length).toBeGreaterThan(0);
              expect(monaca.tokens).toBeTruthy();

              monaca.logout().then(
                function() {
                  monaca.getData('reloginToken').then(
                    function(token) {
                      expect(token.length).toBe(0);
                      expect(monaca.tokens).toBeFalsy();
                      done();
                    }
                  );
                }
              );
            }
          );
        }
      );
    });
  });

  describe('relogin', function() {
    it('should not work after logout', function(done) {
      var resolve = false,
        reject = false;

      monaca.logout().then(function() {
        monaca.relogin().then(
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
    });

    it('should work after login', function(done) {
      var resolve = false,
        reject = false;

      monaca.login(common.username, common.password).then(function() {
        monaca.relogin().then(
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
    });
  });

  describe('getProjects', function() {
    beforeEach(common.login);

    it('should get a list of projects', function(done) {
      var projects = null;

      monaca.getProjects().then(
        function(result) {
          projects = result;   
        }
      )
      .finally(
        function() {
          expect(projects).toEqual(jasmine.any(Array));
          done();
        }
      );
    });
  });

  describe('downloadFile', function() {
    beforeEach(common.login);

    var projectId = null;
    
    beforeEach(function() {
      var ready = false;

      runs(function() {
        monaca.getProjects().then(
          function(projects) {
            projectId = projects[0].projectId;
          }
        )
        .finally(
          function() {
            ready = true;
          }
        );
      });

      waitsFor(function() {
        return ready;
      });
    });

    it('should fail for projects that don\'t exist', function(done) {
      var resolve = false,
        reject = false;
      
      monaca.downloadFile('incorrectid', '/.monaca/project_info.json', path.join(common.tmpDir, common.randomString())).then(
        function() {
          resolve = true;
        },
        function(error) {
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

    it('should fail for a remote file that doesn\'t exist', function(done) {
      var resolve = false,
        reject = false;

      monaca.downloadFile(projectId, '/some/file', path.join(common.tmpDir, common.randomString())).then(
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

    it('should work for a remote file that exists', function(done) {
      var resolve = false,
        reject = false;

      monaca.downloadFile(projectId, '/.monaca/project_info.json', path.join(common.tmpDir, common.randomString())).then(
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

    it('should download a file with correct content', function(done) {
      var resolve = false,
        reject = false;

      // Download to this file.
      var fn = path.join(common.tmpDir, common.randomString());
      
      monaca.downloadFile(projectId, '/.monaca/project_info.json', fn).then(
        function() {
          resolve = true;
          fs.readFile(fn, function(error, data) {
            expect(resolve).toBe(true);
            expect(reject).toBe(false);
            expect(data.toString()).toContain('framework_version');
            done();
          });
        },
        function() {
          reject = true;
        }
      );
    });
  });

  describe('uploadFile', function() {
    beforeEach(common.login);

    var projectId = null,
      fn = null,
      fileContent = null,
      fileCreated = false;
    
    beforeEach(function() {
      fn = path.join(common.tmpDir, common.randomString());
      fileContent = common.randomString();
      fileCreated = false;
      projectId = null;

      runs(function() {
        monaca.getProjects().then(
          function(projects) {
            projectId = projects[0].projectId;
          }
        );

        fs.writeFile(fn, fileContent, function() {
          fileCreated = true;
        });
      });

      waitsFor(function() {
        return (projectId !== null) && fileCreated;
      });
    }); 

    it('should not work if the project doesn\'t exist', function(done) {
      var resolve = false,  
        reject = false;

      monaca.uploadFile('incorrectid', fn, '/file').then(
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

    it('should not work if the local file doesn\'t exist', function(done) {
      var resolve = false,
        reject = false;

      monaca.uploadFile(projectId, '/some/file/', '/file').then(
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

    it('should upload file to the cloud', function(done) {
      var resolve = false,
        reject = false;
      
      monaca.uploadFile(projectId, fn, '/file').then(
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

    it('should upload a file with the correct content', function(done) {
      monaca.uploadFile(projectId, fn, '/file').then(
        function() {
          var newFn = path.join(common.tmpDir, common.randomString());
          monaca.downloadFile(projectId, '/file', newFn).then(
            function() {
              fs.readFile(newFn, function(error, data) {
                expect(data.toString()).toBe(fileContent);
                done();
              });
            }
          );
        }
      );
    });
  });
})();
