'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const Module = require('module')

function withMockedElectronLog(fn) {
  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    if (request === 'electron-log') {
      const noop = () => {}
      const logger = { error: noop, warn: noop, info: noop, verbose: noop, debug: noop, silly: noop }
      return {
        transports: { file: { level: 'info', resolvePathFn: noop }, console: { level: 'info' } },
        create: () => logger,
        error: noop,
        warn: noop,
        info: noop,
        log: noop
      }
    }
    return originalLoad.apply(this, arguments)
  }
  try {
    return fn()
  } finally {
    Module._load = originalLoad
  }
}

test('applyDesiredConfigLocally writes CTRL_TYPE from deviceRole', () => {
  withMockedElectronLog(() => {
    delete require.cache[require.resolve('../src/main/logger')]
    delete require.cache[require.resolve('../src/main/registration')]
    const configService = require('../src/main/config-service')
    const registration = require('../src/main/registration')

    const originalGetValues = configService.getValues
    const originalUpdateValues = configService.updateValues
    let stored = { CTRL_TYPE: 'videowall' }

    configService.getValues = () => stored
    configService.updateValues = (patch) => {
      stored = Object.assign({}, stored, patch)
      return stored
    }

    registration.applyDesiredConfigLocally({ deviceRole: 'console', fullscreen: true })
    assert.equal(stored.CTRL_TYPE, 'console')
    assert.equal(stored.FULLSCREEN, true)
    assert.equal(registration.currentAppliedRole(), 'console')

    registration.applyDesiredConfigLocally({ deviceRole: 'videowall' })
    assert.equal(registration.currentAppliedRole(), 'videowall')

    configService.getValues = originalGetValues
    configService.updateValues = originalUpdateValues
  })
})

test('device-id persists applied config revision', () => {
  const paths = require('../src/main/paths')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clever-player-rev-'))
  const original = paths.getAppDir
  paths.getAppDir = () => tmp

  delete require.cache[require.resolve('../src/main/device-id')]
  const deviceId = require('../src/main/device-id')
  assert.equal(deviceId.getAppliedConfigRevision(), 0)
  deviceId.storeAppliedConfigRevision(7)
  assert.equal(deviceId.getAppliedConfigRevision(), 7)

  paths.getAppDir = original
  delete require.cache[require.resolve('../src/main/device-id')]
  fs.rmSync(tmp, { recursive: true, force: true })
})
