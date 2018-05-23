(function() {
  'use strict';

  var watch = require('watch'),
    fs = require('fs');

  var FileWatcher = function() {
    this.callbacks = [];
    this._isRunning = false;
  };

  FileWatcher.prototype.run = function(filePath) {

    this.stop();

    this.filePath = filePath;

    if (!fs.existsSync(filePath)) {
      throw new Error(filePath + ' does not exist.');
    }

    watch.watchTree(filePath, { ignoreDotFiles: true, ignoreUnreadableDir: true, interval: 500 }, function(f, curr, prev) {
      var changeType;

      if (typeof f === 'object' && prev === null && curr === null) {
        return; // Do nothing.
      } else if (prev === null) {
        changeType = 'create';
      } else if (curr.nlink === 0) {
        changeType = 'delete';
      } else {
        changeType = 'update';
      }

      this.doCallbacks(changeType,f);

      // for (var i = 0; i < this.callbacks.length; i++) {
      //   var cb = this.callbacks[i];
      //   cb(changeType, f);
      // }

    }.bind(this));

    this._isRunning = true;
  };

  FileWatcher.prototype.doCallbacks = function(changeType,f) {
    for (var i = 0; i < this.callbacks.length; i++) {
      var cb = this.callbacks[i];
      cb(changeType, f);
    }
  }

  FileWatcher.prototype.stop = function() {
    if (this.filePath) {
      watch.unwatchTree(this.filePath);
      this.filePath = null;
      this._isRunning = false;
    }
  };

  FileWatcher.prototype.isRunning = function() {
    return this._isRunning;
  };

  FileWatcher.prototype.onchange = function(callback) {
    this.callbacks.push(callback);
  };

  module.exports = FileWatcher;
})();
