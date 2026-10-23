'use strict'

const { app, ipcMain, globalShortcut, screen } = require('electron')
const QRCode = require('qrcode')
const macaddress = require('macaddress')
const { isReachable } = require('./reachable')
const { getAppDir, getHomeDir, getConfigPath } = require('./paths')
const { getLoggers } = require('./logger')
const { isAllowedMainNavigation } = require('./security')
const { isValidAccelerator } = require('./config-template')
const {
  getLegacyWorkAreaBounds,
  resolveRendererWindowBounds,
  isVideoWallCtrl,
  clearExclusiveDisplayMode,
  isExclusiveDisplayMode
} = require('./window-bounds')
const CreateConfig = require('../../create-config')
const {
  openMeetingWindow,
  closeMeetingWindow,
  updateMeetingBounds,
  closeAllMeetingWindows,
  chromeLikeUserAgent
} = require('./meeting-window')

function getConfig() {
  return require('./config-service').getLegacyConfig()
}

function validateSender(event, channel) {
  const { log } = getLoggers()
  if (!event.senderFrame) {
    return true
  }
  const url = event.senderFrame.url
  const config = getConfig()
  if (url && !isAllowedMainNavigation(url, config) && !url.endsWith('src/update.html')) {
    log.warn('Rejected IPC from unexpected frame', { channel, url })
    return false
  }
  return true
}

function getWindowFromEvent(event, windows) {
  const contents = event.sender
  if (windows.mainWin && windows.mainWin.webContents === contents) {
    return windows.mainWin
  }
  if (windows.serverWin && windows.serverWin.webContents === contents) {
    return windows.serverWin
  }
  if (windows.mainWin && !windows.mainWin.isDestroyed()) {
    return windows.mainWin
  }
  return null
}

