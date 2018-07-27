
const path = require('path');
const fs = require('fs-extra');
const crc32 = require('buffer-crc32');
const ignore = require('ignore');
const MIGRATION_FOLDER = 'migration';
const MIGRATION_TEMPLATES_FOLDER = MIGRATION_FOLDER + '/template';
const PROJECT_INFO_FOLDER = MIGRATION_FOLDER + '/project_info';
const CORDOVA_VERSION = '7.1.0';


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

let info = function(msg, deferred) {
  if (deferred) deferred.notify(msg);
  console.log(msg);
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

module.exports = {
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
  CORDOVA_VERSION
};
