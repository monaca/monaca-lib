
CHANGELOG
====

v2.7.8
----
* Modified `webpack` development configuration of `Angular` to fix `live reloading`

v2.7.7
----
* Modified `webpack` development configuration to generate files to `www` directory

v2.7.6
----
* Improved `getLocalProjectFiles` functions by filtering files before further processing
* Generated only one `.monacaignore` file for all project templates
* Fixed Typo

v2.7.5
----
* Added `historyApiFallback` to angular template
* Modified `checkModifiedFiles` functions to return file differences if `options.actionType` is passed as `downloadProject`
* Modified `Upload/Download` functions to include custom files if `options.userDefinedSelectedFiles` and `options.userDefinedSelectFileFlag` is passed as `true`
* Generate `.monacaignore` for both `cordova` and `react-native` templates before `Upload/Download` operation
* Update `.monacaignore` pattern to follow `.gitignore` pattern
* Misc fix

v2.7.4
----
* Added directory path validation check for signing APIs.
* Added fetching signing certificate collection API.

v2.7.0
----
* monaca: Stop live relaod in case of transpile project.

v2.6.3
----
* Reverted changes to the client request creation for CLI.

v2.6.2
----
* Added Android and iOS Signing APIs

v2.6.0
----
* monaca: Added React-Native Project Support
* monaca: Updated iOS Webkit Debug Proxy

v2.5.1
----
* monaca: fixed npm issue for CLI.
* monaca: improved error message when a remote build fails.

v2.5.0
----
* monaca: internal logic fix.
* templates: Fixed default webpack configurations for Angular 2+ in order to support PostCSS correctly.

v2.4.2
----
* monaca: Improved `startRemoteBuild` method logic.

v2.4.1
----
* monaca: Added remote build history API.
* monaca: Improved logout method.

v2.4.0
----
* templates: Added support to Cordova 6.5 templates.
* monaca: Allowed `.bower.json` sync to Cloud.
* monaca: Minor improvement on login method.

v2.3.2
----
* monaca: Updated Webpack resolvers for transpilable templates.

v2.3.1
----
* monaca: Updated `vue-template-compile` to fix issue with Vue templates.

v2.3.0
----
* monaca: Added support to the latest Vue and React templates with Onsen 2.4.0.
* templates: Fixed dependencies and debugging avilability.
* monaca: Improved some error messages with resolution references.

v2.2.12
----
* monaca: Fixed local debugging issue.

v2.2.11
----
* monaca: Fixed critical sync bug when the project path contains special characters.

v2.2.10
----
* monaca: Fixed isTranspileEnabled check.

v2.2.9
----
* templates: fixed Vue Webpack configuration.
* monaca: Added API endpoint management.
* monaca: Fixed requests missing content.
* monaca: Fixed hard-coded API references.

v2.2.8
----
* templates: Added missing additionalDependencies.

v2.2.7
----
* templates: Added Vue.js 2.0 templates for Onsen UI 2.2.0.
* templates: Updated ReactJS and Angular 2+ templates for Onsen UI 2.2.0.

v2.2.6
----
* monaca: Added deleteProjectId functionality.
* monaca: Fixed checkModifiedFiles error handler.

v2.2.5
----
* monaca: Fixed Cordova Project check.
* monaca: Fixed iOS build availability check.
* monaca: Fixed various iOS10 pairing issues on macOS.

v2.2.4
----
* templates: Use autoprefixer for all the CSS.
* templates: Conservative minify for Angular 2.
* monaca: Updated TypeScript dependencies.

v2.2.3
----
* monaca: Improve error message.

v2.2.2
----
* templates: Renamed index.ejs => index.html.ejs
* templates: HTML minifier is case sensitive now. Fixes Angular2 directive naming issues.
* monaca: Fixed logout token minor bug.
* monaca: Fixed cached Cordova version minor bug.

v2.2.1
----
* monaca: Added patched minimatch dependency.

v2.2.0
----
* monaca: Added CI support.

v2.1.4
----
* monaca: Update 'portfinder' dependency.
* monaca: Fixed escape character bug on project path.

v2.1.3
----
* monaca: Reduce package size.
* monaca: Improve Webpack output in development mode.

v2.1.2
----
* monaca: Minor improvement to transpiler configuration.

v2.1.1
----
* monaca: Localkit support when running transpiler.

v2.1.0
----
* monaca and localkit: Various fixes.
* monaca: Webpack dev server support.

v1.1.13
----
* monaca: Allowed upload/download for config files inside the root directory.

v1.1.12
----
* monaca: Fixed wrong files deletion in `downloadProject()`.

v1.1.11
----
* monaca: Added missing `options` to `downloadProject` method in `Monaca.startRemoteBuild` API.

