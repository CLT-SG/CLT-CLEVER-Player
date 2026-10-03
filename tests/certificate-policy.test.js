'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { shouldAcceptCertificate, isTrustedLanHost } = require('../src/main/certificate-policy')

test('trusts LAN addresses used by ScreencastApp websockify', () => {
  assert.equal(isTrustedLanHost('192.168.1.77'), true)
  assert.equal(isTrustedLanHost('10.0.0.5'), true)
  assert.equal(isTrustedLanHost('CLT-27AIO.local'), true)
  assert.equal(isTrustedLanHost('example.com'), false)
})

test('accepts https and wss certificates only for LAN hosts', () => {
  assert.equal(shouldAcceptCertificate('https://192.168.1.77:9100/screencast'), true)
  assert.equal(shouldAcceptCertificate('wss://192.168.1.77:8840/screen0'), true)
  assert.equal(shouldAcceptCertificate('wss://CLT-27AIO.local:8840/screen0'), true)
  assert.equal(shouldAcceptCertificate('https://127.0.0.1:9100/screencast'), true)
  assert.equal(shouldAcceptCertificate('wss://example.com/screen0'), false)
  assert.equal(shouldAcceptCertificate('https://example.com/screencast'), false)
  assert.equal(shouldAcceptCertificate('ws://192.168.1.77:8840/screen0'), false)
  assert.equal(shouldAcceptCertificate('not a url'), false)
})
