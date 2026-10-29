'use strict'

const { app, BrowserWindow, globalShortcut, desktopCapturer, screen, Menu } = require('electron')
const path = require('path')

const CreateConfig = require('./create-config')
const PortScanner = require('./port-scanner')
const { getAppDir, ensureAppDirs } = require('./src/main/paths')
const { setupLogging, logApplicationStart, getLoggers, applyLogSettings } = require('./src/main/logger')
const { setupSecurity, getLocalFileUrl } = require('./src/main/security')
const { setupCrashRecovery, reloadOrRecover, isIgnorableLoadError } = require('./src/main/recovery')
const { setupUpdater } = require('./src/main/updater')
const { registerIpcHandlers } = require('./src/main/ipc')
const { isReachable } = require('./src/main/reachable')
const configService = require('./src/main/config-service')
const { resolveWindowChrome } = require('./src/main/window-bounds')
const {
  hideConsoleChrome,
  stackConsoleAboveLogin,
  stackLoginAboveConsole,
  toggleConsoleLoginStack,
  enforcePreferredStack,
  getPreferredSurface,
} = require('./src/main/window-stack')
const { registerDefaultOsdShortcut } = require('./src/main/osd-shortcut')

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
    const values = configService.getValues()
    const isVideoWall = values.CTRL_TYPE === 'videowall' || values.ctrltype === 'videowall'
    if (!isVideoWall && serverWin && !serverWin.isDestroyed() && serverWin.isVisible()) {
      if (serverWin.isMinimized()) {
        log.info('Server window restore process.')
        serverWin.show()
      }
      // Keep preferred surface (default: Console login/preview above management).
      if (getPreferredSurface() === 'management') {
        stackConsoleAboveLogin(mainWin, serverWin)
      } else {
        stackLoginAboveConsole(mainWin, serverWin)
      }
      return
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

// ScreencastApp websockify uses a local self-signed cert on :8840.
// Chromium can reject that cert for guest-webview wss:// handshakes even
// when /probe (Node rejectUnauthorized:false) reports HTTPS /status PASS.
// Accept LAN appliance certificates before app ready so Video Wall slots
// can open wss://<ip>:8840/screenN.
app.commandLine.appendSwitch('ignore-certificate-errors')
app.commandLine.appendSwitch('disable-http-cache')

function applyRuntimeSettings(snapshot) {
  const values = (snapshot && snapshot.values) || configService.getValues()
  applyLogSettings({
    level: values.LOG_LEVEL,
    retentionDays: values.LOG_RETENTION_DAYS,
    maxSizeMb: values.MAX_LOG_SIZE_MB,
    debugMode: values.DEBUG_MODE
  })
}

function getWindowOptions(show) {
  const values = configService.getValues()
  const allowDevTools = Boolean(values.ENABLE_DEVTOOLS || values.DEV_MODE)
  const chrome = resolveWindowChrome(values)
  return {
    backgroundColor: '#302d2d',
    fullscreenable: chrome.fullscreenable,
    alwaysOnTop: chrome.alwaysOnTop,
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
      devTools: allowDevTools
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

  const values = configService.getValues()
  if (values.ALWAYS_ON_TOP !== false) {
    // 'screen-saver' level keeps the window above the OS taskbar on Windows/Linux.
    mainWin.setAlwaysOnTop(true, 'screen-saver')
    serverWin.setAlwaysOnTop(true, 'screen-saver')
  }

  // Video Wall never uses the management/login pair — keep it hidden from birth.
  if (values.CTRL_TYPE === 'videowall' || values.ctrltype === 'videowall') {
    hideConsoleChrome(serverWin)
  }

  bindWindowGuards(mainWin, 'Main window')
  bindWindowGuards(serverWin, 'Server window')

  // Console: keep Console login/preview above management after focus/load races
  // unless the operator intentionally switched with Alt+PageUp / app-switchwindow.
  const reassertPreferredStack = () => {
    const valuesNow = configService.getValues()
    const isConsole = valuesNow.CTRL_TYPE === 'console' || valuesNow.ctrltype === 'console'
    if (!isConsole || !mainWin || !serverWin || mainWin.isDestroyed() || serverWin.isDestroyed()) {
      return
    }
    if (!serverWin.isVisible()) return
    enforcePreferredStack(mainWin, serverWin)
  }
  serverWin.on('focus', () => {
    if (getPreferredSurface() === 'player') {
      setTimeout(reassertPreferredStack, 0)
    }
  })
  mainWin.on('focus', () => {
    if (getPreferredSurface() === 'management') {
      setTimeout(reassertPreferredStack, 0)
    }
  })
  serverWin.on('show', () => {
    setTimeout(reassertPreferredStack, 50)
  })
  serverWin.webContents.on('did-finish-load', () => {
    setTimeout(reassertPreferredStack, 50)
  })
  mainWin.webContents.on('did-finish-load', () => {
    setTimeout(reassertPreferredStack, 50)
  })

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
    // Do not show yet — CreateConfig.checkSerial retries reachability and
    // loads preview/login (or offline only after retries). Showing early made
    // the first-launch offline page flash before the controller responded.
  })

  try {
    localApi = require('./route')
    localApi.setMainWindow(mainWin, desktopCapturer, screen)
  } catch (error) {
    getLoggers().errorLog.error('Failed to start local API server', error)
  }

  try {
    const registration = require('./src/main/registration')
    registration.setApplyConfigHandler(async (desired, revision, meta) => {
      const { playerLog } = getLoggers()
      const previousRole = (meta && meta.previousRole) || registration.currentAppliedRole()
      const before = configService.getValues()
      const previousTemplateId = String(before.TEMPLATE_ID || '')
      const previousVideowallId = String(before.VIDEOWALL_ID || '')

      registration.applyDesiredConfigLocally(desired)
      applyRuntimeSettings(configService.getSnapshot())

      const settings = configService.getValues()
      const nextRole = registration.currentAppliedRole()
      const roleChanged = previousRole !== nextRole
      const nextTemplateId = String(
        (desired && desired.templateId != null && desired.templateId !== '')
          ? desired.templateId
          : (meta && meta.templateId != null ? meta.templateId : settings.TEMPLATE_ID) || ''
      )
      const nextVideowallId = String(
        (desired && desired.videowallId != null && desired.videowallId !== '')
          ? desired.videowallId
          : (meta && meta.videowallId != null ? meta.videowallId : settings.VIDEOWALL_ID) || ''
      )
      // Template/wall id changes must reload preview — writing TEMPLATE_ID alone
      // left Synced while the window still showed the old layout URL.
      const templateOrWallChanged =
        nextTemplateId !== previousTemplateId || nextVideowallId !== previousVideowallId

      playerLog.info('Applying server configuration', {
        revision,
        previousRole,
        nextRole,
        roleChanged,
        previousTemplateId,
        nextTemplateId,
        templateOrWallChanged
      })

      if (roleChanged || templateOrWallChanged) {
        // Tear down Console chrome when entering Video Wall so interactive
        // surfaces cannot linger after a Console → Video Wall transition.
        if (nextRole === 'videowall' && serverWin && !serverWin.isDestroyed()) {
          try {
            hideConsoleChrome(serverWin)
            await serverWin.loadURL('about:blank')
          } catch {
            // ignore
          }
        }
        // Reload preview/login URLs for the new CTRL_TYPE / template without restarting Electron.
        await reloadPlayer()
        if (nextRole === 'console' && mainWin && serverWin && !serverWin.isDestroyed()) {
          // Default: Console login/preview on top; shortkey brings management forward.
          stackLoginAboveConsole(mainWin, serverWin)
        }
      } else if (mainWin && !mainWin.isDestroyed() && screen) {
        const { applyWindowMode, isVideoWallCtrl } = require('./src/main/window-bounds')
        if (!isVideoWallCtrl(settings)) {
          applyWindowMode(mainWin, settings, screen.getPrimaryDisplay())
        }
      }

      // Confirm runtime role matches desired before the heartbeat acknowledges.
      const applied = registration.currentAppliedRole()
      const desiredRole = (meta && meta.desiredRole) || (desired && desired.deviceRole)
      if (desiredRole && applied !== desiredRole) {
        throw new Error(`Runtime role is ${applied} after apply; desired ${desiredRole}`)
      }
    })
    registration.announce().catch(() => {})
    registration.startHeartbeatLoop()
  } catch (error) {
    getLoggers().errorLog.warn('Player registration loop not started', error)
  }
}

