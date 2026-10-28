'use strict'

const http = require('http')
const https = require('https')
const { URL } = require('url')
const configService = require('./config-service')
const {
  getOrCreateDeviceId,
  getStoredDeviceToken,
  storeDeviceToken,
  getAppliedConfigRevision,
  storeAppliedConfigRevision
} = require('./device-id')
const { buildDeviceInfo } = require('./device-info')
const { getLoggers } = require('./logger')

let heartbeatTimer = null
let lastAppliedRevision = 0
let applyConfigHandler = null
let applyingRevision = null
let pendingConfigError = null

function loadPersistedRevision() {
  try {
    lastAppliedRevision = Number(getAppliedConfigRevision()) || 0
  } catch {
    lastAppliedRevision = 0
  }
}

function controllerBase() {
  const values = configService.getValues()
  const host = values.HOST || '127.0.0.1'
  const port = Number(values.CONTROLLER_PORT) || 80
  const proto = port === 443 ? 'https' : 'http'
  return `${proto}://${host}:${port}`
}

function postJson(pathname, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    let url
    try {
      url = new URL(pathname, controllerBase())
    } catch (err) {
      return reject(err)
    }
    const payload = Buffer.from(JSON.stringify(body || {}))
    const lib = url.protocol === 'https:' ? https : http
    const req = lib.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload.length,
        Accept: 'application/json'
      },
      timeout: timeoutMs || 8000,
      rejectUnauthorized: false
    }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let json = null
        try {
          json = text ? JSON.parse(text) : {}
        } catch {
          json = { raw: text }
        }
        if (res.statusCode >= 400) {
          const err = new Error((json && json.message) || `HTTP ${res.statusCode}`)
          err.statusCode = res.statusCode
          err.body = json
          return reject(err)
        }
        resolve(json)
      })
    })
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy(new Error('timeout'))
    })
    req.write(payload)
    req.end()
  })
}

function setApplyConfigHandler(fn) {
  applyConfigHandler = typeof fn === 'function' ? fn : null
}

function currentAppliedRole() {
  const values = configService.getValues()
  const role = String(values.CTRL_TYPE || values.ctrltype || '').toLowerCase()
  return role === 'console' ? 'console' : 'videowall'
}

async function tryClaimPendingToken(deviceId) {
  try {
    const result = await postJson('/api/player/claim', { deviceId })
    if (result && result.deviceToken) {
      storeDeviceToken(result.deviceToken)
      return result.deviceToken
    }
  } catch {
    // no pending claim
  }
  return null
}

async function announce() {
  const { playerLog, errorLog } = getLoggers()
  loadPersistedRevision()
  const info = buildDeviceInfo()
  let token = getStoredDeviceToken()
  if (!token) {
    token = await tryClaimPendingToken(info.deviceId)
  }
  const body = Object.assign({}, info, {
    deviceToken: token || undefined,
    configAppliedRevision: lastAppliedRevision,
    appliedRole: currentAppliedRole()
  })
  try {
    const result = await postJson('/api/player/announce', body)
    playerLog.info('Announced to CLEVER-Service', {
      registrationStatus: result.registrationStatus,
      deviceId: info.deviceId
    })
    if (result.deviceToken) {
      storeDeviceToken(result.deviceToken)
    }
    if (result.registrationStatus === 'registered' && !getStoredDeviceToken()) {
      await tryClaimPendingToken(info.deviceId)
    }
    await maybeApplyDesiredConfig(result)
    return result
  } catch (err) {
    if (err && err.statusCode === 422) {
      const claimed = await tryClaimPendingToken(info.deviceId)
      if (claimed) {
        return announce()
      }
    }
    errorLog.warn('Player announce failed', err && err.message)
    throw err
  }
}

async function maybeApplyDesiredConfig(result) {
  const { playerLog, errorLog } = getLoggers()
  if (!result) return false

  const revision = Number(result.configRevision) || 0
  const desired = result.desiredConfig
  if (!desired || revision <= lastAppliedRevision) {
    return false
  }
  if (applyingRevision === revision) {
    return false
  }

  applyingRevision = revision
  pendingConfigError = null
  try {
    const previousRole = currentAppliedRole()
    const desiredRole = normalizeRole(desired.deviceRole || result.deviceRole || result.desiredRole)

    if (applyConfigHandler) {
      await applyConfigHandler(desired, revision, {
        previousRole,
        desiredRole,
        videowallId: result.videowallId || desired.videowallId,
        templateId: result.templateId || desired.templateId
      })
    } else {
      applyDesiredConfigLocally(desired)
      if (desiredRole) {
        configService.updateValues({ CTRL_TYPE: desiredRole })
      }
    }

    // Only acknowledge after runtime application succeeds.
    lastAppliedRevision = revision
    storeAppliedConfigRevision(revision)
    playerLog.info('Applied desired config revision', {
      revision,
      previousRole,
      appliedRole: currentAppliedRole(),
      desiredRole
    })
    return true
  } catch (err) {
    pendingConfigError = String(err && err.message ? err.message : err)
    errorLog.warn('Failed applying desired config', pendingConfigError)
    return false
  } finally {
    applyingRevision = null
  }
}

