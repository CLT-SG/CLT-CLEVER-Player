'use strict'

const { isValidHost, isPrivateHost } = require('./config-template')

const LOG_LEVELS = ['error', 'warn', 'info', 'verbose', 'debug', 'silly']
const CTRL_TYPES = ['console', 'videowall']
const UPDATE_CHANNELS = ['latest', 'beta', 'alpha']

const SCHEMA = [
  { section: 'PLAYER', key: 'PLAYER_NAME', type: 'string', default: 'Player-01', comment: 'Display name for this player' },
  { section: 'PLAYER', key: 'PLAYER_LOCATION', type: 'string', default: '', comment: 'Optional site or room name' },
  { section: 'PLAYER', key: 'PLAYER_DESCRIPTION', type: 'string', default: '', comment: 'Optional description' },
  { section: 'PLAYER', key: 'PLAYER_GROUP', type: 'string', default: '', comment: 'Optional player group' },
  { section: 'PLAYER', key: 'PLAYER_TAGS', type: 'string', default: '', comment: 'Optional comma-separated tags' },
  { section: 'PLAYER', key: 'SERIAL_KEY', type: 'string', default: '', comment: 'License / activation serial key' },
  { section: 'PLAYER', key: 'TEMPLATE_ID', type: 'string', default: '1', comment: 'Playlist / template id from CLEVER' },
  { section: 'PLAYER', key: 'CTRL_TYPE', type: 'enum', values: CTRL_TYPES, default: 'console', comment: 'console or videowall' },

  { section: 'DEVICE', key: 'DEVICE_ID', type: 'string', default: '', comment: 'Optional device identifier' },
  { section: 'DEVICE', key: 'DEVICE_SERIAL', type: 'string', default: '', comment: 'Optional hardware serial' },
  { section: 'DEVICE', key: 'DEVICE_TYPE', type: 'string', default: 'console', comment: 'Device type (console or videowall)' },

  { section: 'SERVER', key: 'SERVER_URL', type: 'url', default: '', comment: 'Optional full server URL, for example https://server.domain.com' },
  { section: 'SERVER', key: 'API_URL', type: 'url', default: '', comment: 'Optional API URL, for example https://server.domain.com/api' },
  { section: 'SERVER', key: 'HOST', type: 'host', default: '127.0.0.1', comment: 'CLEVER server IP or hostname (no http://)' },
  { section: 'SERVER', key: 'CONTROLLER_PORT', type: 'port', default: 80, comment: 'CLEVER controller port' },
  { section: 'SERVER', key: 'WEB_PORT', type: 'port', default: 9100, comment: 'CLEVER web hosting port' },
  { section: 'SERVER', key: 'MEDIA_PORT', type: 'port', default: 9200, comment: 'Media server port' },
  { section: 'SERVER', key: 'SCREEN_PORT', type: 'port', default: 9300, comment: 'Screen cast web port' },
  { section: 'SERVER', key: 'SCREEN_API_PORT', type: 'port', default: 9301, comment: 'Screen cast API port' },
  { section: 'SERVER', key: 'REMOTE_DESKTOP_PORT', type: 'port', default: 9400, comment: 'Remote desktop port' },
  { section: 'SERVER', key: 'HEARTBEAT_INTERVAL', type: 'integer', min: 5, max: 3600, default: 30, comment: 'Heartbeat interval in seconds' },
  { section: 'SERVER', key: 'HEARTBEAT_RETRY', type: 'integer', min: 0, max: 20, default: 3, comment: 'Heartbeat retry count' },
  { section: 'SERVER', key: 'SYNC_INTERVAL', type: 'integer', min: 5, max: 3600, default: 60, comment: 'Content sync interval in seconds' },

  { section: 'DISPLAY', key: 'FULLSCREEN', type: 'boolean', default: true, comment: 'Open the player in fullscreen' },
  { section: 'DISPLAY', key: 'KIOSK_MODE', type: 'boolean', default: true, comment: 'Lock the window as a kiosk' },

  { section: 'CONTENT', key: 'CACHE_ENABLED', type: 'boolean', default: true, comment: 'Enable local content cache' },
  { section: 'CONTENT', key: 'CACHE_PATH', type: 'path', default: 'cache', comment: 'Cache folder (relative to ~/clever-console or absolute)' },
  { section: 'CONTENT', key: 'CACHE_SIZE_MB', type: 'integer', min: 1, max: 1000000, default: 5000, comment: 'Maximum cache size in megabytes' },
  { section: 'CONTENT', key: 'CACHE_CLEANUP_DAYS', type: 'integer', min: 1, max: 3650, default: 30, comment: 'Delete unused cache files after this many days' },
  { section: 'CONTENT', key: 'DOWNLOAD_RETRY', type: 'integer', min: 0, max: 20, default: 3, comment: 'Download retry count' },

  { section: 'PLAYBACK', key: 'DEFAULT_VOLUME', type: 'integer', min: 0, max: 100, default: 80, comment: 'Default volume 0-100' },
  { section: 'PLAYBACK', key: 'MUTE', type: 'boolean', default: false, comment: 'Start muted' },
  { section: 'PLAYBACK', key: 'WEBVIEW_ZOOM', type: 'integer', min: 25, max: 500, default: 100, comment: 'Webview zoom percent' },
  { section: 'PLAYBACK', key: 'PLAYBACK_RETRY_COUNT', type: 'integer', min: 0, max: 20, default: 3, comment: 'Playback retry count' },
  { section: 'PLAYBACK', key: 'MEDIA_TIMEOUT', type: 'integer', min: 1, max: 3600, default: 60, comment: 'Media timeout in seconds' },
  { section: 'PLAYBACK', key: 'MEDIA_LOAD_TIMEOUT', type: 'integer', min: 1, max: 3600, default: 60, comment: 'Media load timeout in seconds' },
  { section: 'PLAYBACK', key: 'WEBVIEW_LOAD_TIMEOUT', type: 'integer', min: 1, max: 3600, default: 120, comment: 'Webview load timeout in seconds' },
  { section: 'PLAYBACK', key: 'PDF_RENDER_TIMEOUT', type: 'integer', min: 1, max: 3600, default: 60, comment: 'PDF render timeout in seconds' },

  { section: 'SCREENSHOT', key: 'SCREENSHOT_ENABLED', type: 'boolean', default: true, comment: 'Allow local screenshot API' },
  { section: 'SCREENSHOT', key: 'SCREENSHOT_INTERVAL', type: 'integer', min: 5, max: 86400, default: 300, comment: 'Screenshot interval in seconds' },
  { section: 'SCREENSHOT', key: 'SCREENSHOT_QUALITY', type: 'integer', min: 1, max: 100, default: 80, comment: 'Screenshot quality 1-100' },

  { section: 'MONITORING', key: 'CPU_MONITORING', type: 'boolean', default: true, comment: 'Allow CPU info API' },
  { section: 'MONITORING', key: 'MEMORY_MONITORING', type: 'boolean', default: true, comment: 'Track memory usage in logs' },
  { section: 'MONITORING', key: 'NETWORK_MONITORING', type: 'boolean', default: true, comment: 'Track network reachability' },
  { section: 'MONITORING', key: 'STORAGE_MONITORING', type: 'boolean', default: true, comment: 'Track storage usage in logs' },

  { section: 'WATCHDOG', key: 'WATCHDOG_ENABLED', type: 'boolean', default: true, comment: 'Enable crash watchdog' },
  { section: 'WATCHDOG', key: 'WATCHDOG_RESTART_ON_CRASH', type: 'boolean', default: true, comment: 'Relaunch after a renderer crash' },
  { section: 'WATCHDOG', key: 'WATCHDOG_MAX_CRASH_COUNT', type: 'integer', min: 1, max: 50, default: 5, comment: 'Max relaunches per minute' },

  { section: 'RECOVERY', key: 'AUTO_RECOVER_WEBVIEW', type: 'boolean', default: true, comment: 'Reload the window after a content load failure' },
  { section: 'RECOVERY', key: 'AUTO_RECOVER_PLAYLIST', type: 'boolean', default: true, comment: 'Reload playlist after a push failure' },
  { section: 'RECOVERY', key: 'AUTO_RECOVER_NETWORK', type: 'boolean', default: true, comment: 'Retry when the controller is offline' },

  { section: 'LOGGING', key: 'LOG_LEVEL', type: 'enum', values: LOG_LEVELS, default: 'info', comment: 'error, warn, info, verbose, debug, or silly' },
  { section: 'LOGGING', key: 'LOG_RETENTION_DAYS', type: 'integer', min: 1, max: 3650, default: 30, comment: 'Delete archived logs after this many days' },
  { section: 'LOGGING', key: 'MAX_LOG_SIZE_MB', type: 'integer', min: 1, max: 1024, default: 100, comment: 'Rotate each log file at this size' },

  { section: 'UPDATER', key: 'AUTO_UPDATE', type: 'boolean', default: true, comment: 'Check GitHub Releases for updates' },
  { section: 'UPDATER', key: 'UPDATE_CHANNEL', type: 'enum', values: UPDATE_CHANNELS, default: 'latest', comment: 'latest, beta, or alpha' },
  { section: 'UPDATER', key: 'CHECK_INTERVAL_HOURS', type: 'integer', min: 1, max: 168, default: 6, comment: 'Hours between update checks' },
  { section: 'UPDATER', key: 'AUTO_INSTALL_ON_RESTART', type: 'boolean', default: true, comment: 'Install a downloaded update on restart' },

  { section: 'NETWORK', key: 'OFFLINE_MODE', type: 'boolean', default: false, comment: 'Skip server checks and stay on the offline page' },
  { section: 'NETWORK', key: 'NETWORK_TIMEOUT', type: 'integer', min: 1, max: 300, default: 30, comment: 'Network timeout in seconds' },

  { section: 'ADVANCED', key: 'DEV_MODE', type: 'boolean', default: false, comment: 'Development mode (skips auto-update)' },
  { section: 'ADVANCED', key: 'DEBUG_MODE', type: 'boolean', default: false, comment: 'Write extra debug logs' },
  { section: 'ADVANCED', key: 'ENABLE_DEVTOOLS', type: 'boolean', default: false, comment: 'Allow developer tools (Alt+Insert)' }
]

