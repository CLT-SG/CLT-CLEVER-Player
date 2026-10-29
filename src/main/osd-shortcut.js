'use strict'

const configService = require('./config-service')
const { getLoggers } = require('./logger')
const {
  DEFAULT_OSD_SHORTCUTS,
  normalizeShortcutList,
} = require('./osd-shortcut-helpers')

let registeredShortcuts = []
let getWindowsRef = null

function getGlobalShortcut() {
  // Lazy require so unit tests can import pure helpers without Electron.
  return require('electron').globalShortcut
}

function setOsdShortcutWindows(getWindows) {
  getWindowsRef = typeof getWindows === 'function' ? getWindows : null
}

function requestConsoleOsdToggle() {
  const { log, errorLog } = getLoggers()
  const cfg = configService.getValues()
  const isConsole = cfg.CTRL_TYPE === 'console' || cfg.ctrltype === 'console'
  const windows = getWindowsRef ? getWindowsRef() : {}
  const mainWin = windows && windows.mainWin
  const serverWin = windows && windows.serverWin

  if (!isConsole || !mainWin || mainWin.isDestroyed()) {
    return
  }
  if (!mainWin.isFocused() && !(serverWin && !serverWin.isDestroyed() && serverWin.isFocused())) {
    return
  }
  try {
    mainWin.webContents.send('app-toggleOsd')
    if (serverWin && !serverWin.isDestroyed() && serverWin.isFocused()) {
      mainWin.show()
      mainWin.focus()
    }
    log.info('Console OSD toggle requested')
  } catch (error) {
    errorLog.warn('Failed to toggle Console OSD', error)
  }
}

function unregisterOsdShortcuts() {
  const { errorLog } = getLoggers()
  const globalShortcut = getGlobalShortcut()
  registeredShortcuts.forEach((shortkey) => {
    try {
      globalShortcut.unregister(shortkey)
    } catch (error) {
      errorLog.warn('Failed to unregister OSD shortcut', shortkey, error)
    }
  })
  registeredShortcuts = []
}

function registerOsdShortcuts(primary, alternate) {
  const { log, errorLog } = getLoggers()
  const globalShortcut = getGlobalShortcut()
  const next = normalizeShortcutList(primary, alternate)
  unregisterOsdShortcuts()
  next.forEach((shortkey) => {
    try {
      globalShortcut.register(shortkey, () => requestConsoleOsdToggle())
      registeredShortcuts.push(shortkey)
      log.info('Registered Console OSD shortcut', shortkey)
    } catch (error) {
      errorLog.error('Failed to register OSD shortcut', shortkey, error)
    }
  })
  return registeredShortcuts.slice()
}

function registerDefaultOsdShortcut(getWindows) {
  setOsdShortcutWindows(getWindows)
  return registerOsdShortcuts(DEFAULT_OSD_SHORTCUTS[0], '')
}

module.exports = {
  DEFAULT_OSD_SHORTCUTS,
  setOsdShortcutWindows,
  requestConsoleOsdToggle,
  normalizeShortcutList,
  unregisterOsdShortcuts,
  registerOsdShortcuts,
  registerDefaultOsdShortcut,
}
