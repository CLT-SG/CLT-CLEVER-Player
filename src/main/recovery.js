'use strict'

const fs = require('fs')
const path = require('path')
const { app } = require('electron')
const { getAppDir } = require('./paths')
const { getLoggers } = require('./logger')

const RELAUNCH_WINDOW_MS = 60 * 1000
const MAX_RELAUNCHES = 5

function getCrashStatePath() {
  return path.join(getAppDir(), 'crash-state.json')
}

function readCrashState() {
  try {
    return JSON.parse(fs.readFileSync(getCrashStatePath(), 'utf8'))
  } catch {
    return { count: 0, lastAt: 0 }
  }
}

function writeCrashState(state) {
  try {
    fs.writeFileSync(getCrashStatePath(), JSON.stringify(state), 'utf8')
  } catch {
    // Ignore crash-state write failures.
  }
}

function getWatchdogSettings() {
  try {
    const values = require('./config-service').getValues()
    return {
      enabled: values.WATCHDOG_ENABLED !== false,
      restartOnCrash: values.WATCHDOG_RESTART_ON_CRASH !== false,
      maxCrashCount: Number(values.WATCHDOG_MAX_CRASH_COUNT) || MAX_RELAUNCHES,
      recoverWebview: values.AUTO_RECOVER_WEBVIEW !== false
    }
  } catch {
    return {
      enabled: true,
      restartOnCrash: true,
      maxCrashCount: MAX_RELAUNCHES,
      recoverWebview: true
    }
  }
}

function canRelaunch() {
  const settings = getWatchdogSettings()
  if (!settings.enabled || !settings.restartOnCrash) {
    return false
  }
  const now = Date.now()
  const state = readCrashState()
  if (now - state.lastAt > RELAUNCH_WINDOW_MS) {
    writeCrashState({ count: 1, lastAt: now })
    return true
  }
  if (state.count >= settings.maxCrashCount) {
    return false
  }
  writeCrashState({ count: state.count + 1, lastAt: now })
  return true
}

function safeRelaunch(reason) {
  const { log, errorLog } = getLoggers()
  if (!canRelaunch()) {
    errorLog.error('Relaunch suppressed after repeated crashes', reason)
    return false
  }
  log.warn('Relaunching application', reason)
  app.relaunch()
  app.exit(0)
  return true
}

function reloadOrRecover(win, reason) {
  const { log, errorLog } = getLoggers()
  const settings = getWatchdogSettings()
  if (!settings.recoverWebview) {
    errorLog.warn('Webview auto-recovery disabled', reason)
    return false
  }
  if (win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
    log.warn('Reloading window after failure', reason)
    try {
      win.reload()
      return true
    } catch (error) {
      errorLog.error('Window reload failed', error)
    }
  }
  return safeRelaunch(reason)
}

function setupCrashRecovery(getWindows) {
  const { log, errorLog } = getLoggers()

  app.on('render-process-gone', (_event, webContents, details) => {
    errorLog.error('Renderer process gone', details)
    const windows = getWindows()
    const match = Object.values(windows).find((win) => win && win.webContents === webContents)
    if (details.reason === 'clean-exit') {
      return
    }
    reloadOrRecover(match, `render-process-gone:${details.reason}`)
  })

  app.on('child-process-gone', (_event, details) => {
    errorLog.warn('Child process gone', details)
    if (details.type === 'GPU' || details.type === 'Utility') {
      log.warn('Continuing after child process exit', details.type)
    }
  })

  app.on('gpu-process-crashed', (_event, killed) => {
    errorLog.warn('GPU process crashed', { killed })
  })

  process.on('exit', (code) => {
    log.info('Application closed', { code })
  })
}

function isIgnorableLoadError(errorCode) {
  // ERR_ABORTED, ERR_BLOCKED_BY_CLIENT
  return errorCode === -3 || errorCode === -20
}

module.exports = {
  setupCrashRecovery,
  safeRelaunch,
  reloadOrRecover,
  isIgnorableLoadError,
  canRelaunch
}
