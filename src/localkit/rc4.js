(function() {
  const CryptoJS = require('crypto-js');

  const encrypt = function(msg, pairingKey) {
    if (!pairingKey) {
      throw new Error('Pairing key required to encrypt.');
    }
    return CryptoJS.RC4.encrypt(msg, 
      CryptoJS.enc.Utf8.parse(pairingKey)).toString();  
  }

  const decrypt = function(msg, pairingKey) {
    if (!pairingKey) {
      throw new Error('Pairing key required to decrypt data.');
    }
    const encryptedHex = CryptoJS.enc.Base64.parse(msg);
    return CryptoJS.RC4.decrypt({ ciphertext: encryptedHex }, 
      CryptoJS.enc.Utf8.parse(pairingKey)).toString(CryptoJS.enc.Utf8);  
  };

  module.exports = {
    encrypt: encrypt,
    decrypt: decrypt
  };
})();

