(function() {
  var crypto = require('crypto');

  var encrypt = function(msg, pairingKey) {
    if (!pairingKey) {
      throw new Error('Pairing key required to encrypt.');
    }

    var buf = crypto.createCipheriv('rc4', pairingKey, '').update(new Buffer(msg));

    return buf.toString('base64');
  };

  var decrypt = function(msg, pairingKey) {
    if (!pairingKey) {
      throw new Error('Pairing key required to decrypt data.');
    }
 
    var buf = new Buffer(msg, 'base64'),
      decrypted = crypto.createDecipheriv('rc4', pairingKey, '').update(buf);

    return decrypted.toString();
  };

  module.exports = {
    encrypt: encrypt,
    decrypt: decrypt
  };
})();