v1.1.10
----
 * monaca: Fixed .monaca/project_info.json not updated when syncing back from the Cloud.
 * monaca: Fixed to delete unnecessary files after the build process.

v1.1.9
----
 * monaca: Fixed `Monaca.startRemoteBuild()` API to support placeholders.

v1.1.8
----
 * localkit: Added Cordova Version when getting project list.
 * localkit: Added a filter to the files when getting project file tree.
 * monaca: Added `showUrl` argument to `Monaca.buildProject()` API.

v1.1.7
----
 * monaca: Added `delete` argument to `uploadFiles` method.

v1.1.6
----
 * monaca: Added `Monaca.getLatestVersionInfo()` API to get the latest version information.
 * monaca: Support for .monacaignore so that the user can specify what file to ignore when upload/download from the Cloud.
 * monaca: Added support for `--dry-run` and `--delete` when upload/downloading from the Cloud.
 * monaca: Changed to unzip2 npm module for unzipping the archive.

v1.1.5
----
 * monaca: Fixed `Monaca.uploadFile()` API to limit the number of concurrent connections.
 * monaca: Removed `Monaca.buildProject()` API timeout.

v1.1.5-rc.3
----
 * monaca: Fixed `Monaca.uploadFile()` API to upload using Base64 encoding to avoid data corruption.

v1.1.5-rc.2
----
 * monaca: Fixed `Monaca.uploadProject()` API to also upload platform specific files.
 * localkit: Fixed nic address does not return a valid value in some cases.

v1.1.5-rc.1
----
 * monaca: Added `Monaca.getCurrentUser()` API.
 * localkit: Added `Localkit.generateOneTimePassword()`, `Localkit.validateOneTimePassword()`, `Localkit.generateLocalPairingKey()` API.
 * monaca: Fixed the POST parameter not sent to the server for some reason.

v1.1.4
----
 * monaca: Fix the number of concurrent connections during the network requests.

v1.1.3
----
 * monaca: Fix issue in `Monaca.cloneProject()` where promise was never resolved.

v1.1.0-rc.10
----
 * Released without any changes.

v1.1.0-rc.9
----
 * localkit: Return `frameworkVersion` when calling `Localkit.getProject()` function.
 * localkit: Now `Localkit` emits `live-reload` event when the file has changed.

v1.1.0-rc.8
----
 * localkit: Fixed bug when serving multiple projects.

v1.1.0-rc.7
----
 * monaca: Added `isBuildOnly` parameter to `Monaca.createProject()` API.
 * monaca: Rewrote `Monaca.getTemplates()` method to get templates from Monaca Cloud.
 * monaca: Added `Monaca.createFromTemplate()` method to create a project from a template in Monaca cloud.
 * monaca: Added `disableStatusUpdate` parameter to `Monaca.getLatestNews()`.
 * localkit: Added `Localkit.startWatchProject()`, `Localkit.stopWatchingProject()` and `Localkit.isWatchingProject()` for more granular control.
 * monaca: Added `options.language` parameter.
 * monaca: Added `options` object to `Monaca.relogin()`. Works exactly like the parameters for `Monaca.login()`.
 * localkit: Added `Localkit.initInspector()` method.
 * localkit: Fixed `Localkit.startWatch()` so it will always be resolved.
 * monaca: Return whole response body in `Monaca.login` instead of just the message.
 * monaca: Added `Monaca.download()` method.
 * localkit: Removed nw.js dependency.
 * localkit: `Localkit` object is now an event emitter.
 * localkit: Fixed `Localkit.stopHttpServer` so it will work even if clients are connected to SSE.
 * localkit: Kill adb processes on shutdown.
 * localkit: Add ability to override config.xml project name in `Localkit.addProject()` and `Localkit.setProjects()`.
 * monaca: Don't save cloud project id in `Monaca.cloneProject()`.
 * monaca: Return whole JSON response when making requests to Monaca Cloud.

v1.0.4
----
 * monaca: Added `Monaca.getLatestNews()` to fetch latest news and status on known issues from Monaca Cloud.
 * localkit: Added `options.clientId` to `Localkit.startProject()` method. Used to start a project on one device instead of sending the start signal to all connected devices.
 * localkit: Added `Localkit.startInspector()` to start an inspector when the computer is connected to Localkit.
 * monoaca: Added `Monaca.isMonacaProject()` to check if a directory is a Monaca project.

v1.0.3
----
 * monaca: Added `options` parameter to `Monaca.login()` to specify version.
 * monaca: Added `Monaca.isCordovaProject()` to check if a directory is a Cordova project.

v1.0.2
----
 * monaca: Fixed bug where .cordova directory was not created correctly when missing.

v1.0.1
----
 * monaca: Added configuration methods.
 * monaca: Added proxy support.

v1.0.0
------
 * Initial version.
