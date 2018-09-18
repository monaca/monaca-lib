(function() {
  'use strict';

  var path = require('path');

  let Monaca = require(path.join(__dirname, 'monaca'));
  let Localkit = require(path.join(__dirname, 'localkit'));
  let common = require(path.join(__dirname, 'common'));

  module.exports = {
    Monaca: Monaca,
    Localkit: Localkit,
    common: common
  };
})();
