'use strict'

const { isPrivateHost } = require('./config-template')

function parseUrl(value) {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

/**
 * ScreencastApp websockify is HTTPS on the LAN (wss://<ip>:8840/screenN).
 * The player already accepts certificate errors for private HTTPS pages.
 * WebSocket handshakes use wss: and must follow the same LAN policy,
 * otherwise Video Wall and Console stay on Connecting / Reconnecting.
 */
function isTrustedLanHost(hostname) {
  if (!hostname) {
    return false
  }
  if (isPrivateHost(hostname)) {
    return true
  }
  return /\.local$/i.test(String(hostname))
}

function shouldAcceptCertificate(urlValue) {
  const parsed = parseUrl(urlValue)
  if (!parsed) {
    return false
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'wss:') {
    return false
  }
  return isTrustedLanHost(parsed.hostname)
}

module.exports = {
  isTrustedLanHost,
  shouldAcceptCertificate
}
