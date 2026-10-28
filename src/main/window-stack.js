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
 */

function alive(win) {
  return Boolean(win && typeof win.isDestroyed === 'function' && !win.isDestroyed())
}

function showQuiet(win) {
  if (!alive(win)) return
  if (!win.isVisible()) {
    win.show()
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
  if (alive(mainWin)) {
    showQuiet(mainWin)
  }
  if (alive(serverWin)) {
    raise(serverWin)
  }
}

/** Operator wants login / preview over the management console. */
function stackLoginAboveConsole(mainWin, serverWin) {
  if (alive(serverWin)) {
    showQuiet(serverWin)
  }
  if (alive(mainWin)) {
    raise(mainWin)
  }
}

/**
 * Toggle which surface is on top (Alt+PageUp / app-switchwindow).
 * @returns {'login'|'console'|null}
 */
function toggleConsoleLoginStack(mainWin, serverWin) {
  if (!alive(mainWin) || !alive(serverWin)) {
    return null
  }
  if (mainWin.isFocused()) {
    stackConsoleAboveLogin(mainWin, serverWin)
    return 'console'
  }
  stackLoginAboveConsole(mainWin, serverWin)
  return 'login'
}

module.exports = {
  hideConsoleChrome,
  stackConsoleAboveLogin,
  stackLoginAboveConsole,
  toggleConsoleLoginStack,
  raise,
}
