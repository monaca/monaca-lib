(function() {
  'use strict';

  var path = require('path'),
    Q = require('q'),
    crypto = require('crypto');

  var LocalAuth = require(path.join(__dirname, '..', 'src', 'localkit', 'localAuth'));

  describe('LocalAuth', function() {
    var localAuth;

    beforeEach(function() {
      localAuth = new LocalAuth();
    });

    describe('#generateOneTimePassword()', function() {
      it('throws error if argument is not present', function() {
        expect(function() { localAuth.generateOneTimePassword() })
          .toThrow('Must supply a "ttl" argument.');
      });

      it('throws error if argument is not a number', function() {
        expect(function() { localAuth.generateOneTimePassword('hoge') })
          .toThrow('"ttl" argument must be a number.');
      });

      it('returns a Promise', function() {
        var rv = localAuth.generateOneTimePassword(100);
        expect(Q.isPromise(rv)).toBe(true);
      });

      it('returns a Promise that resolves to an object', function(done) {
        var rv = localAuth.generateOneTimePassword(100);
        rv
          .then(
            function(password) {
              expect(typeof password).toBe('object');
              done();
            }
          );
      });
    });

    describe('#validateOneTimePassword()', function() {
      it('throws error if argument is not present', function() {
        expect(function() { localAuth.validateOneTimePassword() })
          .toThrow('Must supply a "passwordHash" argument.');
      });

      it('throws error if argument is not a string', function() {
        expect(function() { localAuth.validateOneTimePassword(123) })
          .toThrow('"passwordHash" argument must be a string.');
      });

      it('should return a promise', function() {
        var rv = localAuth.validateOneTimePassword('hoge');
        expect(Q.isPromise(rv)).toBe(true);
      });

      it('should reject the promise if the password doesn\'t exist', function(done) {
        var rv = localAuth.validateOneTimePassword('hoge');
        rv
          .then(
            function() {
            },
            function(err) {
              expect(err).toBe('No such password.');
              done();
            }
          );
      });

      it('should reject the promise if the password has expired', function(done) {
        localAuth.generateOneTimePassword(100)
          .then(
            function(password) {
              var shasum = crypto.createHash('sha256');
              shasum.update(password.data);
              var passwordHash = shasum.digest('hex');

              setTimeout(function() {
                localAuth.validateOneTimePassword(passwordHash)
                  .then(
                    function() {
                    },
                    function(err) {
                      expect(err).toEqual('Password has expired.');
                      done();
                    }
                  );
              }, 200);
            }
          );
      });

      it('should resolve the promise with the password token', function(done) {
        localAuth.generateOneTimePassword(100)
          .then(
            function(password) {
              var shasum = crypto.createHash('sha256');
              shasum.update(password.data);
              var passwordHash = shasum.digest('hex');

              localAuth.validateOneTimePassword(passwordHash)
                .then(
                  function(_password) {
                    expect(_password).toBe(password);
                    done();
                  }
                );
            }
          )
      });

      it('should forget the OTP after successful validation', function(done) {
        localAuth.generateOneTimePassword(100)
          .then(
            function(password) {
              var shasum = crypto.createHash('sha256');
              shasum.update(password.data);
              var passwordHash = shasum.digest('hex');

              localAuth.validateOneTimePassword(passwordHash)
                .then(
                  function() {
                    localAuth.validateOneTimePassword(passwordHash)
                      .then(
                        function() {
                        },
                        function(err) {
                          expect(err).toEqual('No such password.');
                          done();
                        }
                      )
                  }
                );
            }
          );
      });
    });

    describe('#generateLocalPairingKey()', function() {
      it('should return a Promise', function() {
        var rv = localAuth.generateLocalPairingKey();
        expect(Q.isPromise(rv)).toBe(true);
      });

      it('should return a Promise that resolves to a string(40)', function(done) {
        var rv = localAuth.generateLocalPairingKey();
        rv.then(
          function(pairingKey) {
            expect(typeof pairingKey).toEqual("string");
            expect(pairingKey.length).toEqual(40);
            done();
          }
        );
      });
    });
  });
})();
