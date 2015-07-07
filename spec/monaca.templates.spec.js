(function() {
  'use strict';

  // imports
  var path = require('path');

  var common = require(path.join(__dirname, 'common')),
    monaca = common.monaca;

  describe('Templates Test', function() {
    it('should return a list of templates', function(done) {
      monaca.getTemplates().then(
        function(templates) {
          expect(templates.length > 5).toBeTruthy();  
          done();
        }
      );
    }, 2000);
  });

})();
