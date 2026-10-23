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

  test('allows media-open-file invoke for local playback dialog', () => {
    assert.equal(isAllowed(INVOKE_CHANNELS, 'media-open-file'), true)
  })

  test('allows meeting browser-window IPC for Google Meet join path', () => {
    assert.equal(isAllowed(INVOKE_CHANNELS, 'meeting-open-window'), true)
    assert.equal(isAllowed(INVOKE_CHANNELS, 'meeting-close-window'), true)
    assert.equal(isAllowed(INVOKE_CHANNELS, 'meeting-update-bounds'), true)
    assert.equal(isAllowed(INVOKE_CHANNELS, 'meeting-get-user-agent'), true)
  })
})
