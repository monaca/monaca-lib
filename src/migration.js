const path = require('path');
const fs = require('fs-extra');
const utils = require(path.join(__dirname, 'utils'));

const packageBackupJsonFile = 'package.backup.json';

/**
 *
 * Function to generate the new scripts commands list into package.json.
 *
 * @param {String} projectDir
 * @param {Boolean} isTranspile
 * @param {String} packageJsonFile Project's packake.json file
 * @param {Boolean} overwrite Overwrite scripts commands defined by user
 * @return {Object | Exception}
 */
const prepareScriptsCommand = (projectDir, isTranspile, packageJsonFile, overwrite = false) => {

  const monacaPreview = isTranspile ? 'npm run dev & npm run watch' : 'npm run dev';
  const monacaTranspile = 'npm run build';
  const monacaDebug = 'npm run watch';
  const devCommand = isTranspile ? 'node ./monaca_preview.js' : 'browser-sync start -s www/ --watch --port 8080';
  const watchCommand = 'webpack --watch --config ./webpack.prod.new.config.js';
  const buildCommand = 'webpack --config ./webpack.prod.new.config.js';
  let packageJsonContent;

  try { packageJsonContent = require(packageJsonFile); } catch (ex) { throw `Failed getting ${packageJsonFile}`; }

  createPackageJsonBackup(projectDir, packageJsonContent);

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
  }

  return packageJsonContent;

}

/**
 *
 * Function to create a backup from package.json
 *
 * @param {String} projectDir
 * @param {String} packageJsonContent Project's packake.json content
 * @return {null | Exception}
 */
const createPackageJsonBackup = (projectDir, packageJsonContent) => {
  // Backup package.json
  try {
    utils.info('\n[package.json] Creating backup...');
    fs.writeFileSync(path.resolve(projectDir, packageBackupJsonFile), JSON.stringify(packageJsonContent, null, 4), 'utf8');
  } catch (ex) { throw 'Failed backuping up package.json.'; }
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
 * Create Webpack config files and preview script
 *
 * @param {String} projectDir Project directory
 * @param {Object} monaca Monaca instance
 * @return {Promise}
 */
const createWebpackFiles = (projectDir, monaca) => {
  const previewScriptName = 'monaca_preview.js';

  // Creating preview script
  const previewScript = path.join(projectDir, previewScriptName);
  const asset = path.resolve(path.join(__dirname, utils.MIGRATION_FOLDER, previewScriptName));

  utils.info('\n[monaca_preview.js] Creating...');
  fs.writeFileSync(previewScript, fs.readFileSync(asset, 'utf8'), 'utf8');

  // Creating new webpack config files
  utils.info('\n[Webpack Config] Creating templates...');
  return monaca.generateTemplateWebpackConfigs(projectDir);
}

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
    fs.writeFile(packageJsonFile, JSON.stringify(packageJsonContent, null, 4), 'utf8', (err) => {
      if (err) return reject(new Error('Failed to update package.json.'));
      return resolve(true);
    });
  })
};

/**
 *
 * Function to create a minimum package.json file
 *
 * @param {String} projectDir Project directory
 * @return {Promise}
 */
const createMinimumPackageJsonFile = (projectDir) => {
  utils.info('[package.json] Creating minimum file...');
  try {
    const packageFolder = path.resolve(projectDir, 'package.json');
    const packageContent = {
      "name": projectDir.substring(projectDir.lastIndexOf('/') + 1),
      "description": "Upgraded project",
    };
    fs.writeFileSync(packageFolder, JSON.stringify(packageContent, null, 4));
  } catch(ex) { throw 'Failed to create package.json'; }
};

/**
 *
 * Inject necessary commands for Cloud into JSON file
 *
 * @param {String} jsonFile Json file
 * @return {Promise}
 */
const injectCloudIDECommands = (jsonFile) => {
  utils.info(`[${jsonFile}] Adding Cloud commands...`);
  return new Promise((resolve, reject) => {
    let jsonFileContent;
    try { jsonFileContent = require(jsonFile); } catch (ex) { throw new Error(`Failed getting ${jsonFileContent}`); }
    jsonFileContent['cloud_ide'] = {
        "preview_command": "monaca preview",
        "preview_port": "8080"
    };
    fs.writeFile(jsonFile, JSON.stringify(jsonFileContent, null, 4), 'utf8', (err) => {
      if (err) return reject(new Error(`Failed to update ${jsonFile}`));
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
const failedCb = (error) => { throw (error); };

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
    const projectInfo = path.resolve(projectDir, '.monaca', 'project_info.json');
    const projectInfoTemplate = path.resolve(__dirname, 'template', 'blank', '.monaca', 'project_info.json');
    utils.info('[.monaca] Creating project_info.json...');
    return new Promise((resolve, reject) => {
      fs.copy(projectInfoTemplate, projectInfo, (err) => {
        if (err) return reject(err);
        try {
          if (!fs.existsSync('.monaca')) fs.mkdirSync('.monaca');

          let projectInfoContent = require(projectInfo);
          projectInfoContent['build'] = {
            "transpile": {
              "enabled": isTranspile ? true: false
            }
          };
          fs.writeFileSync(projectInfo, JSON.stringify(projectInfoContent, null, 4), 'utf8'); return resolve(projectDir);
        } catch (err) { reject(err); }
      });
    })
    .then(() => injectCloudIDECommands(projectInfo));
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
   * @param {Object} options Options
   * @param {Object} monaca Monaca instance
   * @return {Promise}
   */
  upgrade: function (projectDir, options, monaca) {
    if (!monaca.isOldProject(projectDir)) return Promise.reject(new Error('Project created using Monaca CLI 3.x'));

    const packageJsonFile = path.join(projectDir, 'package.json');

    if (options.createPackageJson && !fs.existsSync(packageJsonFile)) createMinimumPackageJsonFile(projectDir);
    if (!fs.existsSync(packageJsonFile)) return Promise.reject(new Error('Failed to update package.json. File missing, please restore it.'));

    const isTranspile = monaca.isTranspilable(projectDir);
    const projectInfo = path.resolve(projectDir, '.monaca', 'project_info.json');
    let packageJsonContent = prepareScriptsCommand(projectDir, isTranspile, packageJsonFile, options.overwrite)

    return injectCommandsIntoPackageJson(packageJsonFile, packageJsonContent)
      .then( () => monaca.installDevDependencies(projectDir, isTranspile))
      .then( (data) => {
        if (isTranspile) return createWebpackFiles(projectDir, monaca);
        else return Promise.resolve(data);
      })
      .then( () => injectCloudIDECommands(projectInfo))
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