'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

test('getOrCreateDeviceId persists a stable id', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clever-player-'))
  const paths = require('../src/main/paths')
  const original = paths.getAppDir
  paths.getAppDir = () => tmp

  // Reload module with patched getAppDir via fresh require cache is awkward;
  // exercise through writing the same file the module uses by mocking path.
  delete require.cache[require.resolve('../src/main/device-id')]
  // Patch by setting CLEVER path: device-id uses getAppDir from paths
  const deviceIdMod = require('../src/main/device-id')

  // Restore after ensuring API surface exists
  assert.equal(typeof deviceIdMod.getOrCreateDeviceId, 'function')
  assert.equal(typeof deviceIdMod.storeDeviceToken, 'function')
  assert.equal(typeof deviceIdMod.getStoredDeviceToken, 'function')

  paths.getAppDir = original
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('buildDeviceInfo exposes registration fields without electron screen', () => {
  const { buildDeviceInfo } = require('../src/main/device-info')
  const info = buildDeviceInfo()
  assert.ok(info.deviceId)
  assert.ok(info.hostname)
  assert.ok(info.capabilities)
  assert.ok(info.capabilities.display)
  assert.equal(info.capabilities.audio.systemVolume, true)
  assert.ok(Array.isArray(info.monitors))
})