const FIELD_BY_KEY = new Map()
for (const field of SCHEMA) {
  FIELD_BY_KEY.set(field.key, field)
  FIELD_BY_KEY.set(`${field.section}.${field.key}`, field)
}

function getDefaultSections() {
  const sections = {}
  for (const field of SCHEMA) {
    if (!sections[field.section]) {
      sections[field.section] = {}
    }
    sections[field.section][field.key] = field.default
  }
  return sections
}

function getDefaultFlat() {
  const values = {}
  for (const field of SCHEMA) {
    values[field.key] = field.default
  }
  return values
}

function parseBoolean(value) {
  if (typeof value === 'boolean') {
    return value
  }
  const text = String(value).trim().toLowerCase()
  if (['true', 'yes', '1', 'on'].includes(text)) {
    return true
  }
  if (['false', 'no', '0', 'off'].includes(text)) {
    return false
  }
  return null
}

function parseInteger(value) {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value
  }
  const text = String(value).trim()
  if (!/^-?\d+$/.test(text)) {
    return null
  }
  const parsed = Number.parseInt(text, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function parseUrl(value) {
  const text = String(value || '').trim()
  if (!text) {
    return ''
  }
  try {
    const parsed = new URL(text)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}

function parseHost(value) {
  const text = String(value || '').trim()
  if (!text) {
    return ''
  }
  if (/^https?:\/\//i.test(text)) {
    try {
      return new URL(text).hostname
    } catch {
      return null
    }
  }
  if (text.includes('/') || text.includes(' ')) {
    return null
  }
  const host = text.split(':')[0]
  return isValidHost(host) ? host : null
}

function parsePath(value) {
  const text = String(value || '').trim()
  if (!text || text.includes('\0')) {
    return null
  }
  return text
}

function coerceField(field, raw) {
  if (raw === undefined || raw === null || raw === '') {
    if (field.type === 'string' || field.type === 'url' || field.type === 'host' || field.type === 'path') {
      return { ok: true, value: field.default }
    }
    return { ok: true, value: field.default, skippedEmpty: true }
  }

  switch (field.type) {
    case 'boolean': {
      const parsed = parseBoolean(raw)
      if (parsed === null) {
        return { ok: false, value: field.default, reason: 'Invalid boolean' }
      }
      return { ok: true, value: parsed }
    }
    case 'integer':
    case 'port': {
      const parsed = parseInteger(raw)
      if (parsed === null) {
        return { ok: false, value: field.default, reason: 'Invalid number' }
      }
      const min = field.type === 'port' ? 1 : (field.min ?? Number.MIN_SAFE_INTEGER)
      const max = field.type === 'port' ? 65535 : (field.max ?? Number.MAX_SAFE_INTEGER)
      if (parsed < min || parsed > max) {
        return { ok: false, value: field.default, reason: `Value out of range (${min}-${max})` }
      }
      return { ok: true, value: parsed }
    }
    case 'url': {
      const parsed = parseUrl(raw)
      if (parsed === null) {
        return { ok: false, value: field.default, reason: 'Invalid URL' }
      }
      return { ok: true, value: parsed }
    }
    case 'host': {
      const parsed = parseHost(raw)
      if (parsed === null) {
        return { ok: false, value: field.default, reason: 'Invalid host' }
      }
      return { ok: true, value: parsed || field.default }
    }
    case 'path': {
      const parsed = parsePath(raw)
      if (parsed === null) {
        return { ok: false, value: field.default, reason: 'Invalid file path' }
      }
      return { ok: true, value: parsed }
    }
    case 'enum': {
      const text = String(raw).trim().toLowerCase()
      if (!(field.values || []).includes(text)) {
        return { ok: false, value: field.default, reason: `Must be one of: ${(field.values || []).join(', ')}` }
      }
      return { ok: true, value: text }
    }
    default:
      return { ok: true, value: String(raw) }
  }
}

function lookupRaw(parsed, field) {
  if (parsed[field.section] && Object.prototype.hasOwnProperty.call(parsed[field.section], field.key)) {
    return parsed[field.section][field.key]
  }
  if (parsed._ROOT && Object.prototype.hasOwnProperty.call(parsed._ROOT, field.key)) {
    return parsed._ROOT[field.key]
  }
  for (const values of Object.values(parsed)) {
    if (values && Object.prototype.hasOwnProperty.call(values, field.key)) {
      return values[field.key]
    }
  }
  return undefined
}

function validateAndApplyDefaults(parsed) {
  const sections = getDefaultSections()
  const warnings = []

  for (const field of SCHEMA) {
    const raw = lookupRaw(parsed || {}, field)
    const result = coerceField(field, raw)
    sections[field.section][field.key] = result.value
    if (!result.ok) {
      warnings.push({
        section: field.section,
        key: field.key,
        value: raw,
        reason: result.reason,
        used: result.value
      })
    }
  }

  for (const [section, values] of Object.entries(parsed || {})) {
    if (section === '_ROOT') {
      continue
    }
    for (const [key, value] of Object.entries(values || {})) {
      if (!FIELD_BY_KEY.has(key)) {
        if (!sections[section]) {
          sections[section] = {}
        }
        sections[section][key] = value
      }
    }
  }

  return { sections, warnings }
}

function flattenSections(sections) {
  const values = {}
  for (const field of SCHEMA) {
    values[field.key] = sections[field.section][field.key]
  }
  return values
}

function hostFromUrl(urlValue) {
  const parsed = parseUrl(urlValue)
  if (!parsed) {
    return ''
  }
  try {
    return new URL(parsed).hostname
  } catch {
    return ''
  }
}

function resolveHost(values) {
  const serverHost = hostFromUrl(values.SERVER_URL)
  const host = String(values.HOST || '').trim()
  const isLocalPlaceholder = !host || host === '127.0.0.1' || host === 'localhost'
  if (serverHost && isLocalPlaceholder) {
    return serverHost
  }
  if (host) {
    return host
  }
  return serverHost || '127.0.0.1'
}

function toLegacyConfig(sections, extras = {}) {
  const values = flattenSections(sections)
  const host = resolveHost(values)
  const controllerPort = String(values.CONTROLLER_PORT)
  const webPort = String(values.WEB_PORT)
  const mediaPort = String(values.MEDIA_PORT)
  const screenPort = String(values.SCREEN_PORT)
  const screenApiPort = String(values.SCREEN_API_PORT)
  const remotePort = String(values.REMOTE_DESKTOP_PORT)
  const ctrltype = CTRL_TYPES.includes(values.CTRL_TYPE)
    ? values.CTRL_TYPE
    : (CTRL_TYPES.includes(String(values.DEVICE_TYPE).toLowerCase()) ? String(values.DEVICE_TYPE).toLowerCase() : 'console')

  return {
    hostserver: host,
    controllerport: controllerPort,
    cleverwebport: webPort,
    mediaserverport: mediaPort,
    screenserverport: screenPort,
    screenapiport: screenApiPort,
    controller: `${host}:${controllerPort}`,
    cleverweb: `${host}:${webPort}`,
    mediaserver: `${host}:${mediaPort}`,
    screenserver: `${host}:${screenPort}`,
    screenapi: `${host}:${screenApiPort}`,
    remotedesktop: `${host}:${remotePort}`,
    controllerport1: controllerPort,
    cleverwebport1: webPort,
    mediaserverport1: mediaPort,
    screenserverport1: screenPort,
    screenapiport1: screenApiPort,
    timeout: Number(values.NETWORK_TIMEOUT) * 1000,
    tempid: String(values.TEMPLATE_ID),
    serialkey: String(values.SERIAL_KEY),
    ctrltype,
    playerName: values.PLAYER_NAME,
    settings: sections,
    values,
    ...extras
  }
}

function parseLegacyConfigJs(source) {
  const text = String(source || '')
  const read = (name) => {
    const pattern = new RegExp(`(?:var|const|let)\\s+${name}\\s*=\\s*(?:'([^']*)'|"([^"]*)"|([^;\\n]+))`)
    const match = text.match(pattern)
    if (!match) {
      return undefined
    }
    return (match[1] ?? match[2] ?? String(match[3] || '').trim())
  }

  return {
    hostserver: read('hostserver'),
    controllerport: read('controllerport'),
    cleverwebport: read('cleverwebport'),
    mediaserverport: read('mediaserverport'),
    screenserverport: read('screenserverport'),
    screenapiport: read('screenapiport'),
    tempid: read('tempid'),
    serialkey: read('serialkey'),
    ctrltype: read('ctrltype')
  }
}

function legacyJsToSections(legacy) {
  const sections = getDefaultSections()
  const host = parseHost(legacy.hostserver)
  if (host) {
    sections.SERVER.HOST = host
    sections.SERVER.SERVER_URL = `http://${host}`
  }
  const assignPort = (key, raw) => {
    const parsed = parseInteger(raw)
    if (parsed !== null && parsed >= 1 && parsed <= 65535) {
      sections.SERVER[key] = parsed
    }
  }
  assignPort('CONTROLLER_PORT', legacy.controllerport)
  assignPort('WEB_PORT', legacy.cleverwebport)
  assignPort('MEDIA_PORT', legacy.mediaserverport)
  assignPort('SCREEN_PORT', legacy.screenserverport)
  assignPort('SCREEN_API_PORT', legacy.screenapiport)
  if (legacy.tempid !== undefined && legacy.tempid !== null && String(legacy.tempid).trim() !== '') {
    sections.PLAYER.TEMPLATE_ID = String(legacy.tempid).trim()
  }
  if (legacy.serialkey) {
    sections.PLAYER.SERIAL_KEY = String(legacy.serialkey).trim()
  }
  const ctrl = String(legacy.ctrltype || '').trim().toLowerCase()
  if (CTRL_TYPES.includes(ctrl)) {
    sections.PLAYER.CTRL_TYPE = ctrl
    sections.DEVICE.DEVICE_TYPE = ctrl
  }
  return sections
}

module.exports = {
  SCHEMA,
  FIELD_BY_KEY,
  LOG_LEVELS,
  CTRL_TYPES,
  UPDATE_CHANNELS,
  getDefaultSections,
  getDefaultFlat,
  validateAndApplyDefaults,
  flattenSections,
  toLegacyConfig,
  parseLegacyConfigJs,
  legacyJsToSections,
  resolveHost,
  parseBoolean,
  parseInteger,
  parseUrl,
  parseHost,
  isPrivateHost,
  coerceField
}
