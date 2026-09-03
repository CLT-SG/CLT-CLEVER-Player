'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')

const APP_DIR_NAME = 'clever-console'

function getHomeDir() {
  return os.homedir()
}

function getAppDir() {
  return path.join(getHomeDir(), APP_DIR_NAME)
}

function getLogDir() {
  return path.join(getAppDir(), 'logs')
}

function getConfigPath() {
  return path.join(getAppDir(), 'config.js')
}

function ensureAppDirs() {
  const appDir = getAppDir()
  const logDir = getLogDir()
  fs.mkdirSync(appDir, { recursive: true })
  fs.mkdirSync(logDir, { recursive: true })
  return { appDir, logDir }
}

module.exports = {
  APP_DIR_NAME,
  getHomeDir,
  getAppDir,
  getLogDir,
  getConfigPath,
  ensureAppDirs
}
