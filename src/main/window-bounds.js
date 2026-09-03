'use strict'

function getLegacyWorkAreaBounds(display) {
  const workArea = (display && display.workArea) || { width: 0, height: 0 }
  return {
    x: 0,
    y: 0,
    width: Math.max(0, Math.floor(Number(workArea.width) || 0)),
    height: Math.max(0, Math.floor(Number(workArea.height) || 0))
  }
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

module.exports = {
  getLegacyWorkAreaBounds,
  resolveWindowChrome
}
