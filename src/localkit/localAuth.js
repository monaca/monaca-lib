(function() {
  'use strict';

  var crypto = require('crypto'),
    Q = require('q');

  /**
   * @class LocalAuth
   * @description
   *  Handles local pairing.
   */
  var LocalAuth = function() {
    this.passwords = [];
  };

  /**
   * @method
   * @memberof LocalAuth
   * @description
   *   Generate a One-Time Password.
   * @param {number} ttl Number of milliseconds the password should be valid.
   * @return {Promise}
   */
  LocalAuth.prototype.generateOneTimePassword = function(ttl) {
    if (!ttl) {
      throw new Error('Must supply a "ttl" argument.');
    }
    else if (typeof ttl !== 'number') {
      throw new Error('"ttl" argument must be a number.');
    }

    var deferred = Q.defer();

    var key = crypto.randomBytes(20, function(err, data) {
      if (err) {
        deferred.reject(err);
      }

      var now = Date.now();

      var password = {
        data: data,
        created: now,
        expires: now + ttl
      };

      var shasum = crypto.createHash('sha256');
      shasum.update(data);
      var key = shasum.digest('hex');

      this.passwords[key] = password;

      deferred.resolve(password);
    }.bind(this));

    return deferred.promise;
  };

  /**
   * @method
   * @memberof LocalAuth
   * @description
   *   Validate a SHA-1 hash of a One-Time Password.
   * @param {string} passwordHash
   * @return Promise
   */
  LocalAuth.prototype.validateOneTimePassword = function(passwordHash) {
    if (typeof passwordHash === 'undefined') {
      throw new Error('Must supply a "passwordHash" argument.');
    }
    else if(typeof passwordHash !== 'string') {
      throw new Error('"passwordHash" argument must be a string.');
    }

    var password = this.passwords[passwordHash],
      now = Date.now();

    if (typeof password === 'undefined') {
      return Q.reject(new Error('No such password.'));
    }
    else if (now > password.expires) {
      return Q.reject(new Error('Password has expired.'));
    }

    delete this.passwords[passwordHash];
    return Q.resolve(password);
  };

  /**
   * @method
   * @memberof LocalAuth
   * @description
   *   Generate local pairing key
   * @return Promise
   */
  LocalAuth.prototype.generateLocalPairingKey = function() {
    var deferred = Q.defer();
    
    var randomBytes = Q.denodeify(crypto.randomBytes);
    randomBytes(20).then(function(pairingKeyInBytes) {
      deferred.resolve(pairingKeyInBytes.toString('hex'));      
    }, function(error) {
      deferred.reject(error);
    });
    
    return deferred.promise;
  };

  module.exports = LocalAuth;
})()
