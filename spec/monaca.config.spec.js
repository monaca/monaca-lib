(function() {
  'use strict';

  // imports
  var path = require('path'),
    os = require('os'),
    Q = require('q');

  var common = require(path.join(__dirname, 'common')),
    monaca = common.monaca;

  describe('Config test', function() {
    var configFile = path.join(os.tmpdir(), common.randomString() + '.json');

    beforeEach(function(done) {
      monaca.setConfigFile(configFile).then(
        function(_configFile) {
          expect(_configFile).toBe(configFile);
          done();
        }
      );
    });

    describe('getConfig', function() {
      it('requires an argument', function() {
        expect(function() {
          monaca.getConfig();
        }).toThrow(new Error('"key" must exist.'));
      });

      it('has to have a string as argument', function() {
        expect(function() {
          monaca.getConfig(3124);
        }).toThrow(new Error('"key" must be a string.'));
      });

      it ('should resolve to "undefined" if trying to get non-existant key.', function(done) {
        monaca.getConfig('something_that_does_not_exist').then(
          function(value) {
            expect(typeof value).toBe('undefined');
            done();
          }
        );
      });

      it('should get the correct value.', function(done) {
        monaca.setConfig('some_key', 'Some value').then(
          function(_value) {
            monaca.getConfig('some_key').then(
              function(value) {
                expect(value).toBe(_value);
                done();
              }
            );
          }
        );
      });
    });

    describe('setConfig', function() {
      it('requires two arguments', function() {
        expect(function() {
          monaca.setConfig();
        }).toThrow(new Error('"key" must exist.'));

        expect(function() {
          monaca.setConfig('key');
        }).toThrow(new Error('"value" must exist.'));
      });

      it('requires string arguments', function() {
        expect(function() {
          monaca.setConfig(123);
        }).toThrow(new Error('"key" must be a string.'));

        expect(function() {
          monaca.setConfig('key', 123);
        }).toThrow(new Error('"value" must be a string.'));
      });
    });

    describe('removeConfig', function() {
      it('should remove a value', function(done) {
        var key = 'some_key',
          value = 'some_value';

        monaca.setConfig(key, value).then(
          function(_value) {
            expect(_value).toBe(value);
            return monaca.getConfig(key);
          }
        )
        .then(
          function(_value) {
            expect(_value).toBe(value);
            return monaca.removeConfig(key);
          }
        )
        .then(
          function(_value) {
            expect(_value).toBe(value);
            return monaca.getConfig(key);
          }
        )
        .then(
          function(_value) {
            expect(typeof _value).toBe('undefined');
            done();
          }
        );
      });
    });

    describe('getAllConfigs', function() {
      it('should get all config values.', function(done) {
        var promises = [],
          i;

        for (i = 1; i <= 20; i++) {
          promises.push(monaca.setConfig('key' + i, 'value' + i));
        }

        Q.all(promises).then(
          function(values) {
            expect(values[3]).toBe('value4');

            return monaca.getAllConfigs();
          }
        )
        .then(
          function(settings) {
            for (i = 1; i <= 20; i++) {
              expect(settings['key' + i]).toBe('value' + i);
            }

            done();
          }
        );
      });
    });
  });
})();
