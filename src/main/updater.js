'use strict'

const path = require('path')
const { app, BrowserWindow, ipcMain } = require('electron')
const { autoUpdater } = require('electron-updater')
const { getLocalFileUrl } = require('./security')
const { getLoggers } = require('./logger')

const STATUS = {
  IDLE: 'idle',
  CHECKING: 'Checking for updates...',
  AVAILABLE: 'Update available',
  UNAVAILABLE: 'Already up to date',
  DOWNLOADING: 'Downloading update...',
  DOWNLOADED: 'Update downloaded',
  RESTART: 'Restart to update',
  FAILED: 'Update failed',
  DEV: 'Updates are disabled in development'
}

const INITIAL_RETRY_MS = 30 * 1000
const MAX_RETRY_MS = 60 * 60 * 1000
const AUTO_RESTART_MS = 30 * 1000

let status = {
  state: STATUS.IDLE,
  progress: 0,
  version: null,
  error: null,
  message: STATUS.IDLE
}

let updateWindow = null
let retryTimer = null
let retryDelay = INITIAL_RETRY_MS
let autoRestartTimer = null
let initialized = false

function broadcast(getMainWindow) {
  const payload = { ...status }
  const mainWindow = getMainWindow()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater-status', payload)
  }
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.webContents.send('updater-status', payload)
  }
}

function summarizeUpdateError(error) {
  if (!error) {
    return 'unknown error'
  }
  const raw = error.message || String(error)
  const status = raw.match(/^(\d{3})\b/)
  const url = raw.match(/url:\s+(\S+)/)
  const parts = ['Update request failed']
  if (status) {
    parts.push(status[1])
  }
  if (url) {
    parts.push(url[1].replace(/\\n.*/, ''))
  } else if (error.code) {
    parts.push(error.code)
  }
  return parts.join(' ')
}

function setStatus(partial, getMainWindow) {
  status = { ...status, ...partial }
  const { updaterLog } = getLoggers()
  updaterLog.info('Update status', status.message, {
    progress: status.progress,
    version: status.version,
    error: status.error
  })
  broadcast(getMainWindow)
  updateOverlayVisibility()
}

function updateOverlayVisibility() {
  if (!updateWindow || updateWindow.isDestroyed()) {
    return
  }
  const visibleStates = [STATUS.AVAILABLE, STATUS.DOWNLOADING, STATUS.DOWNLOADED, STATUS.RESTART, STATUS.FAILED]
  if (visibleStates.includes(status.message) || visibleStates.includes(status.state)) {
    updateWindow.showInactive()
  } else if (status.message === STATUS.UNAVAILABLE || status.message === STATUS.IDLE) {
    updateWindow.hide()
  }
}

function createUpdateWindow() {
  if (updateWindow && !updateWindow.isDestroyed()) {
    return updateWindow
  }

  updateWindow = new BrowserWindow({
    width: 460,
    height: 220,
    show: false,
    frame: false,
    resizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: false,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(app.getAppPath(), 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: false,
      devTools: false
    }
  })

  updateWindow.setAlwaysOnTop(true, 'screen-saver')
  updateWindow.loadURL(getLocalFileUrl('src/update.html'))
  updateWindow.on('closed', () => {
    updateWindow = null
  })
  return updateWindow
}

function scheduleRetry(checkForUpdates) {
  if (retryTimer) {
    clearTimeout(retryTimer)
  }
  retryTimer = setTimeout(() => {
    checkForUpdates()
  }, retryDelay)
  retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS)
}

function getUpdaterSettings() {
  try {
    const values = require('./config-service').getValues()
    return {
      autoUpdate: values.AUTO_UPDATE !== false,
      channel: values.UPDATE_CHANNEL || 'latest',
      checkIntervalHours: Number(values.CHECK_INTERVAL_HOURS) || 6,
      autoInstallOnRestart: values.AUTO_INSTALL_ON_RESTART !== false,
      devMode: values.DEV_MODE === true
    }
  } catch {
    return {
      autoUpdate: true,
      channel: 'latest',
      checkIntervalHours: 6,
      autoInstallOnRestart: true,
      devMode: false
    }
  }
}

