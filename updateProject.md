# Updating a project in Monaca

Sometimes breaking changes are introduced in order to improve existing features. In most cases, these changes are related to new dependencies and files which do not require complex updates. Review the next version, in the list below, to see the necessary steps to bring your project up-to-date.

Before doing any change we recommend to **make a backup of your project**.  If after following these steps you still have any issue, please ask for support in the [community forum](https://community.onsen.io/).


## Version list

### Updating to v2.1.0 (Only React and Angular2 projects)

New dependencies have been introduced to provide a robust transpiler for React and Angular2.  Some of these dependencies are Stylus and react-hot-loader. All of this will be available for newly created projects.

For existing projects, please follow these steps below for basic support:

1. Generate Webpack configuration files and install the new build dependencies:

  a. For Monaca CLI: Run `monaca reconfigure`

  b. For Monaca LocalKit: When trying to transpile a project you will see a dialog about project misconfiguration. Follow the instructions.

2. Update `src/main.js` content:

  Find
  ```javascript
  // Load Onsen UI library
  import 'onsenui';
  ```

  Below insert
  ```javascript
  // Onsen UI Styling and Icons
  require('onsenui/stylus/blue-basic-theme.styl');
  require('onsenui/css/onsenui.css');
  ```

3. Remove distribution file `www/dist.js`.

4. Remove Onsen UI CSS `www/css`.

5. Create directory `<project>/src/public`.

6. Update `index.html` content:
  Remove the following lines:

  ```html
  <link rel="stylesheet" href="css/onsenui.css">
  <link rel="stylesheet" href="css/onsen-css-components.css">

  <script src="dist.js"></script>
  ```

  Add the following lines to `<head></head>` element:

  ```ejs
  <% for (var dep in htmlWebpackPlugin.options.externalJS) { %>
    <script type="text/javascript" src="<%= htmlWebpackPlugin.options.externalJS[dep] %>"></script><% } %>
  <% for (var dep in htmlWebpackPlugin.options.externalCSS) { %>
    <link rel="stylesheet" type="text/css" href="<%= htmlWebpackPlugin.options.externalCSS[dep] %>"><% } %>
  ```

7. Move `<project>/www/index.html` to `<project>/src/public/index.ejs`. Notice that the extension changes to `ejs`.

8. Move other static assets from `<project>/www/*` to `<project>/src/public/*`.
