Monaca Cloud API
================

This is a library used to communicate with the Monaca Cloud REST API.

Initialization
-------------

From version 2.5.0, `clientType: 'lib'` needs to be specified when `monaca-lib` is initialized for standalone use.

**Example:**

```javascript
var Monaca = require('monaca-lib').Monaca;

var monaca = new Monaca({clientType: 'lib'});
```

Example usage
-------------

```javascript
var Monaca = require('monaca-lib').Monaca;

var monaca = new Monaca({clientType: 'lib'});

monaca.login('some@email.com', 'password').then(
  function() {
    console.log('Succesfully logged in!');

    monaca.cloneProject('PROJECT_ID', '/destination/directory').then(
      function() {
        console.log('Successfully clone project!');
      },
      function(error) {
        console.log('Clone failed: ' + error);
      },
      function(progress) {
        console.log('Downloading ' + progress.path);
      }
    );
  },
  function(error) {
    console.log('Login failed: ' + error);
  }
);
```

There is also a `Localkit` class that is used to connect a local development environment to the Monaca Debugger.

```javascript
var monacaLib = require('monaca-lib'),
  Monaca = monacaLib.Monaca,
  Localkit = monacaLib.Localkit;

var monaca = new Monaca({clientType: 'lib'});

var localkit = new Localkit(monaca, '/path/to/project');

localkit.startHttpServer().then(
  function() {
    localkit.startBeaconTransmitter().then(
      function() {
        console.log('Localkit will now wait for connections from the Monaca debugger.');
      }
    );
  }
);
```

Running tests
-------------

To run the tests use the following command:

```bash
$ export MONACA_TEST_EMAIL=some@email.org
$ export MONACA_TEST_PASSWORD=password
$ npm test
```

Building the documentation
--------------------------

The documentation is built using JSDoc. Use the following command in the root directory
to build the documentation:

```bash
$ jsdoc src
```

The generated documentation can be found in `out/index.html`.