function registerShortcuts() {
  const { log } = getLoggers()
  const values = configService.getValues()

  if (values.ENABLE_DEVTOOLS || values.DEV_MODE) {
    globalShortcut.register('Alt+Insert', () => {
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.webContents.openDevTools({ mode: 'detach' })
      }
    })
  }

  globalShortcut.register('Alt+Home', () => {
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.loadURL(getLocalFileUrl('src/configure.html'))
    }
  })

  globalShortcut.register('Alt+PageUp', () => {
    // Console mode: toggle login (preview) above/below the management console.
    // Video Wall has no serverWin chrome — no-op when server is hidden.
    if (!mainWin || !serverWin || serverWin.isDestroyed() || !serverWin.isVisible()) {
      return
    }
    toggleConsoleLoginStack(mainWin, serverWin)
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

  // Console operator OSD: default Alt+O; Service may re-register via IPC.
  // Must work even when Screencast/VNC <webview> has focus.
  registerDefaultOsdShortcut(() => ({ mainWin, serverWin }))
}

async function bootstrapWithConfig() {
  const { log } = getLoggers()
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

async function bootstrapFirstRun() {
  const { errorLog } = getLoggers()
  errorLog.warn('Config missing, scanning for CLEVER server')
  const scanner = new PortScanner()
  const openPorts = await scanner.scanIPRange()
  const ipaddress = openPorts[0] || 'localhost'
  await CreateConfig.createConfigFile(ipaddress, appDir)
}

app.whenReady().then(async () => {
  const { log, errorLog } = getLoggers()
  logApplicationStart(app)
  setupCrashRecovery(() => ({ mainWin, serverWin }))

  try {
    if (configService.hasIni(appDir) || configService.hasLegacyJs(appDir)) {
      const snapshot = configService.initialize({ appDir })
      applyRuntimeSettings(snapshot)
      log.info('Configuration loaded', snapshot.iniPath)
      if (snapshot.migrated) {
        log.info('Migrated config.js to config.ini automatically')
      }
      if (snapshot.warnings && snapshot.warnings.length > 0) {
        errorLog.warn(`Configuration used ${snapshot.warnings.length} default value(s) after validation`)
      }
      await bootstrapWithConfig()
    } else {
      await bootstrapFirstRun()
    }
  } catch (error) {
    errorLog.error('Startup failed, opening configure page', error)
    try {
      if (!configService.hasIni(appDir)) {
        configService.createDefault('127.0.0.1', appDir)
      } else {
        configService.initialize({ appDir })
      }
      applyRuntimeSettings(configService.getSnapshot())
    } catch (configError) {
      errorLog.error('Unable to recover configuration', configError)
    }
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      bootstrapWithConfig().catch((err) => errorLog.error(err))
    }
  })
})

let meetingQuitCleanupDone = false
app.on('before-quit', (event) => {
  if (meetingQuitCleanupDone) return
  // Leave active Meeting Cast calls before the process exits; otherwise hosts
  // keep seeing this display until WebRTC times out.
  event.preventDefault()
  meetingQuitCleanupDone = true
  const { log } = getLoggers()
  log.info('Application closed')
  globalShortcut.unregisterAll()
  try {
    require('./src/main/registration').stopHeartbeatLoop()
  } catch {
    // ignore
  }
  Promise.resolve()
    .then(() => require('./src/main/meeting-window').closeAllMeetingWindows())
    .catch(() => {})
    .finally(() => {
      app.quit()
    })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

module.exports = {
  isReachable
}
