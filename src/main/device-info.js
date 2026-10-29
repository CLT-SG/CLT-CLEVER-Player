'use strict'

const os = require('os')
const { getOrCreateDeviceId } = require('./device-id')
const configService = require('./config-service')

function getScreen() {
  try {
    return require('electron').screen
  } catch {
    return null
  }
}

function primaryLanIp() {
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return '127.0.0.1'
}

function collectMonitors() {
  try {
    const screen = getScreen()
    if (!screen || typeof screen.getAllDisplays !== 'function') {
      return []
    }
    const displays = screen.getAllDisplays()
    const primaryId = screen.getPrimaryDisplay().id
    return displays.map((display, index) => {
      const bounds = display.bounds || {}
      const size = display.size || {}
      const width = size.width || bounds.width || 0
      const height = size.height || bounds.height || 0
      return {
        id: String(display.id),
        name: `Monitor ${index + 1}`,
        index,
        x: bounds.x || 0,
        y: bounds.y || 0,
        width,
        height,
        resolution: width && height ? `${width}x${height}` : null,
        scaleFactor: display.scaleFactor,
        rotation: display.rotation,
        refreshRate: display.displayFrequency || null,
        primary: display.id === primaryId,
        online: true
      }
    })
  } catch {
    return []
  }
}

function buildDeviceInfo(extra) {
  const values = configService.getValues()
  const pkg = (() => {
    try {
      return require('../../package.json')
    } catch {
      return { version: '0.0.0' }
    }
  })()
  const monitors = collectMonitors()
  const primary = monitors.find((m) => m.primary) || monitors[0] || null

  return Object.assign({
    deviceId: getOrCreateDeviceId(),
    hostname: os.hostname(),
    hostnameLocal: os.hostname(),
    ip: primaryLanIp(),
    os: process.platform,
    osArch: process.arch,
    appVersion: pkg.version,
    playerPort: 9000,
    ctrlType: values.CTRL_TYPE || 'console',
    videowallId: values.VIDEOWALL_ID || null,
    templateId: values.TEMPLATE_ID || null,
    monitors,
    primaryDisplay: primary,
    capabilities: {
      display: {
        multiMonitor: monitors.length > 1,
        fullscreen: true,
        kiosk: process.platform !== 'darwin',
        alwaysOnTop: true,
        resolutionChange: false,
        note: 'Resolution changes require OS display settings; player reports actual modes only'
      },
      audio: {
        applicationVolume: true,
        systemVolume: true,
        mute: true,
        outputDevice: true,
        note: 'OSD Audio & Output controls OS master volume/mute when host tools allow; application mute is separate and global (not per-slot)'
      },
      roles: ['videowall', 'console'],
      heartbeat: true,
      configSync: true
    },
    reportedConfig: {
      fullscreen: !!values.FULLSCREEN,
      kioskMode: !!values.KIOSK_MODE,
      alwaysOnTop: values.ALWAYS_ON_TOP !== false,
      logLevel: values.LOG_LEVEL || 'info',
      heartbeatInterval: values.HEARTBEAT_INTERVAL || 30
    }
  }, extra || {})
}

module.exports = {
  buildDeviceInfo,
  collectMonitors,
  primaryLanIp
}
