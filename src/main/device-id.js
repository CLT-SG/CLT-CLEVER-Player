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

function readDeviceFile() {
  const file = deviceIdPath()
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8')) || {}
    }
  } catch {
    // ignore
  }
  return {}
}

function writeDeviceFile(patch) {
  const file = deviceIdPath()
  const data = Object.assign({ deviceId: getOrCreateDeviceId() }, readDeviceFile(), patch || {})
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 2))
  return data
}

function storeDeviceToken(token) {
  writeDeviceFile({
    deviceToken: token ? String(token) : null,
    tokenUpdatedAt: new Date().toISOString()
  })
}

function getAppliedConfigRevision() {
  const raw = readDeviceFile()
  const value = Number(raw.configAppliedRevision)
  return Number.isFinite(value) && value >= 0 ? value : 0
}

function storeAppliedConfigRevision(revision) {
  const value = Number(revision)
  writeDeviceFile({
    configAppliedRevision: Number.isFinite(value) && value >= 0 ? value : 0,
    configAppliedAt: new Date().toISOString()
  })
}

module.exports = {
  getOrCreateDeviceId,
  getStoredDeviceToken,
  storeDeviceToken,
  getAppliedConfigRevision,
  storeAppliedConfigRevision,
  deviceIdPath
}