function normalizeRole(role) {
  const value = String(role || '').toLowerCase()
  return value === 'console' ? 'console' : (value === 'videowall' ? 'videowall' : null)
}

async function heartbeat() {
  const { errorLog } = getLoggers()
  loadPersistedRevision()
  const info = buildDeviceInfo()
  let token = getStoredDeviceToken()
  if (!token) {
    token = await tryClaimPendingToken(info.deviceId)
  }

  const reportedConfig = Object.assign({}, info.reportedConfig || {}, {
    appliedRole: currentAppliedRole(),
    deviceRole: currentAppliedRole(),
    ctrlType: currentAppliedRole(),
    configAppliedRevision: lastAppliedRevision
  })

  const body = Object.assign({}, info, {
    deviceToken: token || undefined,
    configAppliedRevision: lastAppliedRevision,
    appliedRole: currentAppliedRole(),
    reportedRole: currentAppliedRole(),
    reportedConfig,
    configError: pendingConfigError || undefined
  })

  try {
    const result = await postJson('/api/player/heartbeat', body)
    if (result.deviceToken) {
      storeDeviceToken(result.deviceToken)
    }

    const pendingRevision = Number(result.configRevision) || 0
    // Pending revisions must go through maybeApplyDesiredConfig so the apply
    // handler can detect template/wall changes and reload preview. Writing
    // TEMPLATE_ID here first made templateOrWallChanged look false.
    if (pendingRevision > lastAppliedRevision) {
      const applied = await maybeApplyDesiredConfig(result)
      if (applied) {
        pendingConfigError = null
        // One-shot acknowledgment heartbeat with the new applied role (no recurse loop).
        return acknowledgeAppliedConfig()
      }
      return result
    }

    // Already synced — keep local ids aligned without a reload cycle.
    const updates = {}
    if (result.videowallId != null && result.videowallId !== '') {
      updates.VIDEOWALL_ID = String(result.videowallId)
    }
    if (result.templateId != null && result.templateId !== '') {
      updates.TEMPLATE_ID = String(result.templateId)
    }
    if (Object.keys(updates).length) {
      configService.updateValues(updates)
    }

    return result
  } catch (err) {
    errorLog.warn('Player heartbeat failed', err && err.message)
    throw err
  }
}

async function acknowledgeAppliedConfig() {
  const info = buildDeviceInfo()
  const token = getStoredDeviceToken()
  const body = Object.assign({}, info, {
    deviceToken: token || undefined,
    configAppliedRevision: lastAppliedRevision,
    appliedRole: currentAppliedRole(),
    reportedRole: currentAppliedRole(),
    reportedConfig: Object.assign({}, info.reportedConfig || {}, {
      appliedRole: currentAppliedRole(),
      deviceRole: currentAppliedRole(),
      ctrlType: currentAppliedRole(),
      configAppliedRevision: lastAppliedRevision
    })
  })
  return postJson('/api/player/heartbeat', body)
}

/**
 * Immediate pull triggered by CLEVER-Service NotifyPlayerConfigSyncJob.
 */
async function pullAndApplyConfig() {
  return heartbeat()
}

function applyDesiredConfigLocally(config) {
  if (!config || typeof config !== 'object') return
  const updates = {}
  const role = normalizeRole(config.deviceRole || config.ctrlType)
  if (role) updates.CTRL_TYPE = role
  if (config.videowallId != null && config.videowallId !== '') {
    updates.VIDEOWALL_ID = String(config.videowallId)
  }
  if (config.templateId != null && config.templateId !== '') {
    updates.TEMPLATE_ID = String(config.templateId)
  }
  if (typeof config.fullscreen === 'boolean') updates.FULLSCREEN = config.fullscreen
  if (typeof config.kioskMode === 'boolean') updates.KIOSK_MODE = config.kioskMode
  if (typeof config.alwaysOnTop === 'boolean') updates.ALWAYS_ON_TOP = config.alwaysOnTop
  if (typeof config.logLevel === 'string') updates.LOG_LEVEL = config.logLevel
  if (typeof config.heartbeatInterval === 'number') updates.HEARTBEAT_INTERVAL = config.heartbeatInterval
  if (Object.keys(updates).length) {
    configService.updateValues(updates)
  }
}

function startHeartbeatLoop() {
  stopHeartbeatLoop()
  loadPersistedRevision()
  const values = configService.getValues()
  const intervalSec = Math.max(10, Number(values.HEARTBEAT_INTERVAL) || 30)
  const tick = () => {
    heartbeat().catch(() => {})
  }
  tick()
  heartbeatTimer = setInterval(tick, intervalSec * 1000)
  if (heartbeatTimer.unref) heartbeatTimer.unref()
}

function stopHeartbeatLoop() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

function getLastAppliedRevision() {
  loadPersistedRevision()
  return lastAppliedRevision
}

module.exports = {
  announce,
  heartbeat,
  pullAndApplyConfig,
  startHeartbeatLoop,
  stopHeartbeatLoop,
  setApplyConfigHandler,
  applyDesiredConfigLocally,
  getOrCreateDeviceId,
  currentAppliedRole,
  getLastAppliedRevision,
  controllerBase
}