function registerIpcHandlers({ getWindows, reloadPlayer }) {
  const { log, errorLog, playerLog } = getLoggers()

  ipcMain.on('app-exit', (event) => {
    if (!validateSender(event, 'app-exit')) {
      return
    }
    log.info('Application closed')
    app.quit()
  })

  ipcMain.on('app-update-id', (event) => {
    if (!validateSender(event, 'app-update-id')) {
      return
    }
    const { mainWin } = getWindows()
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.reload()
    }
  })

  ipcMain.on('app-savelog', (event, logs) => {
    if (!validateSender(event, 'app-savelog')) {
      return
    }
    const logType = Array.isArray(logs) ? logs[0] : 'info'
    const logText = Array.isArray(logs) ? logs[1] : logs
    if (logType === 'warn' || logType === 'error') {
      errorLog[logType === 'error' ? 'error' : 'warn'](logText)
    } else {
      playerLog.info(logText)
    }
  })

  ipcMain.on('app-reload', (event) => {
    if (!validateSender(event, 'app-reload')) {
      return
    }
    reloadPlayer()
  })

  ipcMain.on('app-mainreload', (event) => {
    if (!validateSender(event, 'app-mainreload')) {
      return
    }
    const { mainWin } = getWindows()
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.reload()
    }
  })

  ipcMain.on('app-resetdefault', async (event) => {
    if (!validateSender(event, 'app-resetdefault')) {
      return
    }
    const { mainWin } = getWindows()
    if (mainWin && !mainWin.isDestroyed()) {
      await mainWin.webContents.session.clearStorageData()
    }
  })

  ipcMain.on('app-configsave', async (event, args) => {
    if (!validateSender(event, 'app-configsave')) {
      return
    }
    try {
      await CreateConfig.updateSpecificVarOnlyConfigFile(getAppDir(), args || {})
      reloadPlayer()
    } catch (error) {
      errorLog.error('Failed to save configuration', error)
    }
  })

  ipcMain.on('app-switchwindow', (event) => {
    if (!validateSender(event, 'app-switchwindow')) {
      return
    }
    const { mainWin, serverWin } = getWindows()
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

  ipcMain.on('app-registerShortkey', (event, args) => {
    if (!validateSender(event, 'app-registerShortkey')) {
      return
    }
    const shortkey = args && args.shortkey
    if (!isValidAccelerator(shortkey)) {
      errorLog.warn('Ignored invalid shortcut', shortkey)
      return
    }
    try {
      globalShortcut.unregister(shortkey)
      globalShortcut.register(shortkey, async () => {
        const { mainWin } = getWindows()
        if (!mainWin || mainWin.isDestroyed()) {
          return
        }
        const encoded = JSON.stringify(String(args.templateData ?? ''))
        try {
          await mainWin.webContents.executeJavaScript(
            `window.localStorage.setItem("templateData", ${encoded});`
          )
          mainWin.webContents.send('app-shortkeyRefresh', shortkey)
          playerLog.info('Playlist changed via shortcut', shortkey)
        } catch (error) {
          errorLog.error('Shortcut handler failed', error)
        }
      })
    } catch (error) {
      errorLog.error('Failed to register shortcut', error)
    }
  })

  ipcMain.on('app-unregisterShortkey', (event, args) => {
    if (!validateSender(event, 'app-unregisterShortkey')) {
      return
    }
    const shortkey = args && args.shortkey
    if (!isValidAccelerator(shortkey)) {
      return
    }
    try {
      globalShortcut.unregister(shortkey)
    } catch (error) {
      errorLog.warn('Failed to unregister shortcut', error)
    }
  })

  ipcMain.on('window-set-bounds', (event, bounds) => {
    if (!validateSender(event, 'window-set-bounds')) {
      return
    }
    const win = getWindowFromEvent(event, getWindows())
    if (!win || win.isDestroyed()) {
      return
    }
    const workArea = getLegacyWorkAreaBounds(screen.getPrimaryDisplay())
    const values = require('./config-service').getValues()
    const ctrltype = values.CTRL_TYPE || values.ctrltype
    const next = resolveRendererWindowBounds(bounds, workArea, ctrltype)
    if (isVideoWallCtrl(ctrltype)) {
      clearExclusiveDisplayMode(win)
      win.setBounds(next)
      return
    }
    if (isExclusiveDisplayMode(win)) {
      return
    }
    win.setBounds(next)
  })

  ipcMain.on('window-load-url', (event, url) => {
    if (!validateSender(event, 'window-load-url')) {
      return
    }
    const win = getWindowFromEvent(event, getWindows())
    const config = getConfig()
    if (!win || !isAllowedMainNavigation(url, config)) {
      errorLog.warn('Blocked window-load-url', url)
      return
    }
    win.loadURL(url)
  })

  ipcMain.on('window-center', (event) => {
    if (!validateSender(event, 'window-center')) {
      return
    }
    const win = getWindowFromEvent(event, getWindows())
    if (win) {
      win.center()
    }
  })

  ipcMain.on('window-show', (event) => {
    if (!validateSender(event, 'window-show')) {
      return
    }
    const win = getWindowFromEvent(event, getWindows())
    if (win) {
      win.show()
    }
  })

  ipcMain.on('window-focus', (event) => {
    if (!validateSender(event, 'window-focus')) {
      return
    }
    const win = getWindowFromEvent(event, getWindows())
    if (win) {
      win.focus()
    }
  })

  ipcMain.on('window-open-devtools', (event) => {
    if (!validateSender(event, 'window-open-devtools')) {
      return
    }
    const values = require('./config-service').getValues()
    if (!values.ENABLE_DEVTOOLS && !values.DEV_MODE) {
      return
    }
    event.sender.openDevTools({ mode: 'detach' })
  })

  ipcMain.handle('app-urlstatus', async (event) => {
    if (!validateSender(event, 'app-urlstatus')) {
      return { currentDateTime: new Date().toISOString(), status: 'offline' }
    }
    const config = getConfig()
    const currentDateTime = require('date-and-time').format(new Date(), 'YYYY/MM/DD HH:mm:ss')
    try {
      const status = config && config.controller
        ? await isReachable('http://' + config.controller, { timeout: Number(config.timeout) || 10000 })
        : false
      playerLog.info('Device connection status', status ? 'online' : 'offline')
      if (status) {
        reloadPlayer()
      }
      return { currentDateTime, status: status ? 'online' : 'offline' }
    } catch (error) {
      errorLog.error('Network error while checking controller', error)
      return { currentDateTime, status: 'offline' }
    }
  })

  ipcMain.handle('app-get-mac', async (event) => {
    if (!validateSender(event, 'app-get-mac')) {
      return null
    }
    try {
      return await macaddress.one()
    } catch (error) {
      errorLog.warn('Failed to read MAC address', error)
      return null
    }
  })

  ipcMain.handle('app-qrcode', async (event, text) => {
    if (!validateSender(event, 'app-qrcode')) {
      return null
    }
    if (typeof text !== 'string' || text.length > 2000) {
      return null
    }
    return QRCode.toDataURL(text, { margin: 1, width: 280 })
  })

  ipcMain.handle('app-get-config', (event) => {
    if (!validateSender(event, 'app-get-config')) {
      return {}
    }
    return getConfig() || {}
  })

  /**
   * Trusted local media picker for Video Wall / Console.
   * Returns metadata + file:// URL only for explicitly selected files.
   * Does not expose arbitrary filesystem browsing APIs to the renderer.
   */
  ipcMain.handle('media-open-file', async (event, options = {}) => {
    if (!validateSender(event, 'media-open-file')) {
      return { ok: false, error: 'unauthorized' }
    }
    const { dialog } = require('electron')
    const fs = require('fs')
    const path = require('path')
    const { pathToFileURL } = require('url')
    const { BrowserWindow } = require('electron')

    const allowedExt = new Set([
      'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp',
      'mp4', 'webm', 'ogv', 'ogg', 'm4v', 'mov',
      'pdf'
    ])

    const parent = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(parent || undefined, {
      title: 'Select local media file',
      properties: ['openFile'],
      filters: [
        { name: 'Media', extensions: Array.from(allowedExt) },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (result.canceled || !result.filePaths || !result.filePaths.length) {
      return { ok: false, cancelled: true, files: [] }
    }

    const files = []
    for (const filePath of result.filePaths) {
      const resolved = path.resolve(filePath)
      const ext = path.extname(resolved).replace(/^\./, '').toLowerCase()
      if (!allowedExt.has(ext)) {
        continue
      }
      let stat
      try {
        stat = fs.statSync(resolved)
      } catch {
        continue
      }
      if (!stat.isFile()) {
        continue
      }
      files.push({
        name: path.basename(resolved),
        size: stat.size,
        mime: '',
        extension: ext,
        // Device-local URL for this player only — never persist as a server reference.
        url: pathToFileURL(resolved).toString(),
        // Absolute path intentionally omitted from renderer-facing payload.
        path: resolved
      })
    }

    return { ok: true, files }
  })

  ipcMain.on('app-get-config', (event) => {
    event.returnValue = getConfig() || {}
  })

  ipcMain.on('app-get-path', (event, name) => {
    if (name === 'home') {
      event.returnValue = getHomeDir()
      return
    }
    if (name === 'config') {
      event.returnValue = getConfigPath()
      return
    }
    event.returnValue = app.getAppPath()
  })

  ipcMain.on('app-get-version', (event) => {
    event.returnValue = app.getVersion()
  })

  /**
   * Google Meet (and similar) often fail inside <webview> guests but work in a
   * top-level BrowserWindow. SlotMeetingCast requests this for Electron players.
   */
  ipcMain.handle('meeting-open-window', (event, payload = {}) => {
    if (!validateSender(event, 'meeting-open-window')) {
      return { ok: false, error: 'unauthorized' }
    }
    const parent = getWindowFromEvent(event, getWindows())
    return openMeetingWindow({
      slotId: payload.slotId,
      url: payload.url,
      bounds: payload.bounds,
      displayName: payload.displayName,
      platform: payload.platform,
      parent
    })
  })

  ipcMain.handle('meeting-close-window', (event, payload = {}) => {
    if (!validateSender(event, 'meeting-close-window')) {
      return { ok: false, error: 'unauthorized' }
    }
    return closeMeetingWindow(payload.slotId)
  })

  ipcMain.handle('meeting-update-bounds', (event, payload = {}) => {
    if (!validateSender(event, 'meeting-update-bounds')) {
      return { ok: false, error: 'unauthorized' }
    }
    return updateMeetingBounds(payload.slotId, payload.bounds || {})
  })

  ipcMain.handle('meeting-get-user-agent', (event) => {
    if (!validateSender(event, 'meeting-get-user-agent')) {
      return { ok: false, error: 'unauthorized' }
    }
    return { ok: true, userAgent: chromeLikeUserAgent() }
  })
}

function formatDateTime(date = new Date()) {
  return require('date-and-time').format(date, 'YYYY/MM/DD HH:mm:ss')
}

module.exports = {
  registerIpcHandlers,
  isValidAccelerator,
  formatDateTime,
  closeAllMeetingWindows
}
