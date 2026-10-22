'use strict'

const http = require('http')
const https = require('https')
const { URL } = require('url')
const configService = require('./config-service')
const { getOrCreateDeviceId, getStoredDeviceToken, storeDeviceToken } = require('./device-id')
const { buildDeviceInfo } = require('./device-info')
const { getLoggers } = require('./logger')

let heartbeatTimer = null
let lastAppliedRevision = 0
let applyConfigHandler = null

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
  const info = buildDeviceInfo()
  let token = getStoredDeviceToken()
  if (!token) {
    token = await tryClaimPendingToken(info.deviceId)
  }
  const body = Object.assign({}, info, {
    deviceToken: token || undefined
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
    return result
  } catch (err) {
    // Already registered but missing token — try one-time claim
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

async function heartbeat() {
  const { playerLog, errorLog } = getLoggers()
  const info = buildDeviceInfo()
  let token = getStoredDeviceToken()
  if (!token) {
    token = await tryClaimPendingToken(info.deviceId)
  }
  const body = Object.assign({}, info, {
    deviceToken: token || undefined,
    configAppliedRevision: lastAppliedRevision
  })

  try {
    const result = await postJson('/api/player/heartbeat', body)
    if (result.deviceToken) {
      storeDeviceToken(result.deviceToken)
    }

    // Server-authoritative role / ids
    const updates = {}
    if (result.deviceRole && ['videowall', 'console'].includes(result.deviceRole)) {
      updates.CTRL_TYPE = result.deviceRole
    }
    if (result.videowallId != null && result.videowallId !== '') {
      updates.VIDEOWALL_ID = String(result.videowallId)
    }
    if (result.templateId != null && result.templateId !== '') {
      updates.TEMPLATE_ID = String(result.templateId)
    }
    if (Object.keys(updates).length) {
      configService.updateValues(updates)
    }

    if (result.desiredConfig && Number(result.configRevision) > lastAppliedRevision) {
      try {
        if (applyConfigHandler) {
          await applyConfigHandler(result.desiredConfig, result.configRevision)
        } else {
          applyDesiredConfigLocally(result.desiredConfig)
        }
        lastAppliedRevision = Number(result.configRevision) || lastAppliedRevision
        playerLog.info('Applied desired config revision', lastAppliedRevision)
      } catch (err) {
        errorLog.warn('Failed applying desired config', err && err.message)
        // Report on next heartbeat via configError by rethrowing path — store for next body
        body.configError = String(err && err.message)
      }
    }

    return result
  } catch (err) {
    errorLog.warn('Player heartbeat failed', err && err.message)
    throw err
  }
}

function applyDesiredConfigLocally(config) {
  if (!config || typeof config !== 'object') return
  const updates = {}
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

module.exports = {
  announce,
  heartbeat,
  startHeartbeatLoop,
  stopHeartbeatLoop,
  setApplyConfigHandler,
  applyDesiredConfigLocally,
  getOrCreateDeviceId,
  controllerBase
}
