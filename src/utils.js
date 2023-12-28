
const path = require('path');
const fs = require('fs-extra');
const ignore = require('ignore');
const MIGRATION_FOLDER = 'migration';
const MIGRATION_TEMPLATES_FOLDER = MIGRATION_FOLDER + '/template';
const PROJECT_INFO_FOLDER = MIGRATION_FOLDER + '/project_info';
const CORDOVA_VERSION = '11.0.0';


let filterIgnoreFiles = function(files, ignoreList, removeBasePath = false) {
  let keys = Object.keys(files);
  let ignoreListInstance = ignore().add(ignoreList);
  if (removeBasePath === true) keys = keys.map(file => file.substr(1)); //remove '/'
  let allowedKeys = ignoreListInstance.filter(keys);
  let basePath = '';
  if (removeBasePath) basePath = '/'; //note: we don't use path.sep here, because we already changed the path in getLocalProjectFiles function
  let allowedFiles = allowedKeys
    .filter(key => allowedKeys.includes(key))
    .reduce((obj, key) => {
      obj[basePath + key] = files[basePath + key];
      return obj;
    }, {});
  return allowedFiles;
}

let filter = function(array, ignoreList) {
  if (!ignoreList) return array;
  if (!array || !array.length) return array;
  let ignoreListInstance = ignore().add(ignoreList);
  return ignoreListInstance.filter(array) || [];
}

let isDirectory = (path) => {
  if(fs.lstatSync(path).isDirectory()) return true;
  return false;
};

/**
 * @todo
 * @deprecated in the next major release
 */
let includeInExplicitFilterList = function(f) {
  if ( f.indexOf('/.monaca') >= 0 || f.indexOf('/node_modules') >= 0 || f.indexOf('/.git') >= 0 ) {
    return true;
  }
  return false;
};

let info = function(msg, deferred, spinner) {
  if (deferred) deferred.notify(msg);
  if (spinner) {
    spinner.text = msg;
  } else {
    console.log(msg);
  }
}

let spinnerSuccess = function(spinner, msg) {
  if (spinner) spinner.succeed(msg);
}

let spinnerFail = function(spinner, msg) {
  if (spinner) spinner.fail(msg);
}

let spinnerLoading = function(spinner, msg) {
  if (spinner && spinner.isSpinning) spinner.text = msg;
}

let startSpinner = function(spinner, msg) {
  if (spinner) spinner.start(msg);
}

let filterObjectByKeys = function(files, selectedKeys) {
  if (!files || !Object.keys(files)) return {};
  if (!selectedKeys || !selectedKeys.length) return {};

  let keys = Object.keys(files);
  let filtered = keys
  .filter(key => selectedKeys.includes(key))
  .reduce((obj, key) => {
   obj[key] = files[key];
   return obj;
  }, {});
  
  return filtered;
};

/**
 * 
 * Checking if Cordova is already installed in the project and we need to install it
 * 
 * @param {String} Project's Directory
 * @return {Boolean}
 */
let needToInstallCordova = (projectDir) => {
  let dep;
  try { dep = require(path.resolve(projectDir, 'node_modules', 'cordova', 'package.json')); }
  catch (e) { return true }
  finally { if (!dep) return true; return false; }
};

/**
 * Read file and parse to JSON
 * @param {String} file path
 * @return {Object}
 */
let readJSONFile = (file, encoding = 'UTF8') => {
  let content = null;
  try {
    content = JSON.parse(fs.readFileSync(file, encoding));
  } catch(e) {
    content = null;
  };
  return content;
};

let isEmptyObject = (obj) => {
  if (!obj) return true;
  for (let key in obj) {
    if (obj.hasOwnProperty(key)) return false;
  }
  return true;
};

/**
 * @method
 * @description
 *  isCapacitorProject
 *
 * @param {String} projectDir Project directory
 * @return {String}
 */
const isCapacitorProject = (projectDir) => {
  try {
    const projectConfig = require(path.join(projectDir, 'package.json'));
    if (projectConfig && projectConfig.dependencies && projectConfig.dependencies['@capacitor/core']) {
      return true;
    }
  } catch (err) {}
  return false;
};

/**
 * Checks if a project is using Yarn as its package manager.
 *
 * @param {string} projectDir - The directory path of the project.
 * @returns {boolean} - Returns true if the project uses Yarn, false otherwise.
 */
const isUsingYarn = (projectDir) => {
  try {
    const projectConfig = require(path.join(projectDir, 'package.json'));
    const monacaPreviewScript = projectConfig.scripts && projectConfig.scripts['monaca:preview'];
    if (monacaPreviewScript && monacaPreviewScript.indexOf('yarn') >= 0) {
      return true;
    }
  } catch (err) {
    console.log(err);
  }
  return false;
};

/**
 * @method
 * @description
 *   return an executable global npm path.
 * @return {String}
 */
const getPackageManager = function (projectDir) {
  let command = 'npm';
  if (isUsingYarn(projectDir)) {
    command = 'yarn';
  }
  if (process.platform !== 'win32') return command;
  return command + '.cmd';
}

const checkIfPackageManagerExists = function (npm, packageManager, emitter, exitCb) {
  if (!npm || !npm.pid) {
    info(`>>> Could not spawn ${packageManager}. Please install/configure ${packageManager}.\n\r`);
    if (packageManager.indexOf('yarn') >= 0) {
      emitter.emit('output', { type: 'error', message: 'YARN_NOT_FOUND' });
    }
    exitCb(1);
  }
};

module.exports = {
  isCapacitorProject: isCapacitorProject,
  filterIgnoreFiles: filterIgnoreFiles,
  isDirectory: isDirectory,
  includeInExplicitFilterList: includeInExplicitFilterList,
  info: info,
  filterObjectByKeys: filterObjectByKeys,
  filter: filter,
  needToInstallCordova: needToInstallCordova,
  MIGRATION_FOLDER,
  MIGRATION_TEMPLATES_FOLDER,
  PROJECT_INFO_FOLDER,
  CORDOVA_VERSION,
  readJSONFile: readJSONFile,
  isEmptyObject: isEmptyObject,
  spinnerFail,
  spinnerLoading,
  spinnerSuccess,
  isUsingYarn,
  getPackageManager,
  checkIfPackageManagerExists,
  startSpinner
};
