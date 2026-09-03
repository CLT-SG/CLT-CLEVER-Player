'use strict'

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
  isValidAccelerator,
  isPrivateHost,
  isValidHost
}