function setupUpdater({ getMainWindow }) {
  const { updaterLog, errorLog } = getLoggers()

  if (initialized) {
    return getPublicApi()
  }
  initialized = true

  const settings = getUpdaterSettings()
  autoUpdater.logger = updaterLog
  autoUpdater.autoDownload = settings.autoUpdate
  autoUpdater.autoInstallOnAppQuit = settings.autoInstallOnRestart
  autoUpdater.allowDowngrade = false
  autoUpdater.allowPrerelease = settings.channel !== 'latest' || /-alpha|-beta/.test(app.getVersion())
  if (typeof autoUpdater.channel !== 'undefined') {
    autoUpdater.channel = settings.channel
  }

  const notify = (partial) => setStatus(partial, getMainWindow)

  const checkForUpdates = async () => {
    const currentSettings = getUpdaterSettings()
    if (!app.isPackaged || currentSettings.devMode || !currentSettings.autoUpdate) {
      notify({ state: 'dev', message: STATUS.DEV, progress: 0, error: null })
      updaterLog.info('Skipping update check', {
        packaged: app.isPackaged,
        autoUpdate: currentSettings.autoUpdate,
        devMode: currentSettings.devMode
      })
      return status
    }

    try {
      notify({ state: 'checking', message: STATUS.CHECKING, error: null })
      updaterLog.info('Checking for update')
      await autoUpdater.checkForUpdates()
    } catch (error) {
      const summary = summarizeUpdateError(error)
      errorLog.error('Update error', summary)
      notify({
        state: 'error',
        message: STATUS.FAILED,
        error: summary
      })
      scheduleRetry(checkForUpdates)
    }
    return status
  }

  autoUpdater.on('checking-for-update', () => {
    notify({ state: 'checking', message: STATUS.CHECKING, error: null })
  })

  autoUpdater.on('update-available', (info) => {
    retryDelay = INITIAL_RETRY_MS
    createUpdateWindow()
    notify({
      state: 'available',
      message: STATUS.AVAILABLE,
      version: info.version,
      progress: 0,
      error: null
    })
    updaterLog.info('Update available', info.version)
  })

  autoUpdater.on('update-not-available', (info) => {
    retryDelay = INITIAL_RETRY_MS
    notify({
      state: 'unavailable',
      message: STATUS.UNAVAILABLE,
      version: info && info.version,
      progress: 0,
      error: null
    })
    updaterLog.info('Update not available')
  })

  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.round(progress.percent || 0)
    notify({
      state: 'downloading',
      message: STATUS.DOWNLOADING,
      progress: percent,
      error: null
    })
    updaterLog.info('Download progress', `${percent}%`)
  })

  autoUpdater.on('update-downloaded', (info) => {
    notify({
      state: 'downloaded',
      message: STATUS.RESTART,
      version: info.version,
      progress: 100,
      error: null
    })
    updaterLog.info('Download completed', info.version)
    updaterLog.info('Update downloaded')

    if (autoRestartTimer) {
      clearTimeout(autoRestartTimer)
    }
    if (getUpdaterSettings().autoInstallOnRestart) {
      autoRestartTimer = setTimeout(() => {
        installUpdate()
      }, AUTO_RESTART_MS)
    }
  })

  autoUpdater.on('error', (error) => {
    const summary = summarizeUpdateError(error)
    errorLog.error('Update error', summary)
    notify({
      state: 'error',
      message: STATUS.FAILED,
      error: summary
    })
    scheduleRetry(checkForUpdates)
  })

  function installUpdate() {
    updaterLog.info('Update installed, restarting')
    try {
      autoUpdater.quitAndInstall(false, true)
    } catch (error) {
      errorLog.error('Failed to install update', error)
      notify({
        state: 'error',
        message: STATUS.FAILED,
        error: error.message || String(error)
      })
    }
  }

  ipcMain.handle('updater-status', () => status)
  ipcMain.on('updater-install', () => {
    installUpdate()
  })
  ipcMain.on('updater-check', () => {
    checkForUpdates()
  })

  app.whenReady().then(() => {
    createUpdateWindow()
    setTimeout(() => {
      checkForUpdates()
    }, 5000)
    const hours = Math.max(1, getUpdaterSettings().checkIntervalHours)
    setInterval(() => {
      checkForUpdates()
    }, hours * 60 * 60 * 1000)
  })

  function getPublicApi() {
    return {
      checkForUpdates,
      installUpdate,
      getStatus: () => ({ ...status })
    }
  }

  return getPublicApi()
}

module.exports = {
  setupUpdater,
  STATUS
}
