
CHANGELOG
====

v1.0.5
----
 * monaca: Added `isBuildOnly` parameter to `Monaca.createProject()` API.
 * monaca: Rewrote `Monaca.getTemplates()` method to get templates from Monaca Cloud.

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
