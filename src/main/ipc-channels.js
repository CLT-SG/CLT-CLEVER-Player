'use strict'

const SEND_CHANNELS = Object.freeze([
  'app-exit',
  'app-update-id',
  'app-savelog',
  'app-reload',
  'app-mainreload',
  'app-resetdefault',
  'app-configsave',
  'app-switchwindow',
  'app-registerShortkey',
  'app-unregisterShortkey',
  'window-set-bounds',
  'window-load-url',
  'window-center',
  'window-show',
  'window-focus',
  'window-open-devtools',
  'updater-install',
  'updater-check'
])

const INVOKE_CHANNELS = Object.freeze([
  'app-urlstatus',
  'app-get-mac',
  'app-qrcode',
  'app-get-config',
  'updater-status'
])

const RECEIVE_CHANNELS = Object.freeze([
  'app-shortkeyRefresh',
  'updater-status'
])

const SYNC_CHANNELS = Object.freeze([
  'app-get-path',
  'app-get-config',
  'app-get-version'
])

function isAllowed(list, channel) {
  return typeof channel === 'string' && list.includes(channel)
}

module.exports = {
  SEND_CHANNELS,
  INVOKE_CHANNELS,
  RECEIVE_CHANNELS,
  SYNC_CHANNELS,
  isAllowed
}
