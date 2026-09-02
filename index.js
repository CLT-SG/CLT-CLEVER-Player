'use strict'

const { app, BrowserWindow, globalShortcut, desktopCapturer, screen, Menu } = require('electron')
const path = require('path')
const fs = require('fs')

const CreateConfig = require('./create-config')
const PortScanner = require('./port-scanner')
const { getAppDir, getConfigPath, ensureAppDirs } = require('./src/main/paths')
const { setupLogging, logApplicationStart, getLoggers } = require('./src/main/logger')
const { setupSecurity, getLocalFileUrl } = require('./src/main/security')
const { setupCrashRecovery, reloadOrRecover, isIgnorableLoadError } = require('./src/main/recovery')
const { setupUpdater } = require('./src/main/updater')
const { registerIpcHandlers } = require('./src/main/ipc')
const { isReachable } = require('./src/main/reachable')

setupLogging()
setupSecurity()

const appDir = getAppDir()
ensureAppDirs()

let mainWin = null
let serverWin = null
let localApi = null

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.exit(0)
} else {
  app.on('second-instance', () => {
    const { log } = getLoggers()
    if (serverWin && !serverWin.isDestroyed()) {
      if (serverWin.isMinimized()) {
        log.info('Server window restore process.')
        serverWin.show()
      }
      serverWin.focus()
    }
    if (mainWin && !mainWin.isDestroyed()) {
      if (mainWin.isMinimized()) {
        log.info('Main window restore process.')
        mainWin.show()
      }
      mainWin.focus()
    }
  })
}

app.commandLine.appendSwitch('disable-http-cache')

function getWindowOptions(show) {
  return {
    backgroundColor: '#302d2d',
    fullscreenable: false,
    resizable: false,
    movable: false,
    closable: false,
    frame: false,
    zoomFactor: 1,
    center: true,
    show,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      sandbox: false,
      webviewTag: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
      devTools: true
    }
  }
}

function bindWindowGuards(win, name) {
  const { log, errorLog, playerLog } = getLoggers()

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    errorLog.warn(`${name} did-fail-load`, { errorCode, errorDescription, validatedURL, isMainFrame })
    if (!isMainFrame || isIgnorableLoadError(errorCode)) {
      return
    }
    playerLog.warn('Content failed', { name, errorCode, errorDescription })
    reloadOrRecover(win, `${name}-did-fail-load:${errorCode}`)
  })

  win.webContents.on('did-finish-load', () => {
    playerLog.info('Content loaded', name)
    win.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {})
  })

  win.webContents.on('unresponsive', () => {
    errorLog.warn(`${name} became unresponsive`)
  })

  win.webContents.on('responsive', () => {
    log.info(`${name} became responsive again`)
  })

  win.webContents.on('preload-error', (_event, preloadPath, error) => {
    errorLog.error(`${name} preload error`, preloadPath, error)
  })
}

async function reloadPlayer() {
  const { playerLog, errorLog } = getLoggers()
  try {
    await CreateConfig.checkSerial(appDir, { mainWin, serverWin })
    playerLog.info('Player started')
  } catch (error) {
    errorLog.error('Failed to reload player', error)
  }
}

function createWindows() {
  const { log, playerLog } = getLoggers()

  mainWin = new BrowserWindow(getWindowOptions(false))
  serverWin = new BrowserWindow({
    ...getWindowOptions(false),
    x: 0,
    y: 0,
    width: 0,
    height: 0
  })

  bindWindowGuards(mainWin, 'Main window')
  bindWindowGuards(serverWin, 'Server window')

  mainWin.on('closed', () => {
    playerLog.info('Player stopped')
    mainWin = null
  })
  serverWin.on('closed', () => {
    serverWin = null
  })

  Menu.setApplicationMenu(null)
  mainWin.setMenu(null)
  serverWin.setMenu(null)

  mainWin.on('ready-to-show', () => {
    log.info('Application ready')
    mainWin.setBackgroundColor('#242322')
    mainWin.show()
  })

  try {
    localApi = require('./route')
    localApi.setMainWindow(mainWin, desktopCapturer, screen)
  } catch (error) {
    getLoggers().errorLog.error('Failed to start local API server', error)
  }
}

function registerShortcuts() {
  const { log } = getLoggers()

  globalShortcut.register('Alt+Insert', () => {
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.openDevTools({ mode: 'detach' })
    }
  })

  globalShortcut.register('Alt+Home', () => {
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.loadURL(getLocalFileUrl('src/configure.html'))
    }
  })

  globalShortcut.register('Alt+PageUp', () => {
    if (!mainWin || !serverWin) {
      return
    }
    if (mainWin.isFocused()) {
      mainWin.blur()
      serverWin.focus()
    } else {
      serverWin.blur()
      mainWin.focus()
    }
  })

  globalShortcut.register('Alt+Delete', () => {
    log.warn('Application exit')
    app.exit(0)
  })

  globalShortcut.register('Alt+F5', async () => {
    if (!mainWin || mainWin.isDestroyed()) {
      return
    }
    await mainWin.webContents.session.clearCache()
    log.info('Cache cleared!')
    mainWin.reload()
  })
}

async function bootstrapWithConfig() {
  const { log, errorLog } = getLoggers()
  CreateConfig.checkVarExistingConfigFile(appDir)
    .then(async (checkExist) => {
      if (!checkExist) {
        const scanner = new PortScanner()
        const openPorts = await scanner.scanIPRange()
        const ipaddress = openPorts[0] || 'localhost'
        await CreateConfig.updateExistingConfigFile(ipaddress, appDir)
      }
    })
    .catch((error) => {
      errorLog.warn(error)
    })

  createWindows()
  registerIpcHandlers({
    getWindows: () => ({ mainWin, serverWin }),
    reloadPlayer
  })
  registerShortcuts()
  setupUpdater({
    getMainWindow: () => mainWin
  })

  setTimeout(() => {
    log.info('Scheduled maintenance restart')
    app.relaunch()
    app.exit(0)
  }, 432000000)

  await reloadPlayer()
}

async function bootstrapWithoutConfig(error) {
  const { log, errorLog } = getLoggers()
  errorLog.warn('Config missing or invalid, scanning for CLEVER server', error && error.message)
  const scanner = new PortScanner()
  const openPorts = await scanner.scanIPRange()
  const ipaddress = openPorts[0] || 'localhost'
  if (!fs.existsSync(getConfigPath())) {
    await CreateConfig.createConfigFile(ipaddress, appDir, error)
  } else {
    log.info('Config file already exists, launching')
    app.relaunch()
    app.exit(0)
  }
}

app.whenReady().then(async () => {
  const { errorLog } = getLoggers()
  logApplicationStart(app)
  setupCrashRecovery(() => ({ mainWin, serverWin }))

  try {
    require(getConfigPath())
    await bootstrapWithConfig()
  } catch (error) {
    if (!fs.existsSync(getConfigPath())) {
      await bootstrapWithoutConfig(error)
    } else {
      errorLog.error('Invalid configuration file, opening configure page', error)
      createWindows()
      registerIpcHandlers({
        getWindows: () => ({ mainWin, serverWin }),
        reloadPlayer
      })
      registerShortcuts()
      setupUpdater({ getMainWindow: () => mainWin })
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.loadURL(getLocalFileUrl('src/configure.html'))
        mainWin.show()
      }
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      bootstrapWithConfig().catch((err) => errorLog.error(err))
    }
  })
})

app.on('before-quit', () => {
  const { log } = getLoggers()
  log.info('Application closed')
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

module.exports = {
  isReachable
}
