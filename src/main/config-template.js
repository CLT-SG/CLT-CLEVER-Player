'use strict'

function generateConfigContent(ipAddress) {
  const safeIp = String(ipAddress || 'localhost').replace(/'/g, '')
  return `
        var hostserver = '${safeIp}'; // IP or Hostname Hosted
        var controllerport = '80'; // Clever Controller Port Number
        var cleverwebport = '9100'; // Clever Web Hosting Port Number
        var mediaserverport = '9200'; // Media Server Services Port Number
        var screenserverport = '9300'; // Screen Cast Web Hosting Services Port Number
        var screenapiport = '9301'; // Screen Cast Socket API Services Port Number
        var tempid = '1'; // insert template id
        var serialkey = '1d74f3eda4dd9d1065a6216c84c27d67301779b76996dc867f4403d48f9ad91e'; // Serial key
        var ctrltype = 'console'; // Controller type
        /*=======================================================================================================
        DO NOT MODIFY ANYTHING BELOW THIS SECTION. IT MAY CORRUPTED THIS APPLICATION
        ========================================================================================================*/
        module.exports.hostserver = hostserver;
        module.exports.controller = \`\${hostserver}:\${controllerport}\`;
        module.exports.cleverweb = \`\${hostserver}:\${cleverwebport}\`;
        module.exports.mediaserver = \`\${hostserver}:\${mediaserverport}\`;
        module.exports.screenserver = \`\${hostserver}:\${screenserverport}\`;
        module.exports.screenapi = \`\${hostserver}:\${screenapiport}\`;
        module.exports.remotedesktop = \`\${hostserver}:9400\`;
        module.exports.controllerport1 = controllerport;
        module.exports.cleverwebport1 = cleverwebport;
        module.exports.mediaserverport1 = mediaserverport;
        module.exports.screenserverport1 = screenserverport;
        module.exports.screenapiport1 = screenapiport;
        module.exports.timeout = 10000;
        module.exports.tempid = tempid;
        module.exports.serialkey = serialkey;
        module.exports.ctrltype = ctrltype;
      `
}

function variableOrder() {
  return [
    'var hostserver',
    'var controllerport',
    'var cleverwebport',
    'var mediaserverport',
    'var screenserverport',
    'var screenapiport',
    'var tempid',
    'var serialkey',
    'var ctrltype'
  ]
}

function isValidAccelerator(value) {
  return typeof value === 'string'
    && value.length < 80
    && /^((CommandOrControl|Command|Cmd|Control|Ctrl|Alt|Option|AltGr|Shift|Super|Meta)\+)*([A-Za-z0-9]+|F\d{1,2})$/.test(value)
}

function isPrivateHost(hostname) {
  if (!hostname) {
    return false
  }
  return /^(localhost|127\.0\.0\.1|::1|0\.0\.0\.0)$/i.test(hostname)
    || /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|169\.254\.)/.test(hostname)
}

function isValidHost(value) {
  if (!value) {
    return false
  }
  if (value === 'localhost' || value === '127.0.0.1') {
    return true
  }
  if (/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(value)) {
    return true
  }
  return /^(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(value)
}

module.exports = {
  generateConfigContent,
  variableOrder,
  isValidAccelerator,
  isPrivateHost,
  isValidHost
}
