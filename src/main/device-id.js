'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { getAppDir } = require('./paths')

const FILE_NAME = 'device-id.json'

function deviceIdPath() {
  return path.join(getAppDir(), FILE_NAME)
}

/**
 * Stable CLEVER-Player device identity. Survives IP/DHCP changes.
 * Stored under ~/clever-console/device-id.json.
 */
function getOrCreateDeviceId() {
  const file = deviceIdPath()
  try {
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (raw && typeof raw.deviceId === 'string' && raw.deviceId.length >= 8) {
        return raw.deviceId
      }
    }
  } catch {
    // regenerate below
  }

  const deviceId = crypto.randomUUID
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString('hex')
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify({ deviceId, createdAt: new Date().toISOString() }, null, 2))
  } catch {
    // still return ephemeral id this session
  }
  return deviceId
}

function getStoredDeviceToken() {
  const file = deviceIdPath()
  try {
    if (!fs.existsSync(file)) return null
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    return raw && raw.deviceToken ? String(raw.deviceToken) : null
  } catch {
    return null
  }
}

function storeDeviceToken(token) {
  const file = deviceIdPath()
  let data = { deviceId: getOrCreateDeviceId() }
  try {
    if (fs.existsSync(file)) {
      data = Object.assign(data, JSON.parse(fs.readFileSync(file, 'utf8')))
    }
  } catch {
    // ignore
  }
  data.deviceToken = token ? String(token) : null
  data.tokenUpdatedAt = new Date().toISOString()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 2))
}

module.exports = {
  getOrCreateDeviceId,
  getStoredDeviceToken,
  storeDeviceToken,
  deviceIdPath
}
