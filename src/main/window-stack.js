'use strict'

/**
 * Console mode uses two windows:
 * - mainWin  → preview / login (player surface)
 * - serverWin → management console (CLEVER-Service UI)
 *
 * Startup puts the console above login. Operators bring login forward
 * (Alt+PageUp / app-switchwindow) when they need to sign in.
 *
 * Video Wall mode never shows serverWin (no login / management chrome).
 *
 * Both windows may be always-on-top; use different Electron levels so the
 * preferred surface reliably stays above the other after first launch.
 */

const LEVEL_TOP = 'screen-saver'
const LEVEL_UNDER = 'floating'

/** @type {'console'|'login'} */
let preferredSurface = 'console'

function alive(win) {
  return Boolean(win && typeof win.isDestroyed === 'function' && !win.isDestroyed())
}

function showQuiet(win) {
  if (!alive(win)) return
  if (!win.isVisible()) {
    win.show()
  }
}

function setAlwaysOnTopLevel(win, level) {
  if (!alive(win) || typeof win.setAlwaysOnTop !== 'function') return
  try {
    win.setAlwaysOnTop(true, level)
  } catch {
    try {
      win.setAlwaysOnTop(true)
    } catch {
      // ignore
    }
  }
}

function raise(win) {
  if (!alive(win)) return
  showQuiet(win)
  try {
    if (typeof win.moveTop === 'function') {
      win.moveTop()
    }
  } catch {
    // ignore platform moveTop failures
  }
  try {
    win.focus()
  } catch {
    // ignore
  }
}

function applyStackLevels(topWin, underWin) {
  // Under first, then top — last raise wins on platforms that ignore levels.
  if (alive(underWin)) {
    setAlwaysOnTopLevel(underWin, LEVEL_UNDER)
    showQuiet(underWin)
  }
  if (alive(topWin)) {
    setAlwaysOnTopLevel(topWin, LEVEL_TOP)
    raise(topWin)
  }
}

/** Video Wall: only the preview surface. */
function hideConsoleChrome(serverWin) {
  if (!alive(serverWin)) return
  try {
    serverWin.hide()
  } catch {
    // ignore
  }
}

/** Console startup: login underneath, management console on top. */
function stackConsoleAboveLogin(mainWin, serverWin) {
  preferredSurface = 'console'
  if (alive(mainWin)) {
    showQuiet(mainWin)
  }
  if (alive(serverWin)) {
    applyStackLevels(serverWin, mainWin)
  }
  return preferredSurface
}

/** Operator wants login / preview over the management console. */
function stackLoginAboveConsole(mainWin, serverWin) {
  preferredSurface = 'login'
  if (alive(serverWin)) {
    showQuiet(serverWin)
  }
  if (alive(mainWin)) {
    applyStackLevels(mainWin, serverWin)
  }
  return preferredSurface
}

/**
 * Re-assert the preferred surface after async loads / focus races.
 * @returns {'console'|'login'|null}
 */
function enforcePreferredStack(mainWin, serverWin) {
  if (!alive(mainWin) || !alive(serverWin) || !serverWin.isVisible()) {
    return null
  }
  if (preferredSurface === 'login') {
    return stackLoginAboveConsole(mainWin, serverWin)
  }
  return stackConsoleAboveLogin(mainWin, serverWin)
}

function getPreferredSurface() {
  return preferredSurface
}

/**
 * Toggle which surface is on top (Alt+PageUp / app-switchwindow).
 * Uses preferredSurface so focus races do not invert the operator intent.
 * @returns {'login'|'console'|null}
 */
function toggleConsoleLoginStack(mainWin, serverWin) {
  if (!alive(mainWin) || !alive(serverWin)) {
    return null
  }
  if (preferredSurface === 'console') {
    return stackLoginAboveConsole(mainWin, serverWin)
  }
  return stackConsoleAboveLogin(mainWin, serverWin)
}

module.exports = {
  LEVEL_TOP,
  LEVEL_UNDER,
  hideConsoleChrome,
  stackConsoleAboveLogin,
  stackLoginAboveConsole,
  toggleConsoleLoginStack,
  enforcePreferredStack,
  getPreferredSurface,
  raise,
}
