(function() {
  'use strict';
  
  var os = require('os');

  var getBroadcastAddress = function(iface) {
    var netmask = new Uint8Array((iface.netmask || '255.255.255.0').split('.')),
        address = new Uint8Array(iface.address.split('.')),
        broadcast = new Uint8Array(4),
        ret = [];

    for (var i = 0; i < 4; i++) {
      broadcast[i] = (netmask[i] & address[i]) | ~netmask[i];
      ret.push(broadcast[i]);
    }

    return ret.join('.'); 
  };

  module.exports = function() {
    var interfaces = os.networkInterfaces(),
      ret = ['255.255.255.255'];

    for (var key in interfaces) {
      if (interfaces.hasOwnProperty(key)) {
      	for (var index in interfaces[key]) {
          if (interfaces[key].hasOwnProperty(index)) {
            var iface = interfaces[key][index];
	    if (!iface.internal && iface.family === 'IPv4') {
              ret.push(getBroadcastAddress(iface));
	    }
          }
	}
      }
    }
    return ret;
  };
})();
