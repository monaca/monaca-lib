const path = require('path');
const fs = require('fs-extra');
const utils = require(path.join(__dirname, 'utils'));

const packageBackupJsonFile = 'package.backup.json';

/**
 *
 * Function to generate the new scripts commands list overwriting the package.json.
 *
 * @param {Boolean} isTranspile
 * @param {String} packageJsonFile Project's packake.json file
 * @param {Boolean} overwrite Overwrite scripts commands defined by user
 * @return {Promise}
 */
const injectScriptsCommand = (isTranspile, packageJsonFile, overwrite = false) => {

  const monacaPreview = isTranspile ? 'npm run dev & npm run watch' : 'npm run dev';
  const monacaTranspile = 'npm run build';
  const monacaDebug = 'npm run watch';
  const devCommand = isTranspile ? 'node ./monaca_preview.js' : 'browser-sync start -s www/ --watch --port 8080';
  const watchCommand = 'webpack --watch --config ./webpack.prod.new.config.js';
  const buildCommand = 'webpack --config ./webpack.prod.new.config.js';
  let packageJsonContent;

  try {
    packageJsonContent = require(packageJsonFile);
  } catch (ex) { Promise.reject.bind(null, new Error(`Failed getting ${packageJsonFile}`)); }

  // Backup package.json
  try {
    utils.info('\n[package.json] Creating backup...');
    fs.writeFileSync(packageBackupJsonFile, JSON.stringify(packageJsonContent, null, 2), 'utf8');
  } catch (ex) { Promise.reject.bind(null, new Error('Failed backuping up package.json.')); }

  return new Promise((resolve, reject) => {
    // Check scripts tag
    if (packageJsonContent.scripts) {
      packageJsonContent.scripts['monaca:preview'] = monacaPreview;
      if (isTranspile) {
        packageJsonContent.scripts['monaca:transpile'] = monacaTranspile;
        packageJsonContent.scripts['monaca:debug'] = monacaDebug;
      }
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
 * Function to generate the new scripts commands list overwriting the package.json.
 *
 * @param {String} packageJsonFile Project's packake.json file
 * @param {Object} commands Object with the commands
 * @return {Object | Exception}
 */
const prepareScriptsCommandInit = (packageJsonFile, commands) => {
  let packageJsonContent;

  try { packageJsonContent = require(packageJsonFile); } catch (ex) { throw new Error(`Failed getting ${packageJsonFile}`); }

  if (!packageJsonContent.scripts) packageJsonContent.scripts = {};
  packageJsonContent.scripts['monaca:preview'] = commands.serve;
  packageJsonContent.scripts['monaca:transpile'] = commands.build;
  packageJsonContent.scripts['monaca:debug'] = commands.watch;

  return packageJsonContent;
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
const executeUpgradeProcess = (packageJsonFile, packageJsonContent, projectDir, isTranspile, monaca) => {
  const previewScriptName = 'monaca_preview.js';

  return new Promise((resolve, reject) => {
    process.on('SIGINT', () => {
      reject(new Error(`Failed to upgrade ${projectDir}. Process cancelled.`));
    });

    // Adding scripts commands
    utils.info('\n[package.json] Adding script commands...');
    fs.writeFile(packageJsonFile, JSON.stringify(packageJsonContent, null, 2), 'utf8', (err) => {
      if (err) reject.bind(err, new Error('Failed to update package.json.'));

      // Installing building dependencies
      monaca.installDevDependencies(projectDir, isTranspile)
        .then(
          (data) => {
            if (isTranspile) {
              // Creating preview script
              const previewScript = path.join(projectDir, previewScriptName);
              const asset = path.resolve(path.join(__dirname, utils.MIGRATION_FOLDER, previewScriptName));

              utils.info('\n[monaca_preview.js] Creating...');
              fs.writeFileSync(previewScript, fs.readFileSync(asset, 'utf8'), 'utf8');

              // Creating new webpack config files
              utils.info('\n[Webpack Config] Creating templates...');
              return monaca.generateTemplateWebpackConfigs(projectDir)
                .then(data => resolve(data) )
                .catch(err => reject(err));
            }
            resolve(data);
          }
        )
        .catch(err => reject(err));
    });
  });
};

/**
 *
 * Install Cordova as a Dev Dependency
 *
 * @param {Object} projectDir Project directory
 * @param {Object} monaca Monaca instance
 * @return {Promise}
 */
const installLatestCordova = (projectDir, monaca) => {
  utils.info(`[Cordova] Installing Cordova ${utils.CORDOVA_VERSION}...`);
  return new Promise((resolve, reject) => {
    let installDependencies = [];

    if (utils.needToInstallCordova(projectDir)) installDependencies.push('cordova@' + utils.CORDOVA_VERSION);
    if (installDependencies.length > 0) {
      monaca._npmInstall(projectDir, installDependencies, true).then(
        resolve.bind(null, projectDir),
        reject.bind(null, new Error('[Cordova] Failed to install latest cordova version.'))
      );
    } else resolve(projectDir);
  });
};

/**
 *
 * Inject scripts commands into package.json
 *
 * @param {Object} packageJsonFile package.json's path
 * @param {Object} packageJsonContent package.json's content
 * @return {Promise}
 */
const injectCommandsIntoPackageJson = (packageJsonFile, packageJsonContent) => {
  return new Promise((resolve, reject) => {
    utils.info('[package.json] Adding script commands...');
    fs.writeFile(packageJsonFile, JSON.stringify(packageJsonContent, null, 2), 'utf8', (err) => {
      if (err) return reject(new Error('Failed to update package.json.'));
      return resolve(true);
    });
  })
};

/**
 *
 * Function to handle errors
 *
 * @param {Object} error
 * @return {Exception}
 */
const failedCb = (error) => {
  // Restore previous package.json file
  try { fs.writeFileSync('package.json', fs.readFileSync(packageBackupJsonFile), 'utf8'); } catch(ex){}
  throw (error);
};

module.exports = {
  /**
   * @method
   * @memberof Monaca
   * @description
   *   Function to create .monaca/project_info.json file
   *
   * @param {String} projectDir Project directory
   * @param {Boolean} isTranspile
   * @return {Promise}
   */
  createProjectInfoFile: function (projectDir, isTranspile) {
    utils.info('[.monaca] Creating project_info.json...');
    return new Promise((resolve, reject) => {

      const projectInfo = path.resolve(projectDir, '.monaca', 'project_info.json');
      const projectInfoTemplate = path.resolve(__dirname, 'template', 'blank', '.monaca', 'project_info.json');

      fs.copy(projectInfoTemplate, projectInfo, (err) => {
        if (err) return reject(err);

        //if (!isTranspile) return resolve(projectDir);
        try {
          if (!fs.existsSync('.monaca')) fs.mkdirSync('.monaca');

          let projectInfoContent = require(projectInfo);
          projectInfoContent['build'] = {
            "transpile": {
              "enabled": isTranspile ? true: false
            }
          };

          fs.writeFileSync(projectInfo, JSON.stringify(projectInfoContent, null, 2), 'utf8'); return resolve(projectDir);
        } catch (err) { reject(err); }

      });

    });
  },

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Function to create res folder with icons and splashes
   *
   * @param {String} projectDir Project directory
   * @return {Promise}
   */
  initIconsSplashes: function (projectDir) {
    utils.info('[res] Inserting icons and splashes...');
    return new Promise((resolve, reject) => {
      const resFolder = path.join(projectDir, 'res');
      const resTemplateFolder = path.resolve(__dirname, 'template', 'blank', 'res');

      fs.exists(resFolder, (exists) => {
        fs.copy(resTemplateFolder, resFolder, {clobber: false}, (err) => {
          if (err) return reject(err);
          return resolve(projectDir);
        });
      });
    });
  },

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Copies Monaca components folder to www.
   *
   * @param {String} projectDir Project directory
   * @return {Promise}
   */
  initComponents: function (projectDir) {
    utils.info('[www] Inserting components...');
    return new Promise((resolve, reject) => {
      const componentsFolder = path.join(projectDir, 'www', 'components');
      const componentsTemplateFolder = path.resolve(__dirname, 'template', 'blank', 'www', 'components');

      fs.exists(componentsFolder, (exists) => {
        fs.copy(componentsTemplateFolder, componentsFolder, {clobber: false}, (err) => {
          if (err) return reject(err);
          return resolve(projectDir);
        });
      });
    });
  },

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Create default config.xml file.
   *
   * @param {String} projectDir Project directory
   * @return {Promise}
   */
  createConfigFile: function (projectDir) {
    utils.info('[config.xml] Creating file...');
    return new Promise((resolve, reject) => {
      const configFolder = path.resolve(projectDir, 'config.xml');
      const configTemplateFolder = path.resolve(__dirname, 'template', 'blank', 'config.xml');

      fs.exists(configFolder, (exists) => {
        if(exists) { process.stdout.write('\tconfig.xml already exists. Skipping.\n'); return resolve(projectDir)}
        fs.copy(configTemplateFolder, configFolder, (err) => {
          if (err) return reject(err);
          return resolve(projectDir);
        });
      });
    });
  },

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Create default package.jsonfile.
   *
   * @param {String} projectDir Project directory
   * @return {Promise}
   */
  createPackageJsonFile: function (projectDir) {
    utils.info('[package.json] Creating file...');
    return new Promise((resolve, reject) => {
      const packageFolder = path.resolve(projectDir, 'package.json');
      const packageTemplateFolder = path.resolve(__dirname, 'template', 'blank', 'package.json');

      fs.exists(packageFolder, (exists) => {
        if(exists) { process.stdout.write('\tpackage.json already exists. Skipping.\n'); return resolve(projectDir)}
        fs.copy(packageTemplateFolder, packageFolder, (err) => {
          if (err) return reject(err);
          return resolve(projectDir);
        });
      });
    });
  },

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
    if (!monaca.isOldProject(projectDir)) return Promise.reject(new Error('Project created using Monaca CLI 3.x'));

    const packageJsonFile = path.join(projectDir, 'package.json');

    if (!fs.existsSync(packageJsonFile)) return Promise.reject(new Error('Failed to update package.json. File missing, please restore it.'));

    const isTranspile = monaca.isTranspilable(projectDir);

    return injectScriptsCommand(isTranspile, packageJsonFile, overwrite)
      .then(
        packageJsonContent => executeUpgradeProcess(packageJsonFile, packageJsonContent, projectDir, isTranspile, monaca)
      )
      .catch(failedCb);
  },

  /**
   * @method
   * @memberof Monaca
   * @description
   *   Allows projects created using other cli tools to use Monaca
   * @param {String} projectDir Project directory
   * @param {Boolean} isTranspile
   * @param {Object} commands commands to inject into package.json
   * @param {Object} monaca Monaca instance
   * @return {Promise}
   */
  init: function (projectDir, isTranspile, commands, monaca) {
    const packageJsonFile = path.join(projectDir, 'package.json');

    return this.createPackageJsonFile(projectDir)
      .then(() => {
        let packageJsonContent;
        try { packageJsonContent = prepareScriptsCommandInit(packageJsonFile, commands); }
        catch (err) { return Promise.reject(err) }
        injectCommandsIntoPackageJson(packageJsonFile, packageJsonContent)
      })
      .then(() => this.initComponents(projectDir))
      .then(() => this.createConfigFile(projectDir))
      .then(() => this.initIconsSplashes(projectDir))
      .then(() => installLatestCordova(projectDir, monaca))
      .then(() => this.createProjectInfoFile(projectDir, isTranspile))
      .catch(failedCb);
    }
}