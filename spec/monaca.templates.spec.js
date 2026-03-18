(function() {
  'use strict';

  // imports
  var path = require('path');

  var common = require(path.join(__dirname, 'common')),
    monaca = common.monaca;

  describe('Templates Test', function() {
    it('should return a list of templates', function(done) {
      monaca.getTemplates().then(
        function(results) {
          const templates = results.template;
          const samples = results.sample;
          const tags = results.tags;
          expect(templates.length > 5).toBeTruthy();  
          expect(samples.length > 5).toBeTruthy();  
          expect(tags.length > 5).toBeTruthy();  
          done();
        }
      );
    }, 2000);
  });

})();
