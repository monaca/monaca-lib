(function() {
  'use strict';

  var path = require('path');

  var Monaca = require(path.join(__dirname, 'monaca')),
    Localkit = require(path.join(__dirname, 'localkit'));

  module.exports = {
    Monaca: Monaca,
    Localkit: Localkit
  };
})();
