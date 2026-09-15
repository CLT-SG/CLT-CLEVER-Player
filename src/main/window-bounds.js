'use strict'

function getWorkAreaFrom(displayOrWorkArea) {
  if (displayOrWorkArea && displayOrWorkArea.workArea) {
    return displayOrWorkArea.workArea
  }
  return displayOrWorkArea || { width: 0, height: 0 }
}

function getLegacyWorkAreaBounds(display) {
  const workArea = getWorkAreaFrom(display)
  return {
    x: 0,
    y: 0,
    width: Math.max(0, Math.floor(Number(workArea.width) || 0)),
    height: Math.max(0, Math.floor(Number(workArea.height) || 0))
  }
}

function clampBoundsToWorkArea(requested, displayOrWorkArea) {
  const area = getLegacyWorkAreaBounds(displayOrWorkArea)
  const reqW = Math.floor(Number(requested && requested.width) || 0)
  const reqH = Math.floor(Number(requested && requested.height) || 0)
  const width = area.width > 0 ? area.width : Math.max(100, reqW)
  const height = area.height > 0 ? area.height : Math.max(100, reqH)
  return {
    x: 0,
    y: 0,
    width: Math.max(100, width),
    height: Math.max(100, height)
  }
}

function sanitizeWindowBounds(requested, fallback) {
  const width = Math.max(
    100,
    Math.floor(Number(requested && requested.width) || Number(fallback && fallback.width) || 100)
  )
  const height = Math.max(
    100,
    Math.floor(Number(requested && requested.height) || Number(fallback && fallback.height) || 100)
  )
  return { x: 0, y: 0, width, height }
}

function isVideoWallCtrl(valuesOrType) {
  if (typeof valuesOrType === 'string') {
    return valuesOrType === 'videowall'
  }
  return Boolean(valuesOrType && (valuesOrType.CTRL_TYPE === 'videowall' || valuesOrType.ctrltype === 'videowall'))
}

function resolveRendererWindowBounds(requested, displayOrWorkArea, ctrltype) {
  if (isVideoWallCtrl(ctrltype)) {
    return sanitizeWindowBounds(requested, getLegacyWorkAreaBounds(displayOrWorkArea))
  }
  return clampBoundsToWorkArea(requested, displayOrWorkArea)
}

function resolveWindowChrome(values = {}) {
  const kiosk = values.KIOSK_MODE === true
  const fullscreen = !kiosk && values.FULLSCREEN === true
  return {
    kiosk,
    fullscreen,
    fullscreenable: kiosk || fullscreen,
    alwaysOnTop: values.ALWAYS_ON_TOP !== false
  }
}

function clearExclusiveDisplayMode(win) {
  try {
    if (typeof win.setKiosk === 'function') {
      win.setKiosk(false)
    }
    if (typeof win.setFullScreen === 'function') {
      win.setFullScreen(false)
    }
  } catch {
    // Some platforms reject kiosk/fullscreen changes while the window is hidden.
  }
}

function isExclusiveDisplayMode(win) {
  try {
    if (typeof win.isKiosk === 'function' && win.isKiosk()) {
      return true
    }
    if (typeof win.isFullScreen === 'function' && win.isFullScreen()) {
      return true
    }
  } catch {
    return false
  }
  return false
}

function applyWindowMode(win, values, display) {
  if (!win || (typeof win.isDestroyed === 'function' && win.isDestroyed())) {
    return null
  }
  const chrome = resolveWindowChrome(values)
  const bounds = getLegacyWorkAreaBounds(display)

  // Video Wall size is owned by the renderer (template resolution). Kiosk and
  // Electron fullscreen would force the monitor size instead of that layout.
  if (isVideoWallCtrl(values)) {
    clearExclusiveDisplayMode(win)
    return null
  }

  try {
    if (chrome.kiosk) {
      if (typeof win.setKiosk === 'function') {
        win.setKiosk(true)
      }
      return bounds
    }
    if (typeof win.setKiosk === 'function') {
      win.setKiosk(false)
    }
    if (chrome.fullscreen) {
      if (typeof win.setFullScreen === 'function') {
        win.setFullScreen(true)
      }
      return bounds
    }
    if (typeof win.setFullScreen === 'function') {
      win.setFullScreen(false)
    }
  } catch {
    // Some platforms reject kiosk/fullscreen changes while the window is hidden.
  }
  if (typeof win.setBounds === 'function') {
    win.setBounds(bounds)
  }
  return bounds
}

module.exports = {
  getLegacyWorkAreaBounds,
  clampBoundsToWorkArea,
  sanitizeWindowBounds,
  resolveRendererWindowBounds,
  isVideoWallCtrl,
  clearExclusiveDisplayMode,
  isExclusiveDisplayMode,
  resolveWindowChrome,
  applyWindowMode
}
