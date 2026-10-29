'use strict'

/**
 * Console mode uses two windows:
 * - mainWin  → Console login / preview (player surface)
 * - serverWin → management UI (CLEVER-Service)
 *
 * Startup keeps Console login/preview on top. Operators bring management
 * forward with Alt+PageUp / app-switchwindow.
 *
 * Video Wall mode never shows serverWin (no login / management chrome).
 *
 * Both windows may be always-on-top; use different Electron levels and an
 * explicit demote/raise sequence so the preferred surface stays above after
 * first launch and load/focus races.
 */

const LEVEL_TOP = 'screen-saver'
const LEVEL_UNDER = 'floating'

/** @type {'player'|'management'} preferred top surface */
let preferredSurface = 'player'

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
    // Some hosts ignore level changes unless always-on-top is cleared first.
    win.setAlwaysOnTop(false)
  } catch {
    // ignore
  }
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

function blurQuiet(win) {
  if (!alive(win) || typeof win.blur !== 'function') return
  try {
    win.blur()
  } catch {
    // ignore
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
  // Demote under window first, then raise top — last raise wins on platforms
  // that ignore always-on-top levels.
  if (alive(underWin)) {
    setAlwaysOnTopLevel(underWin, LEVEL_UNDER)
    showQuiet(underWin)
    blurQuiet(underWin)
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

/**
 * Raise management UI (serverWin) above Console login/preview.
 * Kept name for existing call sites / IPC toggle.
 */
function stackConsoleAboveLogin(mainWin, serverWin) {
  preferredSurface = 'management'
  if (alive(mainWin)) {
    showQuiet(mainWin)
  }
  if (alive(serverWin)) {
    applyStackLevels(serverWin, mainWin)
  }
  return preferredSurface
}

/**
 * Default: Console login/preview (mainWin) above management UI.
 * Kept name for existing call sites.
 */
function stackLoginAboveConsole(mainWin, serverWin) {
  preferredSurface = 'player'
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
 * @returns {'player'|'management'|null}
 */
function enforcePreferredStack(mainWin, serverWin) {
  if (!alive(mainWin) || !alive(serverWin) || !serverWin.isVisible()) {
    return null
  }
  if (preferredSurface === 'management') {
    return stackConsoleAboveLogin(mainWin, serverWin)
  }
  return stackLoginAboveConsole(mainWin, serverWin)
}

function getPreferredSurface() {
  return preferredSurface
}

/**
 * Toggle which surface is on top (Alt+PageUp / app-switchwindow).
 * @returns {'player'|'management'|null}
 */
function toggleConsoleLoginStack(mainWin, serverWin) {
  if (!alive(mainWin) || !alive(serverWin)) {
    return null
  }
  if (preferredSurface === 'player') {
    return stackConsoleAboveLogin(mainWin, serverWin)
  }
  return stackLoginAboveConsole(mainWin, serverWin)
}

/**
 * Schedule a few re-asserts after startup so a late management focus cannot
 * permanently cover Console login/preview.
 */
function schedulePreferredStackEnforcement(mainWin, serverWin, delays) {
  const waitMs = Array.isArray(delays) && delays.length ? delays : [0, 250, 750, 1500]
  waitMs.forEach((ms) => {
    setTimeout(() => {
      enforcePreferredStack(mainWin, serverWin)
    }, Math.max(0, Number(ms) || 0))
  })
}

module.exports = {
  LEVEL_TOP,
  LEVEL_UNDER,
  hideConsoleChrome,
  stackConsoleAboveLogin,
  stackLoginAboveConsole,
  toggleConsoleLoginStack,
  enforcePreferredStack,
  schedulePreferredStackEnforcement,
  getPreferredSurface,
  raise,
}
