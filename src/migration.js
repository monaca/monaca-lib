const path = require('path');
const fs = require('fs');
const utils = require(path.join(__dirname, 'utils'));

/**
 * 
 * Function to generate the new scripts commands list overwriting the package.json.
 * 
 * @param {String} projectDir Project directory
 * @param {Boolean} isTranspile
 * @param {String} packageJsonFile Project's packake.json file
 * @param {Boolean} overwrite Overwrite scripts commands defined by user
 * @return {Promise}
 */
let injectScriptsCommand = (projectDir, isTranspile, packageJsonFile, overwrite) => {

  const monacaPreview = isTranspile ? 'npm run dev & npm run watch' : 'npm run dev';
  const monacaTranspile = 'npm run build';
  const monacaDebug = 'npm run watch';
  const devCommand = isTranspile ? 'node ./monaca_preview.js' : 'browser-sync start -s www/ --watch --port 8080';
  const watchCommand = 'webpack --watch --config ./webpack.prod.new.config.js';
  const buildCommand = 'webpack --config ./webpack.prod.new.config.js';

  let packageJsonContent = require(packageJsonFile);

  return new Promise((resolve, reject) => {
    // Check scripts tag
    if (packageJsonContent.scripts) {
      packageJsonContent.scripts['monaca:preview'] = monacaPreview;
      if (isTranspile) {
        packageJsonContent.scripts['monaca:transpile'] = monacaTranspile;
        packageJsonContent.scripts['monaca:debug'] = monacaDebug;
      }
      console.log('\n');
      if (overwrite) {
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
      return resolve(packageJsonContent);
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
      return resolve(packageJsonContent);
    }
  });

}

/**
 *
 * Local function to write the new commands into package.json, install build dependencies
 *  and create monaca_preview.json script in case of transpile project.
 *
 * @param {Object} packageJsonFile package.json's name
 * @param {Object} packageJsonContent package.json's content
 * @param {Object} projectDir Project directory
 * @param {Boolean} isTranspile
 * @param {Object} monaca Monaca instance
 * @return {Promise}
 */
let executeUpgradeProcess = (packageJsonFile, packageJsonContent, projectDir, isTranspile, monaca) => {
  const previewScriptName = 'monaca_preview.js';

  return new Promise((resolve, reject) => {
    process.on('SIGINT', () => {
      // throw new  Error(`Failed to upgrade ${projectDir}. Process cancelled.`);
      reject(new Error(`Failed to upgrade ${projectDir}. Process cancelled.`));
    });

    // Adding scripts commands
    utils.info('\nAdding script commands into package.json...');
    fs.writeFile(packageJsonFile, JSON.stringify(packageJsonContent, null, 2), 'utf8', (err) => {
      if (err) reject.bind(err, new Error('Failed to update package.json.'));

      // Installing building dependencies
      monaca.installBuildDependencies(projectDir, isTranspile)
        .then(
          (data) => {
            if (isTranspile) {

              // Creating preview script
              const previewScript = path.join(projectDir, previewScriptName);
              const asset = path.resolve(path.join(__dirname, utils.MIGRATION_FOLDER, previewScriptName));

              fs.writeFileSync(previewScript, fs.readFileSync(asset, 'utf8'), 'utf8');
              utils.info('\nPreview script created.');

              // Creating new webpack config files
              return monaca.generateTemplateWebpackConfigs(projectDir)
                .then(data => resolve(data))
                .catch(err => reject(err));
            }
            resolve(data);
          }
        )
        .catch(err => reject(err));
    });
  });
};

module.exports = {
  /**
   * @method
   * @memberof Monaca
   * @description
   *   Upgrade old projects to Monaca CLI 3.0.0 structure:
   *      - Dependencies
   *      - package.json script commands
   * @param {String} projectDir Project directory
   * @param {Boolean} overwrite Overwrite scripts commands defined by user
   * @param {Object} monaca Monaca instance
   * @return {Promise}
   */
  upgrade: function (projectDir, overwrite, monaca) {
    const failedCb = (error) => {
      throw (error);
    };

    if (!monaca.isOldProject(projectDir)) return Promise.reject(new Error('Project created using Monaca CLI 3.x'));

    const packageJsonFile = path.join(projectDir, 'package.json');

    if (!fs.existsSync(packageJsonFile)) return Promise.reject(new Error('Failed to update package.json. File missing, please restore it.'));

    const isTranspile = monaca.isTranspilable(projectDir);

    return injectScriptsCommand(projectDir, isTranspile, packageJsonFile, overwrite)
      .then(
        packageJsonContent => executeUpgradeProcess(packageJsonFile, packageJsonContent, projectDir, isTranspile, monaca),
        failedCb
      );

  }
}