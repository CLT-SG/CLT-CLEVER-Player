'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const { SEND_CHANNELS, INVOKE_CHANNELS, RECEIVE_CHANNELS, isAllowed } = require('../src/main/ipc-channels')

describe('ipc channels', () => {
  test('allows known renderer send channels used by CLEVER web', () => {
    assert.equal(isAllowed(SEND_CHANNELS, 'app-switchwindow'), true)
    assert.equal(isAllowed(SEND_CHANNELS, 'app-registerShortkey'), true)
    assert.equal(isAllowed(RECEIVE_CHANNELS, 'app-shortkeyRefresh'), true)
  })

  test('rejects unknown channels', () => {
    assert.equal(isAllowed(SEND_CHANNELS, 'app-eval'), false)
    assert.equal(isAllowed(INVOKE_CHANNELS, 'shell-open'), false)
    assert.equal(isAllowed(SEND_CHANNELS, null), false)
  })
})
