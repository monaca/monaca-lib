const path = require('path');
const fs = require('fs');
const utils = require(path.join(__dirname, 'utils'));

module.exports = {
  /**
   * @method
   * @memberof Monaca
   * @description
   *   Upgrade old projects to Monaca CLI 3.0.0 structure:
   *      - Dependencies
   *      - package.json script commands
   * @param {String} projectDir Project directory
   * @param {Object} monaca Monaca instance
   * @return {Promise}
   */
  upgrade: function (projectDir, monaca) {
    const isTranspile = monaca.isTranspilable(projectDir);

    const monacaPreview = isTranspile ? 'npm run dev & npm run watch' : 'npm run dev';
    const monacaTranspile = 'npm run build';
    const monacaDebug = 'npm run watch';
    const devCommand = isTranspile ? 'node ./monaca_preview.js' : 'browser-sync start -s www/ --watch --port 8080';
    const watchCommand = 'webpack --watch --config ./webpack.prod.new.config.js';
    const buildCommand = 'webpack --config ./webpack.prod.new.config.js';

    const confirmMessage = isTranspile ? `We are going to inject some new commands under script: 'watch', 'dev' or 'build'.\n` +
      `\t'dev': ${devCommand}\n\t'build': ${buildCommand}\n\t'watch': ${watchCommand}\n` +
      `Do you want to overwrite them?` : `Do you want to overwrite 'dev'?`;

    const packageJsonFile = path.join(projectDir, 'package.json');
    let packageJsonContent = require(packageJsonFile);

    return new Promise((resolve, reject) => {
      // Ctrl + C
      process.on('SIGINT', () => {
        reject(new Error(`Failed to upgrade ${projectDir}. Process cancelled.`));
      });

      // Check if it is a old project
      if (monaca.isOldProject(projectDir)) {
        if (!fs.existsSync(packageJsonFile)) {
          reject.bind(null, new Error('Failed to update package.json. File missing, please restore it.'));
        }

        // Check scripts tag
        if (packageJsonContent.scripts) {
          packageJsonContent.scripts['monaca:preview'] = monacaPreview;
          if (isTranspile) {
            packageJsonContent.scripts['monaca:transpile'] = monacaTranspile;
            packageJsonContent.scripts['monaca:debug'] = monacaDebug;
          }
          console.log('\n');
          utils.confirmationMessage(confirmMessage).then(
            (answer) => {
              if (answer.value) {
                packageJsonContent.scripts['dev'] = devCommand;
                if (isTranspile) {
                  packageJsonContent.scripts['build'] = buildCommand;
                  packageJsonContent.scripts['watch'] = watchCommand;
                }
              } else {
                packageJsonContent.scripts['dev'] = packageJsonContent.scripts.dev ? packageJsonContent.scripts.dev : devCommand;
                if (isTranspile) {
                  packageJsonContent.scripts['build'] = packageJsonContent.scripts.build ? packageJsonContent.scripts.build : buildCommand;
                  packageJsonContent.scripts['watch'] = packageJsonContent.scripts.watch ? packageJsonContent.scripts.watch : watchCommand;
                }
              }
              monaca._executeUpgradeProcess(packageJsonFile, packageJsonContent, projectDir, isTranspile);
            }
          )
        } else {
          packageJsonContent.scripts = {};
          packageJsonContent.scripts['monaca:preview'] = monacaPreview;
          packageJsonContent.scripts['dev'] = devCommand;
          if (isTranspile) {
            packageJsonContent.scripts['monaca:transpile'] = monacaTranspile;
            packageJsonContent.scripts['build'] = buildCommand;
            packageJsonContent.scripts['monaca:debug'] = monacaDebug;
            packageJsonContent.scripts['watch'] = watchCommand;
          }
          monaca._executeUpgradeProcess(packageJsonFile, packageJsonContent, projectDir, isTranspile);
        }
      } else {
        reject.bind(null, new Error('It is not an old project.'));
      }
    });
  }
}