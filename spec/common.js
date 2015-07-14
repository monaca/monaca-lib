(function() {
  'use strict';

  var path = require('path'),
    os = require('os'),
    shell = require('shelljs'),
    Monaca = require(path.join(__dirname, '..', 'src', 'monaca'));

  var USERNAME = process.env.MONACA_TEST_EMAIL,
    PASSWORD = process.env.MONACA_TEST_PASSWORD;

  if (!USERNAME || !PASSWORD) {
    throw new Error('Must define email and password using evironment variables MONACA_TEST_EMAIL and MONACA_TEST_PASSWORD to run tests!');
  }

  var monaca = new Monaca(null, { debug: true} );

  var login = function() {
    var loggedIn = false;
    monaca.login(USERNAME, PASSWORD).then(
      function() {
        loggedIn = true;
      }
    );

    waitsFor(function() {
      return loggedIn;
    });

    runs(function() {
      expect(loggedIn).toBe(true);
    });
  };

  var randomString = function() {
    var text = '';
    var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    for( var i=0; i < 15; i++ ) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }

    return text;
  };

  // Create tmp directory.
  var tmpDir = path.join(os.tmpdir(), randomString());
  shell.mkdir(tmpDir);  

  module.exports = {
    monaca: monaca,
    login: login,
    username: USERNAME,
    password: PASSWORD,
    randomString: randomString,
    tmpDir: tmpDir
  };
})();
